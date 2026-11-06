package dms

import (
	"encoding/binary"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

var (
	scriptTagRegex    = regexp.MustCompile(`(?i)<script\b[^>]*>`)
	inlineEventRegex  = regexp.MustCompile(`(?i)\son[a-z]+\s*=`)
	jsUriRegex        = regexp.MustCompile(`(?i)javascript\s*:`)
	foreignObjRegex   = regexp.MustCompile(`(?i)<foreignObject\b[^>]*>`)
)

// InspectSVGContent checks SVG documents for embedded scripts and XSS vectors
func InspectSVGContent(content []byte) SecurityCheckResult {
	s := string(content)

	if scriptTagRegex.MatchString(s) {
		return SecurityCheckResult{Safe: false, Reason: "SVG contains executable <script> tag"}
	}
	if inlineEventRegex.MatchString(s) {
		return SecurityCheckResult{Safe: false, Reason: "SVG contains inline JavaScript event handler"}
	}
	if jsUriRegex.MatchString(s) {
		return SecurityCheckResult{Safe: false, Reason: "SVG contains javascript: URI scheme"}
	}
	if foreignObjRegex.MatchString(s) {
		return SecurityCheckResult{Safe: false, Reason: "SVG contains dangerous <foreignObject> container"}
	}

	return SecurityCheckResult{Safe: true}
}

// InspectZipOrOffice inspects an archive or Office document for macros and decompression bombs
func InspectZipOrOffice(buf []byte, filename string) SecurityCheckResult {
	ext := strings.ToLower(filepath.Ext(filename))

	// 1. Prohibit macro-enabled file extensions
	if macroExtensions[ext] {
		return SecurityCheckResult{
			Safe:   false,
			Reason: fmt.Sprintf("Macro-enabled file extension '%s' is prohibited by security policy", ext),
		}
	}

	isZipOrOffice := ext == ".zip" || ext == ".docx" || ext == ".xlsx" || ext == ".pptx" ||
		(len(buf) >= 4 && buf[0] == 0x50 && buf[1] == 0x4B && buf[2] == 0x03 && buf[3] == 0x04)

	if !isZipOrOffice {
		return SecurityCheckResult{Safe: true}
	}

	// 2. Check for embedded VBA macro payload
	contentStr := string(buf)
	if strings.Contains(contentStr, "vbaProject.bin") ||
		strings.Contains(contentStr, "word/vbaData.xml") ||
		strings.Contains(contentStr, "xl/vbaProject.bin") {
		return SecurityCheckResult{
			Safe:   false,
			Reason: "OpenXML archive contains vbaProject.bin macro code",
		}
	}

	// 3. Zip decompression bomb heuristic check
	if len(buf) >= 30 && binary.LittleEndian.Uint32(buf[0:4]) == 0x04034B50 {
		compressedSize := binary.LittleEndian.Uint32(buf[18:22])
		uncompressedSize := binary.LittleEndian.Uint32(buf[22:26])

		if compressedSize > 0 && uncompressedSize > 0 {
			ratio := float64(uncompressedSize) / float64(compressedSize)
			if ratio > 100.0 || uncompressedSize > 1073741824 { // ratio > 100:1 or > 1GB uncompressed
				return SecurityCheckResult{
					Safe:   false,
					Reason: fmt.Sprintf("Zip bomb detected: compression ratio %.1f:1 exceeds limit", ratio),
				}
			}
		}
	}

	return SecurityCheckResult{Safe: true}
}

