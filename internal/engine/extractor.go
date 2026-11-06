package engine

import (
	"regexp"
	"strings"
)

// ExtractedData holds structured metadata extracted deterministically from document text.
type ExtractedData struct {
	Dates       []string `json:"dates"`
	Currencies  []string `json:"currencies"`
	Percentages []string `json:"percentages"`
	Identifiers []string `json:"identifiers"`
}

var (
	// Date patterns
	// Indonesian numeric: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
	dateNumericRegex = regexp.MustCompile(`\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b`)
	// Indonesian & English textual dates: e.g. "17 Agustus 1945", "24 August 2026"
	dateTextualRegex = regexp.MustCompile(`(?i)\b(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember|January|February|March|May|June|July|August|October|December)\s+(\d{4})\b`)
	// ISO 8601: YYYY-MM-DD or YYYY/MM/DD
	dateISORegex = regexp.MustCompile(`\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b`)

	// Currency patterns
	// IDR: Rp 2.500.000 or IDR 10.000.000 or Rp. 1.500.000,00
	currencyIDRRegex = regexp.MustCompile(`(?i)\b(?:Rp\.?|IDR)\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\b`)
	// USD: $120,000.00 or USD 500,000
	currencyUSDRegex = regexp.MustCompile(`(?i)\b(?:\$|USD)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\b`)
	// EUR: €500.000 or EUR 1.000,00
	currencyEURRegex = regexp.MustCompile(`(?i)\b(?:€|EUR)\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\b`)

	// Percentage pattern: 1.5% or 10% or 2,5 %
	percentageRegex = regexp.MustCompile(`\b(\d+(?:[.,]\d+)?)\s*%`)

	// Identifier patterns
	// Common prefixed identifiers: No. 123/SPK/2026, Nomor: SPK/2026/LEG-089, INV-001, SK/DIR/2026
	identifierPrefixedRegex = regexp.MustCompile(`(?i)\b(?:Nomor(?:\s+Kontrak)?|No\.|No[\:\/]|INV|SPK|SK)[\s\:\/]*([A-Za-z0-9\-\.\/]+)\b`)
	// Indonesian NPWP (15-16 digits with standard punctuation: 01.234.567.8-901.000)
	npwpRegex = regexp.MustCompile(`\b\d{2}\.\d{3}\.\d{3}\.\d{1}-\d{3}\.\d{3}\b`)
	// Indonesian NIK (16-digit identity number)
	nikRegex = regexp.MustCompile(`(?i)\b(?:NIK|KTP)[\s\:\/]*(\d{16})\b`)
	// Standard UUIDv4
	uuidRegex = regexp.MustCompile(`\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b`)
	// Direct invoice or contract token patterns (e.g., SPK/2026/VND-992, INV-2026-992)
	contractTokenRegex = regexp.MustCompile(`\b(?:SPK|INV|PO|CONTRACT)\/[0-9A-Za-z\-_]+\/[0-9A-Za-z\-_]+\b`)
)

// ExtractMetadata deterministically extracts dates, currencies, percentages, and identifiers
// from unstructured document text without invoking any LLMs.
func ExtractMetadata(text string) ExtractedData {
	result := ExtractedData{
		Dates:       make([]string, 0),
		Currencies:  make([]string, 0),
		Percentages: make([]string, 0),
		Identifiers: make([]string, 0),
	}

	if strings.TrimSpace(text) == "" {
		return result
	}

	// 1. Extract Dates
	dateSet := make(map[string]struct{})
	for _, re := range []*regexp.Regexp{dateNumericRegex, dateTextualRegex, dateISORegex} {
		matches := re.FindAllString(text, -1)
		for _, m := range matches {
			trimmed := strings.TrimSpace(m)
			if _, exists := dateSet[trimmed]; !exists && trimmed != "" {
				dateSet[trimmed] = struct{}{}
				result.Dates = append(result.Dates, trimmed)
			}
		}
	}

	// 2. Extract Currencies
	currSet := make(map[string]struct{})
	for _, re := range []*regexp.Regexp{currencyIDRRegex, currencyUSDRegex, currencyEURRegex} {
		matches := re.FindAllString(text, -1)
		for _, m := range matches {
			trimmed := strings.TrimSpace(m)
			if _, exists := currSet[trimmed]; !exists && trimmed != "" {
				currSet[trimmed] = struct{}{}
				result.Currencies = append(result.Currencies, trimmed)
			}
		}
	}

	// 3. Extract Percentages
	pctSet := make(map[string]struct{})
	pctMatches := percentageRegex.FindAllString(text, -1)
	for _, m := range pctMatches {
		trimmed := strings.TrimSpace(m)
		if _, exists := pctSet[trimmed]; !exists && trimmed != "" {
			pctSet[trimmed] = struct{}{}
			result.Percentages = append(result.Percentages, trimmed)
		}
	}

	// 4. Extract Identifiers
	idSet := make(map[string]struct{})
	negationWords := map[string]bool{
		"problem": true, "doubt": true, "reason": true, "way": true,
		"thanks": true, "matter": true, "worries": true, "issue": true,
	}

	// Prefixed identifiers
	prefixedMatches := identifierPrefixedRegex.FindAllString(text, -1)
	for _, m := range prefixedMatches {
		trimmed := strings.TrimSpace(m)
		lower := strings.ToLower(trimmed)
		hasNegation := false
		for neg := range negationWords {
			if strings.Contains(lower, neg) {
				hasNegation = true
				break
			}
		}
		if hasNegation {
			continue
		}
		if !strings.ContainsAny(trimmed, "0123456789/-") {
			continue
		}
		if _, exists := idSet[trimmed]; !exists && trimmed != "" {
			idSet[trimmed] = struct{}{}
			result.Identifiers = append(result.Identifiers, trimmed)
		}
	}

	// Direct contract tokens
	contractMatches := contractTokenRegex.FindAllString(text, -1)
	for _, m := range contractMatches {
		trimmed := strings.TrimSpace(m)
		if _, exists := idSet[trimmed]; !exists && trimmed != "" {
			idSet[trimmed] = struct{}{}
			result.Identifiers = append(result.Identifiers, trimmed)
		}
	}

	// NPWP
	npwpMatches := npwpRegex.FindAllString(text, -1)
	for _, m := range npwpMatches {
		trimmed := strings.TrimSpace(m)
		if _, exists := idSet[trimmed]; !exists && trimmed != "" {
			idSet[trimmed] = struct{}{}
			result.Identifiers = append(result.Identifiers, trimmed)
		}
	}

	// NIK
	nikMatches := nikRegex.FindAllString(text, -1)
	for _, m := range nikMatches {
		trimmed := strings.TrimSpace(m)
		if _, exists := idSet[trimmed]; !exists && trimmed != "" {
			idSet[trimmed] = struct{}{}
			result.Identifiers = append(result.Identifiers, trimmed)
		}
	}

	// UUID
	uuidMatches := uuidRegex.FindAllString(text, -1)
	for _, m := range uuidMatches {
		trimmed := strings.TrimSpace(m)
		if _, exists := idSet[trimmed]; !exists && trimmed != "" {
			idSet[trimmed] = struct{}{}
			result.Identifiers = append(result.Identifiers, trimmed)
		}
	}

	return result
}
