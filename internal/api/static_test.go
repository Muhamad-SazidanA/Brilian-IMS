package api_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/company/brilian-dms/internal/api"
	"github.com/company/brilian-dms/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func createMockFrontendFS() fstest.MapFS {
	return fstest.MapFS{
		"index.html": &fstest.MapFile{
			Data: []byte("<!doctype html><html><head><title>BrilianIDMS</title></head><body><div id=\"root\">App</div></body></html>"),
		},
		"assets/index-app.js": &fstest.MapFile{
			Data: []byte("console.log('brilian-engine-loaded');"),
		},
		"assets/style.css": &fstest.MapFile{
			Data: []byte("body { background: #020617; }"),
		},
		"vite.svg": &fstest.MapFile{
			Data: []byte("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"),
		},
	}
}

func TestStatic_ServeExistingFiles(t *testing.T) {
	mockFS := createMockFrontendFS()
	cfg := &config.Config{ServerPort: "8080"}
	router := api.NewRouterWithFS(cfg, "test_secret", mockFS)

	t.Run("GET / serves index.html", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Header().Get("Content-Type"), "text/html")
		assert.Contains(t, rec.Body.String(), "<title>BrilianIDMS</title>")
	})

	t.Run("GET /index.html serves index.html directly", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/index.html", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Header().Get("Content-Type"), "text/html")
		assert.Contains(t, rec.Body.String(), "<div id=\"root\">App</div>")
	})

	t.Run("GET /assets/index-app.js serves JavaScript file", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/assets/index-app.js", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Body.String(), "console.log('brilian-engine-loaded');")
	})

	t.Run("GET /assets/style.css serves CSS file", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/assets/style.css", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Body.String(), "background: #020617")
	})

	t.Run("GET /vite.svg serves SVG asset", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/vite.svg", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Body.String(), "<svg")
	})
}

func TestStatic_SPAHtml5HistoryFallback(t *testing.T) {
	mockFS := createMockFrontendFS()
	cfg := &config.Config{ServerPort: "8080"}
	router := api.NewRouterWithFS(cfg, "test_secret", mockFS)

	spaRoutes := []string{
		"/documents",
		"/documents/folder-123",
		"/chat",
		"/compare",
		"/viewer",
		"/workflow",
		"/workflows/wf-9988",
		"/auth/login",
	}

	for _, route := range spaRoutes {
		t.Run("SPA Fallback GET "+route, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, route, nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			assert.Equal(t, http.StatusOK, rec.Code, "SPA route %s must return 200", route)
			assert.Contains(t, rec.Header().Get("Content-Type"), "text/html")
			assert.Contains(t, rec.Body.String(), "<title>BrilianIDMS</title>")
		})
	}
}

func TestStatic_MissingAssetReturns404(t *testing.T) {
	mockFS := createMockFrontendFS()
	cfg := &config.Config{ServerPort: "8080"}
	router := api.NewRouterWithFS(cfg, "test_secret", mockFS)

	missingAssets := []string{
		"/assets/missing-bundle.js",
		"/assets/missing.css",
		"/favicon.ico",
		"/images/missing-logo.png",
	}

	for _, asset := range missingAssets {
		t.Run("Missing asset "+asset+" returns 404", func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, asset, nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			assert.Equal(t, http.StatusNotFound, rec.Code, "Missing asset %s should return 404", asset)
			// Must NOT return index.html for missing assets
			assert.NotContains(t, rec.Body.String(), "<title>BrilianIDMS</title>")
		})
	}
}

func TestStatic_MethodNotAllowedOnNonGet(t *testing.T) {
	mockFS := createMockFrontendFS()
	cfg := &config.Config{ServerPort: "8080"}
	router := api.NewRouterWithFS(cfg, "test_secret", mockFS)

	disallowedMethods := []string{
		http.MethodPost,
		http.MethodPut,
		http.MethodDelete,
		http.MethodPatch,
	}

	for _, method := range disallowedMethods {
		t.Run("Disallowed method "+method+" on SPA route", func(t *testing.T) {
			req := httptest.NewRequest(method, "/documents", nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			assert.Equal(t, http.StatusMethodNotAllowed, rec.Code)
			assert.Contains(t, rec.Header().Get("Allow"), "GET")
		})
	}
}

func TestStatic_APIRoutesNeverInterceptedBySPA(t *testing.T) {
	mockFS := createMockFrontendFS()
	cfg := &config.Config{ServerPort: "8080"}
	router := api.NewRouterWithFS(cfg, "test_secret", mockFS)

	t.Run("GET /health returns JSON", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Header().Get("Content-Type"), "application/json")
		var body map[string]string
		err := json.Unmarshal(rec.Body.Bytes(), &body)
		require.NoError(t, err)
		assert.Equal(t, "healthy", body["status"])
	})

	t.Run("GET /api/v1/health returns JSON", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Header().Get("Content-Type"), "application/json")
	})

	t.Run("GET /api/v1/undefined-route returns 404 JSON, NOT SPA HTML", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/undefined-route", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
		assert.Contains(t, rec.Header().Get("Content-Type"), "application/json")
		assert.NotContains(t, rec.Body.String(), "<!doctype html>")
		assert.Contains(t, rec.Body.String(), "Endpoint not found: GET /api/v1/undefined-route")
	})
}

func TestStatic_NilFileSystemHandling(t *testing.T) {
	// Passing an empty/nil static FS handler
	handler := api.NewStaticHandler(nil)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestStatic_HeadRequestSupport(t *testing.T) {
	mockFS := createMockFrontendFS()
	cfg := &config.Config{ServerPort: "8080"}
	router := api.NewRouterWithFS(cfg, "test_secret", mockFS)

	req := httptest.NewRequest(http.MethodHead, "/", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Header().Get("Content-Type"), "text/html")
	body, _ := io.ReadAll(rec.Body)
	assert.Empty(t, body, "HEAD request should have empty body")
}
