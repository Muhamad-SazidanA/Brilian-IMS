package middleware

import (
	"fmt"
	"net/http"

	"github.com/company/brilian-dms/internal/rbac"
)

// ToRBACUser converts middleware.Claims to rbac.UserClaims
func ToRBACUser(claims *Claims) rbac.UserClaims {
	if claims == nil {
		return rbac.UserClaims{}
	}
	return rbac.UserClaims{
		UserID:   claims.UserID,
		Username: claims.Username,
		Name:     claims.Name,
		Division: claims.Division,
		Level:    claims.Level,
		Role:     claims.Role,
	}
}

// RequireAdmin middleware ensures caller has admin role
func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := GetClaims(r.Context())
		if !ok || claims == nil {
			writeErrorJSON(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
			return
		}

		if claims.Role != RoleAdmin {
			writeErrorJSON(w, http.StatusForbidden, "Forbidden: administrator privileges required")
			return
		}

		next.ServeHTTP(w, r)
	})
}

// RequireDocumentAccess validates dual-axis RBAC access for a document
func RequireDocumentAccess(
	resolveDoc func(r *http.Request) (classification string, division string, err error),
	action string,
) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := GetClaims(r.Context())
			if !ok || claims == nil {
				writeErrorJSON(w, http.StatusUnauthorized, "Missing or malformed Bearer authorization token")
				return
			}

			classification, division, err := resolveDoc(r)
			if err != nil {
				writeErrorJSON(w, http.StatusNotFound, err.Error())
				return
			}

			rbacUser := ToRBACUser(claims)
			access := rbac.EvaluateAccess(rbacUser, classification, division, action)
			if !access.Allowed {
				writeErrorJSON(w, http.StatusForbidden, fmt.Sprintf("Forbidden: %s", access.Reason))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
