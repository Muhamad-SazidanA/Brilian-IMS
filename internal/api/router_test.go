package api_test

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/company/brilian-dms/internal/api"
	"github.com/company/brilian-dms/internal/api/middleware"
	"github.com/company/brilian-dms/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testSecret = "e2e_api_test_secret_12345"

func setupTestRouter() (http.Handler, *middleware.JWTManager) {
	jwtMgr := middleware.NewJWTManager(testSecret)
	cfg := &config.Config{
		ServerPort: "8080",
	}
	router := api.NewRouterWithSecret(cfg, testSecret)
	return router, jwtMgr
}

func TestRouter_HealthCheck(t *testing.T) {
	router, _ := setupTestRouter()

	endpoints := []string{"/health", "/api/v1/health"}

	for _, ep := range endpoints {
		t.Run("GET "+ep, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, ep, nil)
			rec := httptest.NewRecorder()

			router.ServeHTTP(rec, req)

			assert.Equal(t, http.StatusOK, rec.Code)
			var body map[string]string
			err := json.Unmarshal(rec.Body.Bytes(), &body)
			require.NoError(t, err)
			assert.Equal(t, "healthy", body["status"])
		})
	}
}

func TestRouter_CORS_PreflightAndHeaders(t *testing.T) {
	router, _ := setupTestRouter()

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/documents/upload", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Access-Control-Request-Method", "POST")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Equal(t, "*", rec.Header().Get("Access-Control-Allow-Origin"))
	assert.Contains(t, rec.Header().Get("Access-Control-Allow-Methods"), "POST")
	assert.Contains(t, rec.Header().Get("Access-Control-Allow-Headers"), "Authorization")
}

func TestRouter_NotFound_APIRoute(t *testing.T) {
	router, _ := setupTestRouter()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/nonexistent", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNotFound, rec.Code)
	var body map[string]any
	err := json.Unmarshal(rec.Body.Bytes(), &body)
	require.NoError(t, err)
	assert.Equal(t, "error", body["status"])
	assert.Contains(t, body["message"], "Endpoint not found: GET /api/v1/nonexistent")
}

