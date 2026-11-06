package api_test

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/company/brilian-dms/internal/api"
	"github.com/company/brilian-dms/internal/api/middleware"
	"github.com/company/brilian-dms/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const adversarialSecret = "adversarial_secret_key_for_rbac_challenge_2026_test"

func setupAdversarialRouter() (http.Handler, *middleware.JWTManager) {
	jwtMgr := middleware.NewJWTManager(adversarialSecret)
	cfg := &config.Config{
		ServerPort: "8080",
	}
	router := api.NewRouterWithSecret(cfg, adversarialSecret)
	return router, jwtMgr
}

// -----------------------------------------------------------------------------
// 1. FULL RBAC MATRIX ENFORCEMENT: 4 Roles x 4 Protected Endpoints (16 cases)
// -----------------------------------------------------------------------------
//
// Spec Requirements:
// - viewer: Can QA and read; CANNOT upload (403), CANNOT workflow action (403), CANNOT compare (403).
// - uploader: Can upload and read; CANNOT workflow action (403), CANNOT compare (403).
// - reviewer: Can workflow action, compare, QA, read; CANNOT upload (403).
// - admin: Can execute all operations.
// -----------------------------------------------------------------------------

func TestAdversarial_FullRBACMatrix_AllRolesAllEndpoints(t *testing.T) {
	router, jwtMgr := setupAdversarialRouter()

	roles := []string{
		middleware.RoleAdmin,
		middleware.RoleReviewer,
		middleware.RoleUploader,
		middleware.RoleViewer,
	}

	// Helper to issue valid token for role
	issueToken := func(role string) string {
		tok, err := jwtMgr.Sign(middleware.Claims{
			Sub:      "usr-" + role,
			Username: "user_" + role,
			Role:     role,
		})
		require.NoError(t, err)
		return tok
	}

	tokens := make(map[string]string)
	for _, r := range roles {
		tokens[r] = issueToken(r)
	}

	// 1. Upload: POST /api/v1/documents/upload
	t.Run("Endpoint: POST /api/v1/documents/upload", func(t *testing.T) {
		expectedStatuses := map[string]int{
			middleware.RoleAdmin:    http.StatusCreated,   // Allowed (201)
			middleware.RoleReviewer: http.StatusForbidden, // Denied (403)
			middleware.RoleUploader: http.StatusCreated,   // Allowed (201)
			middleware.RoleViewer:   http.StatusForbidden, // Denied (403)
		}

		for _, role := range roles {
			t.Run("Role_"+role, func(t *testing.T) {
				body, _ := json.Marshal(map[string]string{
					"title":     "Test Document " + role + ".pdf",
					"folder_id": "fld-100",
					"file":      "mock_file_content",
				})

				req := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", bytes.NewReader(body))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Authorization", "Bearer "+tokens[role])
				rec := httptest.NewRecorder()

				router.ServeHTTP(rec, req)

				assert.Equal(t, expectedStatuses[role], rec.Code,
					"Role %s got status %d, expected %d on upload", role, rec.Code, expectedStatuses[role])

				if expectedStatuses[role] == http.StatusForbidden {
					assert.Contains(t, rec.Body.String(), "insufficient role permissions")
				} else if expectedStatuses[role] == http.StatusCreated {
					assert.Contains(t, rec.Body.String(), "success")
				}
			})
		}
	})

	// 2. Workflow Action: PUT /api/v1/workflows/{id}/action
	t.Run("Endpoint: PUT /api/v1/workflows/{id}/action", func(t *testing.T) {
		expectedStatuses := map[string]int{
			middleware.RoleAdmin:    http.StatusOK,        // Allowed (200)
			middleware.RoleReviewer: http.StatusOK,        // Allowed (200)
			middleware.RoleUploader: http.StatusForbidden, // Denied (403)
			middleware.RoleViewer:   http.StatusForbidden, // Denied (403)
		}

		for _, role := range roles {
			t.Run("Role_"+role, func(t *testing.T) {
				body, _ := json.Marshal(map[string]string{
					"action": "approve",
					"notes":  "RBAC matrix verification for " + role,
				})

				req := httptest.NewRequest(http.MethodPut, "/api/v1/workflows/wf-test-"+role+"/action", bytes.NewReader(body))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Authorization", "Bearer "+tokens[role])
				rec := httptest.NewRecorder()

				router.ServeHTTP(rec, req)

				assert.Equal(t, expectedStatuses[role], rec.Code,
					"Role %s got status %d, expected %d on workflow action", role, rec.Code, expectedStatuses[role])

				if expectedStatuses[role] == http.StatusForbidden {
					assert.Contains(t, rec.Body.String(), "workflow action permission")
				} else if expectedStatuses[role] == http.StatusOK {
					assert.Contains(t, rec.Body.String(), "success")
				}
			})
		}
	})

	// 3. AI Compare: POST /api/v1/ai/compare
	t.Run("Endpoint: POST /api/v1/ai/compare", func(t *testing.T) {
		expectedStatuses := map[string]int{
			middleware.RoleAdmin:    http.StatusOK,        // Allowed (200)
			middleware.RoleReviewer: http.StatusOK,        // Allowed (200)
			middleware.RoleUploader: http.StatusForbidden, // Denied (403)
			middleware.RoleViewer:   http.StatusForbidden, // Denied (403)
		}

		for _, role := range roles {
			t.Run("Role_"+role, func(t *testing.T) {
				body, _ := json.Marshal(map[string]any{
					"document_ids": []string{"doc-1", "doc-2"},
					"query":        "Bandingkan klausul denda kontrak",
				})

				req := httptest.NewRequest(http.MethodPost, "/api/v1/ai/compare", bytes.NewReader(body))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Authorization", "Bearer "+tokens[role])
				rec := httptest.NewRecorder()

				router.ServeHTTP(rec, req)

				assert.Equal(t, expectedStatuses[role], rec.Code,
					"Role %s got status %d, expected %d on AI compare", role, rec.Code, expectedStatuses[role])

				if expectedStatuses[role] == http.StatusForbidden {
					assert.Contains(t, rec.Body.String(), "AI compare permission")
				} else if expectedStatuses[role] == http.StatusOK {
					assert.Contains(t, rec.Body.String(), "success")
				}
			})
		}
	})

	// 4. AI QA: POST /api/v1/ai/qa
	t.Run("Endpoint: POST /api/v1/ai/qa", func(t *testing.T) {
		// All 4 roles are allowed to run QA
		expectedStatuses := map[string]int{
			middleware.RoleAdmin:    http.StatusOK, // Allowed (200)
			middleware.RoleReviewer: http.StatusOK, // Allowed (200)
			middleware.RoleUploader: http.StatusOK, // Allowed (200)
			middleware.RoleViewer:   http.StatusOK, // Allowed (200)
		}

		for _, role := range roles {
			t.Run("Role_"+role, func(t *testing.T) {
				body, _ := json.Marshal(map[string]string{
					"document_id": "doc-1",
					"question":    "Kapan tanggal jatuh tempo pembayaran?",
				})

				req := httptest.NewRequest(http.MethodPost, "/api/v1/ai/qa", bytes.NewReader(body))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Authorization", "Bearer "+tokens[role])
				rec := httptest.NewRecorder()

				router.ServeHTTP(rec, req)

				assert.Equal(t, expectedStatuses[role], rec.Code,
					"Role %s got status %d, expected %d on AI QA", role, rec.Code, expectedStatuses[role])

				assert.Contains(t, rec.Body.String(), "success")
			})
		}
	})
}

