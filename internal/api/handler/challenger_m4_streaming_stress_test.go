package handler_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/company/brilian-dms/internal/api/handler"
	"github.com/company/brilian-dms/internal/api/middleware"
	"github.com/company/brilian-dms/internal/dms"
	"github.com/company/brilian-dms/internal/rbac"
)

// setupStreamingTestFixture prepares an in-memory DMS Engine, AdminHandler, WatermarkHandler,
// and JWTManager with documents across all four classification levels.
func setupStreamingTestFixture(jwtSecret string) (
	*dms.Engine,
	*handler.AdminHandler,
	*handler.WatermarkHandler,
	*middleware.JWTManager,
	map[string]string, // docKey -> docID
) {
	engine := dms.NewEngine()
	adminHandler := handler.NewAdminHandler()
	wmHandler := handler.NewWatermarkHandler(engine, adminHandler)
	jwtMgr := middleware.NewJWTManager(jwtSecret)

	docIDs := make(map[string]string)

	// Seed documents via UploadSession
	seedDocs := []struct {
		key            string
		filename       string
		classification string
		division       string
		mimeType       string
		content        []byte
	}{
		{
			key:            "doc-publik",
			filename:       "Company_Announcement_2026.pdf",
			classification: rbac.ClassificationPublik,
			division:       "HR",
			mimeType:       "application/pdf",
			content:        []byte("%PDF-1.7 Publik Open Document Body Content\n"),
		},
		{
			key:            "doc-internal",
			filename:       "Internal_Operations_Manual.pdf",
			classification: rbac.ClassificationInternal,
			division:       "Operations",
			mimeType:       "application/pdf",
			content:        []byte("%PDF-1.7 Internal Operational Guidelines Content\n"),
		},
		{
			key:            "doc-rahasia",
			filename:       "Financial_Q3_Audit.pdf",
			classification: rbac.ClassificationRahasia,
			division:       "Finance",
			mimeType:       "application/pdf",
			content:        []byte("%PDF-1.7 Confidential Finance Department Audit Data\n"),
		},
		{
			key:            "doc-sangat-rahasia",
			filename:       "Executive_Acquisition_Strategy.pdf",
			classification: rbac.ClassificationSangatRahasia,
			division:       "Executive",
			mimeType:       "application/pdf",
			content:        []byte("%PDF-1.7 Highly Confidential Acquisition Master Plan\n"),
		},
	}

	for _, sd := range seedDocs {
		sess, err := engine.InitUploadSession(
			"usr-admin-1",
			sd.filename,
			int64(len(sd.content)),
			sd.mimeType,
			"fld-root",
			sd.classification,
			sd.division,
		)
		if err != nil {
			panic(fmt.Sprintf("Failed to init upload session for %s: %v", sd.key, err))
		}

		_, _, _, err = engine.ReceiveChunk(sess.SessionID, 0, "", sd.content)
		if err != nil {
			panic(fmt.Sprintf("Failed to receive chunk for %s: %v", sd.key, err))
		}

		doc, _, err := engine.CompleteUploadSession(sess.SessionID)
		if err != nil {
			panic(fmt.Sprintf("Failed to complete upload session for %s: %v", sd.key, err))
		}

		docIDs[sd.key] = doc.ID
	}

	return engine, adminHandler, wmHandler, jwtMgr, docIDs
}

