package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/company/brilian-dms/internal/api/middleware"
)

// User represents an internal user record
type User struct {
	ID       string
	Username string
	Role     string
	Password string
}

// LoginRequest is the request body for POST /api/v1/auth/login
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// LoginResponse is the success response for POST /api/v1/auth/login
type LoginResponse struct {
	Status string `json:"status"`
	Token  string `json:"token"`
}

// AuthHandler handles authentication operations
type AuthHandler struct {
	jwtMgr *middleware.JWTManager
	users  map[string]User
	mu     sync.RWMutex
}

// NewAuthHandler initializes AuthHandler with standard test/production seed users
func NewAuthHandler(jwtMgr *middleware.JWTManager) *AuthHandler {
	users := map[string]User{
		"admin_brilian": {ID: "usr-admin-1", Username: "admin_brilian", Role: middleware.RoleAdmin, Password: "securepassword"},
		"reviewer_1":    {ID: "usr-rev-1", Username: "reviewer_1", Role: middleware.RoleReviewer, Password: "reviewerpass"},
		"uploader_1":    {ID: "usr-upl-1", Username: "uploader_1", Role: middleware.RoleUploader, Password: "uploaderpass"},
		"viewer_1":      {ID: "usr-viw-1", Username: "viewer_1", Role: middleware.RoleViewer, Password: "viewerpass"},
	}

	return &AuthHandler{
		jwtMgr: jwtMgr,
		users:  users,
	}
}

// RegisterUser dynamically registers or updates a user in the auth handler
func (h *AuthHandler) RegisterUser(u User) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.users[u.Username] = u
}

// Login handles POST /api/v1/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req LoginRequest
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Username and password required")
		return
	}

	username := strings.TrimSpace(req.Username)
	password := req.Password
	if username == "" || password == "" {
		WriteError(w, http.StatusBadRequest, "Username and password required")
		return
	}

	h.mu.RLock()
	user, exists := h.users[username]
	h.mu.RUnlock()

	if !exists || user.Password != password {
		WriteError(w, http.StatusUnauthorized, "Invalid username or password")
		return
	}

	claims := middleware.Claims{
		Sub:      user.ID,
		Username: user.Username,
		Role:     user.Role,
		Iat:      time.Now().Unix(),
		Exp:      time.Now().Add(24 * time.Hour).Unix(),
	}

	token, err := h.jwtMgr.Sign(claims)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to sign JWT token")
		return
	}

	WriteJSON(w, http.StatusOK, LoginResponse{
		Status: "success",
		Token:  token,
	})
}
