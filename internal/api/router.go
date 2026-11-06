package api

import (
	"bytes"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/company/brilian-dms/internal/api/handler"
	"github.com/company/brilian-dms/internal/api/middleware"
	"github.com/company/brilian-dms/internal/config"
)

// Router holds the HTTP mux, middleware, and handler instances
type Router struct {
	Mux              *http.ServeMux
	JWTManager       *middleware.JWTManager
	AuthHandler      *handler.AuthHandler
	DocumentHandler  *handler.DocumentHandler
	UploadHandler    *handler.UploadHandler
	AIHandler        *handler.AIHandler
	WorkflowHandler  *handler.WorkflowHandler
	AdminHandler     *handler.AdminHandler
	RBACHandler      *handler.RBACHandler
	WatermarkHandler *handler.WatermarkHandler
	StaticFS         fs.FS
}

// NewRouter constructs and configures the standard net/http.ServeMux using Go 1.22 routing
func NewRouter(cfg *config.Config) http.Handler {
	secret := ""
	if cfg != nil {
		secret = os.Getenv("JWT_SECRET")
	}
	return NewRouterWithFS(cfg, secret, nil)
}

// NewRouterWithSecret allows explicit injection of JWT secret (useful for tests and multi-tenant configs)
func NewRouterWithSecret(cfg *config.Config, jwtSecret string) http.Handler {
	return NewRouterWithFS(cfg, jwtSecret, nil)
}

// NewRouterWithFS allows explicit injection of JWT secret and static asset filesystem
func NewRouterWithFS(cfg *config.Config, jwtSecret string, staticFS fs.FS) http.Handler {
	jwtMgr := middleware.NewJWTManager(jwtSecret)
	authMiddleware := middleware.Authenticate(jwtMgr)

	authHandler := handler.NewAuthHandler(jwtMgr)
	docHandler := handler.NewDocumentHandler()
	uploadHandler := handler.NewUploadHandler(docHandler.Engine())
	aiHandler := handler.NewAIHandler()
	wfHandler := handler.NewWorkflowHandler()
	adminHandler := handler.NewAdminHandler()
	rbacHandler := handler.NewRBACHandler()
	wmHandler := handler.NewWatermarkHandler(docHandler.Engine(), adminHandler)

	mux := http.NewServeMux()

	// 1. Health check routes
	healthHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handler.WriteJSON(w, http.StatusOK, map[string]string{
			"status": "healthy",
		})
	})
	mux.Handle("GET /health", healthHandler)
	mux.Handle("GET /api/v1/health", healthHandler)

	// 2. Auth routes (Public)
	mux.HandleFunc("POST /api/v1/auth/login", authHandler.Login)

	// 3. Document & Resumable Upload routes (Protected)
	mux.Handle("POST /api/v1/documents/upload/init", authMiddleware(http.HandlerFunc(uploadHandler.Init)))
	mux.Handle("POST /api/v1/documents/upload/chunk", authMiddleware(http.HandlerFunc(uploadHandler.Chunk)))
	mux.Handle("POST /api/v1/documents/upload/complete", authMiddleware(http.HandlerFunc(uploadHandler.Complete)))
	mux.Handle("GET /api/v1/documents/upload/status/", authMiddleware(http.HandlerFunc(uploadHandler.Status)))
	mux.Handle("POST /api/v1/documents/upload", authMiddleware(http.HandlerFunc(docHandler.Upload)))
	mux.Handle("GET /api/v1/documents", authMiddleware(http.HandlerFunc(docHandler.List)))
	mux.Handle("GET /api/v1/documents/{id}/versions", authMiddleware(http.HandlerFunc(docHandler.Versions)))
	mux.Handle("POST /api/v1/documents/{id}/versions/{ver}/restore", authMiddleware(http.HandlerFunc(docHandler.RestoreVersion)))
	mux.Handle("PUT /api/v1/documents/{id}/rename", authMiddleware(http.HandlerFunc(docHandler.Rename)))
	mux.Handle("PUT /api/v1/documents/{id}/move", authMiddleware(http.HandlerFunc(docHandler.Move)))
	mux.Handle("DELETE /api/v1/documents/{id}", authMiddleware(http.HandlerFunc(docHandler.Delete)))

	// Dynamic Watermarking & Access Protected Document Streaming (Protected)
	mux.Handle("GET /api/v1/documents/{id}/preview", authMiddleware(http.HandlerFunc(wmHandler.Preview)))
	mux.Handle("GET /api/v1/documents/{id}/download", authMiddleware(http.HandlerFunc(wmHandler.Download)))

	// 4. Trash Lifecycle routes
	mux.Handle("GET /api/v1/trash", authMiddleware(http.HandlerFunc(docHandler.TrashList)))
	mux.Handle("POST /api/v1/trash/{id}/restore", authMiddleware(http.HandlerFunc(docHandler.TrashRestore)))
	mux.Handle("DELETE /api/v1/trash/{id}/permanent", authMiddleware(http.HandlerFunc(docHandler.TrashPermanent)))

	// 5. AI & Deterministic Engine routes (Protected)
	mux.Handle("POST /api/v1/engine/extract", authMiddleware(http.HandlerFunc(aiHandler.Extract)))
	mux.Handle("POST /api/v1/engine/classify", authMiddleware(http.HandlerFunc(aiHandler.Classify)))
	mux.Handle("GET /api/v1/engine/search", authMiddleware(http.HandlerFunc(aiHandler.Search)))
	mux.Handle("POST /api/v1/engine/search", authMiddleware(http.HandlerFunc(aiHandler.Search)))
	mux.Handle("POST /api/v1/ai/summarize", authMiddleware(http.HandlerFunc(aiHandler.Summarize)))
	mux.Handle("POST /api/v1/ai/compare", authMiddleware(http.HandlerFunc(aiHandler.Compare)))
	mux.Handle("POST /api/v1/ai/qa", authMiddleware(http.HandlerFunc(aiHandler.QA)))

	// 6. Workflow routes (Protected)
	mux.Handle("PUT /api/v1/workflows/{id}/action", authMiddleware(http.HandlerFunc(wfHandler.Action)))

	// 7. Dual-Axis RBAC Check & Permissions (Protected)
	mux.Handle("POST /api/v1/rbac/check", authMiddleware(http.HandlerFunc(rbacHandler.Check)))
	mux.Handle("GET /api/v1/rbac/permissions", authMiddleware(http.HandlerFunc(rbacHandler.Permissions)))

	// 8. Admin Management & Watermark Policies (Protected - Admin Only)
	mux.Handle("GET /api/v1/admin/users", authMiddleware(http.HandlerFunc(adminHandler.ListUsers)))
	mux.Handle("PUT /api/v1/admin/users/{id}", authMiddleware(http.HandlerFunc(adminHandler.UpdateUser)))
	mux.Handle("GET /api/v1/admin/policies", authMiddleware(http.HandlerFunc(adminHandler.GetPolicies)))
	mux.Handle("PUT /api/v1/admin/policies", authMiddleware(http.HandlerFunc(adminHandler.UpdatePolicies)))
	mux.Handle("GET /api/v1/admin/watermark", authMiddleware(http.HandlerFunc(adminHandler.GetWatermark)))
	mux.Handle("PUT /api/v1/admin/watermark", authMiddleware(http.HandlerFunc(adminHandler.UpdateWatermark)))

	// 6. Catch-all fallback for undefined /api/ routes
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		handler.WriteError(w, http.StatusNotFound, fmt.Sprintf("Endpoint not found: %s %s", r.Method, r.URL.Path))
	})

	// 7. Static frontend assets and HTML5 history SPA fallback
	resolvedFS := resolveStaticFS(staticFS)
	mux.Handle("/", NewStaticHandler(resolvedFS))

	// Wrap entire mux with CORS middleware
	return middleware.CORS(mux)
}

