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

func TestAIHandler_Compare_Success(t *testing.T) {
	aiHandler := handler.NewAIHandler()

	allowedRoles := []string{middleware.RoleReviewer, middleware.RoleAdmin}

	for _, role := range allowedRoles {
		t.Run("role_"+role+"_allowed", func(t *testing.T) {
			payload := map[string]any{
				"document_ids": []string{"doc-v1-uuid", "doc-v2-uuid"},
				"query":        "Bandingkan perubahan nilai klausul denda pada kedua kontrak ini.",
			}
			body, _ := json.Marshal(payload)

			req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/ai/compare", bytes.NewReader(body), role, "usr-rev-1")
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()

			aiHandler.Compare(rec, req)

			assert.Equal(t, http.StatusOK, rec.Code)

			var res handler.CompareResponse
			err := json.Unmarshal(rec.Body.Bytes(), &res)
			require.NoError(t, err)

			assert.Equal(t, "success", res.Status)
			assert.Contains(t, res.ComparisonResult, "| Parameter | Kontrak 2025 | Kontrak 2026 |")
			assert.Len(t, res.Citations, 2)
			assert.Equal(t, "doc-v1-uuid", res.Citations[0].DocumentID)
			assert.Equal(t, 4, res.Citations[0].Page)
			assert.Equal(t, "doc-v2-uuid", res.Citations[1].DocumentID)
			assert.Equal(t, 5, res.Citations[1].Page)
		})
	}
}

func TestAIHandler_Compare_RBAC_Forbidden(t *testing.T) {
	aiHandler := handler.NewAIHandler()

	forbiddenRoles := []string{middleware.RoleUploader, middleware.RoleViewer}

	for _, role := range forbiddenRoles {
		t.Run("role_"+role+"_forbidden", func(t *testing.T) {
			payload := map[string]any{
				"document_ids": []string{"doc-v1", "doc-v2"},
				"query":        "Bandingkan klausul",
			}
			body, _ := json.Marshal(payload)

			req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/ai/compare", bytes.NewReader(body), role, "usr-test-1")
			rec := httptest.NewRecorder()

			aiHandler.Compare(rec, req)

			assert.Equal(t, http.StatusForbidden, rec.Code)
			var res map[string]any
			err := json.Unmarshal(rec.Body.Bytes(), &res)
			require.NoError(t, err)
			assert.Equal(t, "error", res["status"])
			assert.Contains(t, res["message"], "role does not have AI compare permission")
		})
	}
}

func TestAIHandler_Compare_BoundaryValidations(t *testing.T) {
	aiHandler := handler.NewAIHandler()

	tests := []struct {
		name         string
		payload      any
		expectedMsg  string
		expectedCode int
	}{
		{
			name: "single document ID",
			payload: map[string]any{
				"document_ids": []string{"only-one-doc"},
				"query":        "Compare please",
			},
			expectedMsg:  "At least two document_ids are required",
			expectedCode: http.StatusBadRequest,
		},
		{
			name: "empty document IDs array",
			payload: map[string]any{
				"document_ids": []string{},
				"query":        "Compare please",
			},
			expectedMsg:  "At least two document_ids are required",
			expectedCode: http.StatusBadRequest,
		},
		{
			name: "empty query",
			payload: map[string]any{
				"document_ids": []string{"doc-1", "doc-2"},
				"query":        "",
			},
			expectedMsg:  "Query cannot be empty",
			expectedCode: http.StatusBadRequest,
		},
		{
			name: "whitespace query",
			payload: map[string]any{
				"document_ids": []string{"doc-1", "doc-2"},
				"query":        "    ",
			},
			expectedMsg:  "Query cannot be empty",
			expectedCode: http.StatusBadRequest,
		},
		{
			name:         "malformed JSON",
			payload:      "not_a_json",
			expectedMsg:  "Invalid JSON payload",
			expectedCode: http.StatusBadRequest,
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

			req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/ai/compare", bytes.NewReader(body), middleware.RoleReviewer, "usr-rev-1")
			rec := httptest.NewRecorder()

			aiHandler.Compare(rec, req)

			assert.Equal(t, tc.expectedCode, rec.Code)
			var res map[string]any
			err := json.Unmarshal(rec.Body.Bytes(), &res)
			require.NoError(t, err)
			assert.Equal(t, "error", res["status"])
			assert.Contains(t, res["message"], tc.expectedMsg)
		})
	}
}