// TestChallenger_Streaming_UnauthenticatedRequests verifies that preview and download
// strictly reject requests lacking valid Bearer authentication.
func TestChallenger_Streaming_UnauthenticatedRequests(t *testing.T) {
	jwtSecret := "challenger_streaming_test_secret_2026"
	_, _, wmHandler, jwtMgr, docIDs := setupStreamingTestFixture(jwtSecret)

	// Wrap in Authenticate middleware
	authMiddleware := middleware.Authenticate(jwtMgr)
	previewHandler := authMiddleware(http.HandlerFunc(wmHandler.Preview))
	downloadHandler := authMiddleware(http.HandlerFunc(wmHandler.Download))

	docID := docIDs["doc-publik"]

	endpoints := []struct {
		name    string
		path    string
		handler http.Handler
	}{
		{"Preview without auth", fmt.Sprintf("/api/v1/documents/%s/preview", docID), previewHandler},
		{"Download without auth", fmt.Sprintf("/api/v1/documents/%s/download", docID), downloadHandler},
	}

	for _, ep := range endpoints {
		t.Run(ep.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, ep.path, nil)
			rec := httptest.NewRecorder()

			ep.handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("Expected 401 Unauthorized, got %d. Body: %s", rec.Code, rec.Body.String())
			}

			var body map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatalf("Failed to parse error JSON response: %v", err)
			}
			if body["status"] != "error" {
				t.Errorf("Expected status='error', got %v", body["status"])
			}
		})
	}
}

// TestChallenger_Streaming_TamperedAndForgedJWT verifies cryptographic defense against token tampering
func TestChallenger_Streaming_TamperedAndForgedJWT(t *testing.T) {
	correctSecret := "valid_secure_jwt_signing_key_2026"
	attackerSecret := "attacker_malicious_forged_secret_key"

	_, _, wmHandler, jwtMgr, docIDs := setupStreamingTestFixture(correctSecret)
	attackerJwtMgr := middleware.NewJWTManager(attackerSecret)

	authMiddleware := middleware.Authenticate(jwtMgr)
	previewHandler := authMiddleware(http.HandlerFunc(wmHandler.Preview))
	downloadHandler := authMiddleware(http.HandlerFunc(wmHandler.Download))

	docID := docIDs["doc-sangat-rahasia"]

	// 1. Forged Admin Token signed with attacker secret
	forgedAdminToken, err := attackerJwtMgr.Sign(middleware.Claims{
		Sub:      "usr-hacker-1",
		UserID:   "usr-hacker-1",
		Username: "hacker",
		Role:     middleware.RoleAdmin,
		Division: rbac.DivisionALL,
		Level:    rbac.LevelL5,
	})
	if err != nil {
		t.Fatalf("Failed to sign forged token: %v", err)
	}

	// 2. Tampered signature (valid token with corrupted signature bytes)
	validToken, _ := jwtMgr.Sign(middleware.Claims{
		Sub:      "usr-user-1",
		Username: "regular_user",
		Role:     middleware.RoleViewer,
		Division: "Finance",
		Level:    "L2",
	})
	tamperedToken := validToken[:len(validToken)-5] + "XXXXX"

	// 3. Expired token
	expiredClaims := middleware.Claims{
		Sub:      "usr-exp-1",
		Username: "expired_user",
		Role:     middleware.RoleViewer,
		Division: "Finance",
		Level:    "L2",
		Iat:      time.Now().Unix() - 7200,
		Exp:      time.Now().Unix() - 3600, // Expired 1 hour ago
	}
	expiredToken, _ := jwtMgr.Sign(expiredClaims)

	// 4. Malformed header variants
	testAttacks := []struct {
		name       string
		authHeader string
	}{
		{"Forged signature with different secret", "Bearer " + forgedAdminToken},
		{"Tampered signature string", "Bearer " + tamperedToken},
		{"Expired JWT token", "Bearer " + expiredToken},
		{"Missing token body (empty Bearer)", "Bearer "},
		{"Bare token without Bearer prefix", validToken},
		{"Basic auth scheme instead of Bearer", "Basic dXNlcjpwYXNz"},
		{"Truncated JWT with single part", "Bearer eyJhbGciOiJIUzI1NiJ9"},
		{"Truncated JWT with two parts", "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0"},
	}

	for _, attack := range testAttacks {
		t.Run(attack.name, func(t *testing.T) {
			// Test preview
			reqPreview := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/documents/%s/preview", docID), nil)
			if attack.authHeader != "" {
				reqPreview.Header.Set("Authorization", attack.authHeader)
			}
			recPreview := httptest.NewRecorder()
			previewHandler.ServeHTTP(recPreview, reqPreview)

			if recPreview.Code != http.StatusUnauthorized {
				t.Errorf("Preview allowed attack %q: expected 401, got %d", attack.name, recPreview.Code)
			}

			// Test download
			reqDownload := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/documents/%s/download", docID), nil)
			if attack.authHeader != "" {
				reqDownload.Header.Set("Authorization", attack.authHeader)
			}
			recDownload := httptest.NewRecorder()
			downloadHandler.ServeHTTP(recDownload, reqDownload)

			if recDownload.Code != http.StatusUnauthorized {
				t.Errorf("Download allowed attack %q: expected 401, got %d", attack.name, recDownload.Code)
			}
		})
	}
}