// resolveStaticFS resolves the static asset filesystem from explicit parameter,
// STATIC_DIR environment variable, or candidate directory locations.
func resolveStaticFS(custom fs.FS) fs.FS {
	if custom != nil {
		return custom
	}
	if dir := os.Getenv("STATIC_DIR"); dir != "" {
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			return os.DirFS(dir)
		}
	}
	candidates := []string{
		"frontend/dist",
		"../../frontend/dist",
		"../frontend/dist",
	}
	for _, cand := range candidates {
		if info, err := os.Stat(cand); err == nil && info.IsDir() {
			return os.DirFS(cand)
		}
	}
	return nil
}

// NewStaticHandler returns an http.Handler that serves static files from staticFS
// with support for HTML5 history API SPA fallback (non-asset routes serve index.html).
func NewStaticHandler(staticFS fs.FS) http.Handler {
	var fileServer http.Handler
	if staticFS != nil {
		fileServer = http.FileServer(http.FS(staticFS))
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			handler.WriteError(w, http.StatusMethodNotAllowed, fmt.Sprintf("Method %s not allowed", r.Method))
			return
		}

		if staticFS == nil {
			http.NotFound(w, r)
			return
		}

		cleanPath := path.Clean(r.URL.Path)
		trimmed := strings.TrimPrefix(cleanPath, "/")

		// Root, empty path, or index.html -> serve index.html directly
		if trimmed == "" || trimmed == "." || trimmed == "index.html" {
			serveIndex(w, r, staticFS)
			return
		}

		// Try to open the requested path directly in staticFS
		f, err := staticFS.Open(trimmed)
		if err == nil {
			stat, statErr := f.Stat()
			_ = f.Close()
			if statErr == nil {
				if stat.IsDir() {
					// Check for nested index.html
					nested := path.Join(trimmed, "index.html")
					if nf, nerr := staticFS.Open(nested); nerr == nil {
						_ = nf.Close()
						r.URL.Path = "/" + nested
						fileServer.ServeHTTP(w, r)
						return
					}
					// Directory without nested index.html -> fall back to root index.html
					serveIndex(w, r, staticFS)
					return
				}
				// Normal static file found -> serve directly
				fileServer.ServeHTTP(w, r)
				return
			}
		}

		// File not found in staticFS:
		// If it's a specific static asset (under /assets/ or has a file extension), return 404
		if strings.HasPrefix(cleanPath, "/assets/") || filepath.Ext(cleanPath) != "" {
			http.NotFound(w, r)
			return
		}

		// For SPA client routes (e.g. /documents, /chat, /compare, /viewer, /workflow), fall back to index.html
		serveIndex(w, r, staticFS)
	})
}

// serveIndex writes the index.html content from staticFS to the response.
func serveIndex(w http.ResponseWriter, r *http.Request, staticFS fs.FS) {
	if staticFS == nil {
		http.NotFound(w, r)
		return
	}

	f, err := staticFS.Open("index.html")
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	if rs, ok := f.(io.ReadSeeker); ok {
		http.ServeContent(w, r, "index.html", stat.ModTime(), rs)
		return
	}

	data, err := io.ReadAll(f)
	if err != nil {
		handler.WriteError(w, http.StatusInternalServerError, "Failed to read index.html")
		return
	}
	http.ServeContent(w, r, "index.html", stat.ModTime(), bytes.NewReader(data))
}
