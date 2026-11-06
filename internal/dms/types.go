package dms

import (
	"sync"
	"time"
)

// DocumentVersion represents a historical rendition of a document
type DocumentVersion struct {
	VersionNumber int       `json:"version_number"`
	FileSize      int64     `json:"file_size"`
	CreatedAt     time.Time `json:"created_at"`
	UploadedBy    string    `json:"uploaded_by"`
	Content       []byte    `json:"-"`
}

// DocumentRecord represents a document in the DMS core
type DocumentRecord struct {
	ID             string            `json:"id"`
	Title          string            `json:"title"`
	FolderID       string            `json:"folder_id"`
	FileSize       int64             `json:"file_size"`
	MimeType       string            `json:"mime_type"`
	Classification string            `json:"classification"`
	Division       string            `json:"division"`
	CurrentVersion int               `json:"current_version"`
	Status         string            `json:"status"`
	UploadedBy     string            `json:"uploaded_by"`
	CreatedAt      time.Time         `json:"created_at"`
	UpdatedAt      time.Time         `json:"updated_at"`
	DeletedAt      *time.Time        `json:"deleted_at,omitempty"`
	DeletedBy      string            `json:"deleted_by,omitempty"`
	IsDeleted      bool              `json:"is_deleted"`
	Content        []byte            `json:"-"`
	Versions       []DocumentVersion `json:"versions,omitempty"`
}

// UploadSession represents an active resumable upload session
type UploadSession struct {
	SessionID      string            `json:"session_id"`
	Filename       string            `json:"filename"`
	TotalSize      int64             `json:"total_size"`
	MimeType       string            `json:"mime_type"`
	FolderID       string            `json:"folder_id"`
	Classification string            `json:"classification"`
	Division       string            `json:"division"`
	ChunkSize      int64             `json:"chunk_size"`
	TotalChunks    int               `json:"total_chunks"`
	ReceivedChunks map[int][]byte    `json:"-"`
	Status         string            `json:"status"` // pending | completed
	UserID         string            `json:"user_id"`
	CreatedAt      time.Time         `json:"created_at"`
	mu             sync.RWMutex
}

// UserQuota represents storage quota tracking for a user
type UserQuota struct {
	MaxBytes  int64 `json:"max_bytes"`
	UsedBytes int64 `json:"used_bytes"`
}

// ValidationResult represents file content validation output
type ValidationResult struct {
	Valid    bool   `json:"valid"`
	Detected string `json:"detected"`
	Error    string `json:"error,omitempty"`
}

// SecurityCheckResult represents malicious file inspection result
type SecurityCheckResult struct {
	Safe   bool   `json:"safe"`
	Reason string `json:"reason,omitempty"`
}

