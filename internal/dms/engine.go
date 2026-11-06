package dms

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"sync"
	"time"
)

// GenerateUUID produces a pseudo-random hex identifier
func GenerateUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Engine encapsulates in-memory DMS business logic
type Engine struct {
	mu             sync.RWMutex
	documents      map[string]*DocumentRecord
	docVersions    map[string][]DocumentVersion
	uploadSessions map[string]*UploadSession
	userQuotas     map[string]*UserQuota
	trash          map[string]*DocumentRecord
}

// NewEngine initializes a thread-safe DMS Engine
func NewEngine() *Engine {
	e := &Engine{
		documents:      make(map[string]*DocumentRecord),
		docVersions:    make(map[string][]DocumentVersion),
		uploadSessions: make(map[string]*UploadSession),
		userQuotas:     make(map[string]*UserQuota),
		trash:          make(map[string]*DocumentRecord),
	}

	// Seed default user storage quotas
	e.userQuotas["usr-admin-1"] = &UserQuota{MaxBytes: 10 * 1024 * 1024 * 1024, UsedBytes: 0}
	e.userQuotas["usr-rev-1"] = &UserQuota{MaxBytes: 1024 * 1024 * 1024, UsedBytes: 0}
	e.userQuotas["usr-upl-1"] = &UserQuota{MaxBytes: 1024 * 1024 * 1024, UsedBytes: 0}
	e.userQuotas["usr-viw-1"] = &UserQuota{MaxBytes: 512 * 1024 * 1024, UsedBytes: 0}

	return e
}

// GetUserQuota returns quota tracking for a user
func (e *Engine) GetUserQuota(userID string) UserQuota {
	e.mu.RLock()
	defer e.mu.RUnlock()
	q, ok := e.userQuotas[userID]
	if !ok {
		return UserQuota{MaxBytes: 1024 * 1024 * 1024, UsedBytes: 0}
	}
	return *q
}

// SetUserQuota sets quota tracking for a user
func (e *Engine) SetUserQuota(userID string, maxBytes, usedBytes int64) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.userQuotas[userID] = &UserQuota{MaxBytes: maxBytes, UsedBytes: usedBytes}
}

// InitUploadSession initializes a new resumable upload session
func (e *Engine) InitUploadSession(
	userID, filename string,
	totalSize int64,
	mimeType, folderID, classification, division string,
) (*UploadSession, error) {
	if totalSize <= 0 {
		return nil, fmt.Errorf("total_size must be a positive number")
	}

	// 1. Sanitize filename
	safeName, err := SanitizeFilename(filename)
	if err != nil {
		return nil, fmt.Errorf("Filename rejected: %w", err)
	}

	// 2. Storage quota enforcement
	e.mu.Lock()
	defer e.mu.Unlock()

	quota, ok := e.userQuotas[userID]
	if !ok {
		quota = &UserQuota{MaxBytes: 1024 * 1024 * 1024, UsedBytes: 0}
		e.userQuotas[userID] = quota
	}

	if quota.UsedBytes+totalSize > quota.MaxBytes {
		return nil, fmt.Errorf("Storage quota exceeded: max %d bytes, current %d bytes, incoming %d bytes",
			quota.MaxBytes, quota.UsedBytes, totalSize)
	}

	const chunkSize = 5 * 1024 * 1024 // 5MB standard chunk
	totalChunks := int((totalSize + chunkSize - 1) / chunkSize)
	sessionID := "upload-" + GenerateUUID()

	if folderID == "" {
		folderID = "root"
	}
	if classification == "" {
		classification = "Internal"
	}
	if division == "" {
		division = "General"
	}
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	session := &UploadSession{
		SessionID:      sessionID,
		Filename:       safeName,
		TotalSize:      totalSize,
		MimeType:       mimeType,
		FolderID:       folderID,
		Classification: classification,
		Division:       division,
		ChunkSize:      chunkSize,
		TotalChunks:    totalChunks,
		ReceivedChunks: make(map[int][]byte),
		Status:         "pending",
		UserID:         userID,
		CreatedAt:      time.Now(),
	}

	e.uploadSessions[sessionID] = session
	return session, nil
}

// ReceiveChunk stores an uploaded chunk with checksum verification
func (e *Engine) ReceiveChunk(sessionID string, chunkIndex int, chunkHash string, data []byte) (received, total, percent int, err error) {
	e.mu.RLock()
	session, ok := e.uploadSessions[sessionID]
	e.mu.RUnlock()

	if !ok {
		return 0, 0, 0, fmt.Errorf("Upload session not found or expired")
	}

	session.mu.Lock()
	defer session.mu.Unlock()

	if chunkIndex < 0 || chunkIndex >= session.TotalChunks {
		return 0, 0, 0, fmt.Errorf("Invalid chunk_index: %d", chunkIndex)
	}

	// Verify SHA-256 hash if provided
	if chunkHash != "" {
		h := sha256.Sum256(data)
		calcHash := hex.EncodeToString(h[:])
		if !strings.EqualFold(calcHash, chunkHash) {
			return 0, 0, 0, fmt.Errorf("Chunk checksum mismatch")
		}
	}

	session.ReceivedChunks[chunkIndex] = data
	receivedCount := len(session.ReceivedChunks)
	if receivedCount == session.TotalChunks {
		session.Status = "completed"
	}

	pct := int((float64(receivedCount) / float64(session.TotalChunks)) * 100)
	return receivedCount, session.TotalChunks, pct, nil
}

