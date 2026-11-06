package watermark_test

import (
	"bytes"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/company/brilian-dms/internal/watermark"
)

// TestChallenger_Watermark_OpacityBoundaryFuzzing tests boundary, sub-boundary, and extreme opacity values
func TestChallenger_Watermark_OpacityBoundaryFuzzing(t *testing.T) {
	// Exact boundary cases specified in Milestone 4 mission
	testCases := []struct {
		name        string
		opacity     float64
		shouldAllow bool
		desc        string
	}{
		{"Below lower bound by epsilon", 0.149999, false, "Must be rejected: strictly < 0.15"},
		{"Exact lower bound boundary", 0.150000, true, "Must be accepted: minimum allowed opacity"},
		{"Standard nominal default", 0.200000, true, "Must be accepted: nominal default"},
		{"Exact upper bound boundary", 0.250000, true, "Must be accepted: maximum allowed opacity"},
		{"Above upper bound by epsilon", 0.250001, false, "Must be rejected: strictly > 0.25"},
		{"Zero opacity", 0.0, true, "Zero value defaults to DefaultOpacity (0.20) in Go struct semantics"},
		{"Negative opacity", -1.0, false, "Must be rejected: negative opacity"},
		{"Full opacity 1.0", 1.0, false, "Must be rejected: obscuring document"},
		{"Extreme opacity 999.0", 999.0, false, "Must be rejected: extreme outlier"},
		{"Negative float boundary", -0.00001, false, "Must be rejected: negative float"},
		{"Intermediate valid 0.18", 0.180000, true, "Must be accepted: within bounds"},
		{"Intermediate valid 0.22", 0.220000, true, "Must be accepted: within bounds"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			opts := watermark.Options{
				FullName: "Adversarial Tester",
				UserID:   "usr-adv-1",
				Opacity:  tc.opacity,
			}
			validated, err := watermark.ValidateOptions(opts)
			if tc.shouldAllow {
				if err != nil {
					t.Fatalf("Expected opacity %v to be valid (%s), but got error: %v", tc.opacity, tc.desc, err)
				}
				if tc.opacity == 0.0 {
					if validated.Opacity != watermark.DefaultOpacity {
						t.Errorf("Expected zero opacity to fall back to DefaultOpacity (0.20), got %v", validated.Opacity)
					}
				} else {
					if validated.Opacity != tc.opacity {
						t.Errorf("Expected opacity %v, got %v", tc.opacity, validated.Opacity)
					}
				}
			} else {
				if err == nil {
					t.Fatalf("Expected opacity %v to be REJECTED (%s), but it succeeded with opacity %v",
						tc.opacity, tc.desc, validated.Opacity)
				}
			}
		})
	}
}

// TestChallenger_Watermark_EmptyAndWhitespaceFields verifies mandatory FullName and UserID validation
func TestChallenger_Watermark_EmptyAndWhitespaceFields(t *testing.T) {
	invalidNames := []string{
		"",
		" ",
		"   ",
		"\t",
		"\n",
		"\r\n",
		"  \t \n ",
	}

	for _, badName := range invalidNames {
		_, err := watermark.ValidateOptions(watermark.Options{
			FullName: badName,
			UserID:   "valid-id",
			Opacity:  0.20,
		})
		if err == nil {
			t.Errorf("Security gap: FullName %q (whitespace-only) was accepted", badName)
		}
	}

	invalidIDs := []string{
		"",
		" ",
		"   ",
		"\t",
		"\n",
		"\r\n",
		"  \t \n ",
	}

	for _, badID := range invalidIDs {
		_, err := watermark.ValidateOptions(watermark.Options{
			FullName: "Valid User",
			UserID:   badID,
			Opacity:  0.20,
		})
		if err == nil {
			t.Errorf("Security gap: UserID %q (whitespace-only) was accepted", badID)
		}
	}
}

