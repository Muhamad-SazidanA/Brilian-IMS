package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/company/brilian-dms/internal/api/middleware"
	"github.com/company/brilian-dms/internal/dms"
)

// Document represents an uploaded document metadata and in-memory state for legacy compatibility
type Document struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	FolderID   string `json:"folder_id"`
	Content    []byte `json:"-"`
	Status     string `json:"status"`
	UploadedBy string `json:"uploaded_by"`
}

// UploadJSONRequest represents JSON payload if uploaded as application/json
type UploadJSONRequest struct {
	Title          string `json:"title"`
	FolderID       string `json:"folder_id"`
	File           any    `json:"file"`
	Classification string `json:"classification"`
	Division       string `json:"division"`
}

// DocumentHandler handles document operations backed by DMS Engine
type DocumentHandler struct {
	engine *dms.Engine
}

// NewDocumentHandler initializes a new DocumentHandler with shared DMS engine
func NewDocumentHandler() *DocumentHandler {
	return &DocumentHandler{
		engine: dms.NewEngine(),
	}
}

// NewDocumentHandlerWithEngine initializes DocumentHandler with a provided DMS engine instance
func NewDocumentHandlerWithEngine(engine *dms.Engine) *DocumentHandler {
	return &DocumentHandler{
		engine: engine,
	}
}

// Engine returns the underlying DMS engine
func (h *DocumentHandler) Engine() *dms.Engine {
	return h.engine
}

// GetDocument returns a document by ID
func (h *DocumentHandler) GetDocument(id string) (Document, bool) {
	doc, ok := h.engine.GetDocument(id)
	if !ok {
		return Document{}, false
	}
	return Document{
		ID:         doc.ID,
		Title:      doc.Title,
		FolderID:   doc.FolderID,
		Content:    doc.Content,
		Status:     doc.Status,
		UploadedBy: doc.UploadedBy,
	}, true
}

// Upload handles legacy POST /api/v1/documents/upload
func (h *DocumentHandler) Upload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims, ok := middleware.GetClaims(r.Context())
	if !ok || claims == nil {
		WriteError(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
		return
	}

	if !middleware.HasPermission(claims.Role, "documents:upload") {
		WriteError(w, http.StatusForbidden, "Forbidden: insufficient role permissions to upload documents")
		return
	}

	var title, folderID, classification, division string
	var fileContent []byte

	contentType := r.Header.Get("Content-Type")

	if strings.HasPrefix(contentType, "application/json") {
		var req UploadJSONRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "Invalid JSON payload")
			return
		}
		title = req.Title
		folderID = req.FolderID
		classification = req.Classification
		division = req.Division

		switch v := req.File.(type) {
		case string:
			if v != "" {
				fileContent = []byte(v)
			}
		case []byte:
			fileContent = v
		default:
			if req.File != nil {
				fileContent, _ = json.Marshal(req.File)
			}
		}
	} else {
		// Multipart or standard form handling
		err := r.ParseMultipartForm(32 << 20) // 32MB max
		if err == nil && r.MultipartForm != nil {
			title = r.FormValue("title")
			folderID = r.FormValue("folder_id")
			classification = r.FormValue("classification")
			division = r.FormValue("division")

			file, _, fileErr := r.FormFile("file")
			if fileErr == nil && file != nil {
				defer file.Close()
				content, readErr := io.ReadAll(file)
				if readErr == nil && len(content) > 0 {
					fileContent = content
				}
			}
		} else {
			_ = r.ParseForm()
			title = r.FormValue("title")
			folderID = r.FormValue("folder_id")
			classification = r.FormValue("classification")
			division = r.FormValue("division")
			if fVal := r.FormValue("file"); fVal != "" {
				fileContent = []byte(fVal)
			}
		}
	}

	// Validate title: cannot be empty or whitespace-only
	if strings.TrimSpace(title) == "" {
		WriteError(w, http.StatusBadRequest, "Invalid or missing title")
		return
	}

	// Validate folder_id: cannot be empty or whitespace-only
	if strings.TrimSpace(folderID) == "" {
		WriteError(w, http.StatusBadRequest, "Invalid or missing folder_id")
		return
	}

	// Validate file: required
	if len(fileContent) == 0 {
		WriteError(w, http.StatusBadRequest, "File is required")
		return
	}

	userID := claims.Sub
	if userID == "" {
		userID = "anonymous"
	}

	// Initialize resumable session through engine for seamless full validation & quota
	session, err := h.engine.InitUploadSession(userID, title, int64(len(fileContent)), dms.DetectMimeType(fileContent), folderID, classification, division)
	if err != nil {
		if strings.Contains(err.Error(), "Storage quota exceeded") {
			WriteError(w, http.StatusRequestEntityTooLarge, err.Error())
			return
		}
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	_, _, _, err = h.engine.ReceiveChunk(session.SessionID, 0, "", fileContent)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	doc, _, err := h.engine.CompleteUploadSession(session.SessionID)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{
		"status":      "success",
		"document_id": doc.ID,
		"message":     "Dokumen berhasil diunggah dan dijadwalkan untuk OCR indexing.",
	})
}

// List handles GET /api/v1/documents
func (h *DocumentHandler) List(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	folderID := r.URL.Query().Get("folder_id")
	docs := h.engine.ListDocuments(folderID)

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":    "success",
		"documents": docs,
		"count":     len(docs),
	})
}

