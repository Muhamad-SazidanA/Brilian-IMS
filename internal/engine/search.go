package engine

import (
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"sync"
	"unicode"
)

// SearchFilter represents query constraints for full-text search.
type SearchFilter struct {
	FolderID       string `json:"folder_id,omitempty"`
	Division       string `json:"division,omitempty"`
	Classification string `json:"classification,omitempty"`
	DocType        string `json:"doc_type,omitempty"`
}

// SearchResult represents a scored document matching the search query.
type SearchResult struct {
	DocID   string   `json:"doc_id"`
	Title   string   `json:"title"`
	Snippet string   `json:"snippet"`
	Score   float64  `json:"score"`
	Matches []string `json:"matches"`
}

// DocumentIndexItem represents a document indexed in the search engine.
type DocumentIndexItem struct {
	DocID          string   `json:"doc_id"`
	Title          string   `json:"title"`
	Content        string   `json:"content"`
	FolderID       string   `json:"folder_id"`
	Division       string   `json:"division"`
	Classification string   `json:"classification"`
	DocType        string   `json:"doc_type"`
	Metadata       []string `json:"metadata,omitempty"`
}

// Posting represents term frequency and positions within a document.
type Posting struct {
	DocID       string
	Frequency   int
	TitleHits   int
	ContentHits int
	MetaHits    int
}

// SearchEngine is an in-memory thread-safe full-text search engine with inverted indexing,
// relevance scoring, and highlighted snippet extraction.
type SearchEngine struct {
	mu        sync.RWMutex
	docs      map[string]DocumentIndexItem
	index     map[string]map[string]*Posting // token -> docID -> Posting
	docCount  int
	docTokens map[string]int // docID -> totalTokens
}

var (
	defaultEngine     *SearchEngine
	defaultEngineOnce sync.Once
	wordCharRegex     = regexp.MustCompile(`[\p{L}\p{N}]+`)
)

// GetDefaultEngine returns the package-level shared search engine singleton.
func GetDefaultEngine() *SearchEngine {
	defaultEngineOnce.Do(func() {
		defaultEngine = NewSearchEngine()
		// Seed default engine with sample repository documents for instant search availability
		defaultEngine.seedDefaultDocuments()
	})
	return defaultEngine
}

// NewSearchEngine initializes a new SearchEngine.
func NewSearchEngine() *SearchEngine {
	return &SearchEngine{
		docs:      make(map[string]DocumentIndexItem),
		index:     make(map[string]map[string]*Posting),
		docTokens: make(map[string]int),
	}
}

// Tokenize converts text into a slice of normalized lowercase tokens.
func Tokenize(text string) []string {
	if text == "" {
		return nil
	}
	matches := wordCharRegex.FindAllString(text, -1)
	tokens := make([]string, 0, len(matches))
	for _, m := range matches {
		t := strings.ToLower(strings.TrimSpace(m))
		if len(t) >= 2 {
			tokens = append(tokens, t)
		}
	}
	return tokens
}