// -----------------------------------------------------------------------------
// 2. TOKEN SECURITY CHALLENGES: Expired, Tampered, Malformed, Missing Bearer
// -----------------------------------------------------------------------------

func TestAdversarial_TokenSecurity_Boundaries(t *testing.T) {
	router, jwtMgr := setupAdversarialRouter()

	endpoints := []struct {
		method string
		path   string
		body   string
	}{
		{"POST", "/api/v1/documents/upload", `{"title":"x.pdf","folder_id":"f1","file":"data"}`},
		{"POST", "/api/v1/ai/compare", `{"document_ids":["d1","d2"],"query":"comp"}`},
		{"POST", "/api/v1/ai/qa", `{"document_id":"d1","question":"who?"}`},
		{"PUT", "/api/v1/workflows/wf-1/action", `{"action":"approve","notes":"ok"}`},
	}

	t.Run("Missing Authorization Header Entirely", func(t *testing.T) {
		for _, ep := range endpoints {
			req := httptest.NewRequest(ep.method, ep.path, strings.NewReader(ep.body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()

			router.ServeHTTP(rec, req)

			assert.Equal(t, http.StatusUnauthorized, rec.Code, "Expected 401 for %s %s without auth header", ep.method, ep.path)
			assert.Contains(t, rec.Body.String(), "Missing or malformed Bearer authorization token")
		}
	})

	t.Run("Malformed Authorization Header Prefixes", func(t *testing.T) {
		validToken, err := jwtMgr.Sign(middleware.Claims{
			Sub:      "usr-1",
			Username: "admin",
			Role:     middleware.RoleAdmin,
		})
		require.NoError(t, err)

		malformedHeaders := []struct {
			name   string
			header string
		}{
			{"Raw token without Bearer prefix", validToken},
			{"Basic auth scheme", "Basic " + base64.StdEncoding.EncodeToString([]byte("admin:pass"))},
			{"Token scheme", "Token " + validToken},
			{"Bearer without space", "Bearer" + validToken},
			{"Bearer with lowercase", "bearer " + validToken}, // Go HasPrefix checks exact "Bearer "
			{"Bearer with trailing empty token", "Bearer "},
			{"Bearer with whitespace only", "Bearer    "},
			{"Bearer with double prefix", "Bearer Bearer " + validToken},
		}

		for _, mh := range malformedHeaders {
			t.Run(mh.name, func(t *testing.T) {
				req := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", strings.NewReader(`{"title":"x.pdf","folder_id":"f1","file":"data"}`))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Authorization", mh.header)
				rec := httptest.NewRecorder()

				router.ServeHTTP(rec, req)

				assert.Equal(t, http.StatusUnauthorized, rec.Code, "Expected 401 for header %q", mh.header)
			})
		}
	})

	t.Run("Expired Token Variations", func(t *testing.T) {
		now := time.Now().Unix()

		expiredCases := []struct {
			name string
			exp  int64
		}{
			{"Expired 1 second ago", now - 1},
			{"Expired 10 seconds ago", now - 10},
			{"Expired 1 hour ago", now - 3600},
			{"Expired 30 days ago", now - 86400*30},
			{"Epoch 1 (1970)", 1},
		}

		for _, ec := range expiredCases {
			t.Run(ec.name, func(t *testing.T) {
				token, err := jwtMgr.Sign(middleware.Claims{
					Sub:      "usr-1",
					Username: "admin",
					Role:     middleware.RoleAdmin,
					Iat:      ec.exp - 3600,
					Exp:      ec.exp,
				})
				require.NoError(t, err)

				req := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", strings.NewReader(`{"title":"x.pdf","folder_id":"f1","file":"data"}`))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Authorization", "Bearer "+token)
				rec := httptest.NewRecorder()

				router.ServeHTTP(rec, req)

				assert.Equal(t, http.StatusUnauthorized, rec.Code)
				assert.Contains(t, rec.Body.String(), "JWT token has expired")
			})
		}
	})

	t.Run("Cryptographic Signature Tampering & Forgery", func(t *testing.T) {
		validToken, err := jwtMgr.Sign(middleware.Claims{
			Sub:      "usr-viw-1",
			Username: "viewer_1",
			Role:     middleware.RoleViewer,
		})
		require.NoError(t, err)

		parts := strings.Split(validToken, ".")
		require.Len(t, parts, 3)

		// Attack 1: Privilege Escalation via Claims Modification
		// Replace viewer payload with admin payload, keep viewer's signature
		adminClaims := middleware.Claims{
			Sub:      "usr-viw-1",
			Username: "viewer_1",
			Role:     middleware.RoleAdmin,
			Iat:      time.Now().Unix(),
			Exp:      time.Now().Unix() + 3600,
		}
		adminClaimsBytes, _ := json.Marshal(adminClaims)
		forgedPayload := base64.RawURLEncoding.EncodeToString(adminClaimsBytes)
		forgedToken := parts[0] + "." + forgedPayload + "." + parts[2]

		req1 := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", strings.NewReader(`{"title":"x.pdf","folder_id":"f1","file":"data"}`))
		req1.Header.Set("Content-Type", "application/json")
		req1.Header.Set("Authorization", "Bearer "+forgedToken)
		rec1 := httptest.NewRecorder()

		router.ServeHTTP(rec1, req1)
		assert.Equal(t, http.StatusUnauthorized, rec1.Code, "Forged claims must return 401")
		assert.Contains(t, rec1.Body.String(), "Invalid JWT signature")

		// Attack 2: 1-Bit Flips in Signature
		sigBytes, _ := base64.RawURLEncoding.DecodeString(parts[2])
		sigBytes[len(sigBytes)-1] ^= 0x01 // flip lowest bit
		flippedSig := base64.RawURLEncoding.EncodeToString(sigBytes)
		flippedToken := parts[0] + "." + parts[1] + "." + flippedSig

		req2 := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", strings.NewReader(`{"title":"x.pdf","folder_id":"f1","file":"data"}`))
		req2.Header.Set("Content-Type", "application/json")
		req2.Header.Set("Authorization", "Bearer "+flippedToken)
		rec2 := httptest.NewRecorder()

		router.ServeHTTP(rec2, req2)
		assert.Equal(t, http.StatusUnauthorized, rec2.Code, "Bit-flipped signature must return 401")
		assert.Contains(t, rec2.Body.String(), "Invalid JWT signature")

		// Attack 3: None Algorithm Exploit (alg: "none")
		noneHeader := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`))
		noneToken := noneHeader + "." + forgedPayload + "."

		req3 := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", strings.NewReader(`{"title":"x.pdf","folder_id":"f1","file":"data"}`))
		req3.Header.Set("Content-Type", "application/json")
		req3.Header.Set("Authorization", "Bearer "+noneToken)
		rec3 := httptest.NewRecorder()

		router.ServeHTTP(rec3, req3)
		assert.Equal(t, http.StatusUnauthorized, rec3.Code, "None algorithm must return 401")

		// Attack 4: Token signed with different secret
		attackerMgr := middleware.NewJWTManager("attacker_compromised_secret_666")
		attackerToken, _ := attackerMgr.Sign(middleware.Claims{
			Sub:      "usr-attacker",
			Username: "attacker",
			Role:     middleware.RoleAdmin,
		})

		req4 := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", strings.NewReader(`{"title":"x.pdf","folder_id":"f1","file":"data"}`))
		req4.Header.Set("Content-Type", "application/json")
		req4.Header.Set("Authorization", "Bearer "+attackerToken)
		rec4 := httptest.NewRecorder()

		router.ServeHTTP(rec4, req4)
		assert.Equal(t, http.StatusUnauthorized, rec4.Code, "Different secret token must return 401")
		assert.Contains(t, rec4.Body.String(), "Invalid JWT signature")
	})

	t.Run("Malformed Token Structural Variations", func(t *testing.T) {
		malformedTokens := []string{
			"single_part_string_no_dots",
			"header.payload_only_two_parts",
			"one.two.three.four_parts",
			"...empty_dots...",
			"invalid-base64-header!@#.payload.signature",
			"header.invalid-base64-payload!@#.signature",
		}

		for _, mt := range malformedTokens {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", strings.NewReader(`{"title":"x.pdf","folder_id":"f1","file":"data"}`))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+mt)
			rec := httptest.NewRecorder()

			router.ServeHTTP(rec, req)
			assert.Equal(t, http.StatusUnauthorized, rec.Code, "Malformed token %q must return 401", mt)
		}
	})
}

// -----------------------------------------------------------------------------
// 3. ADVERSARIAL PRIVILEGE ESCALATION & ARBITRARY ROLE INJECTION
// -----------------------------------------------------------------------------

func TestAdversarial_ArbitraryRoleInjection(t *testing.T) {
	router, _ := setupAdversarialRouter()

	// Manually construct tokens with invalid/unauthorized roles directly signed with valid secret
	// to see if the server accepts undefined roles
	invalidRoles := []string{
		"root",
		"superuser",
		"ADMIN",     // case sensitivity
		"Viewer",    // case sensitivity
		"uploader ", // trailing whitespace
		"guest",
		"anonymous",
		"system",
		"",
		"null",
		"../../admin",
	}

	for _, invalidRole := range invalidRoles {
		t.Run("InvalidRole_"+invalidRole, func(t *testing.T) {
			// Manually construct token to bypass client-side Sign() check
			headerJSON := `{"alg":"HS256","typ":"JWT"}`
			claimsJSON := fmt.Sprintf(`{"sub":"usr-hack","username":"hacker","role":"%s","iat":%d,"exp":%d}`,
				invalidRole, time.Now().Unix(), time.Now().Unix()+3600)

			encHeader := base64.RawURLEncoding.EncodeToString([]byte(headerJSON))
			encClaims := base64.RawURLEncoding.EncodeToString([]byte(claimsJSON))
			data := encHeader + "." + encClaims

			// Sign with genuine server secret
			signer := middleware.NewJWTManager(adversarialSecret)
			// Compute genuine HMAC signature manually
			sig := computeHMAC(data, adversarialSecret)
			token := data + "." + sig

			// Verify verify() accepts cryptographic integrity
			verifiedClaims, err := signer.Verify(token)
			require.NoError(t, err, "Cryptographic verification should pass since secret is genuine")
			assert.Equal(t, invalidRole, verifiedClaims.Role)

			// NOW challenge protected endpoints with this forged role token
			endpoints := []struct {
				method string
				path   string
				body   string
			}{
				{"POST", "/api/v1/documents/upload", `{"title":"hacked.pdf","folder_id":"fld-1","file":"bad"}`},
				{"POST", "/api/v1/ai/compare", `{"document_ids":["d1","d2"],"query":"compare"}`},
				{"PUT", "/api/v1/workflows/wf-hack/action", `{"action":"approve","notes":"hacked"}`},
			}

			for _, ep := range endpoints {
				req := httptest.NewRequest(ep.method, ep.path, strings.NewReader(ep.body))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Authorization", "Bearer "+token)
				rec := httptest.NewRecorder()

				router.ServeHTTP(rec, req)

				// Server MUST return 403 Forbidden because invalidRole has NO permissions in RolePermissions matrix
				assert.Equal(t, http.StatusForbidden, rec.Code,
					"Role %q must be strictly rejected with 403 on %s %s, got %d", invalidRole, ep.method, ep.path, rec.Code)
			}
		})
	}
}

// computeHMAC helper using standard HMAC-SHA256
func computeHMAC(data, secret string) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(data))
	return base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}

// -----------------------------------------------------------------------------
// 4. CONCURRENT ACCESS & REPLAY ATTACK STRESS TEST
// -----------------------------------------------------------------------------

func TestAdversarial_ConcurrencyAndReplay(t *testing.T) {
	router, jwtMgr := setupAdversarialRouter()

	adminToken, err := jwtMgr.Sign(middleware.Claims{
		Sub:      "usr-admin",
		Username: "admin_brilian",
		Role:     middleware.RoleAdmin,
	})
	require.NoError(t, err)

	viewerToken, err := jwtMgr.Sign(middleware.Claims{
		Sub:      "usr-viewer",
		Username: "viewer_1",
		Role:     middleware.RoleViewer,
	})
	require.NoError(t, err)

	const concurrency = 20
	var wg sync.WaitGroup

	// Concurrently send 20 requests with admin token (should all succeed 201)
	wg.Add(concurrency)
	for i := 0; i < concurrency; i++ {
		idx := i
		go func() {
			defer wg.Done()
			body, _ := json.Marshal(map[string]string{
				"title":     fmt.Sprintf("Concurrent Doc %d.pdf", idx),
				"folder_id": "fld-100",
				"file":      "concurrent_content",
			})
			req := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+adminToken)
			rec := httptest.NewRecorder()

			router.ServeHTTP(rec, req)
			assert.Equal(t, http.StatusCreated, rec.Code)
		}()
	}

	// Concurrently send 20 requests with viewer token to upload (should all fail 403)
	wg.Add(concurrency)
	for i := 0; i < concurrency; i++ {
		idx := i
		go func() {
			defer wg.Done()
			body, _ := json.Marshal(map[string]string{
				"title":     fmt.Sprintf("Unauthorized Doc %d.pdf", idx),
				"folder_id": "fld-100",
				"file":      "bad_content",
			})
			req := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+viewerToken)
			rec := httptest.NewRecorder()

			router.ServeHTTP(rec, req)
			assert.Equal(t, http.StatusForbidden, rec.Code)
		}()
	}

	wg.Wait()
}

// -----------------------------------------------------------------------------
// 5. MULTIPART FORM BOUNDARY & HEADER TAMPERING UNDER RBAC
// -----------------------------------------------------------------------------

func TestAdversarial_MultipartForm_Upload_RBAC(t *testing.T) {
	router, jwtMgr := setupAdversarialRouter()

	uploaderToken, err := jwtMgr.Sign(middleware.Claims{
		Sub:      "usr-upl",
		Username: "uploader_1",
		Role:     middleware.RoleUploader,
	})
	require.NoError(t, err)

	reviewerToken, err := jwtMgr.Sign(middleware.Claims{
		Sub:      "usr-rev",
		Username: "reviewer_1",
		Role:     middleware.RoleReviewer,
	})
	require.NoError(t, err)

	// Valid multipart form body
	createMultipartBody := func(title, folderID, fileContent string) (*bytes.Buffer, string) {
		buf := &bytes.Buffer{}
		writer := multipart.NewWriter(buf)
		_ = writer.WriteField("title", title)
		_ = writer.WriteField("folder_id", folderID)
		part, _ := writer.CreateFormFile("file", "test.pdf")
		_, _ = part.Write([]byte(fileContent))
		_ = writer.Close()
		return buf, writer.FormDataContentType()
	}

	t.Run("Uploader allowed multipart upload", func(t *testing.T) {
		buf, ct := createMultipartBody("Contract 2026.pdf", "fld-1", "binary_data")
		req := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", buf)
		req.Header.Set("Content-Type", ct)
		req.Header.Set("Authorization", "Bearer "+uploaderToken)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusCreated, rec.Code)
	})

	t.Run("Reviewer forbidden multipart upload (403)", func(t *testing.T) {
		buf, ct := createMultipartBody("Contract 2026.pdf", "fld-1", "binary_data")
		req := httptest.NewRequest(http.MethodPost, "/api/v1/documents/upload", buf)
		req.Header.Set("Content-Type", ct)
		req.Header.Set("Authorization", "Bearer "+reviewerToken)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusForbidden, rec.Code)
		assert.Contains(t, rec.Body.String(), "insufficient role permissions")
	})
}
