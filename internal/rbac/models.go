package rbac

// Division constants supported across the organization
const (
	DivisionFinance    = "Finance"
	DivisionHR         = "HR"
	DivisionLegal      = "Legal"
	DivisionIT         = "IT"
	DivisionMarketing  = "Marketing"
	DivisionOperations = "Operations"
	DivisionExecutive  = "Executive"
	DivisionALL        = "ALL"
)

// ValidDivisions list for validation
var ValidDivisions = []string{
	DivisionFinance,
	DivisionHR,
	DivisionLegal,
	DivisionIT,
	DivisionMarketing,
	DivisionOperations,
	DivisionExecutive,
	DivisionALL,
}

// Level constants representing seniority hierarchy
const (
	LevelL1 = "L1" // Staff
	LevelL2 = "L2" // Senior Staff
	LevelL3 = "L3" // Lead / Supervisor
	LevelL4 = "L4" // Manager
	LevelL5 = "L5" // Director / Executive
)

// ValidLevels list for validation
var ValidLevels = []string{
	LevelL1,
	LevelL2,
	LevelL3,
	LevelL4,
	LevelL5,
}

// Document Classification constants
const (
	ClassificationPublik        = "Publik"
	ClassificationInternal      = "Internal"
	ClassificationRahasia       = "Rahasia"
	ClassificationSangatRahasia = "Sangat Rahasia"
)

// ValidClassifications list for validation
var ValidClassifications = []string{
	ClassificationPublik,
	ClassificationInternal,
	ClassificationRahasia,
	ClassificationSangatRahasia,
}

// Action verbs
const (
	ActionView     = "view"
	ActionDownload = "download"
)

// ValidActions list for validation
var ValidActions = []string{
	ActionView,
	ActionDownload,
}

// UserClaims holds identity and dual-axis RBAC claims
type UserClaims struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Name     string `json:"name"`
	Division string `json:"division"`
	Level    string `json:"level"`
	Role     string `json:"role"`
}

// AccessResult represents the outcome of an access evaluation
type AccessResult struct {
	Allowed bool   `json:"allowed"`
	Reason  string `json:"reason,omitempty"`
}

// GranularPermission provides detailed view and download authorization
type GranularPermission struct {
	Allowed     bool   `json:"allowed"`
	CanView     bool   `json:"can_view"`
	CanDownload bool   `json:"can_download"`
	Reason      string `json:"reason,omitempty"`
}

// PolicyRule describes a cell in the RBAC matrix for administrative inspection
type PolicyRule struct {
	Classification string `json:"classification"`
	DivisionRule   string `json:"division_rule"`
	LevelRule      string `json:"level_rule"`
	CanView        string `json:"can_view"`
	CanDownload    string `json:"can_download"`
	Description    string `json:"description"`
}