// IndexDocument indexes a document into the inverted index.
func (se *SearchEngine) IndexDocument(item DocumentIndexItem) {
	se.mu.Lock()
	defer se.mu.Unlock()

	// If already exists, remove prior postings first
	if _, exists := se.docs[item.DocID]; exists {
		se.removeDocumentPostings(item.DocID)
	}

	se.docs[item.DocID] = item
	se.docCount++

	titleTokens := Tokenize(item.Title)
	contentTokens := Tokenize(item.Content)
	metaTokens := make([]string, 0)
	for _, m := range item.Metadata {
		metaTokens = append(metaTokens, Tokenize(m)...)
	}
	if item.DocType != "" {
		metaTokens = append(metaTokens, Tokenize(item.DocType)...)
	}
	if item.Classification != "" {
		metaTokens = append(metaTokens, Tokenize(item.Classification)...)
	}

	totalTokens := len(titleTokens) + len(contentTokens) + len(metaTokens)
	se.docTokens[item.DocID] = totalTokens

	// Aggregate postings
	postings := make(map[string]*Posting)

	for _, t := range titleTokens {
		p, ok := postings[t]
		if !ok {
			p = &Posting{DocID: item.DocID}
			postings[t] = p
		}
		p.TitleHits++
		p.Frequency++
	}

	for _, t := range contentTokens {
		p, ok := postings[t]
		if !ok {
			p = &Posting{DocID: item.DocID}
			postings[t] = p
		}
		p.ContentHits++
		p.Frequency++
	}

	for _, t := range metaTokens {
		p, ok := postings[t]
		if !ok {
			p = &Posting{DocID: item.DocID}
			postings[t] = p
		}
		p.MetaHits++
		p.Frequency++
	}

	for token, p := range postings {
		if _, ok := se.index[token]; !ok {
			se.index[token] = make(map[string]*Posting)
		}
		se.index[token][item.DocID] = p
	}
}

func (se *SearchEngine) removeDocumentPostings(docID string) {
	if _, exists := se.docs[docID]; !exists {
		return
	}
	delete(se.docs, docID)
	delete(se.docTokens, docID)
	if se.docCount > 0 {
		se.docCount--
	}
	for token, docMap := range se.index {
		delete(docMap, docID)
		if len(docMap) == 0 {
			delete(se.index, token)
		}
	}
}

// RemoveDocument deletes a document from the search index.
func (se *SearchEngine) RemoveDocument(docID string) {
	se.mu.Lock()
	defer se.mu.Unlock()
	se.removeDocumentPostings(docID)
}

// GetDocument retrieves a document by ID from the index.
func (se *SearchEngine) GetDocument(docID string) (DocumentIndexItem, bool) {
	se.mu.RLock()
	defer se.mu.RUnlock()
	doc, exists := se.docs[docID]
	return doc, exists
}

// SearchDocuments searches the default index with the provided query and filter.
func SearchDocuments(query string, filter SearchFilter) []SearchResult {
	return GetDefaultEngine().Search(query, filter)
}

