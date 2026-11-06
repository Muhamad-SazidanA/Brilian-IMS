package watermark

import (
	"bytes"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// Constants defining strictly bounded opacity and default angles
const (
	MinOpacity   = 0.15
	MaxOpacity   = 0.25
	DefaultOpacity = 0.20
	DefaultAngle   = -45.0
)

// Common validation errors
var (
	ErrEmptyFullName    = errors.New("Watermark FullName is mandatory and cannot be empty")
	ErrEmptyUserID      = errors.New("Watermark UserID is mandatory and cannot be empty")
	ErrOpacityOutOfBounds = errors.New("Watermark opacity must be strictly between 0.15 and 0.25 (inclusive)")
)

// Options holds dynamic watermark rendering and stamping configuration
type Options struct {
	FullName      string    `json:"FullName"`
	UserID        string    `json:"UserID"`
	Timestamp     time.Time `json:"Timestamp"`
	Opacity       float64   `json:"Opacity"`
	DiagonalAngle float64   `json:"DiagonalAngle"`
}

// Config represents administrative watermark settings
type Config struct {
	DefaultOpacity float64 `json:"default_opacity"`
	DefaultAngle   float64 `json:"default_angle"`
	BannerText     string  `json:"banner_text"`
}

// DefaultConfig returns default administrative watermark configuration
func DefaultConfig() Config {
	return Config{
		DefaultOpacity: DefaultOpacity,
		DefaultAngle:   DefaultAngle,
		BannerText:     "BRILIAN INTELLIGENT DMS",
	}
}

// ValidateOptions validates and normalizes watermark configuration
func ValidateOptions(opts Options) (Options, error) {
	name := strings.TrimSpace(opts.FullName)
	if name == "" {
		return opts, ErrEmptyFullName
	}

	id := strings.TrimSpace(opts.UserID)
	if id == "" {
		return opts, ErrEmptyUserID
	}

	opacity := opts.Opacity
	if opacity == 0 {
		opacity = DefaultOpacity
	}
	if opacity < MinOpacity || opacity > MaxOpacity {
		return opts, fmt.Errorf("%w, got %v", ErrOpacityOutOfBounds, opacity)
	}

	angle := opts.DiagonalAngle
	if angle == 0 {
		angle = DefaultAngle
	}

	ts := opts.Timestamp
	if ts.IsZero() {
		ts = time.Now().UTC()
	}

	return Options{
		FullName:      name,
		UserID:        id,
		Timestamp:     ts.UTC(),
		Opacity:       opacity,
		DiagonalAngle: angle,
	}, nil
}

// FormatWatermarkText produces standard text pattern: FullName | UserID | Timestamp
func FormatWatermarkText(opts Options) string {
	tsStr := opts.Timestamp.Format(time.RFC3339)
	return fmt.Sprintf("%s | %s | %s", opts.FullName, opts.UserID, tsStr)
}

// ApplyWatermark injects dynamic watermark into byte slice based on MIME type
func ApplyWatermark(content []byte, mimeType string, opts Options) ([]byte, error) {
	validated, err := ValidateOptions(opts)
	if err != nil {
		return nil, err
	}

	text := FormatWatermarkText(validated)
	normalizedMime := strings.ToLower(strings.TrimSpace(mimeType))

	// 1. PDF: embed annotation trailer matching watermark_oracle.js
	if normalizedMime == "application/pdf" {
		stamp := fmt.Sprintf(
			"\n%% BRILIAN_DYNAMIC_WATERMARK: %s [opacity=%.2f, angle=%.1f]\n<< /Type /Annot /Subtype /Watermark /Rect [0 0 595 842] /Contents (%s) /CA %.2f >>\n",
			text, validated.Opacity, validated.DiagonalAngle, text, validated.Opacity,
		)
		return append(content, []byte(stamp)...), nil
	}

	// 2. Text / JSON: prepend comment header
	if strings.HasPrefix(normalizedMime, "text/") || normalizedMime == "application/json" {
		stamp := fmt.Sprintf("/* BRILIAN_DYNAMIC_WATERMARK: %s */\n", text)
		var buf bytes.Buffer
		buf.WriteString(stamp)
		buf.Write(content)
		return buf.Bytes(), nil
	}

	// 3. SVG: inject XML element before closing </svg>
	if normalizedMime == "image/svg+xml" {
		svgCloseRe := regexp.MustCompile(`(?i)</svg>\s*$`)
		baseContent := svgCloseRe.ReplaceAll(content, nil)

		stamp := fmt.Sprintf(
			"\n<g class=\"brilian-watermark\" opacity=\"%.2f\" transform=\"rotate(%.1f)\">\n  <text font-size=\"14\" fill=\"#14161B\" font-family=\"IBM Plex Sans, sans-serif\">%s</text>\n</g>\n</svg>",
			validated.Opacity, validated.DiagonalAngle, text,
		)
		var buf bytes.Buffer
		buf.Write(baseContent)
		buf.WriteString(stamp)
		return buf.Bytes(), nil
	}

	// 4. Other / Generic Binary: append binary watermark trailer
	trailer := fmt.Sprintf(
		"\n__BRILIAN_WATERMARK__[%s;opacity=%.2f;angle=%.1f]__\n",
		text, validated.Opacity, validated.DiagonalAngle,
	)
	return append(content, []byte(trailer)...), nil
}

// VerificationResult holds the watermark verification flags
type VerificationResult struct {
	Valid      bool `json:"valid"`
	HasName    bool `json:"has_name"`
	HasID      bool `json:"has_id"`
	HasOpacity bool `json:"has_opacity"`
}

// VerifyWatermark inspects a byte buffer to confirm dynamic watermark presence
func VerifyWatermark(content []byte, opts Options) VerificationResult {
	str := string(content)
	hasName := strings.Contains(str, opts.FullName)
	hasID := strings.Contains(str, opts.UserID)

	opStr1 := fmt.Sprintf("opacity=%.2f", opts.Opacity)
	opStr2 := fmt.Sprintf("/CA %.2f", opts.Opacity)
	hasOpacity := strings.Contains(str, opStr1) || strings.Contains(str, opStr2)

	return VerificationResult{
		Valid:      hasName && hasID,
		HasName:    hasName,
		HasID:      hasID,
		HasOpacity: hasOpacity,
	}
}
