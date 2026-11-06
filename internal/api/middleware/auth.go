package middleware

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

// Common JWT and Authentication errors matching E2E test assertions
var (
	ErrMissingOrMalformedAuth = errors.New("Missing or malformed Bearer authorization token")
	ErrTokenExpired           = errors.New("Unauthorized: JWT token has expired")
	ErrInvalidSignature       = errors.New("Unauthorized: Invalid JWT signature")
	ErrMalformedToken         = errors.New("Malformed JWT token structure")
	ErrInvalidRole            = errors.New("Invalid role")
	ErrEmptyToken             = errors.New("Token must be a non-empty string")
)

// Valid application roles
const (
	RoleAdmin    = "admin"
	RoleReviewer = "reviewer"
	RoleUploader = "uploader"
	RoleViewer   = "viewer"
)

var ValidRoles = []string{RoleAdmin, RoleReviewer, RoleUploader, RoleViewer}

// RolePermissions defines the authorization matrix
var RolePermissions = map[string]map[string]bool{
	RoleAdmin: {
		"auth:manage":      true,
		"documents:read":   true,
		"documents:upload": true,
		"documents:delete": true,
		"folders:manage":   true,
		"workflow:action":  true,
		"ai:compare":       true,
		"ai:qa":            true,
		"system:admin":     true,
	},
	RoleReviewer: {
		"documents:read":  true,
		"workflow:action": true,
		"ai:compare":      true,
		"ai:qa":           true,
	},
	RoleUploader: {
		"documents:read":   true,
		"documents:upload": true,
		"folders:manage":   true,
		"workflow:submit":  true,
		"ai:qa":            true,
	},
	RoleViewer: {
		"documents:read": true,
		"ai:qa":          true,
	},
}

// IsValidRole checks if the role is one of the four supported roles
func IsValidRole(role string) bool {
	for _, r := range ValidRoles {
		if r == role {
			return true
		}
	}
	return false
}

// HasPermission checks if the role possesses the required permission
func HasPermission(role, permission string) bool {
	perms, ok := RolePermissions[role]
	if !ok {
		return false
	}
	return perms[permission]
}

// Claims represents the RFC 7519 JWT payload with role and RBAC claims
type Claims struct {
	Sub      string `json:"sub"`
	UserID   string `json:"user_id,omitempty"`
	Username string `json:"username"`
	Role     string `json:"role"`
	Division string `json:"division,omitempty"`
	Level    string `json:"level,omitempty"`
	Name     string `json:"name,omitempty"`
	Iat      int64  `json:"iat"`
	Exp      int64  `json:"exp"`
}

type jwtHeader struct {
	Alg string `json:"alg"`
	Typ string `json:"typ"`
}

// JWTManager handles signing and verification using HMAC-SHA256 (HS256)
type JWTManager struct {
	secret []byte
}

// NewJWTManager creates a new JWTManager. If secret is empty, falls back to environment or default
func NewJWTManager(secret string) *JWTManager {
	if secret == "" {
		if envSec := os.Getenv("JWT_SECRET"); envSec != "" {
			secret = envSec
		} else {
			secret = "brilian_jwt_secret_signing_key_2026_test"
		}
	}
	return &JWTManager{
		secret: []byte(secret),
	}
}

// Sign issues a signed HS256 JWT string from claims
func (m *JWTManager) Sign(claims Claims, expiresIn ...time.Duration) (string, error) {
	if !IsValidRole(claims.Role) {
		return "", fmt.Errorf("%w: %s. Must be one of %s", ErrInvalidRole, claims.Role, strings.Join(ValidRoles, ", "))
	}

	now := time.Now().Unix()
	if claims.Iat == 0 {
		claims.Iat = now
	}
	if claims.Exp == 0 {
		ttl := 3600 * time.Second
		if len(expiresIn) > 0 && expiresIn[0] > 0 {
			ttl = expiresIn[0]
		}
		claims.Exp = now + int64(ttl.Seconds())
	}

	header := jwtHeader{
		Alg: "HS256",
		Typ: "JWT",
	}

	headerJSON, err := json.Marshal(header)
	if err != nil {
		return "", fmt.Errorf("failed to marshal header: %w", err)
	}

	claimsJSON, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("failed to marshal claims: %w", err)
	}

	encHeader := base64.RawURLEncoding.EncodeToString(headerJSON)
	encClaims := base64.RawURLEncoding.EncodeToString(claimsJSON)
	data := encHeader + "." + encClaims

	h := hmac.New(sha256.New, m.secret)
	h.Write([]byte(data))
	signature := base64.RawURLEncoding.EncodeToString(h.Sum(nil))

	return data + "." + signature, nil
}

