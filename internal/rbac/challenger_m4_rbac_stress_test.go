package rbac_test

import (
	"fmt"
	"testing"

	"github.com/company/brilian-dms/internal/rbac"
)

// TestChallenger_RBAC_CombinatorialPermutations executes exhaustive permutations of the dual-axis
// RBAC evaluation matrix across all divisions, levels, roles, classifications, document divisions, and actions.
func TestChallenger_RBAC_CombinatorialPermutations(t *testing.T) {
	divisions := []string{
		rbac.DivisionFinance,
		rbac.DivisionHR,
		rbac.DivisionLegal,
		rbac.DivisionIT,
		rbac.DivisionMarketing,
		rbac.DivisionOperations,
		rbac.DivisionExecutive,
		rbac.DivisionALL,
		"Hacker",
		"",
		"hr",
		"finance",
		"null",
		"root",
	}

	levels := []string{
		rbac.LevelL1,
		rbac.LevelL2,
		rbac.LevelL3,
		rbac.LevelL4,
		rbac.LevelL5,
		"L0",
		"L6",
		"ADMIN",
		"",
		"l1",
		"L99",
	}

	roles := []string{
		"admin",
		"viewer",
		"uploader",
		"reviewer",
		"",
		"guest",
		"superadmin",
	}

	classifications := []string{
		rbac.ClassificationPublik,
		rbac.ClassificationInternal,
		rbac.ClassificationRahasia,
		rbac.ClassificationSangatRahasia,
		"TopSecret",
		"",
		"public",
		"secret",
	}

	docDivisions := []string{
		rbac.DivisionFinance,
		rbac.DivisionHR,
		rbac.DivisionLegal,
		rbac.DivisionIT,
		rbac.DivisionMarketing,
		rbac.DivisionOperations,
		rbac.DivisionExecutive,
		rbac.DivisionALL,
		"Other",
		"",
	}

	actions := []string{
		rbac.ActionView,
		rbac.ActionDownload,
		"delete",
		"",
		"edit",
		"VIEW",
		"DOWNLOAD",
	}

	totalCombinations := 0
	allowedCount := 0
	deniedCount := 0

	for _, div := range divisions {
		for _, lvl := range levels {
			for _, role := range roles {
				user := rbac.UserClaims{
					UserID:   "usr-fuzz",
					Username: "fuzz_user",
					Division: div,
					Level:    lvl,
					Role:     role,
				}

				for _, cls := range classifications {
					for _, docDiv := range docDivisions {
						for _, act := range actions {
							totalCombinations++
							res := rbac.EvaluateAccess(user, cls, docDiv, act)

							// 1. Invariant: Invalid classification must ALWAYS be denied
							if !rbac.IsValidClassification(cls) {
								if res.Allowed {
									t.Fatalf("Security bypass: allowed access for invalid classification %q (div=%s, lvl=%s, role=%s, act=%s)",
										cls, div, lvl, role, act)
								}
							}

							// 2. Invariant: Invalid action must ALWAYS be denied
							if act != rbac.ActionView && act != rbac.ActionDownload {
								if res.Allowed {
									t.Fatalf("Security bypass: allowed access for invalid action %q (cls=%s, div=%s, lvl=%s, role=%s)",
										act, cls, div, lvl, role)
								}
							}

							// 3. Invariant: Executive Override
							// Admin role, ALL division, or Executive L5 has universal access for valid classification & valid action
							isExecutiveOverride := role == "admin" || div == rbac.DivisionALL || (div == rbac.DivisionExecutive && lvl == rbac.LevelL5)
							if isExecutiveOverride && rbac.IsValidClassification(cls) && (act == rbac.ActionView || act == rbac.ActionDownload) {
								if !res.Allowed {
									t.Fatalf("False rejection: executive override failed for div=%s, lvl=%s, role=%s, cls=%s, act=%s: %s",
										div, lvl, role, cls, act, res.Reason)
								}
							}

							// 4. Invariant: For non-executive, invalid division or level must ALWAYS be denied
							if !isExecutiveOverride && rbac.IsValidClassification(cls) && (act == rbac.ActionView || act == rbac.ActionDownload) {
								if !rbac.IsValidDivision(div) || !rbac.IsValidLevel(lvl) {
									if res.Allowed {
										t.Fatalf("Security bypass: allowed invalid div/level (div=%q, lvl=%q) without executive override",
											div, lvl)
									}
								}
							}

							// 5. Invariant: Rahasia cross-division isolation
							if !isExecutiveOverride && cls == rbac.ClassificationRahasia && rbac.IsValidDivision(div) && rbac.IsValidLevel(lvl) {
								if div != docDiv && res.Allowed {
									t.Fatalf("Cross-division breach: Rahasia docDiv=%s accessed by userDiv=%s lvl=%s act=%s",
										docDiv, div, lvl, act)
								}
								if div == docDiv {
									// L1 must be denied
									if lvl == rbac.LevelL1 && res.Allowed {
										t.Fatalf("Level L1 granted access to Rahasia document in same division")
									}
									// L2 download must be denied
									if lvl == rbac.LevelL2 && act == rbac.ActionDownload && res.Allowed {
										t.Fatalf("Level L2 granted download access to Rahasia document")
									}
								}
							}

							// 6. Invariant: Sangat Rahasia cross-division isolation & level hierarchy
							if !isExecutiveOverride && cls == rbac.ClassificationSangatRahasia && rbac.IsValidDivision(div) && rbac.IsValidLevel(lvl) {
								if div != docDiv && res.Allowed {
									t.Fatalf("Cross-division breach: Sangat Rahasia docDiv=%s accessed by userDiv=%s lvl=%s act=%s",
										docDiv, div, lvl, act)
								}
								if div == docDiv {
									// L1, L2, L3 must be denied
									if (lvl == rbac.LevelL1 || lvl == rbac.LevelL2 || lvl == rbac.LevelL3) && res.Allowed {
										t.Fatalf("Level %s granted access to Sangat Rahasia document in same division", lvl)
									}
									// L4 download must be denied
									if lvl == rbac.LevelL4 && act == rbac.ActionDownload && res.Allowed {
										t.Fatalf("Level L4 granted download access to Sangat Rahasia document")
									}
								}
							}

							// 7. Invariant: Internal download restriction for L1
							if !isExecutiveOverride && cls == rbac.ClassificationInternal && rbac.IsValidDivision(div) && lvl == rbac.LevelL1 {
								if act == rbac.ActionDownload && res.Allowed {
									t.Fatalf("Security breach: L1 allowed to download Internal document")
								}
								if act == rbac.ActionView && !res.Allowed {
									t.Fatalf("False rejection: L1 denied view access to Internal document: %s", res.Reason)
								}
							}

							if res.Allowed {
								allowedCount++
							} else {
								deniedCount++
							}
						}
					}
				}
			}
		}
	}

	t.Logf("Exhaustive Combinatorial RBAC Stress Results: total=%d, allowed=%d, denied=%d",
		totalCombinations, allowedCount, deniedCount)
	if totalCombinations < 500000 {
		t.Fatalf("Expected at least 500,000 combinations tested, got %d", totalCombinations)
	}
}

