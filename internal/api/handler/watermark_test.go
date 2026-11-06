package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/company/brilian-dms/internal/api/handler"
	"github.com/company/brilian-dms/internal/api/middleware"
	"github.com/company/brilian-dms/internal/dms"
)

func TestWatermarkHandler_PreviewAndDownload(t *testing.T) {
	engine := dms.NewEngine()
	adminHandler := handler.NewAdminHandler()
	wmHandler := handler.NewWatermarkHandler(engine, adminHandler)

	// Seed document via resumable upload
	session, err := engine.InitUploadSession(
		"usr-admin-1",
		"Quarterly_Report.pdf",
		int64(len("%PDF-1.7 confidential report\n")),
		"application/pdf",
		"fld-root",
		"Publik",
		"Finance",
	)
	if err != nil {
		t.Fatalf("InitUploadSession failed: %v", err)
	}

	_, _, _, err = engine.ReceiveChunk(session.SessionID, 0, "", []byte("%PDF-1.7 confidential report\n"))
	if err != nil {
		t.Fatalf("ReceiveChunk failed: %v", err)
	}

	doc, _, err := engine.CompleteUploadSession(session.SessionID)
	if err != nil {
		t.Fatalf("CompleteUploadSession failed: %v", err)
	}

	viewerClaims := &middleware.Claims{
		Sub:      "usr-viw-1",
		UserID:   "usr-viw-1",
		Username: "viewer_1",
		Name:     "Rina Wijaya",
		Role:     "viewer",
		Division: "Finance",
		Level:    "L2",
	}

	t.Run("Unauthorized access returns 401", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/documents/"+doc.ID+"/preview", nil)
		w := httptest.NewRecorder()
		wmHandler.Preview(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("Expected 401 Unauthorized, got %d", w.Code)
		}

		dlReq := httptest.NewRequest(http.MethodGet, "/api/v1/documents/"+doc.ID+"/download", nil)
		dlW := httptest.NewRecorder()
		wmHandler.Download(dlW, dlReq)
		if dlW.Code != http.StatusUnauthorized {
			t.Errorf("Expected 401 Unauthorized on download, got %d", dlW.Code)
		}
	})

	t.Run("Authorized preview applies watermark", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/documents/"+doc.ID+"/preview?format=json", nil)
		req.Header.Set("Accept", "application/json")
		ctx := middleware.ContextWithClaims(req.Context(), viewerClaims)
		w := httptest.NewRecorder()

		wmHandler.Preview(w, req.WithContext(ctx))
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		if w.Header().Get("X-Watermark-Applied") != "true" {
			t.Errorf("Expected X-Watermark-Applied header")
		}

		var res struct {
			Status    string `json:"status"`
			Content   string `json:"content"`
			Watermark struct {
				FullName string `json:"FullName"`
				UserID   string `json:"UserID"`
			} `json:"watermark"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatalf("Failed to parse preview response: %v", err)
		}

		if res.Watermark.FullName != "Rina Wijaya" || res.Watermark.UserID != "usr-viw-1" {
			t.Errorf("Unexpected watermark attributes: %+v", res.Watermark)
		}

		if !strings.Contains(res.Content, "Rina Wijaya") || !strings.Contains(res.Content, "usr-viw-1") {
			t.Errorf("Watermark content does not contain user credentials")
		}
	})

	t.Run("Authorized download streams watermarked binary", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/documents/"+doc.ID+"/download", nil)
		ctx := middleware.ContextWithClaims(req.Context(), viewerClaims)
		w := httptest.NewRecorder()

		wmHandler.Download(w, req.WithContext(ctx))
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		if w.Header().Get("X-Watermark-Applied") != "true" {
			t.Errorf("Expected X-Watermark-Applied header")
		}

		bodyStr := w.Body.String()
		if !strings.Contains(bodyStr, "Rina Wijaya") || !strings.Contains(bodyStr, "usr-viw-1") {
			t.Errorf("Downloaded binary missing dynamic watermark stamp")
		}
	})
}