func TestAIHandler_QA_Success(t *testing.T) {
	aiHandler := handler.NewAIHandler()

	allRoles := []string{middleware.RoleAdmin, middleware.RoleReviewer, middleware.RoleUploader, middleware.RoleViewer}

	for _, role := range allRoles {
		t.Run("role_"+role+"_allowed", func(t *testing.T) {
			payload := map[string]string{
				"document_id": "doc-v1-uuid",
				"question":    "Berapa tanggal jatuh tempo pembayaran?",
			}
			body, _ := json.Marshal(payload)

			req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/ai/qa", bytes.NewReader(body), role, "usr-test-1")
			rec := httptest.NewRecorder()

			aiHandler.QA(rec, req)

			assert.Equal(t, http.StatusOK, rec.Code)

			var res handler.QAResponse
			err := json.Unmarshal(rec.Body.Bytes(), &res)
			require.NoError(t, err)

			assert.Equal(t, "success", res.Status)
			assert.Contains(t, res.Answer, "30 hari setelah invoice diterbitkan")
			assert.Equal(t, 2, res.PageReference)
		})
	}
}

func TestAIHandler_QA_BoundaryValidations(t *testing.T) {
	aiHandler := handler.NewAIHandler()

	tests := []struct {
		name         string
		payload      any
		expectedMsg  string
		expectedCode int
	}{
		{
			name: "missing document_id",
			payload: map[string]string{
				"document_id": "",
				"question":    "Pertanyaan valid",
			},
			expectedMsg:  "document_id is required",
			expectedCode: http.StatusBadRequest,
		},
		{
			name: "whitespace document_id",
			payload: map[string]string{
				"document_id": "   ",
				"question":    "Pertanyaan valid",
			},
			expectedMsg:  "document_id is required",
			expectedCode: http.StatusBadRequest,
		},
		{
			name: "missing question",
			payload: map[string]string{
				"document_id": "doc-uuid-1",
				"question":    "",
			},
			expectedMsg:  "question cannot be empty",
			expectedCode: http.StatusBadRequest,
		},
		{
			name: "whitespace question",
			payload: map[string]string{
				"document_id": "doc-uuid-1",
				"question":    "    ",
			},
			expectedMsg:  "question cannot be empty",
			expectedCode: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			body, _ := json.Marshal(tc.payload)
			req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/ai/qa", bytes.NewReader(body), middleware.RoleViewer, "usr-viw-1")
			rec := httptest.NewRecorder()

			aiHandler.QA(rec, req)

			assert.Equal(t, tc.expectedCode, rec.Code)
			var res map[string]any
			err := json.Unmarshal(rec.Body.Bytes(), &res)
			require.NoError(t, err)
			assert.Equal(t, "error", res["status"])
			assert.Contains(t, res["message"], tc.expectedMsg)
		})
	}
}

func TestAIHandler_Unauthenticated(t *testing.T) {
	aiHandler := handler.NewAIHandler()

	req1 := httptest.NewRequest(http.MethodPost, "/api/v1/ai/compare", nil)
	rec1 := httptest.NewRecorder()
	aiHandler.Compare(rec1, req1)
	assert.Equal(t, http.StatusUnauthorized, rec1.Code)

	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/ai/qa", nil)
	rec2 := httptest.NewRecorder()
	aiHandler.QA(rec2, req2)
	assert.Equal(t, http.StatusUnauthorized, rec2.Code)

	req3 := httptest.NewRequest(http.MethodPost, "/api/v1/engine/extract", nil)
	rec3 := httptest.NewRecorder()
	aiHandler.Extract(rec3, req3)
	assert.Equal(t, http.StatusUnauthorized, rec3.Code)

	req4 := httptest.NewRequest(http.MethodPost, "/api/v1/engine/classify", nil)
	rec4 := httptest.NewRecorder()
	aiHandler.Classify(rec4, req4)
	assert.Equal(t, http.StatusUnauthorized, rec4.Code)

	req5 := httptest.NewRequest(http.MethodGet, "/api/v1/engine/search", nil)
	rec5 := httptest.NewRecorder()
	aiHandler.Search(rec5, req5)
	assert.Equal(t, http.StatusUnauthorized, rec5.Code)

	req6 := httptest.NewRequest(http.MethodPost, "/api/v1/ai/summarize", nil)
	rec6 := httptest.NewRecorder()
	aiHandler.Summarize(rec6, req6)
	assert.Equal(t, http.StatusUnauthorized, rec6.Code)
}

func TestAIHandler_Extract_SuccessAndBoundaries(t *testing.T) {
	aiHandler := handler.NewAIHandler()

	// 1. Success with rich text
	text := "Nomor Kontrak: SPK/2026/LEG-089. Nilai transaksi Rp 2.500.000 berlaku per 17-08-1945."
	body, _ := json.Marshal(map[string]string{"text": text})
	req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/engine/extract", bytes.NewReader(body), middleware.RoleViewer, "usr-viw-1")
	rec := httptest.NewRecorder()

	aiHandler.Extract(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)

	var res handler.ExtractResponse
	err := json.Unmarshal(rec.Body.Bytes(), &res)
	require.NoError(t, err)
	assert.Equal(t, "success", res.Status)
	assert.Contains(t, res.Data.Dates, "17-08-1945")
	assert.NotEmpty(t, res.Data.Currencies)

	// 2. Empty text validation
	emptyBody, _ := json.Marshal(map[string]string{"text": ""})
	reqEmpty := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/engine/extract", bytes.NewReader(emptyBody), middleware.RoleViewer, "usr-viw-1")
	recEmpty := httptest.NewRecorder()
	aiHandler.Extract(recEmpty, reqEmpty)
	assert.Equal(t, http.StatusBadRequest, recEmpty.Code)
}

