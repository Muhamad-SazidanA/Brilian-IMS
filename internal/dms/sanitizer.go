package dms

import (
	"fmt"
	"path"
	"path/filepath"
	"regexp"
	"strings"
)

var disallowedExtensions = map[string]bool{
	".exe": true, ".bat": true, ".cmd": true, ".sh": true,
	".vbs": true, ".js": true, ".ps1": true, ".msi": true,
	".dll": true, ".jar": true, ".com": true, ".scr": true,
	".pif": true,
}

var macroExtensions = map[string]bool{
	".docm": true, ".xlsm": true, ".pptm": true,
	".dotm": true, ".xltm": true, ".ppam": true,
}

var reservedDeviceNames = map[string]bool{
	"CON": true, "PRN": true, "AUX": true, "NUL": true,
	"COM1": true, "COM2": true, "COM3": true, "COM4": true, "COM5": true,
	"COM6": true, "COM7": true, "COM8": true, "COM9": true,
	"LPT1": true, "LPT2": true, "LPT3": true, "LPT4": true, "LPT5": true,
	"LPT6": true, "LPT7": true, "LPT8": true, "LPT9": true,
}

var invalidCharsRegex = regexp.MustCompile(`[<>:"/\\|?*\x00-\x1F]`)

// SanitizeFilename cleans an incoming filename and defends against path traversal,
// null byte injection, invalid characters, prohibited extensions, and reserved device names.
func SanitizeFilename(raw string) (string, error) {
	if strings.TrimSpace(raw) == "" {
		return "", fmt.Errorf("filename must be a non-empty string")
	}

	// 1. Check for null byte injection
	if strings.Contains(raw, "\x00") || strings.Contains(raw, "%00") {
		return "", fmt.Errorf("Null byte injection detected in filename")
	}

	// 2. Strip directory traversal sequences
	normalized := strings.ReplaceAll(raw, "\\", "/")
	base := path.Base(normalized)
	if base == "." || base == "/" || base == "" {
		return "", fmt.Errorf("sanitization resulted in an empty filename")
	}

	// 3. Replace invalid filesystem characters
	cleaned := invalidCharsRegex.ReplaceAllString(base, "_")
	cleaned = strings.TrimSpace(cleaned)
	if cleaned == "" || cleaned == "." {
		return "", fmt.Errorf("sanitization resulted in an empty filename")
	}

	// 4. Check prohibited executable extensions
	ext := strings.ToLower(filepath.Ext(cleaned))
	if disallowedExtensions[ext] {
		return "", fmt.Errorf("Executable extension '%s' is prohibited", ext)
	}

	// 5. Windows reserved device names protection
	stem := strings.ToUpper(strings.TrimSuffix(cleaned, filepath.Ext(cleaned)))
	if reservedDeviceNames[stem] {
		cleaned = "safe_" + cleaned
	}

	return cleaned, nil
}