// Search executes a full-text search against the index with BM25-like scoring,
// applies metadata filters, and generates highlighted snippets.
func (se *SearchEngine) Search(query string, filter SearchFilter) []SearchResult {
	se.mu.RLock()
	defer se.mu.RUnlock()

	queryTokens := Tokenize(query)
	if len(queryTokens) == 0 {
		return []SearchResult{}
	}

	docScores := make(map[string]float64)
	docMatches := make(map[string]map[string]struct{})

	// Score candidates
	for _, qToken := range queryTokens {
		postingsMap, exists := se.index[qToken]
		if !exists {
			// Substring search fallback on indexed tokens
			for indexedToken, pMap := range se.index {
				if strings.Contains(indexedToken, qToken) || strings.Contains(qToken, indexedToken) {
					for docID, posting := range pMap {
						docScores[docID] += float64(posting.Frequency) * 0.5
						if docMatches[docID] == nil {
							docMatches[docID] = make(map[string]struct{})
						}
						docMatches[docID][indexedToken] = struct{}{}
					}
				}
			}
			continue
		}

		// Calculate IDF: log((N - n + 0.5) / (n + 0.5) + 1)
		n := float64(len(postingsMap))
		totalDocs := float64(se.docCount)
		if totalDocs < n {
			totalDocs = n
		}
		arg := 1.0 + (totalDocs-n+0.5)/(n+0.5)
		if arg <= 0.0 || math.IsNaN(arg) {
			arg = 1.0
		}
		idf := math.Log(arg)
		if idf < 0.1 || math.IsNaN(idf) || math.IsInf(idf, 0) {
			idf = 0.1
		}

		for docID, posting := range postingsMap {
			// Title matches get high boost (3.5x), Content (1.0x), Meta (1.5x)
			weightedFreq := float64(posting.TitleHits)*3.5 + float64(posting.ContentHits)*1.0 + float64(posting.MetaHits)*1.5
			score := idf * weightedFreq
			docScores[docID] += score

			if docMatches[docID] == nil {
				docMatches[docID] = make(map[string]struct{})
			}
			docMatches[docID][qToken] = struct{}{}
		}
	}

	results := make([]SearchResult, 0, len(docScores))

	for docID, score := range docScores {
		doc, exists := se.docs[docID]
		if !exists {
			continue
		}

		// Apply Filters
		if filter.FolderID != "" && doc.FolderID != filter.FolderID {
			continue
		}
		if filter.Division != "" && !strings.EqualFold(doc.Division, filter.Division) && !strings.EqualFold(filter.Division, "ALL") {
			continue
		}
		if filter.Classification != "" && !strings.EqualFold(doc.Classification, filter.Classification) {
			continue
		}
		if filter.DocType != "" && !strings.EqualFold(doc.DocType, filter.DocType) {
			continue
		}

		// Collect unique matched terms
		var matchedTerms []string
		for term := range docMatches[docID] {
			matchedTerms = append(matchedTerms, term)
		}
		sort.Strings(matchedTerms)

		// Snippet generation with keyword highlighting (<mark>...</mark>)
		snippet := generateSnippet(doc.Content, doc.Title, matchedTerms)

		// Round score to 2 decimal places
		roundedScore := math.Round(score*100) / 100

		results = append(results, SearchResult{
			DocID:   docID,
			Title:   doc.Title,
			Snippet: snippet,
			Score:   roundedScore,
			Matches: matchedTerms,
		})
	}

	// Sort results descending by score
	sort.Slice(results, func(i, j int) bool {
		if results[i].Score == results[j].Score {
			return results[i].Title < results[j].Title
		}
		return results[i].Score > results[j].Score
	})

	return results
}

// generateSnippet finds the best excerpt containing matching tokens and highlights them.
func generateSnippet(content string, fallbackTitle string, matchedTerms []string) string {
	combined := content
	if fallbackTitle != "" {
		if content != "" {
			combined = fallbackTitle + " — " + content
		} else {
			combined = fallbackTitle
		}
	}
	if combined == "" {
		return "Dokumen tidak memiliki pratinjau teks."
	}

	lowerText := strings.ToLower(combined)

	// Find position of the first matching term
	bestPos := -1
	for _, term := range matchedTerms {
		pos := strings.Index(lowerText, strings.ToLower(term))
		if pos != -1 {
			if bestPos == -1 || pos < bestPos {
				bestPos = pos
			}
		}
	}

	var rawSnippet string
	if bestPos == -1 {
		// No match found, take first 160 characters
		if len(combined) <= 160 {
			rawSnippet = combined
		} else {
			rawSnippet = combined[:160] + "..."
		}
	} else {
		// Take a window of 160 characters around bestPos
		start := bestPos - 30
		if start < 0 {
			start = 0
		}
		// Align start to whitespace
		for start > 0 && !unicode.IsSpace(rune(combined[start])) {
			start--
		}

		end := start + 160
		if end > len(combined) {
			end = len(combined)
		}
		// Align end to whitespace
		for end < len(combined) && !unicode.IsSpace(rune(combined[end])) {
			end++
		}

		rawSnippet = strings.TrimSpace(combined[start:end])
		if start > 0 {
			rawSnippet = "..." + rawSnippet
		}
		if end < len(combined) {
			rawSnippet = rawSnippet + "..."
		}
	}

	// Highlight matched terms using <mark>
	highlighted := rawSnippet
	for _, term := range matchedTerms {
		if len(term) < 2 {
			continue
		}
		pattern := fmt.Sprintf(`(?i)\b(?:%s)\b`, regexp.QuoteMeta(term))
		re, err := regexp.Compile(pattern)
		if err == nil {
			highlighted = re.ReplaceAllString(highlighted, "<mark>"+strings.ToLower(term)+"</mark>")
		}
	}

	return highlighted
}


