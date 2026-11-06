package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/company/brilian-dms/internal/api/middleware"
	"github.com/company/brilian-dms/internal/rbac"
	"github.com/company/brilian-dms/internal/watermark"
)

// AdminUser represents a manageable user profile with dual-axis RBAC attributes
type AdminUser struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	Division string `json:"division"`
	Level    string `json:"level"`
}

// UpdateUserRequest represents the payload for PUT /api/v1/admin/users/:id
type UpdateUserRequest struct {
	Name     string `json:"name,omitempty"`
	Role     string `json:"role,omitempty"`
	Division string `json:"division,omitempty"`
	Level    string `json:"level,omitempty"`
}

// UpdateWatermarkRequest represents the payload for PUT /api/v1/admin/watermark
type UpdateWatermarkRequest struct {
	Opacity    *float64 `json:"opacity,omitempty"`
	Angle      *float64 `json:"angle,omitempty"`
	BannerText *string  `json:"banner_text,omitempty"`
}

// AdminHandler manages users, security policies, and dynamic watermark configuration
type AdminHandler struct {
	mu              sync.RWMutex
	users           map[string]AdminUser
	watermarkConfig watermark.Config
	policyMatrix    *rbac.PolicyMatrix
}

// NewAdminHandler initializes AdminHandler with default seed data
func NewAdminHandler() *AdminHandler {
	seedUsers := map[string]AdminUser{
		"usr-admin-1": {
			ID:       "usr-admin-1",
			Username: "admin_brilian",
			Name:     "Budi Santoso",
			Role:     middleware.RoleAdmin,
			Division: rbac.DivisionALL,
			Level:    rbac.LevelL5,
		},
		"usr-rev-1": {
			ID:       "usr-rev-1",
			Username: "reviewer_1",
			Name:     "Dewi Lestari",
			Role:     middleware.RoleReviewer,
			Division: rbac.DivisionLegal,
			Level:    rbac.LevelL3,
		},
		"usr-upl-1": {
			ID:       "usr-upl-1",
			Username: "uploader_1",
			Name:     "Ahmad Fauzi",
			Role:     middleware.RoleUploader,
			Division: rbac.DivisionHR,
			Level:    rbac.LevelL2,
		},
		"usr-viw-1": {
			ID:       "usr-viw-1",
			Username: "viewer_1",
			Name:     "Rina Wijaya",
			Role:     middleware.RoleViewer,
			Division: rbac.DivisionFinance,
			Level:    rbac.LevelL2,
		},
	}

	return &AdminHandler{
		users:           seedUsers,
		watermarkConfig: watermark.DefaultConfig(),
		policyMatrix:    rbac.DefaultPolicyMatrix(),
	}
}

// GetWatermarkConfigValue returns the current watermark config safely
func (h *AdminHandler) GetWatermarkConfigValue() watermark.Config {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.watermarkConfig
}

// ListUsers handles GET /api/v1/admin/users
func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims, ok := middleware.GetClaims(r.Context())
	if !ok || claims == nil {
		WriteError(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
		return
	}
	if claims.Role != middleware.RoleAdmin {
		WriteError(w, http.StatusForbidden, "Forbidden: admin only")
		return
	}

	h.mu.RLock()
	list := make([]AdminUser, 0, len(h.users))
	for _, u := range h.users {
		list = append(list, u)
	}
	h.mu.RUnlock()

	WriteJSON(w, http.StatusOK, map[string]any{
		"status": "success",
		"users":  list,
		"count":  len(list),
	})
}

