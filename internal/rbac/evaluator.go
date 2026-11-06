package rbac

import (
	"fmt"
	"strconv"
	"strings"
)

// IsValidDivision checks if the division is valid
func IsValidDivision(division string) bool {
	for _, d := range ValidDivisions {
		if d == division {
			return true
		}
	}
	return false
}

// IsValidLevel checks if the level is in L1-L5
func IsValidLevel(level string) bool {
	for _, l := range ValidLevels {
		if l == level {
			return true
		}
	}
	return false
}

// IsValidClassification checks if document classification is supported
func IsValidClassification(classification string) bool {
	for _, c := range ValidClassifications {
		if c == classification {
			return true
		}
	}
	return false
}

// ParseLevelNumber extracts numeric level from "L1"-"L5"
func ParseLevelNumber(level string) int {
	trimmed := strings.TrimPrefix(level, "L")
	num, err := strconv.Atoi(trimmed)
	if err != nil {
		return 0
	}
	return num
}

// EvaluateAccess evaluates permission for a given user against a document classification and origin division.
// Logic matches rbac_oracle.js faithfully.
func EvaluateAccess(claims UserClaims, docClassification, docDivision, action string) AccessResult {
	if claims.Division == "" && claims.Role == "" {
		return AccessResult{Allowed: false, Reason: "Invalid or missing user claims"}
	}

	if !IsValidClassification(docClassification) {
		return AccessResult{
			Allowed: false,
			Reason:  fmt.Sprintf("Unknown document classification: %s", docClassification),
		}
	}

	if action != ActionView && action != ActionDownload {
		return AccessResult{
			Allowed: false,
			Reason:  fmt.Sprintf("Invalid action verb: %s", action),
		}
	}

	// Executive override: Admin role or Executive/ALL L5 has universal access
	if claims.Role == "admin" || claims.Division == DivisionALL || (claims.Division == DivisionExecutive && claims.Level == LevelL5) {
		return AccessResult{Allowed: true}
	}

	if !IsValidDivision(claims.Division) {
		return AccessResult{
			Allowed: false,
			Reason:  fmt.Sprintf("Invalid user division: %s", claims.Division),
		}
	}

	if !IsValidLevel(claims.Level) {
		return AccessResult{
			Allowed: false,
			Reason:  fmt.Sprintf("Invalid user level: %s", claims.Level),
		}
	}

	levelNum := ParseLevelNumber(claims.Level)
	isSameDivision := claims.Division == docDivision

	// 1. Publik: Open to any division, L1-L5 for both view and download
	if docClassification == ClassificationPublik {
		return AccessResult{Allowed: true}
	}

	// 2. Internal: Any division
	// L1: View allowed, Download denied
	// L2-L5: View allowed, Download allowed
	if docClassification == ClassificationInternal {
		if action == ActionView {
			return AccessResult{Allowed: true}
		}
		if action == ActionDownload {
			if levelNum >= 2 {
				return AccessResult{Allowed: true}
			}
			return AccessResult{
				Allowed: false,
				Reason:  "Level L1 has view-only rights for Internal documents",
			}
		}
	}

	// 3. Rahasia: Restricted to origin division
	if docClassification == ClassificationRahasia {
		if !isSameDivision {
			return AccessResult{
				Allowed: false,
				Reason:  fmt.Sprintf("Access denied: Rahasia document restricted to %s division", docDivision),
			}
		}
		if levelNum < 2 {
			return AccessResult{
				Allowed: false,
				Reason:  "Level L1 has no access to Rahasia documents",
			}
		}
		if action == ActionView {
			return AccessResult{Allowed: true}
		}
		if action == ActionDownload {
			if levelNum >= 3 {
				return AccessResult{Allowed: true}
			}
			return AccessResult{
				Allowed: false,
				Reason:  "Level L2 has view-only rights for Rahasia documents",
			}
		}
	}

	// 4. Sangat Rahasia: Strictly confidential
	if docClassification == ClassificationSangatRahasia {
		if !isSameDivision {
			return AccessResult{
				Allowed: false,
				Reason:  fmt.Sprintf("Access denied: Sangat Rahasia document restricted to %s division", docDivision),
			}
		}
		if levelNum < 4 {
			return AccessResult{
				Allowed: false,
				Reason:  "Levels L1-L3 have no access to Sangat Rahasia documents",
			}
		}
		if action == ActionView {
			return AccessResult{Allowed: true}
		}
		if action == ActionDownload {
			if levelNum >= 5 {
				return AccessResult{Allowed: true}
			}
			return AccessResult{
				Allowed: false,
				Reason:  "Level L4 has view-only rights for Sangat Rahasia documents",
			}
		}
	}

	return AccessResult{
		Allowed: false,
		Reason:  "Access denied by security matrix policy",
	}
}

// EvaluatePermissions evaluates both view and download permissions for a document.
func EvaluatePermissions(claims UserClaims, docClassification, docDivision string) GranularPermission {
	viewRes := EvaluateAccess(claims, docClassification, docDivision, ActionView)
	downloadRes := EvaluateAccess(claims, docClassification, docDivision, ActionDownload)

	reason := ""
	if !viewRes.Allowed {
		reason = viewRes.Reason
	} else if !downloadRes.Allowed {
		reason = downloadRes.Reason
	}

	return GranularPermission{
		Allowed:     viewRes.Allowed,
		CanView:     viewRes.Allowed,
		CanDownload: downloadRes.Allowed,
		Reason:      reason,
	}
}
