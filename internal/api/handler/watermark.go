package handler

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/company/brilian-dms/internal/api/middleware"
	"github.com/company/brilian-dms/internal/dms"
	"github.com/company/brilian-dms/internal/rbac"
	"github.com/company/brilian-dms/internal/watermark"
)

// WatermarkHandler handles document preview and download with mandatory dynamic watermarking and RBAC checks
type WatermarkHandler struct {
	engine       *dms.Engine
	adminHandler *AdminHandler
}

// NewWatermarkHandler initializes a WatermarkHandler with DMS engine and admin configuration
func NewWatermarkHandler(engine *dms.Engine, adminHandler *AdminHandler) *WatermarkHandler {
	return &WatermarkHandler{
		engine:       engine,
		adminHandler: adminHandler,
	}
}

// extractDocIDFromPath extracts document ID from URL path
// e.g. /api/v1/documents/{id}/preview or /api/v1/documents/{id}/download
func extractDocIDFromPath(p, suffix string) string {
	trimmed := strings.Trim(p, "/")
	parts := strings.Split(trimmed, "/")
	// Expected: ["api", "v1", "documents", "{id}", "preview"]
	for i, part := range parts {
		if part == "documents" && i+2 < len(parts) && parts[i+2] == suffix {
			return parts[i+1]
		}
	}
	if len(parts) >= 2 {
		return parts[len(parts)-2]
	}
	return ""
}

// Preview handles GET /api/v1/documents/{id}/preview
func (h *WatermarkHandler) Preview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims, ok := middleware.GetClaims(r.Context())
	if !ok || claims == nil {
		WriteError(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
		return
	}

	docID := extractDocIDFromPath(r.URL.Path, "preview")
	if docID == "" {
		WriteError(w, http.StatusBadRequest, "Missing document ID")
		return
	}

	doc, found := h.engine.GetDocument(docID)
	if !found || doc.IsDeleted {
		WriteError(w, http.StatusNotFound, "Document not found")
		return
	}

	// Dual-Axis RBAC Check: View
	rbacUser := middleware.ToRBACUser(claims)
	access := rbac.EvaluateAccess(rbacUser, doc.Classification, doc.Division, rbac.ActionView)
	if !access.Allowed {
		WriteError(w, http.StatusForbidden, fmt.Sprintf("Forbidden: %s", access.Reason))
		return
	}

	// Mandatory Dynamic Watermark configuration
	cfg := h.adminHandler.GetWatermarkConfigValue()
	opts := watermark.Options{
		FullName:      claims.Name,
		UserID:        claims.UserID,
		Timestamp:     time.Now().UTC(),
		Opacity:       cfg.DefaultOpacity,
		DiagonalAngle: cfg.DefaultAngle,
	}
	if opts.FullName == "" {
		opts.FullName = claims.Username
	}
	if opts.FullName == "" {
		opts.FullName = "Authorized User"
	}
	if opts.UserID == "" {
		opts.UserID = claims.Sub
	}

	watermarked, err := watermark.ApplyWatermark(doc.Content, doc.MimeType, opts)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to apply watermark: %s", err.Error()))
		return
	}

	w.Header().Set("X-Watermark-Applied", "true")
	w.Header().Set("Content-Type", doc.MimeType)

	// If JSON requested explicitly
	acceptHeader := r.Header.Get("Accept")
	formatQuery := r.URL.Query().Get("format")
	if strings.Contains(acceptHeader, "application/json") || formatQuery == "json" {
		WriteJSON(w, http.StatusOK, map[string]any{
			"status":      "success",
			"document_id": doc.ID,
			"mime_type":   doc.MimeType,
			"content":     string(watermarked),
			"watermark": map[string]any{
				"FullName":      opts.FullName,
				"UserID":        opts.UserID,
				"Timestamp":     opts.Timestamp.Format(time.RFC3339),
				"Opacity":       opts.Opacity,
				"DiagonalAngle": opts.DiagonalAngle,
			},
		})
		return
	}

	// Otherwise, write binary stream directly
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(watermarked)
}

// Download handles GET /api/v1/documents/{id}/download
func (h *WatermarkHandler) Download(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims, ok := middleware.GetClaims(r.Context())
	if !ok || claims == nil {
		WriteError(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
		return
	}

	docID := extractDocIDFromPath(r.URL.Path, "download")
	if docID == "" {
		WriteError(w, http.StatusBadRequest, "Missing document ID")
		return
	}

	doc, found := h.engine.GetDocument(docID)
	if !found || doc.IsDeleted {
		WriteError(w, http.StatusNotFound, "Document not found")
		return
	}

	// Dual-Axis RBAC Check: Download
	rbacUser := middleware.ToRBACUser(claims)
	access := rbac.EvaluateAccess(rbacUser, doc.Classification, doc.Division, rbac.ActionDownload)
	if !access.Allowed {
		WriteError(w, http.StatusForbidden, fmt.Sprintf("Forbidden: %s", access.Reason))
		return
	}

	// Mandatory Dynamic Watermark configuration
	cfg := h.adminHandler.GetWatermarkConfigValue()
	opts := watermark.Options{
		FullName:      claims.Name,
		UserID:        claims.UserID,
		Timestamp:     time.Now().UTC(),
		Opacity:       cfg.DefaultOpacity,
		DiagonalAngle: cfg.DefaultAngle,
	}
	if opts.FullName == "" {
		opts.FullName = claims.Username
	}
	if opts.FullName == "" {
		opts.FullName = "Authorized User"
	}
	if opts.UserID == "" {
		opts.UserID = claims.Sub
	}

	watermarked, err := watermark.ApplyWatermark(doc.Content, doc.MimeType, opts)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to apply watermark: %s", err.Error()))
		return
	}

	w.Header().Set("X-Watermark-Applied", "true")
	w.Header().Set("Content-Type", doc.MimeType)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", doc.Title))

	// If JSON requested explicitly
	acceptHeader := r.Header.Get("Accept")
	formatQuery := r.URL.Query().Get("format")
	if strings.Contains(acceptHeader, "application/json") || formatQuery == "json" {
		WriteJSON(w, http.StatusOK, map[string]any{
			"status":      "success",
			"document_id": doc.ID,
			"filename":    doc.Title,
			"mime_type":   doc.MimeType,
			"content":     string(watermarked),
			"watermark": map[string]any{
				"FullName":      opts.FullName,
				"UserID":        opts.UserID,
				"Timestamp":     opts.Timestamp.Format(time.RFC3339),
				"Opacity":       opts.Opacity,
				"DiagonalAngle": opts.DiagonalAngle,
			},
		})
		return
	}

	// Stream file bytes
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(watermarked)
}