// UpdateUser handles PUT /api/v1/admin/users/{id}
func (h *AdminHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims, ok := middleware.GetClaims(r.Context())
	if !ok || claims == nil {
		WriteError(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
		return
	}
	if claims.Role != middleware.RoleAdmin {
		WriteError(w, http.StatusForbidden, "Forbidden: admin only")
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 4 {
		WriteError(w, http.StatusBadRequest, "Missing user ID in path")
		return
	}
	targetID := pathParts[len(pathParts)-1]

	var req UpdateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	h.mu.Lock()
	user, exists := h.users[targetID]
	if !exists {
		h.mu.Unlock()
		WriteError(w, http.StatusNotFound, fmt.Sprintf("User with ID %s not found", targetID))
		return
	}

	if req.Name != "" {
		user.Name = req.Name
	}
	if req.Role != "" {
		if !middleware.IsValidRole(req.Role) {
			h.mu.Unlock()
			WriteError(w, http.StatusBadRequest, fmt.Sprintf("Invalid role: %s", req.Role))
			return
		}
		user.Role = req.Role
	}
	if req.Division != "" {
		if !rbac.IsValidDivision(req.Division) {
			h.mu.Unlock()
			WriteError(w, http.StatusBadRequest, fmt.Sprintf("Invalid division: %s", req.Division))
			return
		}
		user.Division = req.Division
	}
	if req.Level != "" {
		if !rbac.IsValidLevel(req.Level) {
			h.mu.Unlock()
			WriteError(w, http.StatusBadRequest, fmt.Sprintf("Invalid level: %s", req.Level))
			return
		}
		user.Level = req.Level
	}

	h.users[targetID] = user
	h.mu.Unlock()

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":  "success",
		"user":    user,
		"message": "User attributes successfully updated.",
	})
}

// GetPolicies handles GET /api/v1/admin/policies
func (h *AdminHandler) GetPolicies(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims, ok := middleware.GetClaims(r.Context())
	if !ok || claims == nil {
		WriteError(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
		return
	}
	if claims.Role != middleware.RoleAdmin {
		WriteError(w, http.StatusForbidden, "Forbidden: admin only")
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":           "success",
		"rules":            h.policyMatrix.GetRules(),
		"watermark_config": h.watermarkConfig,
		"divisions":        rbac.ValidDivisions,
		"levels":           rbac.ValidLevels,
		"classifications":  rbac.ValidClassifications,
	})
}

// UpdatePolicies handles PUT /api/v1/admin/policies
func (h *AdminHandler) UpdatePolicies(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims, ok := middleware.GetClaims(r.Context())
	if !ok || claims == nil {
		WriteError(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
		return
	}
	if claims.Role != middleware.RoleAdmin {
		WriteError(w, http.StatusForbidden, "Forbidden: admin only")
		return
	}

	var payload struct {
		Rules           []rbac.PolicyRule  `json:"rules,omitempty"`
		WatermarkConfig *watermark.Config  `json:"watermark_config,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	if len(payload.Rules) > 0 {
		h.policyMatrix.UpdateRules(payload.Rules)
	}

	if payload.WatermarkConfig != nil {
		op := payload.WatermarkConfig.DefaultOpacity
		if op < watermark.MinOpacity || op > watermark.MaxOpacity {
			WriteError(w, http.StatusBadRequest, "Opacity must be bounded strictly between 0.15 and 0.25")
			return
		}
		h.watermarkConfig = *payload.WatermarkConfig
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":           "success",
		"rules":            h.policyMatrix.GetRules(),
		"watermark_config": h.watermarkConfig,
		"message":          "Security policies updated.",
	})
}

// GetWatermark handles GET /api/v1/admin/watermark
func (h *AdminHandler) GetWatermark(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims, ok := middleware.GetClaims(r.Context())
	if !ok || claims == nil {
		WriteError(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
		return
	}
	if claims.Role != middleware.RoleAdmin {
		WriteError(w, http.StatusForbidden, "Forbidden: admin only")
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	WriteJSON(w, http.StatusOK, map[string]any{
		"status": "success",
		"config": h.watermarkConfig,
	})
}

// UpdateWatermark handles PUT /api/v1/admin/watermark
func (h *AdminHandler) UpdateWatermark(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims, ok := middleware.GetClaims(r.Context())
	if !ok || claims == nil {
		WriteError(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
		return
	}
	if claims.Role != middleware.RoleAdmin {
		WriteError(w, http.StatusForbidden, "Forbidden: admin only")
		return
	}

	var req UpdateWatermarkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	if req.Opacity != nil {
		op := *req.Opacity
		if op < watermark.MinOpacity || op > watermark.MaxOpacity {
			WriteError(w, http.StatusBadRequest, "Opacity must be bounded strictly between 0.15 and 0.25")
			return
		}
		h.watermarkConfig.DefaultOpacity = op
	}

	if req.Angle != nil {
		h.watermarkConfig.DefaultAngle = *req.Angle
	}

	if req.BannerText != nil {
		h.watermarkConfig.BannerText = *req.BannerText
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":  "success",
		"config":  h.watermarkConfig,
		"message": "Watermark configuration updated.",
	})
}
