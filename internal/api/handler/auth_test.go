package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/company/brilian-dms/internal/api/handler"
	"github.com/company/brilian-dms/internal/api/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testJWTSecret = "test_signing_secret_key_for_unit_tests_12345"

func TestAuthHandler_Login_Success(t *testing.T) {
	jwtMgr := middleware.NewJWTManager(testJWTSecret)
	authHandler := handler.NewAuthHandler(jwtMgr)

	tests := []struct {
		name         string
		username     string
		password     string
		expectedRole string
	}{
		{
			name:         "admin login",
			username:     "admin_brilian",
			password:     "securepassword",
			expectedRole: middleware.RoleAdmin,
		},
		{
			name:         "reviewer login",
			username:     "reviewer_1",
			password:     "reviewerpass",
			expectedRole: middleware.RoleReviewer,
		},
		{
			name:         "uploader login",
			username:     "uploader_1",
			password:     "uploaderpass",
			expectedRole: middleware.RoleUploader,
		},
		{
			name:         "viewer login",
			username:     "viewer_1",
			password:     "viewerpass",
			expectedRole: middleware.RoleViewer,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			payload := map[string]string{
				"username": tc.username,
				"password": tc.password,
			}
			body, _ := json.Marshal(payload)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()

			authHandler.Login(rec, req)

			assert.Equal(t, http.StatusOK, rec.Code)

			var res map[string]any
			err := json.Unmarshal(rec.Body.Bytes(), &res)
			require.NoError(t, err)

			assert.Equal(t, "success", res["status"])
			token, ok := res["token"].(string)
			require.True(t, ok)
			assert.NotEmpty(t, token)

			// Verify token claims
			claims, err := jwtMgr.Verify(token)
			require.NoError(t, err)
			assert.Equal(t, tc.expectedRole, claims.Role)
			assert.Equal(t, tc.username, claims.Username)
		})
	}
}

func TestAuthHandler_Login_InvalidCredentials(t *testing.T) {
	jwtMgr := middleware.NewJWTManager(testJWTSecret)
	authHandler := handler.NewAuthHandler(jwtMgr)

	tests := []struct {
		name     string
		username string
		password string
	}{
		{
			name:     "wrong password",
			username: "admin_brilian",
			password: "wrong_password_attempt",
		},
		{
			name:     "non-existent user",
			username: "ghost_user",
			password: "password123",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			payload := map[string]string{
				"username": tc.username,
				"password": tc.password,
			}
			body, _ := json.Marshal(payload)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()

			authHandler.Login(rec, req)

			assert.Equal(t, http.StatusUnauthorized, rec.Code)

			var res map[string]any
			err := json.Unmarshal(rec.Body.Bytes(), &res)
			require.NoError(t, err)
			assert.Equal(t, "error", res["status"])
			assert.Equal(t, "Invalid username or password", res["message"])
		})
	}
}

func TestAuthHandler_Login_MissingParameters(t *testing.T) {
	jwtMgr := middleware.NewJWTManager(testJWTSecret)
	authHandler := handler.NewAuthHandler(jwtMgr)

	tests := []struct {
		name    string
		payload any
	}{
		{
			name:    "empty username",
			payload: map[string]string{"username": "", "password": "securepassword"},
		},
		{
			name:    "whitespace username",
			payload: map[string]string{"username": "   ", "password": "securepassword"},
		},
		{
			name:    "missing password",
			payload: map[string]string{"username": "admin_brilian", "password": ""},
		},
		{
			name:    "malformed JSON",
			payload: "{malformed_json_here",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var body []byte
			switch v := tc.payload.(type) {
			case string:
				body = []byte(v)
			default:
				body, _ = json.Marshal(v)
			}

			req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()

			authHandler.Login(rec, req)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			var res map[string]any
			err := json.Unmarshal(rec.Body.Bytes(), &res)
			require.NoError(t, err)
			assert.Equal(t, "error", res["status"])
		})
	}
}

func TestAuthHandler_Login_MethodNotAllowed(t *testing.T) {
	jwtMgr := middleware.NewJWTManager(testJWTSecret)
	authHandler := handler.NewAuthHandler(jwtMgr)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/login", nil)
	rec := httptest.NewRecorder()

	authHandler.Login(rec, req)

	assert.Equal(t, http.StatusMethodNotAllowed, rec.Code)
}

func TestAuthHandler_RegisterUser(t *testing.T) {
	jwtMgr := middleware.NewJWTManager(testJWTSecret)
	authHandler := handler.NewAuthHandler(jwtMgr)

	authHandler.RegisterUser(handler.User{
		ID:       "usr-new-99",
		Username: "new_analyst",
		Role:     middleware.RoleReviewer,
		Password: "analyst_secret_pass",
	})

	payload := map[string]string{
		"username": "new_analyst",
		"password": "analyst_secret_pass",
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
	rec := httptest.NewRecorder()

	authHandler.Login(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	var res map[string]any
	err := json.Unmarshal(rec.Body.Bytes(), &res)
	require.NoError(t, err)
	assert.Equal(t, "success", res["status"])
}
