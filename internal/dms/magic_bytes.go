package dms

import (
	"bytes"
	"fmt"
	"strings"
)

// DetectMimeType inspects the binary content of a buffer to determine its MIME type
func DetectMimeType(buf []byte) string {
	if len(buf) == 0 {
		return "application/octet-stream"
	}

	// 1. PDF signature: %PDF- in leading 1024 bytes
	limit := len(buf)
	if limit > 1024 {
		limit = 1024
	}
	if bytes.Contains(buf[:limit], []byte("%PDF-")) {
		return "application/pdf"
	}

	// 2. PNG signature: 89 50 4E 47 0D 0A 1A 0A
	if len(buf) >= 8 && bytes.Equal(buf[:8], []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}) {
		return "image/png"
	}

	// 3. JPEG signature: FF D8 FF
	if len(buf) >= 3 && buf[0] == 0xFF && buf[1] == 0xD8 && buf[2] == 0xFF {
		return "image/jpeg"
	}

	// 4. GIF signature: GIF87a or GIF89a
	if len(buf) >= 6 && (string(buf[:6]) == "GIF87a" || string(buf[:6]) == "GIF89a") {
		return "image/gif"
	}

	// 5. WebP signature: RIFF....WEBP
	if len(buf) >= 12 && string(buf[:4]) == "RIFF" && string(buf[8:12]) == "WEBP" {
		return "image/webp"
	}

	// 6. MP4 signature: ftyp at offset 4
	if len(buf) >= 8 && string(buf[4:8]) == "ftyp" {
		return "video/mp4"
	}

	// 7. MP3 signature: ID3 or MPEG frame sync
	if len(buf) >= 3 && string(buf[:3]) == "ID3" {
		return "audio/mpeg"
	}
	if len(buf) >= 2 && buf[0] == 0xFF && (buf[1]&0xE0) == 0xE0 {
		return "audio/mpeg"
	}

	// 8. WAV signature: RIFF....WAVE
	if len(buf) >= 12 && string(buf[:4]) == "RIFF" && string(buf[8:12]) == "WAVE" {
		return "audio/wav"
	}

	// 9. OpenXML and ZIP signatures: PK\x03\x04
	if len(buf) >= 4 && buf[0] == 0x50 && buf[1] == 0x4B && buf[2] == 0x03 && buf[3] == 0x04 {
		contentStr := string(buf)
		if strings.Contains(contentStr, "word/") {
			return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
		}
		if strings.Contains(contentStr, "xl/") {
			return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
		}
		if strings.Contains(contentStr, "ppt/") {
			return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
		}
		return "application/zip"
	}

	// 10. Executable PE/ELF binary detection (disguised files)
	if len(buf) >= 2 && buf[0] == 0x4D && buf[1] == 0x5A { // MZ
		return "application/x-dosexec"
	}
	if len(buf) >= 4 && buf[0] == 0x7F && string(buf[1:4]) == "ELF" {
		return "application/x-executable"
	}

	// 11. Plain text check: no null bytes in first 1024 bytes
	if !bytes.Contains(buf[:limit], []byte{0x00}) {
		return "text/plain"
	}

	return "application/octet-stream"
}

// ValidateMagicBytes verifies declared MIME type against binary magic bytes
func ValidateMagicBytes(buf []byte, declaredMime string) ValidationResult {
	detected := DetectMimeType(buf)

	if declaredMime == "" {
		return ValidationResult{
			Valid:    false,
			Error:    "Declared MIME type is required",
			Detected: detected,
		}
	}

	// Exact match
	if detected == declaredMime {
		return ValidationResult{Valid: true, Detected: detected}
	}

	// OpenXML family match with generic ZIP
	if detected == "application/zip" && strings.HasPrefix(declaredMime, "application/vnd.openxmlformats-officedocument") {
		return ValidationResult{Valid: true, Detected: declaredMime}
	}

	// Text variations
	if strings.HasPrefix(declaredMime, "text/") && detected == "text/plain" {
		return ValidationResult{Valid: true, Detected: declaredMime}
	}

	// Binary spoofing detection
	return ValidationResult{
		Valid:    false,
		Error:    fmt.Sprintf("MIME spoofing detected: file claims to be '%s' but binary magic bytes match '%s'", declaredMime, detected),
		Detected: detected,
	}
}

