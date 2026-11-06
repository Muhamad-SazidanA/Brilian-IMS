package rbac

import "sync"

// PolicyMatrix represents the dual-axis security matrix rules
type PolicyMatrix struct {
	mu    sync.RWMutex
	Rules []PolicyRule `json:"rules"`
}

// DefaultPolicyMatrix returns the canonical dual-axis policy matrix rules
func DefaultPolicyMatrix() *PolicyMatrix {
	return &PolicyMatrix{
		Rules: []PolicyRule{
			{
				Classification: ClassificationPublik,
				DivisionRule:   "Semua Divisi (Finance, HR, Legal, IT, Marketing, Operations, Executive, ALL)",
				LevelRule:      "L1 - L5",
				CanView:        "L1, L2, L3, L4, L5",
				CanDownload:    "L1, L2, L3, L4, L5",
				Description:    "Dokumen terbuka untuk umum internal seluruh organisasi.",
			},
			{
				Classification: ClassificationInternal,
				DivisionRule:   "Semua Divisi",
				LevelRule:      "L1: View Only, L2 - L5: View & Download",
				CanView:        "L1, L2, L3, L4, L5",
				CanDownload:    "L2, L3, L4, L5",
				Description:    "Dokumen operasional internal organisasi. Staf pemula (L1) hanya diizinkan melihat tanpa hak unduh berkas.",
			},
			{
				Classification: ClassificationRahasia,
				DivisionRule:   "Khusus Divisi Asal Dokumen (Cross-division diblokir)",
				LevelRule:      "L1: Ditolak, L2: View Only, L3 - L5: View & Download",
				CanView:        "L2, L3, L4, L5 (Divisi Asal)",
				CanDownload:    "L3, L4, L5 (Divisi Asal)",
				Description:    "Dokumen rahasia divisi. Akses lintas divisi ditolak total. Dalam divisi asal, L1 tidak memiliki akses dan L2 hanya pratinjau.",
			},
			{
				Classification: ClassificationSangatRahasia,
				DivisionRule:   "Khusus Divisi Asal Dokumen (Cross-division diblokir)",
				LevelRule:      "L1 - L3: Ditolak, L4: View Only, L5: View & Download",
				CanView:        "L4, L5 (Divisi Asal)",
				CanDownload:    "L5 (Divisi Asal)",
				Description:    "Dokumen sangat rahasia tingkat tinggi. Hanya pimpinan (L4 Manajer dan L5 Direktur) divisi asal yang diizinkan mengakses.",
			},
			{
				Classification: "Executive Override",
				DivisionRule:   "Admin Role / ALL Division / Executive Level L5",
				LevelRule:      "L5 / Admin",
				CanView:        "Universal Access",
				CanDownload:    "Universal Access",
				Description:    "Hak akses universal tanpa batas divisi atau klasifikasi dokumen.",
			},
		},
	}
}

// GetRules returns a copy of current policy rules
func (m *PolicyMatrix) GetRules() []PolicyRule {
	m.mu.RLock()
	defer m.mu.RUnlock()
	res := make([]PolicyRule, len(m.Rules))
	copy(res, m.Rules)
	return res
}

// UpdateRules replaces the policy rules
func (m *PolicyMatrix) UpdateRules(rules []PolicyRule) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Rules = rules
}
