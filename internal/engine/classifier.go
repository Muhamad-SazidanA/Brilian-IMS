package engine

import (
	"math"
	"strings"
)

// ClassificationResult represents the deterministic document type determination.
type ClassificationResult struct {
	DocType         string   `json:"doc_type"`
	Confidence      float64  `json:"confidence"`
	MatchedKeywords []string `json:"matched_keywords"`
}

// CategoryMapping maps internal categories to both Indonesian and English canonical terms.
type CategoryRule struct {
	Name            string
	EnglishName     string
	Keywords        []string
	WeightModifiers map[string]int
}

var ClassificationDictionary = []CategoryRule{
	{
		Name:        "Surat Perjanjian",
		EnglishName: "Contract",
		Keywords: []string{
			"SURAT PERJANJIAN", "PERJANJIAN KERJASAMA", "MEMORANDUM OF UNDERSTANDING",
			"PIHAK PERTAMA", "PIHAK KEDUA", "PASAL", "KLAUSUL", "KONTRAK", "AGREEMENT", "PKS",
		},
	},
	{
		Name:        "Invoice / Tagihan",
		EnglishName: "Invoice",
		Keywords: []string{
			"INVOICE", "FAKTUR PENJUALAN", "TAGIHAN", "TOTAL PEMBAYARAN",
			"JATUH TEMPO", "DUE DATE", "REKENING", "FAKTUR PAJAK", "KWITANSI", "BILLING",
		},
	},
	{
		Name:        "Surat Keputusan",
		EnglishName: "Legal Memo",
		Keywords: []string{
			"SURAT KEPUTUSAN", "MEMUTUSKAN", "MENIMBANG", "MENGINGAT", "MENETAPKAN",
			"LEGAL MEMO", "SURAT EDARAN", "DECREE", "KEPUTUSAN DIREKSI",
		},
	},
	{
		Name:        "SOP / Pedoman",
		EnglishName: "Technical Report",
		Keywords: []string{
			"STANDAR OPERASIONAL PROSEDUR", "STANDARD OPERATING PROCEDURE", "SOP",
			"PROSEDUR KERJA", "RUANG LINGKUP", "TECHNICAL REPORT", "PETUNJUK TEKNIS", "PEDOMAN",
		},
	},
	{
		Name:        "Laporan Keuangan",
		EnglishName: "Financial Statement",
		Keywords: []string{
			"LAPORAN KEUANGAN", "NERACA", "LABA RUGI", "ARUS KAS",
			"BALANCE SHEET", "ASSET", "FINANCIAL STATEMENT", "CASH FLOW", "LAPORAN TAHUNAN",
		},
	},
	{
		Name:        "Formulir HR",
		EnglishName: "HR Document",
		Keywords: []string{
			"FORMULIR PENGAJUAN", "CUTI TAHUNAN", "SLIP GAJI", "PAYSLIP",
			"KARYAWAN", "HUMAN RESOURCES", "PENILAIAN KINERJA", "SURAT PERINGATAN", "FORMULIR HR",
		},
	},
}

// ClassifyDocument categorizes documents deterministically based on keyword frequency,
// structural indicators, and filename pattern matching without calling an LLM.
func ClassifyDocument(text string, filename string) ClassificationResult {
	combined := strings.ToUpper(filename + " " + text)

	bestType := "Dokumen Umum"
	highestScore := 0
	var bestMatchedKeywords []string

	for _, rule := range ClassificationDictionary {
		score := 0
		var matched []string

		for _, kw := range rule.Keywords {
			if strings.Contains(combined, kw) {
				score++
				matched = append(matched, kw)
			}
		}

		if score > highestScore {
			highestScore = score
			bestType = rule.Name
			bestMatchedKeywords = matched
		}
	}

	confidence := 0.20
	if highestScore > 0 {
		c := 0.50 + float64(highestScore)*0.15
		if c > 1.0 {
			c = 1.0
		}
		confidence = math.Round(c*100) / 100
	}

	if bestMatchedKeywords == nil {
		bestMatchedKeywords = make([]string, 0)
	}

	return ClassificationResult{
		DocType:         bestType,
		Confidence:      confidence,
		MatchedKeywords: bestMatchedKeywords,
	}
}