// TestChallenger_Streaming_DualAxisRBACViolations verifies that preview and download
// properly reject unauthorized users based on division and level matrices.
func TestChallenger_Streaming_DualAxisRBACViolations(t *testing.T) {
	jwtSecret := "rbac_streaming_violation_test_secret"
	_, _, wmHandler, jwtMgr, docIDs := setupStreamingTestFixture(jwtSecret)

	authMiddleware := middleware.Authenticate(jwtMgr)
	previewHandler := authMiddleware(http.HandlerFunc(wmHandler.Preview))
	downloadHandler := authMiddleware(http.HandlerFunc(wmHandler.Download))

	// User tokens
	l1OperationsToken, _ := jwtMgr.Sign(middleware.Claims{
		Sub:      "usr-op-l1",
		UserID:   "usr-op-l1",
		Username: "staff_l1",
		Role:     middleware.RoleViewer,
		Division: "Operations",
		Level:    "L1",
		Name:     "Staff Satu",
	})

	hrL2Token, _ := jwtMgr.Sign(middleware.Claims{
		Sub:      "usr-hr-l2",
		UserID:   "usr-hr-l2",
		Username: "hr_staff_l2",
		Role:     middleware.RoleViewer,
		Division: "HR",
		Level:    "L2",
		Name:     "HR Staff",
	})

	execL4Token, _ := jwtMgr.Sign(middleware.Claims{
		Sub:      "usr-exec-l4",
		UserID:   "usr-exec-l4",
		Username: "exec_mgr_l4",
		Role:     middleware.RoleViewer,
		Division: "Executive",
		Level:    "L4",
		Name:     "Executive Manager",
	})

	execL5Token, _ := jwtMgr.Sign(middleware.Claims{
		Sub:      "usr-exec-l5",
		UserID:   "usr-exec-l5",
		Username: "exec_dir_l5",
		Role:     middleware.RoleViewer,
		Division: "Executive",
		Level:    "L5",
		Name:     "Executive Director",
	})

	t.Run("Violation 1: L1 user cannot download Internal document", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/documents/%s/download", docIDs["doc-internal"]), nil)
		req.Header.Set("Authorization", "Bearer "+l1OperationsToken)
		rec := httptest.NewRecorder()
		downloadHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("Expected 403 Forbidden for L1 download of Internal doc, got %d", rec.Code)
		}
		if !strings.Contains(rec.Body.String(), "Level L1 has view-only rights for Internal documents") {
			t.Errorf("Expected L1 reason message, got: %s", rec.Body.String())
		}
	})

	t.Run("Allowed: L1 user CAN preview Internal document", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/documents/%s/preview", docIDs["doc-internal"]), nil)
		req.Header.Set("Authorization", "Bearer "+l1OperationsToken)
		rec := httptest.NewRecorder()
		previewHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for L1 preview of Internal doc, got %d: %s", rec.Code, rec.Body.String())
		}
		if rec.Header().Get("X-Watermark-Applied") != "true" {
			t.Errorf("Expected X-Watermark-Applied header")
		}
		if !strings.Contains(rec.Body.String(), "Staff Satu") || !strings.Contains(rec.Body.String(), "usr-op-l1") {
			t.Errorf("Watermark missing user identity: %s", rec.Body.String())
		}
	})

	t.Run("Violation 2: HR user cannot preview Finance Rahasia document (Cross-division)", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/documents/%s/preview", docIDs["doc-rahasia"]), nil)
		req.Header.Set("Authorization", "Bearer "+hrL2Token)
		rec := httptest.NewRecorder()
		previewHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("Expected 403 Forbidden for cross-division preview of Rahasia doc, got %d", rec.Code)
		}
		if !strings.Contains(rec.Body.String(), "restricted to Finance division") {
			t.Errorf("Expected Finance division restriction message, got: %s", rec.Body.String())
		}
	})

	t.Run("Violation 3: Executive L4 cannot download Sangat Rahasia document (View only)", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/documents/%s/download", docIDs["doc-sangat-rahasia"]), nil)
		req.Header.Set("Authorization", "Bearer "+execL4Token)
		rec := httptest.NewRecorder()
		downloadHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("Expected 403 Forbidden for L4 download of Sangat Rahasia doc, got %d", rec.Code)
		}
		if !strings.Contains(rec.Body.String(), "Level L4 has view-only rights for Sangat Rahasia documents") {
			t.Errorf("Expected L4 reason message, got: %s", rec.Body.String())
		}
	})

	t.Run("Allowed: Executive L4 CAN preview Sangat Rahasia document", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/documents/%s/preview", docIDs["doc-sangat-rahasia"]), nil)
		req.Header.Set("Authorization", "Bearer "+execL4Token)
		rec := httptest.NewRecorder()
		previewHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for L4 preview of Sangat Rahasia doc, got %d: %s", rec.Code, rec.Body.String())
		}
		if rec.Header().Get("X-Watermark-Applied") != "true" {
			t.Errorf("Expected X-Watermark-Applied header")
		}
	})

	t.Run("Allowed: Executive L5 CAN download Sangat Rahasia document", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/documents/%s/download", docIDs["doc-sangat-rahasia"]), nil)
		req.Header.Set("Authorization", "Bearer "+execL5Token)
		rec := httptest.NewRecorder()
		downloadHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for L5 download of Sangat Rahasia doc, got %d: %s", rec.Code, rec.Body.String())
		}
		if rec.Header().Get("X-Watermark-Applied") != "true" {
			t.Errorf("Expected X-Watermark-Applied header")
		}
		if !strings.Contains(rec.Header().Get("Content-Disposition"), "Executive_Acquisition_Strategy.pdf") {
			t.Errorf("Expected Content-Disposition header with filename, got: %s", rec.Header().Get("Content-Disposition"))
		}
	})
}