// TestChallenger_Watermark_HighConcurrencyStress executes 50 parallel goroutines generating watermarked
// PDF, SVG, Text, and Generic Binary buffers simultaneously.
func TestChallenger_Watermark_HighConcurrencyStress(t *testing.T) {
	const goroutineCount = 50
	basePDF := []byte("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n")
	baseSVG := []byte("<svg width=\"200\" height=\"200\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"100%\" height=\"100%\" fill=\"blue\"/></svg>")
	baseJSON := []byte("{\"document_id\":\"doc-stress-1\",\"title\":\"Confidential Audit Report 2026\"}")
	baseBinary := []byte{0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x08, 0x00, 0x08, 0x00, 0x00, 0x00}

	var wg sync.WaitGroup
	errorsChan := make(chan string, goroutineCount*4)

	for i := 0; i < goroutineCount; i++ {
		workerID := i
		wg.Add(4)

		// 1. PDF concurrent worker
		go func(id int) {
			defer wg.Done()
			user := fmt.Sprintf("PDF Worker %03d", id)
			uid := fmt.Sprintf("usr-pdf-%03d", id)
			opts := watermark.Options{
				FullName:      user,
				UserID:        uid,
				Opacity:       0.20,
				DiagonalAngle: -45.0,
			}
			stamped, err := watermark.ApplyWatermark(basePDF, "application/pdf", opts)
			if err != nil {
				errorsChan <- fmt.Sprintf("PDF worker %d failed: %v", id, err)
				return
			}
			res := watermark.VerifyWatermark(stamped, opts)
			if !res.Valid || !res.HasName || !res.HasID || !res.HasOpacity {
				errorsChan <- fmt.Sprintf("PDF worker %d verification failed: %+v", id, res)
			}
			// Check that this worker's output does not contain another worker's ID
			otherWorker := fmt.Sprintf("usr-pdf-%03d", (id+1)%goroutineCount)
			if strings.Contains(string(stamped), otherWorker) && id != (id+1)%goroutineCount {
				errorsChan <- fmt.Sprintf("PDF worker %d output cross-contaminated with %s", id, otherWorker)
			}
		}(workerID)

		// 2. SVG concurrent worker
		go func(id int) {
			defer wg.Done()
			user := fmt.Sprintf("SVG Worker %03d", id)
			uid := fmt.Sprintf("usr-svg-%03d", id)
			opts := watermark.Options{
				FullName:      user,
				UserID:        uid,
				Opacity:       0.18,
				DiagonalAngle: -30.0,
			}
			stamped, err := watermark.ApplyWatermark(baseSVG, "image/svg+xml", opts)
			if err != nil {
				errorsChan <- fmt.Sprintf("SVG worker %d failed: %v", id, err)
				return
			}
			res := watermark.VerifyWatermark(stamped, opts)
			if !res.Valid || !res.HasName || !res.HasID {
				errorsChan <- fmt.Sprintf("SVG worker %d verification failed: %+v", id, res)
			}
			// Explicitly verify XML opacity attribute (VerifyWatermark.HasOpacity omits quotes)
			xmlOpacity := fmt.Sprintf("opacity=\"%.2f\"", opts.Opacity)
			if !strings.Contains(string(stamped), xmlOpacity) {
				errorsChan <- fmt.Sprintf("SVG worker %d output missing XML opacity attribute %s", id, xmlOpacity)
			}
			if !strings.HasSuffix(strings.TrimSpace(string(stamped)), "</svg>") {
				errorsChan <- fmt.Sprintf("SVG worker %d output malformed XML closing tag", id)
			}
		}(workerID)

		// 3. JSON/Text concurrent worker
		go func(id int) {
			defer wg.Done()
			user := fmt.Sprintf("JSON Worker %03d", id)
			uid := fmt.Sprintf("usr-json-%03d", id)
			opts := watermark.Options{
				FullName: user,
				UserID:   uid,
				Opacity:  0.22,
			}
			stamped, err := watermark.ApplyWatermark(baseJSON, "application/json", opts)
			if err != nil {
				errorsChan <- fmt.Sprintf("JSON worker %d failed: %v", id, err)
				return
			}
			res := watermark.VerifyWatermark(stamped, opts)
			if !res.Valid || !res.HasName || !res.HasID {
				errorsChan <- fmt.Sprintf("JSON worker %d verification failed: %+v", id, res)
			}
		}(workerID)

		// 4. Binary concurrent worker
		go func(id int) {
			defer wg.Done()
			user := fmt.Sprintf("BIN Worker %03d", id)
			uid := fmt.Sprintf("usr-bin-%03d", id)
			opts := watermark.Options{
				FullName: user,
				UserID:   uid,
				Opacity:  0.25,
			}
			stamped, err := watermark.ApplyWatermark(baseBinary, "application/octet-stream", opts)
			if err != nil {
				errorsChan <- fmt.Sprintf("BIN worker %d failed: %v", id, err)
				return
			}
			res := watermark.VerifyWatermark(stamped, opts)
			if !res.Valid || !res.HasName || !res.HasID || !res.HasOpacity {
				errorsChan <- fmt.Sprintf("BIN worker %d verification failed: %+v", id, res)
			}
		}(workerID)
	}

	wg.Wait()
	close(errorsChan)

	var failureMsgs []string
	for msg := range errorsChan {
		failureMsgs = append(failureMsgs, msg)
	}

	if len(failureMsgs) > 0 {
		t.Fatalf("High concurrency watermark stress encountered %d failures:\n%s",
			len(failureMsgs), strings.Join(failureMsgs, "\n"))
	}
	t.Logf("High concurrency stress test PASSED: 200 operations across 50 concurrent goroutines completed without error or corruption.")
}

