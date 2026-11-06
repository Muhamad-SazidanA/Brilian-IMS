package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/company/brilian-dms/internal/engine"
)

// SummarizeRequest represents the payload for document summarization.
type SummarizeRequest struct {
	DocumentID string `json:"document_id"`
	Text       string `json:"text,omitempty"`
	MaxTokens  int    `json:"max_tokens,omitempty"`
}

// SummarizeResponse represents the summarization output.
type SummarizeResponse struct {
	Status     string `json:"status"`
	Summary    string `json:"summary"`
	TokenCount int    `json:"token_count"`
	Model      string `json:"model"`
	Provider   string `json:"provider"`
}

// Summarizer performs document summarization with token budgeting and deterministic fallback.
type Summarizer struct {
	provider   string
	apiKey     string
	baseURL    string
	model      string
	isMock     bool
	httpClient *http.Client
}

// NewSummarizer initializes a Summarizer using environment configuration.
func NewSummarizer() *Summarizer {
	provider := strings.ToLower(os.Getenv("LLM_PROVIDER"))
	if provider == "" {
		provider = "mock"
	}

	apiKey := os.Getenv("LLM_API_KEY")
	baseURL := os.Getenv("LLM_BASE_URL")
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	model := os.Getenv("LLM_MODEL")
	if model == "" {
		model = "mock-deterministic-v1"
	}

	mockEnv := strings.ToLower(os.Getenv("LLM_MOCK"))
	isMock := mockEnv == "true" || mockEnv == "1" || apiKey == "" || provider == "mock"

	return &Summarizer{
		provider:   provider,
		apiKey:     apiKey,
		baseURL:    baseURL,
		model:      model,
		isMock:     isMock,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// Summarize generates a document summary within token constraints,
// applying prompt injection defense and deterministic fallback when offline/mock.
func (s *Summarizer) Summarize(ctx context.Context, req SummarizeRequest) (SummarizeResponse, error) {
	text := strings.TrimSpace(req.Text)
	if text == "" {
		return SummarizeResponse{
			Status:     "error",
			Summary:    "Teks dokumen tidak dapat ditemukan atau kosong.",
			TokenCount: 0,
			Model:      s.model,
			Provider:   s.provider,
		}, fmt.Errorf("document text is empty")
	}


	// 1. Defend against prompt injection in document text
	sanitizedText := SanitizePromptContent(text, req.DocumentID)

	maxTokens := req.MaxTokens
	if maxTokens <= 0 || maxTokens > 4000 {
		maxTokens = 500
	}

	// 2. If in mock mode or API key missing, execute deterministic engine-backed summarization
	if s.isMock {
		return s.deterministicSummary(text, sanitizedText, maxTokens), nil
	}

	// 3. For live LLM providers, call remote API with timeout fallback
	ctxWithTimeout, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	type chatMessage struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	type chatRequest struct {
		Model     string        `json:"model"`
		Messages  []chatMessage `json:"messages"`
		MaxTokens int           `json:"max_tokens"`
	}
	type chatChoice struct {
		Message chatMessage `json:"message"`
	}
	type chatUsage struct {
		TotalTokens int `json:"total_tokens"`
	}
	type chatResponse struct {
		Choices []chatChoice `json:"choices"`
		Usage   chatUsage    `json:"usage"`
	}

	reqBody := chatRequest{
		Model: s.model,
		Messages: []chatMessage{
			{Role: "system", Content: "Anda adalah asisten cerdas sistem manajemen dokumen enterprise. Buatlah ringkasan eksekutif dokumen dalam bahasa Indonesia yang akurat dan padat."},
			{Role: "user", Content: sanitizedText},
		},
		MaxTokens: maxTokens,
	}

	reqBytes, err := json.Marshal(reqBody)
	if err == nil {
		endpoint := strings.TrimRight(s.baseURL, "/") + "/chat/completions"
		httpReq, err := http.NewRequestWithContext(ctxWithTimeout, http.MethodPost, endpoint, bytes.NewReader(reqBytes))
		if err == nil {
			httpReq.Header.Set("Content-Type", "application/json")
			httpReq.Header.Set("Authorization", "Bearer "+s.apiKey)

			resp, err := s.httpClient.Do(httpReq)
			if err == nil {
				defer resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					var chatResp chatResponse
					if err := json.NewDecoder(resp.Body).Decode(&chatResp); err == nil && len(chatResp.Choices) > 0 {
						return SummarizeResponse{
							Status:     "success",
							Summary:    strings.TrimSpace(chatResp.Choices[0].Message.Content),
							TokenCount: chatResp.Usage.TotalTokens,
							Model:      s.model,
							Provider:   s.provider,
						}, nil
					}
				}
			}
		}
	}

	// Resilient fallback to deterministic engine on remote failure
	return s.deterministicSummary(text, sanitizedText, maxTokens), nil
}

// deterministicSummary builds an executive summary using deterministic extraction & classification.
func (s *Summarizer) deterministicSummary(originalText, sanitizedText string, maxTokens int) SummarizeResponse {
	cls := engine.ClassifyDocument(originalText, "")
	ext := engine.ExtractMetadata(originalText)

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Dokumen diklasifikasikan sebagai %s (Tingkat Keyakinan: %.0f%%).\n\n", cls.DocType, cls.Confidence*100))

	// Highlight Key Metadata
	if len(ext.Identifiers) > 0 || len(ext.Currencies) > 0 || len(ext.Dates) > 0 {
		sb.WriteString("Parameter Dokumen Utama:\n")
		if len(ext.Identifiers) > 0 {
			sb.WriteString(fmt.Sprintf("- Nomor Referensi: %s\n", strings.Join(ext.Identifiers, ", ")))
		}
		if len(ext.Currencies) > 0 {
			sb.WriteString(fmt.Sprintf("- Nilai Transaksi: %s\n", strings.Join(ext.Currencies, ", ")))
		}
		if len(ext.Dates) > 0 {
			sb.WriteString(fmt.Sprintf("- Tanggal Penting: %s\n", strings.Join(ext.Dates, ", ")))
		}
		if len(ext.Percentages) > 0 {
			sb.WriteString(fmt.Sprintf("- Persentase / Bunga / Denda: %s\n", strings.Join(ext.Percentages, ", ")))
		}
		sb.WriteString("\n")
	}

	// Extract meaningful clauses
	lines := strings.Split(originalText, "\n")
	var keyClauses []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if len(trimmed) > 15 {
			lower := strings.ToLower(trimmed)
			if strings.Contains(lower, "pasal") ||
				strings.Contains(lower, "ketentuan") ||
				strings.Contains(lower, "pembayaran") ||
				strings.Contains(lower, "denda") ||
				strings.Contains(lower, "sla") ||
				strings.Contains(lower, "laba") ||
				strings.Contains(lower, "ringkasan") {
				keyClauses = append(keyClauses, trimmed)
			}
		}
	}

	if len(keyClauses) > 0 {
		sb.WriteString("Poin-Poin Utama:\n")
		limit := 4
		if len(keyClauses) < limit {
			limit = len(keyClauses)
		}
		for i := 0; i < limit; i++ {
			sb.WriteString(fmt.Sprintf("%d. %s\n", i+1, keyClauses[i]))
		}
	} else {
		// Excerpt
		cleanLines := strings.Fields(originalText)
		wordCount := len(cleanLines)
		if wordCount > 40 {
			wordCount = 40
		}
		sb.WriteString("Ringkasan Konten: " + strings.Join(cleanLines[:wordCount], " ") + "...")
	}

	summaryText := strings.TrimSpace(sb.String())

	// Estimate token count
	tokens := int(math.Ceil(float64(len(summaryText)) / 3.8))
	if tokens > maxTokens {
		tokens = maxTokens
	}

	return SummarizeResponse{
		Status:     "success",
		Summary:    summaryText,
		TokenCount: tokens,
		Model:      s.model,
		Provider:   s.provider,
	}
}