// TestChallenger_Streaming_ConcurrentHTTPRequestsStress tests 50 parallel goroutines making concurrent
// preview and download requests against the same document to ensure zero data race or cross-talk.
func TestChallenger_Streaming_ConcurrentHTTPRequestsStress(t *testing.T) {
	jwtSecret := "streaming_concurrency_secret_2026"
	_, _, wmHandler, jwtMgr, docIDs := setupStreamingTestFixture(jwtSecret)

	authMiddleware := middleware.Authenticate(jwtMgr)
	previewHandler := authMiddleware(http.HandlerFunc(wmHandler.Preview))
	downloadHandler := authMiddleware(http.HandlerFunc(wmHandler.Download))

	docID := docIDs["doc-publik"]
	const concurrentClients = 50

	var wg sync.WaitGroup
	errChan := make(chan string, concurrentClients*2)

	for i := 0; i < concurrentClients; i++ {
		clientID := i
		wg.Add(2)

		// Concurrent Preview Client
		go func(id int) {
			defer wg.Done()
			userName := fmt.Sprintf("Streamer %03d", id)
			userID := fmt.Sprintf("usr-strm-%03d", id)
			token, err := jwtMgr.Sign(middleware.Claims{
				Sub:      userID,
				UserID:   userID,
				Username: userName,
				Role:     middleware.RoleViewer,
				Division: "IT",
				Level:    "L2",
				Name:     userName,
			})
			if err != nil {
				errChan <- fmt.Sprintf("Failed to sign token for preview client %d: %v", id, err)
				return
			}

			req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/documents/%s/preview", docID), nil)
			req.Header.Set("Authorization", "Bearer "+token)
			rec := httptest.NewRecorder()

			previewHandler.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				errChan <- fmt.Sprintf("Preview client %d failed with status %d: %s", id, rec.Code, rec.Body.String())
				return
			}
			bodyStr := rec.Body.String()
			if !strings.Contains(bodyStr, userID) || !strings.Contains(bodyStr, userName) {
				errChan <- fmt.Sprintf("Preview client %d watermark missing credentials: %s", id, bodyStr)
			}
		}(clientID)

		// Concurrent Download Client
		go func(id int) {
			defer wg.Done()
			userName := fmt.Sprintf("Downloader %03d", id)
			userID := fmt.Sprintf("usr-down-%03d", id)
			token, err := jwtMgr.Sign(middleware.Claims{
				Sub:      userID,
				UserID:   userID,
				Username: userName,
				Role:     middleware.RoleViewer,
				Division: "Legal",
				Level:    "L3",
				Name:     userName,
			})
			if err != nil {
				errChan <- fmt.Sprintf("Failed to sign token for download client %d: %v", id, err)
				return
			}

			req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/documents/%s/download", docID), nil)
			req.Header.Set("Authorization", "Bearer "+token)
			rec := httptest.NewRecorder()

			downloadHandler.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				errChan <- fmt.Sprintf("Download client %d failed with status %d: %s", id, rec.Code, rec.Body.String())
				return
			}
			bodyStr := rec.Body.String()
			if !strings.Contains(bodyStr, userID) || !strings.Contains(bodyStr, userName) {
				errChan <- fmt.Sprintf("Download client %d watermark missing credentials: %s", id, bodyStr)
			}
		}(clientID)
	}

	wg.Wait()
	close(errChan)

	var failures []string
	for msg := range errChan {
		failures = append(failures, msg)
	}

	if len(failures) > 0 {
		t.Fatalf("Concurrent HTTP streaming stress failed with %d errors:\n%s",
			len(failures), strings.Join(failures, "\n"))
	}
	t.Logf("Concurrent HTTP streaming stress PASSED: 100 concurrent requests across 50 goroutines completed without race or data corruption.")
}