// GetUploadStatus returns the progress of an upload session
func (e *Engine) GetUploadStatus(sessionID string) (status string, receivedChunks []int, totalChunks, percent int, err error) {
	e.mu.RLock()
	session, ok := e.uploadSessions[sessionID]
	e.mu.RUnlock()

	if !ok {
		return "", nil, 0, 0, fmt.Errorf("Upload session not found")
	}

	session.mu.RLock()
	defer session.mu.RUnlock()

	chunks := make([]int, 0, len(session.ReceivedChunks))
	for k := range session.ReceivedChunks {
		chunks = append(chunks, k)
	}

	pct := int((float64(len(session.ReceivedChunks)) / float64(session.TotalChunks)) * 100)
	return session.Status, chunks, session.TotalChunks, pct, nil
}

// CompleteUploadSession validates, assembles, inspects, and stores the completed document
func (e *Engine) CompleteUploadSession(sessionID string) (*DocumentRecord, int, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	session, ok := e.uploadSessions[sessionID]
	if !ok {
		return nil, 0, fmt.Errorf("Upload session not found")
	}

	session.mu.RLock()
	if len(session.ReceivedChunks) < session.TotalChunks {
		session.mu.RUnlock()
		return nil, 0, fmt.Errorf("Incomplete upload: received %d of %d chunks",
			len(session.ReceivedChunks), session.TotalChunks)
	}

	// Assemble chunks in sequential order
	var buf bytes.Buffer
	for i := 0; i < session.TotalChunks; i++ {
		chunkData, exists := session.ReceivedChunks[i]
		if !exists {
			session.mu.RUnlock()
			return nil, 0, fmt.Errorf("Missing chunk index: %d", i)
		}
		buf.Write(chunkData)
	}
	session.mu.RUnlock()
	fullContent := buf.Bytes()

	// Magic byte inspection
	if session.MimeType != "application/octet-stream" {
		magic := ValidateMagicBytes(fullContent, session.MimeType)
		if !magic.Valid {
			return nil, 0, fmt.Errorf("%s", magic.Error)
		}
	}

	// SVG XSS check
	if session.MimeType == "image/svg+xml" {
		svgCheck := InspectSVGContent(fullContent)
		if !svgCheck.Safe {
			return nil, 0, fmt.Errorf("Malicious file rejected: %s", svgCheck.Reason)
		}
	}

	// Office Macro & Zip bomb check
	officeCheck := InspectZipOrOffice(fullContent, session.Filename)
	if !officeCheck.Safe {
		return nil, 0, fmt.Errorf("%s", officeCheck.Reason)
	}

	// Check existing document with same filename in same folder for Versioning
	var existingDoc *DocumentRecord
	for _, doc := range e.documents {
		if doc.Title == session.Filename && doc.FolderID == session.FolderID && !doc.IsDeleted {
			existingDoc = doc
			break
		}
	}

	var docRecord *DocumentRecord
	newVersion := 1

	if existingDoc != nil {
		// Auto-increment version
		newVersion = existingDoc.CurrentVersion + 1
		existingDoc.CurrentVersion = newVersion
		existingDoc.FileSize = int64(len(fullContent))
		existingDoc.UpdatedAt = time.Now()
		existingDoc.Content = fullContent

		versions := e.docVersions[existingDoc.ID]
		versions = append(versions, DocumentVersion{
			VersionNumber: newVersion,
			FileSize:      int64(len(fullContent)),
			CreatedAt:     time.Now(),
			UploadedBy:    session.UserID,
			Content:       fullContent,
		})
		e.docVersions[existingDoc.ID] = versions
		docRecord = existingDoc
	} else {
		// Create new document record (Version 1)
		docID := "doc-" + GenerateUUID()
		docRecord = &DocumentRecord{
			ID:             docID,
			Title:          session.Filename,
			FolderID:       session.FolderID,
			FileSize:       int64(len(fullContent)),
			MimeType:       session.MimeType,
			Classification: session.Classification,
			Division:       session.Division,
			CurrentVersion: 1,
			Status:         "draft",
			UploadedBy:     session.UserID,
			CreatedAt:      time.Now(),
			UpdatedAt:      time.Now(),
			IsDeleted:      false,
			Content:        fullContent,
		}

		e.documents[docID] = docRecord
		e.docVersions[docID] = []DocumentVersion{
			{
				VersionNumber: 1,
				FileSize:      int64(len(fullContent)),
				CreatedAt:     time.Now(),
				UploadedBy:    session.UserID,
				Content:       fullContent,
			},
		}
	}

	// Update quota
	if q, exists := e.userQuotas[session.UserID]; exists {
		q.UsedBytes += int64(len(fullContent))
	}

	// Clean up upload session
	delete(e.uploadSessions, sessionID)

	return docRecord, newVersion, nil
}

