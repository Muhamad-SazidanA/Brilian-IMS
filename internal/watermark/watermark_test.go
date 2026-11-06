package watermark_test

import (
	"strings"
	"testing"
	"time"

	"github.com/company/brilian-dms/internal/watermark"
)

func TestValidateOptions_StrictOpacityBounds(t *testing.T) {
	// Valid opacities: 0.15, 0.20, 0.25
	for _, op := range []float64{0.15, 0.20, 0.22, 0.25} {
		opts := watermark.Options{
			FullName: "Alice",
			UserID:   "usr-1",
			Opacity:  op,
		}
		validated, err := watermark.ValidateOptions(opts)
		if err != nil {
			t.Errorf("Expected opacity %v to be valid, got error: %v", op, err)
		}
		if validated.Opacity != op {
			t.Errorf("Expected opacity %v, got %v", op, validated.Opacity)
		}
	}

	// Invalid out-of-bounds opacities
	for _, op := range []float64{0.05, 0.14, 0.26, 0.80, -0.10} {
		opts := watermark.Options{
			FullName: "Alice",
			UserID:   "usr-1",
			Opacity:  op,
		}
		_, err := watermark.ValidateOptions(opts)
		if err == nil {
			t.Errorf("Expected opacity %v to be rejected, but it succeeded", op)
		}
	}
}

func TestValidateOptions_MandatoryFields(t *testing.T) {
	// Empty FullName
	_, err := watermark.ValidateOptions(watermark.Options{
		FullName: "   ",
		UserID:   "u1",
		Opacity:  0.20,
	})
	if err == nil {
		t.Errorf("Expected empty FullName to be rejected")
	}

	// Empty UserID
	_, err = watermark.ValidateOptions(watermark.Options{
		FullName: "Alice",
		UserID:   "",
		Opacity:  0.20,
	})
	if err == nil {
		t.Errorf("Expected empty UserID to be rejected")
	}
}

func TestApplyWatermark_PDF(t *testing.T) {
	initialContent := []byte("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n")
	opts := watermark.Options{
		FullName:      "Rina Wijaya",
		UserID:        "usr-viw-1",
		Timestamp:     time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC),
		Opacity:       0.20,
		DiagonalAngle: -45.0,
	}

	stamped, err := watermark.ApplyWatermark(initialContent, "application/pdf", opts)
	if err != nil {
		t.Fatalf("Failed to apply PDF watermark: %v", err)
	}

	res := watermark.VerifyWatermark(stamped, opts)
	if !res.Valid {
		t.Errorf("PDF watermark verification failed: %+v", res)
	}
	if !res.HasName || !res.HasID || !res.HasOpacity {
		t.Errorf("PDF watermark missing elements: %+v", res)
	}

	contentStr := string(stamped)
	if !strings.Contains(contentStr, "BRILIAN_DYNAMIC_WATERMARK: Rina Wijaya | usr-viw-1") {
		t.Errorf("PDF trailer does not contain expected header")
	}
	if !strings.Contains(contentStr, "<< /Type /Annot /Subtype /Watermark") {
		t.Errorf("PDF does not contain Watermark Annot object")
	}
}

func TestApplyWatermark_Text(t *testing.T) {
	initialContent := []byte("{\"status\":\"ok\",\"document_title\":\"Policy\"}")
	opts := watermark.Options{
		FullName: "Dewi Lestari",
		UserID:   "usr-rev-1",
		Opacity:  0.25,
	}

	stamped, err := watermark.ApplyWatermark(initialContent, "application/json", opts)
	if err != nil {
		t.Fatalf("Failed to apply JSON watermark: %v", err)
	}

	contentStr := string(stamped)
	if !strings.HasPrefix(contentStr, "/* BRILIAN_DYNAMIC_WATERMARK: Dewi Lestari | usr-rev-1") {
		t.Errorf("Text comment missing at start of content: %s", contentStr[:80])
	}
}

func TestApplyWatermark_SVG(t *testing.T) {
	initialContent := []byte("<svg width=\"100\" height=\"100\"><circle cx=\"50\" cy=\"50\" r=\"40\"/></svg>")
	opts := watermark.Options{
		FullName:      "Budi Santoso",
		UserID:        "usr-admin-1",
		Opacity:       0.18,
		DiagonalAngle: -30.0,
	}

	stamped, err := watermark.ApplyWatermark(initialContent, "image/svg+xml", opts)
	if err != nil {
		t.Fatalf("Failed to apply SVG watermark: %v", err)
	}

	contentStr := string(stamped)
	if !strings.Contains(contentStr, "<g class=\"brilian-watermark\" opacity=\"0.18\"") {
		t.Errorf("SVG missing watermark element: %s", contentStr)
	}
	if !strings.HasSuffix(strings.TrimSpace(contentStr), "</svg>") {
		t.Errorf("SVG does not properly close with </svg>")
	}
}

func TestApplyWatermark_GenericBinary(t *testing.T) {
	initialContent := []byte{0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00} // DOCX zip signature
	opts := watermark.Options{
		FullName: "Ahmad Fauzi",
		UserID:   "usr-upl-1",
		Opacity:  0.22,
	}

	stamped, err := watermark.ApplyWatermark(initialContent, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", opts)
	if err != nil {
		t.Fatalf("Failed to apply binary watermark: %v", err)
	}

	res := watermark.VerifyWatermark(stamped, opts)
	if !res.Valid {
		t.Errorf("Generic binary watermark verification failed: %+v", res)
	}
	if !strings.Contains(string(stamped), "__BRILIAN_WATERMARK__[Ahmad Fauzi | usr-upl-1") {
		t.Errorf("Binary trailer missing")
	}
}
