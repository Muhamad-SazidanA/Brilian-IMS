package rbac_test

import (
	"testing"

	"github.com/company/brilian-dms/internal/rbac"
)

func TestEvaluateAccess_Publik(t *testing.T) {
	levels := []string{"L1", "L2", "L3", "L4", "L5"}
	divisions := []string{"HR", "Finance", "Legal", "IT", "Marketing", "Operations"}

	for _, div := range divisions {
		for _, lvl := range levels {
			user := rbac.UserClaims{
				UserID:   "u1",
				Division: div,
				Level:    lvl,
				Role:     "viewer",
			}

			viewRes := rbac.EvaluateAccess(user, rbac.ClassificationPublik, "Legal", rbac.ActionView)
			if !viewRes.Allowed {
				t.Errorf("Publik view should be allowed for %s %s, got disallowed: %s", div, lvl, viewRes.Reason)
			}

			dlRes := rbac.EvaluateAccess(user, rbac.ClassificationPublik, "Legal", rbac.ActionDownload)
			if !dlRes.Allowed {
				t.Errorf("Publik download should be allowed for %s %s, got disallowed: %s", div, lvl, dlRes.Reason)
			}
		}
	}
}

func TestEvaluateAccess_Internal(t *testing.T) {
	// L1 from any division: view allowed, download denied
	l1User := rbac.UserClaims{
		UserID:   "u-l1",
		Division: "Finance",
		Level:    "L1",
		Role:     "viewer",
	}

	viewRes := rbac.EvaluateAccess(l1User, rbac.ClassificationInternal, "HR", rbac.ActionView)
	if !viewRes.Allowed {
		t.Errorf("Internal view should be allowed for L1, got: %s", viewRes.Reason)
	}

	dlRes := rbac.EvaluateAccess(l1User, rbac.ClassificationInternal, "HR", rbac.ActionDownload)
	if dlRes.Allowed {
		t.Errorf("Internal download should be denied for L1")
	}
	if dlRes.Reason != "Level L1 has view-only rights for Internal documents" {
		t.Errorf("Unexpected reason: %s", dlRes.Reason)
	}

	// L2-L5 from any division: view allowed, download allowed
	for _, lvl := range []string{"L2", "L3", "L4", "L5"} {
		user := rbac.UserClaims{
			UserID:   "u-lvl",
			Division: "Finance",
			Level:    lvl,
			Role:     "viewer",
		}
		if res := rbac.EvaluateAccess(user, rbac.ClassificationInternal, "HR", rbac.ActionView); !res.Allowed {
			t.Errorf("Internal view should be allowed for %s, got: %s", lvl, res.Reason)
		}
		if res := rbac.EvaluateAccess(user, rbac.ClassificationInternal, "HR", rbac.ActionDownload); !res.Allowed {
			t.Errorf("Internal download should be allowed for %s, got: %s", lvl, res.Reason)
		}
	}
}

func TestEvaluateAccess_Rahasia_SameDivision(t *testing.T) {
	// L1: both denied
	l1 := rbac.UserClaims{UserID: "u1", Division: "Legal", Level: "L1", Role: "viewer"}
	if res := rbac.EvaluateAccess(l1, rbac.ClassificationRahasia, "Legal", rbac.ActionView); res.Allowed {
		t.Errorf("Rahasia view should be denied for same-division L1")
	}
	if res := rbac.EvaluateAccess(l1, rbac.ClassificationRahasia, "Legal", rbac.ActionDownload); res.Allowed {
		t.Errorf("Rahasia download should be denied for same-division L1")
	}

	// L2: view allowed, download denied
	l2 := rbac.UserClaims{UserID: "u2", Division: "Legal", Level: "L2", Role: "viewer"}
	if res := rbac.EvaluateAccess(l2, rbac.ClassificationRahasia, "Legal", rbac.ActionView); !res.Allowed {
		t.Errorf("Rahasia view should be allowed for same-division L2")
	}
	if res := rbac.EvaluateAccess(l2, rbac.ClassificationRahasia, "Legal", rbac.ActionDownload); res.Allowed {
		t.Errorf("Rahasia download should be denied for same-division L2")
	}

	// L3-L5: view allowed, download allowed
	for _, lvl := range []string{"L3", "L4", "L5"} {
		user := rbac.UserClaims{UserID: "u-hi", Division: "Legal", Level: lvl, Role: "viewer"}
		if res := rbac.EvaluateAccess(user, rbac.ClassificationRahasia, "Legal", rbac.ActionView); !res.Allowed {
			t.Errorf("Rahasia view should be allowed for same-division %s", lvl)
		}
		if res := rbac.EvaluateAccess(user, rbac.ClassificationRahasia, "Legal", rbac.ActionDownload); !res.Allowed {
			t.Errorf("Rahasia download should be allowed for same-division %s", lvl)
		}
	}
}

