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

// UploadHandler manages HTTP chunked resumable upload requests
type UploadHandler struct {
	engine *dms.Engine
}

// NewUploadHandler creates a new UploadHandler backed by the DMS engine
func NewUploadHandler(engine *dms.Engine) *UploadHandler {
	return &UploadHandler{engine: engine}
}

// UploadInitRequest defines parameters for initiating resumable upload
type UploadInitRequest struct {
	Filename       string `json:"filename"`
	TotalSize      int64  `json:"total_size"`
	MimeType       string `json:"mime_type"`
	FolderID       string `json:"folder_id"`
	Classification string `json:"classification"`
	Division       string `json:"division"`
}

// Init handles POST /api/v1/documents/upload/init
func (h *UploadHandler) Init(w http.ResponseWriter, r *http.Request) {
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

	var req UploadInitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}

	if strings.TrimSpace(req.Filename) == "" {
		WriteError(w, http.StatusBadRequest, "Valid filename is required")
		return
	}
	if req.TotalSize <= 0 {
		WriteError(w, http.StatusBadRequest, "total_size must be a positive number")
		return
	}

	userID := claims.Sub
	if userID == "" {
		userID = "anonymous"
	}

	session, err := h.engine.InitUploadSession(
		userID,
		req.Filename,
		req.TotalSize,
		req.MimeType,
		req.FolderID,
		req.Classification,
		req.Division,
	)
	if err != nil {
		if strings.Contains(err.Error(), "Storage quota exceeded") {
			WriteError(w, http.StatusRequestEntityTooLarge, err.Error())
			return
		}
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{
		"status":       "success",
		"session_id":   session.SessionID,
		"chunk_size":   session.ChunkSize,
		"total_chunks": session.TotalChunks,
	})
}

// Chunk handles POST /api/v1/documents/upload/chunk
func (h *UploadHandler) Chunk(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims, ok := middleware.GetClaims(r.Context())
	if !ok || claims == nil {
		WriteError(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
		return
	}

	var sessionID string
	var chunkIndex int
	var chunkHash string
	var chunkBytes []byte

	contentType := r.Header.Get("Content-Type")

	if strings.HasPrefix(contentType, "application/json") {
		var req struct {
			SessionID  string `json:"session_id"`
			ChunkIndex int    `json:"chunk_index"`
			ChunkHash  string `json:"chunk_hash"`
			File       any    `json:"file"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "Invalid JSON payload")
			return
		}
		sessionID = req.SessionID
		chunkIndex = req.ChunkIndex
		chunkHash = req.ChunkHash

		switch v := req.File.(type) {
		case string:
			chunkBytes = []byte(v)
		case []byte:
			chunkBytes = v
		default:
			if req.File != nil {
				chunkBytes, _ = json.Marshal(req.File)
			}
		}
	} else {
		// Multipart form handling
		if err := r.ParseMultipartForm(32 << 20); err != nil {
			_ = r.ParseForm()
		}

		sessionID = r.FormValue("session_id")
		if idxStr := r.FormValue("chunk_index"); idxStr != "" {
			chunkIndex, _ = strconv.Atoi(idxStr)
		}
		chunkHash = r.FormValue("chunk_hash")

		file, _, err := r.FormFile("file")
		if err == nil && file != nil {
			defer file.Close()
			chunkBytes, _ = io.ReadAll(file)
		} else if fVal := r.FormValue("file"); fVal != "" {
			chunkBytes = []byte(fVal)
		}
	}

	if sessionID == "" {
		WriteError(w, http.StatusBadRequest, "session_id is required")
		return
	}

	received, total, percent, err := h.engine.ReceiveChunk(sessionID, chunkIndex, chunkHash, chunkBytes)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":   "success",
		"received": received,
		"total":    total,
		"percent":  percent,
	})
}

// Status handles GET /api/v1/documents/upload/status/{id}
func (h *UploadHandler) Status(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 5 {
		WriteError(w, http.StatusBadRequest, "Missing session ID in path")
		return
	}
	sessionID := pathParts[len(pathParts)-1]

	status, receivedChunks, totalChunks, percent, err := h.engine.GetUploadStatus(sessionID)
	if err != nil {
		WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":          status,
		"received_chunks": receivedChunks,
		"total_chunks":    totalChunks,
		"percent":         percent,
	})
}

// Complete handles POST /api/v1/documents/upload/complete
func (h *UploadHandler) Complete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims, ok := middleware.GetClaims(r.Context())
	if !ok || claims == nil {
		WriteError(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
		return
	}

	var req struct {
		SessionID string `json:"session_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}
	if req.SessionID == "" {
		WriteError(w, http.StatusBadRequest, "session_id is required")
		return
	}

	doc, version, err := h.engine.CompleteUploadSession(req.SessionID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		if strings.Contains(err.Error(), "MIME spoofing") {
			WriteError(w, http.StatusUnsupportedMediaType, err.Error())
			return
		}
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{
		"status":      "success",
		"document_id": doc.ID,
		"version":     version,
		"document": map[string]any{
			"id":              doc.ID,
			"title":           doc.Title,
			"current_version": doc.CurrentVersion,
			"file_size":       doc.FileSize,
			"classification":  doc.Classification,
			"division":        doc.Division,
		},
	})
}

