package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/company/brilian-dms/internal/api/middleware"
)

// WorkflowRecord stores workflow action history and state
type WorkflowRecord struct {
	ID         string    `json:"id"`
	LastAction string    `json:"last_action"`
	Notes      string    `json:"notes"`
	ActionBy   string    `json:"action_by"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// WorkflowActionRequest represents request body for PUT /api/v1/workflows/{id}/action
type WorkflowActionRequest struct {
	Action string `json:"action"`
	Notes  string `json:"notes"`
}

// WorkflowHandler handles workflow actions
type WorkflowHandler struct {
	workflows map[string]WorkflowRecord
	mu        sync.RWMutex
}

// NewWorkflowHandler initializes WorkflowHandler
func NewWorkflowHandler() *WorkflowHandler {
	return &WorkflowHandler{
		workflows: make(map[string]WorkflowRecord),
	}
}

// GetWorkflow returns workflow record by ID
func (h *WorkflowHandler) GetWorkflow(id string) (WorkflowRecord, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	rec, ok := h.workflows[id]
	return rec, ok
}

// Action handles PUT /api/v1/workflows/{id}/action
func (h *WorkflowHandler) Action(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims, ok := middleware.GetClaims(r.Context())
	if !ok || claims == nil {
		WriteError(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
		return
	}

	if !middleware.HasPermission(claims.Role, "workflow:action") {
		WriteError(w, http.StatusForbidden, "Forbidden: role does not have workflow action permission")
		return
	}

	// Extract path value {id}
	workflowID := r.PathValue("id")
	if workflowID == "" {
		// Fallback URL parser for /api/v1/workflows/{id}/action
		pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		for i, part := range pathParts {
			if part == "workflows" && i+2 < len(pathParts) && pathParts[i+2] == "action" {
				workflowID = pathParts[i+1]
				break
			}
		}
	}

	if workflowID == "" {
		WriteError(w, http.StatusBadRequest, "Invalid workflow identifier")
		return
	}

	var req WorkflowActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	validActions := map[string]bool{
		"approve": true,
		"reject":  true,
		"revise":  true,
	}

	if !validActions[req.Action] {
		WriteError(w, http.StatusBadRequest, fmt.Sprintf("Invalid action. Must be one of: approve, reject, revise (got: %s)", req.Action))
		return
	}

	record := WorkflowRecord{
		ID:         workflowID,
		LastAction: req.Action,
		Notes:      req.Notes,
		ActionBy:   claims.Sub,
		UpdatedAt:  time.Now(),
	}

	h.mu.Lock()
	h.workflows[workflowID] = record
	h.mu.Unlock()

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":  "success",
		"message": "Status workflow berhasil diperbarui.",
	})
}