func TestEvaluateAccess_Rahasia_CrossDivision(t *testing.T) {
	levels := []string{"L1", "L2", "L3", "L4", "L5"}
	for _, lvl := range levels {
		user := rbac.UserClaims{UserID: "u-cross", Division: "HR", Level: lvl, Role: "viewer"}
		viewRes := rbac.EvaluateAccess(user, rbac.ClassificationRahasia, "Finance", rbac.ActionView)
		if viewRes.Allowed {
			t.Errorf("Level %s cross-division view must be denied", lvl)
		}
		expectedReason := "Access denied: Rahasia document restricted to Finance division"
		if viewRes.Reason != expectedReason {
			t.Errorf("Expected reason %q, got %q", expectedReason, viewRes.Reason)
		}

		dlRes := rbac.EvaluateAccess(user, rbac.ClassificationRahasia, "Finance", rbac.ActionDownload)
		if dlRes.Allowed {
			t.Errorf("Level %s cross-division download must be denied", lvl)
		}
	}
}

func TestEvaluateAccess_SangatRahasia(t *testing.T) {
	// L1-L3 denied both
	for _, lvl := range []string{"L1", "L2", "L3"} {
		user := rbac.UserClaims{UserID: "u", Division: "Executive", Level: lvl, Role: "viewer"}
		if res := rbac.EvaluateAccess(user, rbac.ClassificationSangatRahasia, "Executive", rbac.ActionView); res.Allowed {
			t.Errorf("Sangat Rahasia view should be denied for %s", lvl)
		}
		if res := rbac.EvaluateAccess(user, rbac.ClassificationSangatRahasia, "Executive", rbac.ActionDownload); res.Allowed {
			t.Errorf("Sangat Rahasia download should be denied for %s", lvl)
		}
	}

	// L4: view allowed, download denied
	l4 := rbac.UserClaims{UserID: "u4", Division: "Executive", Level: "L4", Role: "viewer"}
	if res := rbac.EvaluateAccess(l4, rbac.ClassificationSangatRahasia, "Executive", rbac.ActionView); !res.Allowed {
		t.Errorf("Sangat Rahasia view should be allowed for L4")
	}
	if res := rbac.EvaluateAccess(l4, rbac.ClassificationSangatRahasia, "Executive", rbac.ActionDownload); res.Allowed {
		t.Errorf("Sangat Rahasia download should be denied for L4")
	}

	// L5: view allowed, download allowed
	l5 := rbac.UserClaims{UserID: "u5", Division: "Executive", Level: "L5", Role: "viewer"}
	if res := rbac.EvaluateAccess(l5, rbac.ClassificationSangatRahasia, "Executive", rbac.ActionView); !res.Allowed {
		t.Errorf("Sangat Rahasia view should be allowed for L5")
	}
	if res := rbac.EvaluateAccess(l5, rbac.ClassificationSangatRahasia, "Executive", rbac.ActionDownload); !res.Allowed {
		t.Errorf("Sangat Rahasia download should be allowed for L5")
	}

	// Cross-division denied for L4
	l4Cross := rbac.UserClaims{UserID: "u4c", Division: "Finance", Level: "L4", Role: "viewer"}
	if res := rbac.EvaluateAccess(l4Cross, rbac.ClassificationSangatRahasia, "Executive", rbac.ActionView); res.Allowed {
		t.Errorf("Sangat Rahasia view should be denied cross-division")
	}
}