// TestChallenger_RBAC_ParseLevelNumberEdgeCases tests boundary and malicious numeric inputs
func TestChallenger_RBAC_ParseLevelNumberEdgeCases(t *testing.T) {
	testCases := []struct {
		input    string
		expected int
	}{
		{"L1", 1},
		{"L2", 2},
		{"L3", 3},
		{"L4", 4},
		{"L5", 5},
		{"L0", 0},
		{"L-1", -1}, // strconv.Atoi("-1") succeeds and returns negative integer -1
		{"L", 0},
		{"", 0},
		{"ADMIN", 0},
		{"L100", 100},
		{"L99999999999999999999999999999999", 0}, // Overflow -> 0
		{"L\x001", 0},
	}

	for _, tc := range testCases {
		got := rbac.ParseLevelNumber(tc.input)
		if got != tc.expected {
			t.Errorf("ParseLevelNumber(%q) = %d; expected %d", tc.input, got, tc.expected)
		}
	}
}

// TestChallenger_RBAC_GranularPermissionsConsistency verifies that EvaluatePermissions exactly reflects
// separate view and download evaluations across all valid matrix cells.
func TestChallenger_RBAC_GranularPermissionsConsistency(t *testing.T) {
	for _, div := range rbac.ValidDivisions {
		for _, lvl := range rbac.ValidLevels {
			user := rbac.UserClaims{
				UserID:   "usr-perm",
				Division: div,
				Level:    lvl,
				Role:     "viewer",
			}

			for _, cls := range rbac.ValidClassifications {
				for _, docDiv := range rbac.ValidDivisions {
					perms := rbac.EvaluatePermissions(user, cls, docDiv)
					viewRes := rbac.EvaluateAccess(user, cls, docDiv, rbac.ActionView)
					dlRes := rbac.EvaluateAccess(user, cls, docDiv, rbac.ActionDownload)

					if perms.CanView != viewRes.Allowed {
						t.Errorf("Discrepancy in CanView: got %v, expected %v (userDiv=%s, lvl=%s, cls=%s, docDiv=%s)",
							perms.CanView, viewRes.Allowed, div, lvl, cls, docDiv)
					}
					if perms.CanDownload != dlRes.Allowed {
						t.Errorf("Discrepancy in CanDownload: got %v, expected %v (userDiv=%s, lvl=%s, cls=%s, docDiv=%s)",
							perms.CanDownload, dlRes.Allowed, div, lvl, cls, docDiv)
					}
				}
			}
		}
	}
}

// TestChallenger_RBAC_PolicyMatrix_ThreadSafety tests concurrent reads and updates on PolicyMatrix
func TestChallenger_RBAC_PolicyMatrix_ThreadSafety(t *testing.T) {
	matrix := rbac.DefaultPolicyMatrix()

	done := make(chan bool)
	for i := 0; i < 20; i++ {
		go func() {
			for j := 0; j < 100; j++ {
				rules := matrix.GetRules()
				if len(rules) == 0 {
					t.Errorf("Empty rules encountered during concurrent read")
				}
			}
			done <- true
		}()
	}

	for i := 0; i < 5; i++ {
		go func() {
			for j := 0; j < 50; j++ {
				matrix.UpdateRules([]rbac.PolicyRule{
					{Classification: rbac.ClassificationPublik, Description: fmt.Sprintf("Update %d", j)},
				})
			}
			done <- true
		}()
	}

	for i := 0; i < 25; i++ {
		<-done
	}
}
