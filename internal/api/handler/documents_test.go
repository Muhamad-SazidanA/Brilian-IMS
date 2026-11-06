package handler_test

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/company/brilian-dms/internal/api/handler"
	"github.com/company/brilian-dms/internal/api/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func createAuthenticatedContextRequest(method, target string, body io.Reader, role, userID string) *http.Request {
	req := httptest.NewRequest(method, target, body)
	claims := &middleware.Claims{
		Sub:      userID,
		Username: "user_" + role,
		Role:     role,
	}
	ctx := middleware.ContextWithClaims(req.Context(), claims)
	return req.WithContext(ctx)
}

func TestDocumentHandler_Upload_Multipart_Success(t *testing.T) {
	docHandler := handler.NewDocumentHandler()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("title", "Perjanjian Kerjasama 2026.pdf")
	_ = writer.WriteField("folder_id", "fld-uuid-1234")

	part, err := writer.CreateFormFile("file", "contract.pdf")
	require.NoError(t, err)
	_, _ = part.Write([]byte("%PDF-1.7 mock document stream"))
	_ = writer.Close()

	req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/documents/upload", body, middleware.RoleUploader, "usr-upl-1")
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rec := httptest.NewRecorder()

	docHandler.Upload(rec, req)

	assert.Equal(t, http.StatusCreated, rec.Code)

	var res map[string]any
	err = json.Unmarshal(rec.Body.Bytes(), &res)
	require.NoError(t, err)

	assert.Equal(t, "success", res["status"])
	docID, ok := res["document_id"].(string)
	require.True(t, ok)
	assert.NotEmpty(t, docID)
	assert.Contains(t, res["message"], "Dokumen berhasil diunggah")

	// Verify genuine in-memory state
	savedDoc, exists := docHandler.GetDocument(docID)
	require.True(t, exists)
	assert.Equal(t, "Perjanjian Kerjasama 2026.pdf", savedDoc.Title)
	assert.Equal(t, "fld-uuid-1234", savedDoc.FolderID)
	assert.Equal(t, "draft", savedDoc.Status)
	assert.Equal(t, "usr-upl-1", savedDoc.UploadedBy)
	assert.Equal(t, []byte("%PDF-1.7 mock document stream"), savedDoc.Content)
}

func TestDocumentHandler_Upload_JSON_Success(t *testing.T) {
	docHandler := handler.NewDocumentHandler()

	payload := map[string]string{
		"title":     "Legal Policy Memo.docx",
		"folder_id": "fld-legal-99",
		"file":      "mock_base64_or_raw_string_data",
	}
	body, _ := json.Marshal(payload)

	req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/documents/upload", bytes.NewReader(body), middleware.RoleAdmin, "usr-admin-1")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	docHandler.Upload(rec, req)

	assert.Equal(t, http.StatusCreated, rec.Code)

	var res map[string]any
	err := json.Unmarshal(rec.Body.Bytes(), &res)
	require.NoError(t, err)

	assert.Equal(t, "success", res["status"])
	docID, ok := res["document_id"].(string)
	require.True(t, ok)
	assert.NotEmpty(t, docID)

	savedDoc, exists := docHandler.GetDocument(docID)
	require.True(t, exists)
	assert.Equal(t, "Legal Policy Memo.docx", savedDoc.Title)
	assert.Equal(t, "usr-admin-1", savedDoc.UploadedBy)
}

func TestDocumentHandler_Upload_RBAC_Forbidden(t *testing.T) {
	docHandler := handler.NewDocumentHandler()

	forbiddenRoles := []string{middleware.RoleViewer, middleware.RoleReviewer}

	for _, role := range forbiddenRoles {
		t.Run(role+" forbidden to upload", func(t *testing.T) {
			payload := map[string]string{
				"title":     "Unauthorized Doc.pdf",
				"folder_id": "fld-1",
				"file":      "data",
			}
			body, _ := json.Marshal(payload)

			req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/documents/upload", bytes.NewReader(body), role, "usr-test-1")
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()

			docHandler.Upload(rec, req)

			assert.Equal(t, http.StatusForbidden, rec.Code)

			var res map[string]any
			err := json.Unmarshal(rec.Body.Bytes(), &res)
			require.NoError(t, err)
			assert.Equal(t, "error", res["status"])
			assert.Contains(t, res["message"], "insufficient role permissions")
		})
	}
}

func TestDocumentHandler_Upload_BoundaryValidations(t *testing.T) {
	docHandler := handler.NewDocumentHandler()

	tests := []struct {
		name         string
		title        string
		folderID     string
		file         string
		expectedMsg  string
		expectedCode int
	}{
		{
			name:         "empty title",
			title:        "",
			folderID:     "fld-1",
			file:         "content",
			expectedMsg:  "Invalid or missing title",
			expectedCode: http.StatusBadRequest,
		},
		{
			name:         "whitespace title",
			title:        "   ",
			folderID:     "fld-1",
			file:         "content",
			expectedMsg:  "Invalid or missing title",
			expectedCode: http.StatusBadRequest,
		},
		{
			name:         "empty folder_id",
			title:        "Valid Title",
			folderID:     "",
			file:         "content",
			expectedMsg:  "Invalid or missing folder_id",
			expectedCode: http.StatusBadRequest,
		},
		{
			name:         "whitespace folder_id",
			title:        "Valid Title",
			folderID:     "   ",
			file:         "content",
			expectedMsg:  "Invalid or missing folder_id",
			expectedCode: http.StatusBadRequest,
		},
		{
			name:         "missing file",
			title:        "Valid Title",
			folderID:     "fld-1",
			file:         "",
			expectedMsg:  "File is required",
			expectedCode: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			payload := map[string]string{
				"title":     tc.title,
				"folder_id": tc.folderID,
				"file":      tc.file,
			}
			body, _ := json.Marshal(payload)

			req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/documents/upload", bytes.NewReader(body), middleware.RoleUploader, "usr-upl-1")
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()

			docHandler.Upload(rec, req)

			assert.Equal(t, tc.expectedCode, rec.Code)
			var res map[string]any
			err := json.Unmarshal(rec.Body.Bytes(), &res)
			require.NoError(t, err)
			assert.Equal(t, "error", res["status"])
			assert.Contains(t, res["message"], tc.expectedMsg)
		})
	}
}

func TestDocumentHandler_Upload_Unauthenticated(t *testing.T) {
	docHandler := handler.NewDocumentHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", nil)
	rec := httptest.NewRecorder()

	docHandler.Upload(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}