func TestAIHandler_Classify_SuccessAndBoundaries(t *testing.T) {
	aiHandler := handler.NewAIHandler()

	// 1. Success contract
	body, _ := json.Marshal(map[string]string{
		"text":     "SURAT PERJANJIAN KERJASAMA PENGADAAN ANTARA PIHAK PERTAMA DAN KEDUA PASAL 1",
		"filename": "kontrak.pdf",
	})
	req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/engine/classify", bytes.NewReader(body), middleware.RoleViewer, "usr-viw-1")
	rec := httptest.NewRecorder()

	aiHandler.Classify(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)

	var res handler.ClassifyResponse
	err := json.Unmarshal(rec.Body.Bytes(), &res)
	require.NoError(t, err)
	assert.Equal(t, "success", res.Status)
	assert.Equal(t, "Surat Perjanjian", res.Result.DocType)
	assert.True(t, res.Result.Confidence >= 0.8)

	// 2. Empty text and filename
	emptyBody, _ := json.Marshal(map[string]string{"text": "", "filename": ""})
	reqEmpty := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/engine/classify", bytes.NewReader(emptyBody), middleware.RoleViewer, "usr-viw-1")
	recEmpty := httptest.NewRecorder()
	aiHandler.Classify(recEmpty, reqEmpty)
	assert.Equal(t, http.StatusBadRequest, recEmpty.Code)
}

func TestAIHandler_Search_SuccessAndBoundaries(t *testing.T) {
	aiHandler := handler.NewAIHandler()

	// 1. Success GET search
	req := createAuthenticatedContextRequest(http.MethodGet, "/api/v1/engine/search?q=kontrak", nil, middleware.RoleViewer, "usr-viw-1")
	rec := httptest.NewRecorder()

	aiHandler.Search(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)

	var res handler.SearchResponse
	err := json.Unmarshal(rec.Body.Bytes(), &res)
	require.NoError(t, err)
	assert.Equal(t, "success", res.Status)
	assert.Equal(t, "kontrak", res.Query)
	assert.NotEmpty(t, res.Results)

	// 2. Success POST search with filter
	postBody, _ := json.Marshal(map[string]any{
		"query": "pengadaan",
		"filter": map[string]string{
			"division": "Legal",
		},
	})
	reqPost := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/engine/search", bytes.NewReader(postBody), middleware.RoleViewer, "usr-viw-1")
	recPost := httptest.NewRecorder()
	aiHandler.Search(recPost, reqPost)
	assert.Equal(t, http.StatusOK, recPost.Code)

	// 3. Empty query validation
	reqEmpty := createAuthenticatedContextRequest(http.MethodGet, "/api/v1/engine/search?q=", nil, middleware.RoleViewer, "usr-viw-1")
	recEmpty := httptest.NewRecorder()
	aiHandler.Search(recEmpty, reqEmpty)
	assert.Equal(t, http.StatusBadRequest, recEmpty.Code)
}

func TestAIHandler_Summarize_SuccessAndBoundaries(t *testing.T) {
	aiHandler := handler.NewAIHandler()

	// 1. Success summarize
	docText := "SURAT KEPUTUSAN DIREKSI MEMUTUSKAN DAN MENETAPKAN STRUKTUR ORGANISASI Nomor SK/2026/001 Tanggal 06/11/2026."
	body, _ := json.Marshal(map[string]any{
		"document_id": "doc-sk-1",
		"text":        docText,
		"max_tokens":  200,
	})
	req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/ai/summarize", bytes.NewReader(body), middleware.RoleViewer, "usr-viw-1")
	rec := httptest.NewRecorder()

	aiHandler.Summarize(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)

	var res handler.SummarizeResponse
	err := json.Unmarshal(rec.Body.Bytes(), &res)
	require.NoError(t, err)
	assert.Equal(t, "success", res.Status)
	assert.Contains(t, res.Summary, "Surat Keputusan")
	assert.True(t, res.TokenCount > 0)

	// 2. Missing text and document_id
	emptyBody, _ := json.Marshal(map[string]any{"document_id": "", "text": ""})
	reqEmpty := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/ai/summarize", bytes.NewReader(emptyBody), middleware.RoleViewer, "usr-viw-1")
	recEmpty := httptest.NewRecorder()
	aiHandler.Summarize(recEmpty, reqEmpty)
	assert.Equal(t, http.StatusBadRequest, recEmpty.Code)
}