func TestEvaluateAccess_ExecutiveOverride(t *testing.T) {
	// Admin role
	admin := rbac.UserClaims{UserID: "u-admin", Division: "Legal", Level: "L1", Role: "admin"}
	if res := rbac.EvaluateAccess(admin, rbac.ClassificationSangatRahasia, "Finance", rbac.ActionView); !res.Allowed {
		t.Errorf("Admin role should have universal view access")
	}
	if res := rbac.EvaluateAccess(admin, rbac.ClassificationSangatRahasia, "Finance", rbac.ActionDownload); !res.Allowed {
		t.Errorf("Admin role should have universal download access")
	}

	// Division ALL
	allDiv := rbac.UserClaims{UserID: "u-all", Division: "ALL", Level: "L1", Role: "viewer"}
	if res := rbac.EvaluateAccess(allDiv, rbac.ClassificationSangatRahasia, "Finance", rbac.ActionView); !res.Allowed {
		t.Errorf("Division ALL should have universal view access")
	}
	if res := rbac.EvaluateAccess(allDiv, rbac.ClassificationSangatRahasia, "Finance", rbac.ActionDownload); !res.Allowed {
		t.Errorf("Division ALL should have universal download access")
	}

	// Executive L5
	execL5 := rbac.UserClaims{UserID: "u-exec", Division: "Executive", Level: "L5", Role: "viewer"}
	if res := rbac.EvaluateAccess(execL5, rbac.ClassificationSangatRahasia, "Finance", rbac.ActionView); !res.Allowed {
		t.Errorf("Executive L5 should have universal view access")
	}
}

func TestEvaluateAccess_ValidationErrors(t *testing.T) {
	validUser := rbac.UserClaims{UserID: "u", Division: "Finance", Level: "L3", Role: "viewer"}

	// Unknown classification
	if res := rbac.EvaluateAccess(validUser, "TopSecret", "Finance", rbac.ActionView); res.Allowed {
		t.Errorf("Unknown classification should be denied")
	}

	// Invalid action
	if res := rbac.EvaluateAccess(validUser, rbac.ClassificationPublik, "Finance", "delete"); res.Allowed {
		t.Errorf("Invalid action verb should be denied")
	}

	// Invalid division
	badDivUser := rbac.UserClaims{UserID: "u", Division: "NonExistent", Level: "L3", Role: "viewer"}
	if res := rbac.EvaluateAccess(badDivUser, rbac.ClassificationInternal, "Finance", rbac.ActionView); res.Allowed {
		t.Errorf("Invalid division should be denied")
	}

	// Invalid level
	badLvlUser := rbac.UserClaims{UserID: "u", Division: "Finance", Level: "L99", Role: "viewer"}
	if res := rbac.EvaluateAccess(badLvlUser, rbac.ClassificationInternal, "Finance", rbac.ActionView); res.Allowed {
		t.Errorf("Invalid level should be denied")
	}
}

func TestEvaluatePermissions_Granular(t *testing.T) {
	l1Finance := rbac.UserClaims{UserID: "u1", Division: "Finance", Level: "L1", Role: "viewer"}
	perms := rbac.EvaluatePermissions(l1Finance, rbac.ClassificationInternal, "Finance")
	if !perms.CanView {
		t.Errorf("L1 should have can_view = true for Internal")
	}
	if perms.CanDownload {
		t.Errorf("L1 should have can_download = false for Internal")
	}
}