// Verify decodes and cryptographically verifies an HS256 token string
func (m *JWTManager) Verify(token string) (*Claims, error) {
	if strings.TrimSpace(token) == "" {
		return nil, ErrEmptyToken
	}

	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, ErrMalformedToken
	}

	encHeader, encClaims, signature := parts[0], parts[1], parts[2]
	data := encHeader + "." + encClaims

	h := hmac.New(sha256.New, m.secret)
	h.Write([]byte(data))
	expectedSig := base64.RawURLEncoding.EncodeToString(h.Sum(nil))

	if !hmac.Equal([]byte(signature), []byte(expectedSig)) {
		return nil, ErrInvalidSignature
	}

	claimsBytes, err := base64.RawURLEncoding.DecodeString(encClaims)
	if err != nil {
		return nil, fmt.Errorf("failed to decode claims payload: %w", err)
	}

	var claims Claims
	if err := json.Unmarshal(claimsBytes, &claims); err != nil {
		return nil, fmt.Errorf("failed to unmarshal claims JSON: %w", err)
	}

	now := time.Now().Unix()
	if claims.Exp > 0 && claims.Exp < now {
		return nil, ErrTokenExpired
	}

	if claims.UserID == "" {
		claims.UserID = claims.Sub
	}
	if claims.Division == "" {
		if claims.Role == RoleAdmin {
			claims.Division = "ALL"
		} else {
			claims.Division = "General"
		}
	}
	if claims.Level == "" {
		if claims.Role == RoleAdmin {
			claims.Level = "L5"
		} else {
			claims.Level = "L2"
		}
	}
	if claims.Name == "" {
		claims.Name = claims.Username
	}

	return &claims, nil
}

type contextKey string

const claimsKey contextKey = "brilian_user_claims"

// ContextWithClaims injects parsed Claims into context
func ContextWithClaims(ctx context.Context, claims *Claims) context.Context {
	return context.WithValue(ctx, claimsKey, claims)
}

// GetClaims retrieves Claims from request context
func GetClaims(ctx context.Context) (*Claims, bool) {
	c, ok := ctx.Value(claimsKey).(*Claims)
	return c, ok
}

// writeErrorJSON helper for middleware responses
func writeErrorJSON(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":  "error",
		"message": msg,
	})
}

// Authenticate returns a middleware that validates Bearer JWT tokens and sets claims in context
func Authenticate(jwtMgr *JWTManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				writeErrorJSON(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
				return
			}

			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			claims, err := jwtMgr.Verify(tokenStr)
			if err != nil {
				if errors.Is(err, ErrTokenExpired) {
					writeErrorJSON(w, http.StatusUnauthorized, "Unauthorized: JWT token has expired")
					return
				}
				if errors.Is(err, ErrInvalidSignature) {
					writeErrorJSON(w, http.StatusUnauthorized, "Unauthorized: Invalid JWT signature")
					return
				}
				writeErrorJSON(w, http.StatusUnauthorized, fmt.Sprintf("Unauthorized: %s", err.Error()))
				return
			}

			ctx := ContextWithClaims(r.Context(), claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequirePermission enforces RBAC permission check on the authenticated claims
func RequirePermission(permission string, customForbiddenMsg ...string) func(http.Handler) http.Handler {
	forbiddenMsg := "Forbidden: insufficient role permissions"
	if len(customForbiddenMsg) > 0 && customForbiddenMsg[0] != "" {
		forbiddenMsg = customForbiddenMsg[0]
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := GetClaims(r.Context())
			if !ok || claims == nil {
				writeErrorJSON(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
				return
			}

			if !HasPermission(claims.Role, permission) {
				writeErrorJSON(w, http.StatusForbidden, forbiddenMsg)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// CORS returns a middleware that handles CORS headers and OPTIONS preflights
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, X-Requested-With")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