// TestChallenger_Streaming_DeletedOrNonExistentDocument verifies 404 responses for deleted or missing documents
func TestChallenger_Streaming_DeletedOrNonExistentDocument(t *testing.T) {
	jwtSecret := "not_found_test_secret"
	engine, _, wmHandler, jwtMgr, docIDs := setupStreamingTestFixture(jwtSecret)

	authMiddleware := middleware.Authenticate(jwtMgr)
	previewHandler := authMiddleware(http.HandlerFunc(wmHandler.Preview))
	downloadHandler := authMiddleware(http.HandlerFunc(wmHandler.Download))

	adminToken, _ := jwtMgr.Sign(middleware.Claims{
		Sub:      "usr-admin-1",
		Role:     middleware.RoleAdmin,
		Division: rbac.DivisionALL,
		Level:    rbac.LevelL5,
	})

	// 1. Non-existent document
	t.Run("Non-existent doc preview returns 404", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/documents/doc-non-existent-999/preview", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		rec := httptest.NewRecorder()
		previewHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Errorf("Expected 404, got %d", rec.Code)
		}
	})

	// 2. Soft-deleted document
	docID := docIDs["doc-internal"]
	err := engine.SoftDeleteDocument(docID, "usr-admin-1")
	if err != nil {
		t.Fatalf("Failed to soft-delete document: %v", err)
	}

	t.Run("Deleted doc preview returns 404", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/documents/%s/preview", docID), nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		rec := httptest.NewRecorder()
		previewHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Errorf("Expected 404 for deleted doc preview, got %d", rec.Code)
		}
	})

	t.Run("Deleted doc download returns 404", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/documents/%s/download", docID), nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		rec := httptest.NewRecorder()
		downloadHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Errorf("Expected 404 for deleted doc download, got %d", rec.Code)
		}
	})
}