// GetDocument returns an active document by ID
func (e *Engine) GetDocument(docID string) (*DocumentRecord, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	doc, ok := e.documents[docID]
	if !ok || doc.IsDeleted {
		return nil, false
	}
	return doc, true
}

// ListDocuments returns active documents in a folder or all
func (e *Engine) ListDocuments(folderID string) []*DocumentRecord {
	e.mu.RLock()
	defer e.mu.RUnlock()
	res := make([]*DocumentRecord, 0)
	for _, doc := range e.documents {
		if doc.IsDeleted {
			continue
		}
		if folderID == "" || doc.FolderID == folderID {
			res = append(res, doc)
		}
	}
	return res
}

// RenameDocument updates the document title after sanitization
func (e *Engine) RenameDocument(docID, newTitle string) (*DocumentRecord, error) {
	safeTitle, err := SanitizeFilename(newTitle)
	if err != nil {
		return nil, err
	}

	e.mu.Lock()
	defer e.mu.Unlock()
	doc, ok := e.documents[docID]
	if !ok || doc.IsDeleted {
		return nil, fmt.Errorf("Document not found")
	}

	doc.Title = safeTitle
	doc.UpdatedAt = time.Now()
	return doc, nil
}

// MoveDocument transfers a document to another folder
func (e *Engine) MoveDocument(docID, targetFolderID string) (*DocumentRecord, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	doc, ok := e.documents[docID]
	if !ok || doc.IsDeleted {
		return nil, fmt.Errorf("Document not found")
	}

	doc.FolderID = targetFolderID
	doc.UpdatedAt = time.Now()
	return doc, nil
}

// GetDocumentVersions returns all versions of a document
func (e *Engine) GetDocumentVersions(docID string) ([]DocumentVersion, int, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	doc, ok := e.documents[docID]
	if !ok || doc.IsDeleted {
		return nil, 0, fmt.Errorf("Document not found")
	}

	versions := e.docVersions[docID]
	return versions, doc.CurrentVersion, nil
}

// RestoreDocumentVersion creates a new incremented version containing historical contents
func (e *Engine) RestoreDocumentVersion(docID string, targetVersion int, userID string) (*DocumentRecord, int, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	doc, ok := e.documents[docID]
	if !ok || doc.IsDeleted {
		return nil, 0, fmt.Errorf("Document not found")
	}

	versions := e.docVersions[docID]
	var historical *DocumentVersion
	for _, v := range versions {
		if v.VersionNumber == targetVersion {
			historical = &v
			break
		}
	}

	if historical == nil {
		return nil, 0, fmt.Errorf("Version %d not found", targetVersion)
	}

	newVersion := doc.CurrentVersion + 1
	doc.CurrentVersion = newVersion
	doc.Content = historical.Content
	doc.FileSize = historical.FileSize
	doc.UpdatedAt = time.Now()

	e.docVersions[docID] = append(versions, DocumentVersion{
		VersionNumber: newVersion,
		FileSize:      historical.FileSize,
		CreatedAt:     time.Now(),
		UploadedBy:    userID,
		Content:       historical.Content,
	})

	return doc, newVersion, nil
}

// SoftDeleteDocument moves a document to trash
func (e *Engine) SoftDeleteDocument(docID, userID string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	doc, ok := e.documents[docID]
	if !ok || doc.IsDeleted {
		return fmt.Errorf("Document not found or already deleted")
	}

	now := time.Now()
	doc.IsDeleted = true
	doc.DeletedAt = &now
	doc.DeletedBy = userID

	e.trash[docID] = doc
	return nil
}

// ListTrash returns all documents currently in trash
func (e *Engine) ListTrash() []*DocumentRecord {
	e.mu.RLock()
	defer e.mu.RUnlock()

	items := make([]*DocumentRecord, 0, len(e.trash))
	for _, doc := range e.trash {
		items = append(items, doc)
	}
	return items
}

// RestoreFromTrash recovers a soft-deleted document
func (e *Engine) RestoreFromTrash(docID string) (*DocumentRecord, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	doc, ok := e.trash[docID]
	if !ok {
		return nil, fmt.Errorf("Item not found in trash")
	}

	doc.IsDeleted = false
	doc.DeletedAt = nil
	doc.DeletedBy = ""
	delete(e.trash, docID)

	return doc, nil
}

// PermanentPurgeTrash completely purges document and versions (Admin/L5 only)
func (e *Engine) PermanentPurgeTrash(docID string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	_, inTrash := e.trash[docID]
	_, inDocs := e.documents[docID]

	if !inTrash && !inDocs {
		return fmt.Errorf("Item not found")
	}

	delete(e.trash, docID)
	delete(e.documents, docID)
	delete(e.docVersions, docID)
	return nil
}

