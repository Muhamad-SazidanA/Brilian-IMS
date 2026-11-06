package handler_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/company/brilian-dms/internal/api/handler"
	"github.com/company/brilian-dms/internal/api/middleware"
	"github.com/company/brilian-dms/internal/engine"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestChallenger_Compare_DynamicExtractionStress verifies that Compare dynamically
// extracts metadata from indexed documents in searchEng and handles edge documents safely.
func TestChallenger_Compare_DynamicExtractionStress(t *testing.T) {
	aiHandler := handler.NewAIHandler()
	searchEng := engine.GetDefaultEngine()

	// 1. Index custom documents with distinct financial and contractual terms
	docAlpha := engine.DocumentIndexItem{
		DocID:          "doc-stress-alpha",
		Title:          "Perjanjian Pengadaan Server 2027",
		Content:        "SURAT PERJANJIAN PENGADAAN SERVER. Nilai Kontrak sebesar Rp 25.000.000.000. Denda keterlambatan ditetapkan sebesar 7.5%. Termin pembayaran 30 hari kalender.",
		FolderID:       "fld-infra",
		Division:       "Technology",
		Classification: "Internal",
		DocType:        "Surat Perjanjian",
	}

	docBeta := engine.DocumentIndexItem{
		DocID:          "doc-stress-beta",
		Title:          "Perjanjian Lisensi Cloud 2027",
		Content:        "SURAT PERJANJIAN LISENSI CLOUD. Nilai Kontrak disepakati Rp 32.500.000.000. Denda pembatalan sepihak adalah 15%. Termin pembayaran 45 hari setelah faktur diterima.",
		FolderID:       "fld-infra",
		Division:       "Technology",
		Classification: "Internal",
		DocType:        "Surat Perjanjian",
	}

	// Doc with empty metadata (no currencies, no percentages, no terms)
	docGamma := engine.DocumentIndexItem{
		DocID:          "doc-stress-gamma",
		Title:          "Dokumen Kosong Parameter",
		Content:        "DOKUMEN KESEPAKATAN UMUM TANPA ANGKA DAN TANPA KLAUSUL NOMINAL.",
		FolderID:       "fld-gen",
		Division:       "General",
		Classification: "Publik",
		DocType:        "Memo Internal",
	}

	searchEng.IndexDocument(docAlpha)
	searchEng.IndexDocument(docBeta)
	searchEng.IndexDocument(docGamma)

	t.Run("dynamic_extraction_between_two_custom_documents", func(t *testing.T) {
		payload := map[string]any{
			"document_ids": []string{"doc-stress-alpha", "doc-stress-beta"},
			"query":        "Bandingkan klausul denda dan nilai kontrak antara Alpha dan Beta",
		}
		body, _ := json.Marshal(payload)
		req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/ai/compare", bytes.NewReader(body), middleware.RoleReviewer, "usr-rev-1")
		rec := httptest.NewRecorder()

		aiHandler.Compare(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handler.CompareResponse
		err := json.Unmarshal(rec.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp.Status)

		// Verify dynamic extraction matched docAlpha & docBeta values
		assert.Contains(t, resp.ComparisonResult, "Rp 25.000.000.000", "Should dynamically extract Alpha contract value")
		assert.Contains(t, resp.ComparisonResult, "Rp 32.500.000.000", "Should dynamically extract Beta contract value")
		assert.Contains(t, resp.ComparisonResult, "3 Tahap (30/30/40)", "Should detect 30 hari termin")
		assert.Contains(t, resp.ComparisonResult, "4 Tahap (25/25/25/25)", "Should detect 45 hari termin")

		// Citations
		require.Len(t, resp.Citations, 2)
		assert.Equal(t, "doc-stress-alpha", resp.Citations[0].DocumentID)
		assert.Equal(t, "doc-stress-beta", resp.Citations[1].DocumentID)
	})

	t.Run("graceful_fallback_when_document_has_no_financial_metadata", func(t *testing.T) {
		payload := map[string]any{
			"document_ids": []string{"doc-stress-gamma", "doc-stress-alpha"},
			"query":        "Bandingkan dokumen kosong parameter dengan dokumen Alpha",
		}
		body, _ := json.Marshal(payload)
		req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/ai/compare", bytes.NewReader(body), middleware.RoleReviewer, "usr-rev-1")
		rec := httptest.NewRecorder()

		aiHandler.Compare(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handler.CompareResponse
		err := json.Unmarshal(rec.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp.Status)
		// Should fall back to default values without panic or slice out-of-range
		assert.Contains(t, resp.ComparisonResult, "1%", "Gamma should fall back to default 1% denda")
		assert.Contains(t, resp.ComparisonResult, "Rp 1.500.000.000", "Gamma should fall back to default contract value")
	})

	t.Run("fallback_when_doc_ids_not_in_search_engine", func(t *testing.T) {
		payload := map[string]any{
			"document_ids": []string{"doc-nonexistent-1", "doc-nonexistent-2"},
			"query":        "Bandingkan dokumen yang belum terindeks",
		}
		body, _ := json.Marshal(payload)
		req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/ai/compare", bytes.NewReader(body), middleware.RoleReviewer, "usr-rev-1")
		rec := httptest.NewRecorder()

		aiHandler.Compare(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handler.CompareResponse
		err := json.Unmarshal(rec.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp.Status)
		assert.NotEmpty(t, resp.ComparisonResult)
		assert.Equal(t, "doc-nonexistent-1", resp.Citations[0].DocumentID)
		assert.Equal(t, "doc-nonexistent-2", resp.Citations[1].DocumentID)
	})

	t.Run("handling_more_than_two_document_ids", func(t *testing.T) {
		payload := map[string]any{
			"document_ids": []string{"doc-stress-alpha", "doc-stress-beta", "doc-extra-3", "doc-extra-4", "doc-extra-5"},
			"query":        "Bandingkan 5 dokumen sekaligus",
		}
		body, _ := json.Marshal(payload)
		req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/ai/compare", bytes.NewReader(body), middleware.RoleReviewer, "usr-rev-1")
		rec := httptest.NewRecorder()

		aiHandler.Compare(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handler.CompareResponse
		err := json.Unmarshal(rec.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp.Status)
		// Should compare the primary pair without crashing
		assert.Len(t, resp.Citations, 2)
	})
}

// TestChallenger_UnknownFieldsRejection ensures strict JSON deserialization
// with dec.DisallowUnknownFields() across all AI and engine handlers.
func TestChallenger_UnknownFieldsRejection(t *testing.T) {
	aiHandler := handler.NewAIHandler()

	tests := []struct {
		endpoint string
		path     string
		role     string
		handler  func(http.ResponseWriter, *http.Request)
		payload  string
	}{
		{
			endpoint: "compare_unknown_field",
			path:     "/api/v1/ai/compare",
			role:     middleware.RoleReviewer,
			handler:  aiHandler.Compare,
			payload:  `{"document_ids":["doc-1","doc-2"],"query":"test","malicious_injected_field":"payload"}`,
		},
		{
			endpoint: "qa_unknown_field",
			path:     "/api/v1/ai/qa",
			role:     middleware.RoleViewer,
			handler:  aiHandler.QA,
			payload:  `{"document_id":"doc-1","question":"test?","admin_override":true}`,
		},
		{
			endpoint: "extract_unknown_field",
			path:     "/api/v1/engine/extract",
			role:     middleware.RoleViewer,
			handler:  aiHandler.Extract,
			payload:  `{"text":"SPK/2026/001","bypass_auth":1}`,
		},
		{
			endpoint: "classify_unknown_field",
			path:     "/api/v1/engine/classify",
			role:     middleware.RoleViewer,
			handler:  aiHandler.Classify,
			payload:  `{"text":"kontrak","filename":"test.pdf","extra_param":"unexpected"}`,
		},
		{
			endpoint: "search_post_unknown_field",
			path:     "/api/v1/engine/search",
			role:     middleware.RoleViewer,
			handler:  aiHandler.Search,
			payload:  `{"query":"kontrak","unexpected_root_key":"exploit"}`,
		},
		{
			endpoint: "summarize_unknown_field",
			path:     "/api/v1/ai/summarize",
			role:     middleware.RoleViewer,
			handler:  aiHandler.Summarize,
			payload:  `{"document_id":"doc-1","text":"kontrak","prompt_injection_key":"leak"}`,
		},
	}

	for _, tc := range tests {
		t.Run(tc.endpoint, func(t *testing.T) {
			req := createAuthenticatedContextRequest(http.MethodPost, tc.path, strings.NewReader(tc.payload), tc.role, "usr-test-1")
			rec := httptest.NewRecorder()

			tc.handler(rec, req)
			assert.Equal(t, http.StatusBadRequest, rec.Code, "DisallowUnknownFields should reject unexpected JSON field")

			var res map[string]any
			err := json.Unmarshal(rec.Body.Bytes(), &res)
			require.NoError(t, err)
			assert.Equal(t, "error", res["status"])
			assert.Contains(t, res["message"], "Invalid JSON payload")
		})
	}
}

// TestChallenger_MethodNotAllowed_Tampering ensures unsupported HTTP methods
// return 405 Method Not Allowed on all endpoints.
func TestChallenger_MethodNotAllowed_Tampering(t *testing.T) {
	aiHandler := handler.NewAIHandler()

	endpoints := []struct {
		name    string
		path    string
		handler func(http.ResponseWriter, *http.Request)
		allowed string
	}{
		{"compare", "/api/v1/ai/compare", aiHandler.Compare, http.MethodPost},
		{"qa", "/api/v1/ai/qa", aiHandler.QA, http.MethodPost},
		{"extract", "/api/v1/engine/extract", aiHandler.Extract, http.MethodPost},
		{"classify", "/api/v1/engine/classify", aiHandler.Classify, http.MethodPost},
		{"summarize", "/api/v1/ai/summarize", aiHandler.Summarize, http.MethodPost},
	}

	disallowedMethods := []string{
		http.MethodGet,
		http.MethodPut,
		http.MethodDelete,
		http.MethodPatch,
		http.MethodOptions,
		http.MethodHead,
	}

	for _, ep := range endpoints {
		for _, method := range disallowedMethods {
			if method == ep.allowed {
				continue
			}
			t.Run(fmt.Sprintf("%s_%s_not_allowed", ep.name, method), func(t *testing.T) {
				req := createAuthenticatedContextRequest(method, ep.path, strings.NewReader("{}"), middleware.RoleAdmin, "usr-admin-1")
				rec := httptest.NewRecorder()

				ep.handler(rec, req)
				assert.Equal(t, http.StatusMethodNotAllowed, rec.Code)

				var res map[string]any
				err := json.Unmarshal(rec.Body.Bytes(), &res)
				require.NoError(t, err)
				assert.Equal(t, "error", res["status"])
				assert.Equal(t, "Method not allowed", res["message"])
			})
		}
	}

	// Search handler allows GET and POST; check DELETE, PUT, PATCH
	searchDisallowed := []string{http.MethodDelete, http.MethodPut, http.MethodPatch}
	for _, m := range searchDisallowed {
		t.Run("search_"+m+"_not_allowed", func(t *testing.T) {
			req := createAuthenticatedContextRequest(m, "/api/v1/engine/search", strings.NewReader("{}"), middleware.RoleAdmin, "usr-admin-1")
			rec := httptest.NewRecorder()

			aiHandler.Search(rec, req)
			assert.Equal(t, http.StatusMethodNotAllowed, rec.Code)
		})
	}
}

// TestChallenger_HighConcurrency_RaceConditionStress executes concurrent requests
// across all AI and engine handlers while simultaneously adding and searching documents.
func TestChallenger_HighConcurrency_RaceConditionStress(t *testing.T) {
	aiHandler := handler.NewAIHandler()
	searchEng := engine.GetDefaultEngine()

	concurrency := 40
	var wg sync.WaitGroup
	wg.Add(concurrency)

	for i := 0; i < concurrency; i++ {
		workerID := i
		go func() {
			defer wg.Done()

			// 1. Dynamic Indexing
			searchEng.IndexDocument(engine.DocumentIndexItem{
				DocID:          fmt.Sprintf("doc-concurrent-%d", workerID),
				Title:          fmt.Sprintf("Concurrent Contract %d", workerID),
				Content:        fmt.Sprintf("Kontrak nomor SPK/2026/%04d dengan nilai Rp %d.000.000 denda %d%%.", workerID, (workerID+1)*100, (workerID%10)+1),
				FolderID:       "fld-concurrent",
				Division:       "Finance",
				Classification: "Internal",
				DocType:        "Surat Perjanjian",
			})

			// 2. Call Compare endpoint
			compareBody, _ := json.Marshal(map[string]any{
				"document_ids": []string{"doc-kontrak-2025", fmt.Sprintf("doc-concurrent-%d", workerID)},
				"query":        "Bandingkan klausul denda dan termin pembayaran",
			})
			reqComp := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/ai/compare", bytes.NewReader(compareBody), middleware.RoleReviewer, "usr-rev-1")
			recComp := httptest.NewRecorder()
			aiHandler.Compare(recComp, reqComp)
			if recComp.Code != http.StatusOK {
				t.Errorf("Compare worker %d failed with code %d", workerID, recComp.Code)
			}

			// 3. Call Extract endpoint
			extractBody, _ := json.Marshal(map[string]string{
				"text": fmt.Sprintf("NPWP: 01.234.567.8-%03d.000 Tanggal 17-08-2026 Nilai Rp 50.000.000", workerID%900+100),
			})
			reqExt := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/engine/extract", bytes.NewReader(extractBody), middleware.RoleViewer, "usr-viw-1")
			recExt := httptest.NewRecorder()
			aiHandler.Extract(recExt, reqExt)
			if recExt.Code != http.StatusOK {
				t.Errorf("Extract worker %d failed with code %d", workerID, recExt.Code)
			}

			// 4. Call Search GET endpoint
			reqSearch := createAuthenticatedContextRequest(http.MethodGet, fmt.Sprintf("/api/v1/engine/search?q=SPK/2026/%04d", workerID), nil, middleware.RoleViewer, "usr-viw-1")
			recSearch := httptest.NewRecorder()
			aiHandler.Search(recSearch, reqSearch)
			if recSearch.Code != http.StatusOK {
				t.Errorf("Search worker %d failed with code %d", workerID, recSearch.Code)
			}

			// 5. Call Classify endpoint
			classBody, _ := json.Marshal(map[string]string{
				"text":     "SURAT PERJANJIAN KERJASAMA PENGADAAN PERANGKAT SERVER",
				"filename": fmt.Sprintf("contract_%d.pdf", workerID),
			})
			reqClass := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/engine/classify", bytes.NewReader(classBody), middleware.RoleViewer, "usr-viw-1")
			recClass := httptest.NewRecorder()
			aiHandler.Classify(recClass, reqClass)
			if recClass.Code != http.StatusOK {
				t.Errorf("Classify worker %d failed with code %d", workerID, recClass.Code)
			}
		}()
	}

	wg.Wait()
}

// TestChallenger_MassiveDocumentIDsArray ensures Compare handler gracefully handles
// a huge list of document IDs without stack overflow or out of memory.
func TestChallenger_MassiveDocumentIDsArray(t *testing.T) {
	aiHandler := handler.NewAIHandler()

	massiveIDs := make([]string, 500)
	for i := 0; i < 500; i++ {
		massiveIDs[i] = fmt.Sprintf("doc-bulk-%d", i)
	}

	payload := map[string]any{
		"document_ids": massiveIDs,
		"query":        "Bandingkan banyak dokumen dalam satu request",
	}
	body, _ := json.Marshal(payload)
	req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/ai/compare", bytes.NewReader(body), middleware.RoleReviewer, "usr-rev-1")
	rec := httptest.NewRecorder()

	aiHandler.Compare(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)

	var resp handler.CompareResponse
	err := json.Unmarshal(rec.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "success", resp.Status)
	assert.NotEmpty(t, resp.ComparisonResult)
	assert.Len(t, resp.Citations, 2)
}