func TestRouter_FullLifecycleFlow(t *testing.T) {
	router, jwtMgr := setupTestRouter()

	// 1. Login with valid admin credentials
	loginBody, _ := json.Marshal(map[string]string{
		"username": "admin_brilian",
		"password": "securepassword",
	})
	loginReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(loginBody))
	loginReq.Header.Set("Content-Type", "application/json")
	loginRec := httptest.NewRecorder()

	router.ServeHTTP(loginRec, loginReq)

	assert.Equal(t, http.StatusOK, loginRec.Code)
	var loginRes map[string]any
	err := json.Unmarshal(loginRec.Body.Bytes(), &loginRes)
	require.NoError(t, err)
	assert.Equal(t, "success", loginRes["status"])
	adminToken := loginRes["token"].(string)
	assert.NotEmpty(t, adminToken)

	// Issue tokens for other roles
	uploaderToken, _ := jwtMgr.Sign(middleware.Claims{
		Sub:      "usr-upl-1",
		Username: "uploader_1",
		Role:     middleware.RoleUploader,
	})
	reviewerToken, _ := jwtMgr.Sign(middleware.Claims{
		Sub:      "usr-rev-1",
		Username: "reviewer_1",
		Role:     middleware.RoleReviewer,
	})
	viewerToken, _ := jwtMgr.Sign(middleware.Claims{
		Sub:      "usr-viw-1",
		Username: "viewer_1",
		Role:     middleware.RoleViewer,
	})

	// 2. Upload Document as Uploader (Multipart Form)
	multipartBody := &bytes.Buffer{}
	writer := multipart.NewWriter(multipartBody)
	_ = writer.WriteField("title", "Perjanjian Kerjasama 2026.pdf")
	_ = writer.WriteField("folder_id", "fld-uuid-1234")
	part, _ := writer.CreateFormFile("file", "contract.pdf")
	_, _ = part.Write([]byte("binary_content_stream"))
	_ = writer.Close()

	uploadReq := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", multipartBody)
	uploadReq.Header.Set("Content-Type", writer.FormDataContentType())
	uploadReq.Header.Set("Authorization", "Bearer "+uploaderToken)
	uploadRec := httptest.NewRecorder()

	router.ServeHTTP(uploadRec, uploadReq)

	assert.Equal(t, http.StatusCreated, uploadRec.Code)
	var uploadRes map[string]any
	err = json.Unmarshal(uploadRec.Body.Bytes(), &uploadRes)
	require.NoError(t, err)
	assert.Equal(t, "success", uploadRes["status"])
	docID := uploadRes["document_id"].(string)
	assert.NotEmpty(t, docID)
	assert.Contains(t, uploadRes["message"], "Dokumen berhasil diunggah")

	// 3. Upload rejected for Viewer (403)
	badUploadReq := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", bytes.NewReader([]byte(`{"title":"Illegal.pdf","folder_id":"fld-1","file":"data"}`)))
	badUploadReq.Header.Set("Content-Type", "application/json")
	badUploadReq.Header.Set("Authorization", "Bearer "+viewerToken)
	badUploadRec := httptest.NewRecorder()

	router.ServeHTTP(badUploadRec, badUploadReq)

	assert.Equal(t, http.StatusForbidden, badUploadRec.Code)
	var badUploadRes map[string]any
	_ = json.Unmarshal(badUploadRec.Body.Bytes(), &badUploadRes)
	assert.Contains(t, badUploadRes["message"], "insufficient role permissions")

	// 4. Compare Documents as Reviewer
	compareBody, _ := json.Marshal(map[string]any{
		"document_ids": []string{"doc-v1-uuid", "doc-v2-uuid"},
		"query":        "Bandingkan perubahan nilai klausul denda pada kedua kontrak ini.",
	})
	compareReq := httptest.NewRequest(http.MethodPost, "/api/v1/ai/compare", bytes.NewReader(compareBody))
	compareReq.Header.Set("Content-Type", "application/json")
	compareReq.Header.Set("Authorization", "Bearer "+reviewerToken)
	compareRec := httptest.NewRecorder()

	router.ServeHTTP(compareRec, compareReq)

	assert.Equal(t, http.StatusOK, compareRec.Code)
	var compareRes map[string]any
	_ = json.Unmarshal(compareRec.Body.Bytes(), &compareRes)
	assert.Equal(t, "success", compareRes["status"])
	assert.Contains(t, compareRes["comparison_result"], "| Parameter | Kontrak 2025 | Kontrak 2026 |")
	citations := compareRes["citations"].([]any)
	assert.Len(t, citations, 2)

	// 5. Query AI Q&A as Viewer
	qaBody, _ := json.Marshal(map[string]string{
		"document_id": "doc-v1-uuid",
		"question":    "Berapa tanggal jatuh tempo pembayaran?",
	})
	qaReq := httptest.NewRequest(http.MethodPost, "/api/v1/ai/qa", bytes.NewReader(qaBody))
	qaReq.Header.Set("Content-Type", "application/json")
	qaReq.Header.Set("Authorization", "Bearer "+viewerToken)
	qaRec := httptest.NewRecorder()

	router.ServeHTTP(qaRec, qaReq)

	assert.Equal(t, http.StatusOK, qaRec.Code)
	var qaRes map[string]any
	_ = json.Unmarshal(qaRec.Body.Bytes(), &qaRes)
	assert.Equal(t, "success", qaRes["status"])
	assert.Contains(t, qaRes["answer"], "30 hari setelah invoice diterbitkan")
	assert.Equal(t, float64(2), qaRes["page_reference"])

	// 6. Approve Workflow as Reviewer
	wfBody, _ := json.Marshal(map[string]string{
		"action": "approve",
		"notes":  "Dokumen sudah sesuai dengan ketentuan hukum.",
	})
	wfReq := httptest.NewRequest(http.MethodPut, "/api/v1/workflows/wf-9988/action", bytes.NewReader(wfBody))
	wfReq.Header.Set("Content-Type", "application/json")
	wfReq.Header.Set("Authorization", "Bearer "+reviewerToken)
	wfRec := httptest.NewRecorder()

	router.ServeHTTP(wfRec, wfReq)

	assert.Equal(t, http.StatusOK, wfRec.Code)
	var wfRes map[string]any
	_ = json.Unmarshal(wfRec.Body.Bytes(), &wfRes)
	assert.Equal(t, "success", wfRes["status"])
	assert.Contains(t, wfRes["message"], "Status workflow berhasil diperbarui")

	// 7. Workflow Action rejected for Uploader (403)
	badWfBody, _ := json.Marshal(map[string]string{
		"action": "approve",
		"notes":  "Self-approval attempt",
	})
	badWfReq := httptest.NewRequest(http.MethodPut, "/api/v1/workflows/wf-9988/action", bytes.NewReader(badWfBody))
	badWfReq.Header.Set("Content-Type", "application/json")
	badWfReq.Header.Set("Authorization", "Bearer "+uploaderToken)
	badWfRec := httptest.NewRecorder()

	router.ServeHTTP(badWfRec, badWfReq)

	assert.Equal(t, http.StatusForbidden, badWfRec.Code)
	var badWfRes map[string]any
	_ = json.Unmarshal(badWfRec.Body.Bytes(), &badWfRes)
	assert.Contains(t, badWfRes["message"], "role does not have workflow action permission")
}

func TestRouter_AuthToken_Rejections(t *testing.T) {
	router, jwtMgr := setupTestRouter()

	t.Run("missing authorization header", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("malformed non-Bearer scheme", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", nil)
		req.Header.Set("Authorization", "Basic dXNlcjpwYXNz")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("malformed token string", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", nil)
		req.Header.Set("Authorization", "Bearer not_a_jwt_token")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("expired JWT token", func(t *testing.T) {
		expiredToken, err := jwtMgr.Sign(middleware.Claims{
			Sub:      "usr-1",
			Username: "user_test",
			Role:     middleware.RoleAdmin,
			Iat:      time.Now().Unix() - 7200,
			Exp:      time.Now().Unix() - 3600, // expired 1 hour ago
		})
		require.NoError(t, err)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", nil)
		req.Header.Set("Authorization", "Bearer "+expiredToken)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
		assert.Contains(t, rec.Body.String(), "JWT token has expired")
	})

	t.Run("tampered signature", func(t *testing.T) {
		validToken, err := jwtMgr.Sign(middleware.Claims{
			Sub:      "usr-1",
			Username: "user_test",
			Role:     middleware.RoleAdmin,
		})
		require.NoError(t, err)

		parts := strings.Split(validToken, ".")
		tamperedToken := parts[0] + "." + parts[1] + ".tampered_signature_bytes"

		req := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", nil)
		req.Header.Set("Authorization", "Bearer "+tamperedToken)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
		assert.Contains(t, rec.Body.String(), "Invalid JWT signature")
	})
}
