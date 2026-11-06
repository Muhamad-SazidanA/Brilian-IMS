package handler

import (
	"encoding/json"
	"net/http"

	"github.com/company/brilian-dms/internal/api/middleware"
	"github.com/company/brilian-dms/internal/rbac"
)

// RBACCheckRequest represents the payload for POST /api/v1/rbac/check
type RBACCheckRequest struct {
	DocClassification string `json:"doc_classification"`
	DocDivision       string `json:"doc_division"`
	Action            string `json:"action,omitempty"`
}

// RBACHandler provides endpoints for real-time access permission evaluations
type RBACHandler struct{}

// NewRBACHandler creates a new RBACHandler instance
func NewRBACHandler() *RBACHandler {
	return &RBACHandler{}
}

// Check evaluates document access for the authenticated caller
func (h *RBACHandler) Check(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims, ok := middleware.GetClaims(r.Context())
	if !ok || claims == nil {
		WriteError(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
		return
	}

	var req RBACCheckRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	rbacUser := middleware.ToRBACUser(claims)
	action := req.Action
	if action == "" {
		action = rbac.ActionView
	}

	access := rbac.EvaluateAccess(rbacUser, req.DocClassification, req.DocDivision, action)
	perms := rbac.EvaluatePermissions(rbacUser, req.DocClassification, req.DocDivision)

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":       "success",
		"allowed":      access.Allowed,
		"can_view":     perms.CanView,
		"can_download": perms.CanDownload,
		"reason":       access.Reason,
		"action":       action,
		"user": map[string]any{
			"user_id":  rbacUser.UserID,
			"division": rbacUser.Division,
			"level":    rbacUser.Level,
			"role":     rbacUser.Role,
		},
	})
}

// Permissions returns the authenticated caller's claims and permission matrix summary
func (h *RBACHandler) Permissions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims, ok := middleware.GetClaims(r.Context())
	if !ok || claims == nil {
		WriteError(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
		return
	}

	rbacUser := middleware.ToRBACUser(claims)

	// Build user-specific capabilities for all standard classifications
	matrixSummary := make(map[string]map[string]bool)
	for _, cls := range rbac.ValidClassifications {
		sameDivPerms := rbac.EvaluatePermissions(rbacUser, cls, rbacUser.Division)
		matrixSummary[cls] = map[string]bool{
			"can_view":     sameDivPerms.CanView,
			"can_download": sameDivPerms.CanDownload,
		}
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status": "success",
		"user": map[string]any{
			"user_id":  rbacUser.UserID,
			"username": rbacUser.Username,
			"name":     rbacUser.Name,
			"division": rbacUser.Division,
			"level":    rbacUser.Level,
			"role":     rbacUser.Role,
		},
		"permissions": matrixSummary,
	})
}