// seedDefaultDocuments populates default initial documents from PROJECT seed data.
func (se *SearchEngine) seedDefaultDocuments() {
	se.IndexDocument(DocumentIndexItem{
		DocID:          "doc-kontrak-2025",
		Title:          "Kontrak Kerja Sama Pengadaan IT 2025 (v1.0).pdf",
		Content:        "PASAL 1: KETENTUAN UMUM Perjanjian ini mengatur kerja sama pengadaan infrastruktur server on-premise. PASAL 2: TATA CARA PEMBAYARAN Tanggal jatuh tempo pembayaran adalah 30 hari setelah invoice diterbitkan secara sah. PASAL 3: DENDA DAN GANTI RUGI Nilai denda keterlambatan ditetapkan sebesar 1% untuk setiap minggu keterlambatan. Nomor Kontrak SPK/2025/IT-01. Nilai kontrak Rp 1.500.000.000.",
		FolderID:       "fld-vendor",
		Division:       "Legal",
		Classification: "Internal",
		DocType:        "Surat Perjanjian",
		Metadata:       []string{"SPK/2025/IT-01", "Rp 1.500.000.000", "30 hari"},
	})

	se.IndexDocument(DocumentIndexItem{
		DocID:          "doc-kontrak-2026",
		Title:          "Adendum Kontrak Pengadaan IT & SLA 2026 (v2.0).pdf",
		Content:        "PASAL 1: KETENTUAN UMUM REVISI Perjanjian ini memperbarui SLA infrastruktur server high-availability. PASAL 2: TATA CARA PEMBAYARAN Tanggal jatuh tempo pembayaran disesuaikan menjadi 45 hari setelah verifikasi berita acara. PASAL 3: REVISI KLAUSUL DENDA Nilai denda keterlambatan ditingkatkan menjadi 2% per minggu untuk menjamin disiplin delivery. PASAL 4: STANDAR SLA & UPTIME Penyedia wajib mempertahankan uptime 99.95% dengan dukungan on-site 24/7. Nomor SPK/2026/LEG-089.",
		FolderID:       "fld-vendor",
		Division:       "Legal",
		Classification: "Rahasia",
		DocType:        "Surat Perjanjian",
		Metadata:       []string{"SPK/2026/LEG-089", "Rp 1.850.000.000", "2% per minggu", "45 hari"},
	})

	se.IndexDocument(DocumentIndexItem{
		DocID:          "doc-laporan-keuangan",
		Title:          "Laporan Finansial dan Neraca Kuartal IV 2025.xlsx",
		Content:        "LAPORAN KEUANGAN TAHUNAN NERACA LABA RUGI DAN ARUS KAS KUARTAL IV 2025. Total Pendapatan Operasional Rp 48.500.000.000 dengan margin EBITDA 28.4%. Audit Clean Opinion.",
		FolderID:       "fld-finance",
		Division:       "Finance",
		Classification: "Sangat Rahasia",
		DocType:        "Laporan Keuangan",
		Metadata:       []string{"Rp 48.500.000.000", "28.4%", "Clean Opinion"},
	})

	se.IndexDocument(DocumentIndexItem{
		DocID:          "doc-spesifikasi-arsitektur",
		Title:          "Dokumen Spesifikasi Arsitektur Sistem.docx",
		Content:        "STANDAR OPERASIONAL PROSEDUR DAN SPESIFIKASI ARSITEKTUR. Sistem Brilian IDMS diimplementasikan menggunakan arsitektur single-binary on-premise Go backend. Modul AES-256 in-memory prompt encryptor dan Rust WebAssembly.",
		FolderID:       "fld-compliance",
		Division:       "Technology",
		Classification: "Internal",
		DocType:        "SOP / Pedoman",
		Metadata:       []string{"AES-256", "WebAssembly", "Go backend"},
	})
}
