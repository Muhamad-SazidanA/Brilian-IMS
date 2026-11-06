package handler

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
)

// Response represents a standard JSON API response structure
type Response struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}

// WriteJSON writes a JSON payload with standard status code and Content-Type header
func WriteJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// WriteError writes a structured JSON error response
func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]any{
		"status":  "error",
		"message": message,
	})
}

// GenerateUUID generates an RFC 4122 compliant UUID v4 string using crypto/rand
func GenerateUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40 // Version 4
	b[8] = (b[8] & 0x3f) | 0x80 // Variant 10
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
