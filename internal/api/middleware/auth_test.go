package middleware_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/company/brilian-dms/internal/api/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testSecret = "unit_test_middleware_jwt_secret_9988"

func TestJWTManager_SignAndVerify_Roundtrip(t *testing.T) {
	mgr := middleware.NewJWTManager(testSecret)

	claims := middleware.Claims{
		Sub:      "usr-100",
		Username: "alice",
		Role:     middleware.RoleAdmin,
	}

	token, err := mgr.Sign(claims)
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	verified, err := mgr.Verify(token)
	require.NoError(t, err)
	assert.Equal(t, "usr-100", verified.Sub)
	assert.Equal(t, "alice", verified.Username)
	assert.Equal(t, middleware.RoleAdmin, verified.Role)
	assert.Greater(t, verified.Exp, verified.Iat)
}

func TestJWTManager_Sign_InvalidRole(t *testing.T) {
	mgr := middleware.NewJWTManager(testSecret)

	claims := middleware.Claims{
		Sub:      "usr-100",
		Username: "hacker",
		Role:     "superadmin_invalid",
	}

	_, err := mgr.Sign(claims)
	assert.ErrorIs(t, err, middleware.ErrInvalidRole)
}

func TestJWTManager_Verify_Failures(t *testing.T) {
	mgr := middleware.NewJWTManager(testSecret)

	t.Run("empty token", func(t *testing.T) {
		_, err := mgr.Verify("")
		assert.ErrorIs(t, err, middleware.ErrEmptyToken)
	})

	t.Run("malformed token missing parts", func(t *testing.T) {
		_, err := mgr.Verify("header.payload")
		assert.ErrorIs(t, err, middleware.ErrMalformedToken)
	})

	t.Run("tampered signature", func(t *testing.T) {
		token, err := mgr.Sign(middleware.Claims{
			Sub:      "usr-1",
			Username: "bob",
			Role:     middleware.RoleViewer,
		})
		require.NoError(t, err)

		parts := strings.Split(token, ".")
		tampered := parts[0] + "." + parts[1] + ".invalid_sig"

		_, err = mgr.Verify(tampered)
		assert.ErrorIs(t, err, middleware.ErrInvalidSignature)
	})

	t.Run("expired token", func(t *testing.T) {
		token, err := mgr.Sign(middleware.Claims{
			Sub:      "usr-1",
			Username: "bob",
			Role:     middleware.RoleViewer,
			Iat:      time.Now().Unix() - 100,
			Exp:      time.Now().Unix() - 10,
		})
		require.NoError(t, err)

		_, err = mgr.Verify(token)
		assert.ErrorIs(t, err, middleware.ErrTokenExpired)
	})
}

func TestRBAC_Matrix(t *testing.T) {
	assert.True(t, middleware.IsValidRole(middleware.RoleAdmin))
	assert.True(t, middleware.IsValidRole(middleware.RoleReviewer))
	assert.True(t, middleware.IsValidRole(middleware.RoleUploader))
	assert.True(t, middleware.IsValidRole(middleware.RoleViewer))
	assert.False(t, middleware.IsValidRole("superuser"))

	assert.True(t, middleware.HasPermission(middleware.RoleAdmin, "documents:upload"))
	assert.True(t, middleware.HasPermission(middleware.RoleAdmin, "workflow:action"))
	assert.True(t, middleware.HasPermission(middleware.RoleUploader, "documents:upload"))
	assert.False(t, middleware.HasPermission(middleware.RoleUploader, "workflow:action"))
	assert.False(t, middleware.HasPermission(middleware.RoleReviewer, "documents:upload"))
	assert.True(t, middleware.HasPermission(middleware.RoleReviewer, "workflow:action"))
	assert.True(t, middleware.HasPermission(middleware.RoleViewer, "documents:read"))
	assert.False(t, middleware.HasPermission(middleware.RoleViewer, "workflow:action"))
	assert.False(t, middleware.HasPermission("unknown_role", "documents:read"))
}

func TestAuthenticate_Middleware(t *testing.T) {
	mgr := middleware.NewJWTManager(testSecret)
	authMW := middleware.Authenticate(mgr)

	nextCalled := false
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := middleware.GetClaims(r.Context())
		assert.True(t, ok)
		assert.Equal(t, "alice", claims.Username)
		nextCalled = true
		w.WriteHeader(http.StatusOK)
	})

	handler := authMW(nextHandler)

	t.Run("missing header", func(t *testing.T) {
		nextCalled = false
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
		assert.False(t, nextCalled)
	})

	t.Run("valid token", func(t *testing.T) {
		token, _ := mgr.Sign(middleware.Claims{
			Sub:      "usr-1",
			Username: "alice",
			Role:     middleware.RoleAdmin,
		})
		nextCalled = false
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.True(t, nextCalled)
	})
}

func TestRequirePermission_Middleware(t *testing.T) {
	permMW := middleware.RequirePermission("workflow:action")

	nextCalled := false
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusOK)
	})

	handler := permMW(nextHandler)

	t.Run("forbidden role", func(t *testing.T) {
		nextCalled = false
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req = req.WithContext(middleware.ContextWithClaims(req.Context(), &middleware.Claims{
			Role: middleware.RoleViewer,
		}))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusForbidden, rec.Code)
		assert.False(t, nextCalled)
	})

	t.Run("allowed role", func(t *testing.T) {
		nextCalled = false
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req = req.WithContext(middleware.ContextWithClaims(req.Context(), &middleware.Claims{
			Role: middleware.RoleReviewer,
		}))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.True(t, nextCalled)
	})
}

func TestCORS_Middleware(t *testing.T) {
	nextCalled := false
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusOK)
	})

	corsHandler := middleware.CORS(nextHandler)

	t.Run("OPTIONS preflight", func(t *testing.T) {
		nextCalled = false
		req := httptest.NewRequest(http.MethodOptions, "/api/v1/resource", nil)
		rec := httptest.NewRecorder()
		corsHandler.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNoContent, rec.Code)
		assert.False(t, nextCalled)
		assert.Equal(t, "*", rec.Header().Get("Access-Control-Allow-Origin"))
		assert.NotEmpty(t, rec.Header().Get("Access-Control-Allow-Methods"))
		assert.NotEmpty(t, rec.Header().Get("Access-Control-Allow-Headers"))
	})

	t.Run("regular GET with CORS", func(t *testing.T) {
		nextCalled = false
		req := httptest.NewRequest(http.MethodGet, "/api/v1/resource", nil)
		rec := httptest.NewRecorder()
		corsHandler.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		assert.True(t, nextCalled)
		assert.Equal(t, "*", rec.Header().Get("Access-Control-Allow-Origin"))
	})
}

func TestWriteErrorJSON(t *testing.T) {
	// Directly verify JSON response helper behavior through unauthenticated middleware
	mgr := middleware.NewJWTManager(testSecret)
	authMW := middleware.Authenticate(mgr)
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()
	authMW(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})).ServeHTTP(rec, req)

	var res map[string]any
	err := json.Unmarshal(rec.Body.Bytes(), &res)
	require.NoError(t, err)
	assert.Equal(t, "error", res["status"])
	assert.Equal(t, "Missing or malformed Bearer authorization token", res["message"])
}
