package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/company/brilian-dms/internal/api/handler"
	"github.com/company/brilian-dms/internal/api/middleware"
	"github.com/company/brilian-dms/internal/rbac"
)

func TestRBACHandler_CheckAndPermissions(t *testing.T) {
	rbacHandler := handler.NewRBACHandler()

	// Authenticated claims for L2 Finance user
	claims := &middleware.Claims{
		Sub:      "usr-viw-1",
		UserID:   "usr-viw-1",
		Username: "viewer_1",
		Name:     "Rina Wijaya",
		Role:     "viewer",
		Division: "Finance",
		Level:    "L2",
	}

	t.Run("Check View on Internal document", func(t *testing.T) {
		body, _ := json.Marshal(handler.RBACCheckRequest{
			DocClassification: "Internal",
			DocDivision:       "HR",
			Action:            "view",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/rbac/check", bytes.NewReader(body))
		ctx := middleware.ContextWithClaims(req.Context(), claims)
		w := httptest.NewRecorder()

		rbacHandler.Check(w, req.WithContext(ctx))

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var res struct {
			Status      string `json:"status"`
			Allowed     bool   `json:"allowed"`
			CanView     bool   `json:"can_view"`
			CanDownload bool   `json:"can_download"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatalf("Failed to parse response: %v", err)
		}

		if !res.Allowed || !res.CanView || !res.CanDownload {
			t.Errorf("Expected view and download allowed for L2 on Internal, got %+v", res)
		}
	})

	t.Run("Check Download on Rahasia cross-division document rejected", func(t *testing.T) {
		body, _ := json.Marshal(handler.RBACCheckRequest{
			DocClassification: "Rahasia",
			DocDivision:       "Legal",
			Action:            "download",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/rbac/check", bytes.NewReader(body))
		ctx := middleware.ContextWithClaims(req.Context(), claims)
		w := httptest.NewRecorder()

		rbacHandler.Check(w, req.WithContext(ctx))

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d", w.Code)
		}

		var res struct {
			Allowed bool   `json:"allowed"`
			Reason  string `json:"reason"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		if res.Allowed {
			t.Errorf("Expected cross-division Rahasia download to be rejected")
		}
	})

	t.Run("Permissions returns user matrix summary", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/rbac/permissions", nil)
		ctx := middleware.ContextWithClaims(req.Context(), claims)
		w := httptest.NewRecorder()

		rbacHandler.Permissions(w, req.WithContext(ctx))

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d", w.Code)
		}

		var res struct {
			Status      string                          `json:"status"`
			User        map[string]any                  `json:"user"`
			Permissions map[string]map[string]bool      `json:"permissions"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatalf("Failed to parse response: %v", err)
		}

		if res.Permissions["Publik"]["can_view"] != true {
			t.Errorf("Expected Publik can_view to be true")
		}
	})
}

func TestAdminHandler_UsersAndPolicies(t *testing.T) {
	adminHandler := handler.NewAdminHandler()

	adminClaims := &middleware.Claims{
		Sub:      "usr-admin-1",
		Role:     middleware.RoleAdmin,
		Division: "ALL",
		Level:    "L5",
	}

	viewerClaims := &middleware.Claims{
		Sub:      "usr-viw-1",
		Role:     middleware.RoleViewer,
		Division: "Finance",
		Level:    "L2",
	}

	t.Run("Non-admin cannot list users", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/users", nil)
		ctx := middleware.ContextWithClaims(req.Context(), viewerClaims)
		w := httptest.NewRecorder()

		adminHandler.ListUsers(w, req.WithContext(ctx))
		if w.Code != http.StatusForbidden {
			t.Errorf("Expected 403 Forbidden, got %d", w.Code)
		}
	})

	t.Run("Admin can list users", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/users", nil)
		ctx := middleware.ContextWithClaims(req.Context(), adminClaims)
		w := httptest.NewRecorder()

		adminHandler.ListUsers(w, req.WithContext(ctx))
		if w.Code != http.StatusOK {
			t.Errorf("Expected 200 OK, got %d", w.Code)
		}
	})

	t.Run("Admin can update user division and level", func(t *testing.T) {
		body, _ := json.Marshal(handler.UpdateUserRequest{
			Division: rbac.DivisionIT,
			Level:    rbac.LevelL4,
		})
		req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/users/usr-viw-1", bytes.NewReader(body))
		ctx := middleware.ContextWithClaims(req.Context(), adminClaims)
		w := httptest.NewRecorder()

		adminHandler.UpdateUser(w, req.WithContext(ctx))
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Admin watermark configuration updates within valid range", func(t *testing.T) {
		validOpacity := 0.22
		body, _ := json.Marshal(handler.UpdateWatermarkRequest{
			Opacity: &validOpacity,
		})
		req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/watermark", bytes.NewReader(body))
		ctx := middleware.ContextWithClaims(req.Context(), adminClaims)
		w := httptest.NewRecorder()

		adminHandler.UpdateWatermark(w, req.WithContext(ctx))
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		// Reject out-of-bounds opacity (0.50)
		badOpacity := 0.50
		badBody, _ := json.Marshal(handler.UpdateWatermarkRequest{
			Opacity: &badOpacity,
		})
		badReq := httptest.NewRequest(http.MethodPut, "/api/v1/admin/watermark", bytes.NewReader(badBody))
		badCtx := middleware.ContextWithClaims(badReq.Context(), adminClaims)
		badW := httptest.NewRecorder()

		adminHandler.UpdateWatermark(badW, badReq.WithContext(badCtx))
		if badW.Code != http.StatusBadRequest {
			t.Errorf("Expected 400 Bad Request on out-of-bounds opacity, got %d", badW.Code)
		}
	})
}