// Versions handles GET /api/v1/documents/{id}/versions
func (h *DocumentHandler) Versions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	// e.g. api/v1/documents/{id}/versions
	if len(pathParts) < 4 {
		WriteError(w, http.StatusBadRequest, "Invalid document ID in path")
		return
	}
	docID := pathParts[len(pathParts)-2]

	versions, currentVer, err := h.engine.GetDocumentVersions(docID)
	if err != nil {
		WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	type verResp struct {
		VersionNumber int    `json:"version_number"`
		FileSize      int64  `json:"file_size"`
		CreatedAt     string `json:"created_at"`
		UploadedBy    string `json:"uploaded_by"`
	}

	formatted := make([]verResp, len(versions))
	for i, v := range versions {
		formatted[i] = verResp{
			VersionNumber: v.VersionNumber,
			FileSize:      v.FileSize,
			CreatedAt:     v.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			UploadedBy:    v.UploadedBy,
		}
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":          "success",
		"document_id":     docID,
		"current_version": currentVer,
		"versions":        formatted,
	})
}

// RestoreVersion handles POST /api/v1/documents/{id}/versions/{ver}/restore
func (h *DocumentHandler) RestoreVersion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims, ok := middleware.GetClaims(r.Context())
	if !ok || claims == nil {
		WriteError(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
		return
	}

	if !middleware.HasPermission(claims.Role, "documents:upload") {
		WriteError(w, http.StatusForbidden, "Forbidden: insufficient role to restore versions")
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	// api/v1/documents/{id}/versions/{ver}/restore -> parts length 6
	if len(pathParts) < 6 {
		WriteError(w, http.StatusBadRequest, "Invalid path parameters")
		return
	}
	docID := pathParts[3]
	verStr := pathParts[5]
	targetVer, err := strconv.Atoi(verStr)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid version number")
		return
	}

	doc, newVer, err := h.engine.RestoreDocumentVersion(docID, targetVer, claims.Sub)
	if err != nil {
		WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":          "success",
		"document_id":     doc.ID,
		"current_version": newVer,
		"restored_from":   targetVer,
		"message":         "Dokumen berhasil dipulihkan.",
	})
}

// Rename handles PUT /api/v1/documents/{id}/rename
func (h *DocumentHandler) Rename(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 4 {
		WriteError(w, http.StatusBadRequest, "Invalid path")
		return
	}
	docID := pathParts[len(pathParts)-2]

	var req struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}

	doc, err := h.engine.RenameDocument(docID, req.Title)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":   "success",
		"document": doc,
	})
}

// Move handles PUT /api/v1/documents/{id}/move
func (h *DocumentHandler) Move(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 4 {
		WriteError(w, http.StatusBadRequest, "Invalid path")
		return
	}
	docID := pathParts[len(pathParts)-2]

	var req struct {
		FolderID string `json:"folder_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}

	doc, err := h.engine.MoveDocument(docID, req.FolderID)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":   "success",
		"document": doc,
	})
}

// Delete handles DELETE /api/v1/documents/{id} (soft-delete to trash)
func (h *DocumentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims, ok := middleware.GetClaims(r.Context())
	if !ok || claims == nil {
		WriteError(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
		return
	}

	if !middleware.HasPermission(claims.Role, "documents:delete") && claims.Role != "admin" && claims.Role != "reviewer" {
		WriteError(w, http.StatusForbidden, "Forbidden: insufficient role to delete documents")
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	docID := pathParts[len(pathParts)-1]

	err := h.engine.SoftDeleteDocument(docID, claims.Sub)
	if err != nil {
		WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":  "success",
		"message": "Dokumen berhasil dipindahkan ke kotak sampah (trash).",
	})
}

// TrashList handles GET /api/v1/trash
func (h *DocumentHandler) TrashList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	items := h.engine.ListTrash()
	WriteJSON(w, http.StatusOK, map[string]any{
		"status":      "success",
		"trash_items": items,
		"count":       len(items),
	})
}

// TrashRestore handles POST /api/v1/trash/{id}/restore
func (h *DocumentHandler) TrashRestore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 4 {
		WriteError(w, http.StatusBadRequest, "Invalid path")
		return
	}
	docID := pathParts[len(pathParts)-2]

	doc, err := h.engine.RestoreFromTrash(docID)
	if err != nil {
		WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":      "success",
		"document_id": doc.ID,
		"message":     "Dokumen berhasil dipulihkan dari kotak sampah.",
	})
}

// TrashPermanent handles DELETE /api/v1/trash/{id}/permanent (Admin / L5 only)
func (h *DocumentHandler) TrashPermanent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims, ok := middleware.GetClaims(r.Context())
	if !ok || claims == nil {
		WriteError(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
		return
	}

	if claims.Role != "admin" {
		WriteError(w, http.StatusForbidden, "Forbidden: only Administrator or Level L5 can permanently purge items")
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 4 {
		WriteError(w, http.StatusBadRequest, "Invalid path")
		return
	}
	docID := pathParts[len(pathParts)-2]

	err := h.engine.PermanentPurgeTrash(docID)
	if err != nil {
		WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":  "success",
		"message": "Dokumen dan seluruh riwayat versi berhasil dihapus secara permanen.",
	})
}
