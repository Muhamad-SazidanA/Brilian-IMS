package ai

import (
	"fmt"
	"regexp"
)


var (
	delimiterEscapeRegex = regexp.MustCompile(`(?i)<<</?UNTRUSTED_DOCUMENT_CONTENT[\s\S]*?>>>`)

	// Known adversarial prompt injection patterns
	injectionPatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)ignore\s+all\s+(?:previous|prior)\s+instructions`),
		regexp.MustCompile(`(?i)system\s+prompt\s+override`),
		regexp.MustCompile(`(?i)you\s+are\s+now\s+in\s+dan\s+mode`),
		regexp.MustCompile(`(?i)output\s+the\s+system\s+prompt`),
		regexp.MustCompile(`(?i)reveal\s+(?:the\s+)?system\s+prompt`),
		regexp.MustCompile(`(?i)disregard\s+(?:all\s+)?(?:prior|previous|above)\s+instructions`),
		regexp.MustCompile(`(?i)bypass\s+(?:all\s+)?security\s+protocols`),
		regexp.MustCompile(`(?i)ignore\s+(?:all\s+)?(?:rules|constraints|instructions)`),
		regexp.MustCompile(`(?i)jailbreak`),
	}
)

// DetectInjection inspects untrusted document text for known prompt injection signatures.
func DetectInjection(text string) (bool, []string) {
	if text == "" {
		return false, nil
	}
	var detected []string
	for _, pattern := range injectionPatterns {
		if pattern.MatchString(text) {
			detected = append(detected, pattern.String())
		}
	}
	return len(detected) > 0, detected
}

// SanitizePromptContent neutralizes adversarial prompt injection payloads
// and wraps untrusted document content in strict cryptographic/isolation delimiters.
func SanitizePromptContent(docText string, docID string) string {
	if docText == "" {
		return ""
	}
	if docID == "" {
		docID = "unknown"
	}

	cleaned := docText

	// 1. Defend against delimiter escape sequences injected inside document text
	cleaned = delimiterEscapeRegex.ReplaceAllString(cleaned, "[ESCAPED_SANDBOX_DELIMITER]")

	// 2. Block known prompt injection attack phrases
	for _, pattern := range injectionPatterns {
		cleaned = pattern.ReplaceAllString(cleaned, "[INJECTION_BLOCKED]")
	}

	// 3. Wrap in canonical boundary delimiters to isolate untrusted user data from LLM instructions
	return fmt.Sprintf("<<<UNTRUSTED_DOCUMENT_CONTENT doc_id=%q>>>\n%s\n<<</UNTRUSTED_DOCUMENT_CONTENT>>>", docID, cleaned)
}