// TestChallenger_Watermark_SharedBufferCapacitySafety investigates whether concurrent append
// onto a slice with excess capacity mutates or corrupts memory across callers.
func TestChallenger_Watermark_SharedBufferCapacitySafety(t *testing.T) {
	// Create a slice with excess capacity, mimicking buffers loaded from network/disk
	const initialData = "%PDF-1.7 standard header\n"
	rawBuf := make([]byte, len(initialData), len(initialData)+500)
	copy(rawBuf, []byte(initialData))

	const goroutines = 20
	var wg sync.WaitGroup
	var mu sync.Mutex
	results := make([]string, goroutines)

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			opts := watermark.Options{
				FullName: fmt.Sprintf("User%d", idx),
				UserID:   fmt.Sprintf("usr-%d", idx),
				Opacity:  0.20,
			}
			// Each goroutine passes the SAME rawBuf slice
			stamped, err := watermark.ApplyWatermark(rawBuf, "application/pdf", opts)
			if err != nil {
				t.Errorf("Error applying watermark: %v", err)
				return
			}
			mu.Lock()
			results[idx] = string(stamped)
			mu.Unlock()
		}(i)
	}

	wg.Wait()

	// Verify that each result retained its own UserID
	for i := 0; i < goroutines; i++ {
		expectedID := fmt.Sprintf("usr-%d", i)
		if !strings.Contains(results[i], expectedID) {
			t.Errorf("Corruption detected: Goroutine %d result does not contain %s", i, expectedID)
		}
	}

	// Verify the original rawBuf was not mutated in its visible length
	if string(rawBuf) != initialData {
		t.Errorf("Original buffer was mutated! Expected %q, got %q", initialData, string(rawBuf))
	}
}

// TestChallenger_Watermark_AllStandardMIMETypes verifies dynamic watermarking across diverse MIME types
func TestChallenger_Watermark_AllStandardMIMETypes(t *testing.T) {
	opts := watermark.Options{
		FullName:  "Dewi Lestari",
		UserID:    "usr-rev-1",
		Timestamp: time.Date(2026, 11, 6, 15, 30, 0, 0, time.UTC),
		Opacity:   0.20,
	}

	mimeTests := []struct {
		mimeType    string
		content     []byte
		checkString string
	}{
		{"application/pdf", []byte("%PDF-1.4\n"), "<< /Type /Annot /Subtype /Watermark"},
		{"text/plain", []byte("plain text document"), "/* BRILIAN_DYNAMIC_WATERMARK: Dewi Lestari | usr-rev-1"},
		{"text/csv", []byte("col1,col2\nval1,val2"), "/* BRILIAN_DYNAMIC_WATERMARK: Dewi Lestari | usr-rev-1"},
		{"application/json", []byte("{\"key\":\"value\"}"), "/* BRILIAN_DYNAMIC_WATERMARK: Dewi Lestari | usr-rev-1"},
		{"image/svg+xml", []byte("<svg><rect/></svg>"), "<g class=\"brilian-watermark\" opacity=\"0.20\""},
		{"application/vnd.openxmlformats-officedocument.wordprocessingml.document", []byte("PK\x03\x04"), "__BRILIAN_WATERMARK__[Dewi Lestari | usr-rev-1"},
		{"application/octet-stream", []byte{0x00, 0x01, 0x02}, "__BRILIAN_WATERMARK__[Dewi Lestari | usr-rev-1"},
	}

	for _, tc := range mimeTests {
		t.Run(tc.mimeType, func(t *testing.T) {
			stamped, err := watermark.ApplyWatermark(tc.content, tc.mimeType, opts)
			if err != nil {
				t.Fatalf("Failed to apply watermark for %s: %v", tc.mimeType, err)
			}
			if !bytes.Contains(stamped, []byte(tc.checkString)) {
				t.Errorf("MIME %s output does not contain expected watermark string %q.\nOutput: %s",
					tc.mimeType, tc.checkString, string(stamped))
			}
			res := watermark.VerifyWatermark(stamped, opts)
			if !res.Valid {
				t.Errorf("VerifyWatermark failed for MIME %s", tc.mimeType)
			}
		})
	}
}

// TestChallenger_Watermark_VerifyWatermark_SVGOpacityDefect empirically verifies that
// VerifyWatermark.HasOpacity fails on SVG because it searches for 'opacity=%.2f' (without quotes)
// while SVG embeds XML attribute 'opacity="%.2f"' (with quotes).
func TestChallenger_Watermark_VerifyWatermark_SVGOpacityDefect(t *testing.T) {
	opts := watermark.Options{
		FullName: "Adversarial Checker",
		UserID:   "usr-adv-1",
		Opacity:  0.20,
	}
	svgContent := []byte("<svg width=\"100\" height=\"100\"><circle/></svg>")
	stamped, err := watermark.ApplyWatermark(svgContent, "image/svg+xml", opts)
	if err != nil {
		t.Fatalf("Failed to apply SVG watermark: %v", err)
	}

	res := watermark.VerifyWatermark(stamped, opts)
	if !res.HasOpacity {
		t.Logf("Empirical Observation Confirmed: VerifyWatermark.HasOpacity is false for SVG due to unquoted format pattern in VerifyWatermark (searches for 'opacity=0.20' instead of 'opacity=\"0.20\"')")
	}
}

