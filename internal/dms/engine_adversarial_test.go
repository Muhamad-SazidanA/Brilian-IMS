package dms_test

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"testing"

	"github.com/company/brilian-dms/internal/dms"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestChecksumComparison_AdversarialStress tests chunk checksum validation logic
func TestChecksumComparison_AdversarialStress(t *testing.T) {
	engine := dms.NewEngine()
	userID := "usr-upl-1"
	chunkData := []byte("%PDF-1.7\nSample content for checksum adversarial verification.")

	// Compute real SHA-256
	h := sha256.Sum256(chunkData)
	lowerHash := hex.EncodeToString(h[:])
	upperHash := strings.ToUpper(lowerHash)

	// Interleave mixed case
	mixedRunes := []rune(lowerHash)
	for i := 0; i < len(mixedRunes); i += 2 {
		mixedRunes[i] = []rune(upperHash)[i]
	}
	mixedHash := string(mixedRunes)

	// 1. Lowercase hash should succeed
	t.Run("Valid lowercase SHA-256 hash passes", func(t *testing.T) {
		session, err := engine.InitUploadSession(userID, "doc_lower.pdf", int64(len(chunkData)), "application/pdf", "root", "Internal", "General")
		require.NoError(t, err)

		recv, total, pct, err := engine.ReceiveChunk(session.SessionID, 0, lowerHash, chunkData)
		assert.NoError(t, err)
		assert.Equal(t, 1, recv)
		assert.Equal(t, 1, total)
		assert.Equal(t, 100, pct)
	})

	// 2. Uppercase hash should succeed via strings.EqualFold
	t.Run("Valid uppercase SHA-256 hash passes via strings.EqualFold", func(t *testing.T) {
		session, err := engine.InitUploadSession(userID, "doc_upper.pdf", int64(len(chunkData)), "application/pdf", "root", "Internal", "General")
		require.NoError(t, err)

		recv, total, pct, err := engine.ReceiveChunk(session.SessionID, 0, upperHash, chunkData)
		assert.NoError(t, err)
		assert.Equal(t, 1, recv)
		assert.Equal(t, 1, total)
		assert.Equal(t, 100, pct)
	})

	// 3. Mixed-case hash should succeed via strings.EqualFold
	t.Run("Valid mixed-case SHA-256 hash passes via strings.EqualFold", func(t *testing.T) {
		session, err := engine.InitUploadSession(userID, "doc_mixed.pdf", int64(len(chunkData)), "application/pdf", "root", "Internal", "General")
		require.NoError(t, err)

		recv, total, pct, err := engine.ReceiveChunk(session.SessionID, 0, mixedHash, chunkData)
		assert.NoError(t, err)
		assert.Equal(t, 1, recv)
		assert.Equal(t, 1, total)
		assert.Equal(t, 100, pct)
	})

	// 4. Empty hash string skips hash verification (per contract: optional)
	t.Run("Empty hash string skips hash check", func(t *testing.T) {
		session, err := engine.InitUploadSession(userID, "doc_empty_hash.pdf", int64(len(chunkData)), "application/pdf", "root", "Internal", "General")
		require.NoError(t, err)

		recv, total, pct, err := engine.ReceiveChunk(session.SessionID, 0, "", chunkData)
		assert.NoError(t, err)
		assert.Equal(t, 1, recv)
		assert.Equal(t, 1, total)
		assert.Equal(t, 100, pct)
	})

	// 5. Corrupted hash: single character alteration must fail
	t.Run("Single character altered hash rejected", func(t *testing.T) {
		session, err := engine.InitUploadSession(userID, "doc_corrupt.pdf", int64(len(chunkData)), "application/pdf", "root", "Internal", "General")
		require.NoError(t, err)

		corrupted := []byte(lowerHash)
		if corrupted[0] == 'a' {
			corrupted[0] = 'b'
		} else {
			corrupted[0] = 'a'
		}

		_, _, _, err = engine.ReceiveChunk(session.SessionID, 0, string(corrupted), chunkData)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "Chunk checksum mismatch")
	})

	// 6. Truncated hash: shorter length must fail
	t.Run("Truncated hash (63 chars) rejected", func(t *testing.T) {
		session, err := engine.InitUploadSession(userID, "doc_trunc.pdf", int64(len(chunkData)), "application/pdf", "root", "Internal", "General")
		require.NoError(t, err)

		truncated := lowerHash[:63]
		_, _, _, err = engine.ReceiveChunk(session.SessionID, 0, truncated, chunkData)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "Chunk checksum mismatch")
	})

	// 7. Extended hash: longer length must fail
	t.Run("Extended hash (65 chars) rejected", func(t *testing.T) {
		session, err := engine.InitUploadSession(userID, "doc_ext.pdf", int64(len(chunkData)), "application/pdf", "root", "Internal", "General")
		require.NoError(t, err)

		extended := lowerHash + "0"
		_, _, _, err = engine.ReceiveChunk(session.SessionID, 0, extended, chunkData)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "Chunk checksum mismatch")
	})

	// 8. Hash with whitespace padding must fail (not trimmed)
	t.Run("Whitespace padded hash rejected", func(t *testing.T) {
		session, err := engine.InitUploadSession(userID, "doc_space.pdf", int64(len(chunkData)), "application/pdf", "root", "Internal", "General")
		require.NoError(t, err)

		padded := " " + lowerHash
		_, _, _, err = engine.ReceiveChunk(session.SessionID, 0, padded, chunkData)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "Chunk checksum mismatch")
	})

	// 9. Hash with non-hex characters must fail
	t.Run("Non-hex character hash rejected", func(t *testing.T) {
		session, err := engine.InitUploadSession(userID, "doc_nonhex.pdf", int64(len(chunkData)), "application/pdf", "root", "Internal", "General")
		require.NoError(t, err)

		nonHex := "zzzz" + lowerHash[4:]
		_, _, _, err = engine.ReceiveChunk(session.SessionID, 0, nonHex, chunkData)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "Chunk checksum mismatch")
	})

	// 10. Tampered data with correct hash must fail
	t.Run("Tampered data with original hash rejected", func(t *testing.T) {
		session, err := engine.InitUploadSession(userID, "doc_tampered.pdf", int64(len(chunkData)), "application/pdf", "root", "Internal", "General")
		require.NoError(t, err)

		tamperedData := append(chunkData, []byte("MALICIOUS INJECTION")...)
		_, _, _, err = engine.ReceiveChunk(session.SessionID, 0, lowerHash, tamperedData)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "Chunk checksum mismatch")
	})
}

// TestChunkAssembly_OutofOrder verifies chunks arriving in arbitrary order assemble sequentially
func TestChunkAssembly_OutofOrder(t *testing.T) {
	engine := dms.NewEngine()
	userID := "usr-upl-1"

	chunk0 := []byte("%PDF-1.7\nChunk 0: Header Section\n")
	chunk1 := []byte("Chunk 1: Document Metadata & Dictionary\n")
	chunk2 := []byte("Chunk 2: Page Stream Object Definition\n")
	chunk3 := []byte("Chunk 3: Cross Reference Table Data\n")
	chunk4 := []byte("Chunk 4: Trailer & EOF Marker %%EOF\n")

	allChunks := [][]byte{chunk0, chunk1, chunk2, chunk3, chunk4}
	totalSize := int64(5 * 5 * 1024 * 1024) // 5 chunks of 5MB capacity

	session, err := engine.InitUploadSession(userID, "out_of_order.pdf", totalSize, "application/pdf", "root", "Internal", "General")
	require.NoError(t, err)
	require.Equal(t, 5, session.TotalChunks)

	// Send chunks in random order: 3, 1, 4, 0, 2
	arrivalOrder := []int{3, 1, 4, 0, 2}
	for _, idx := range arrivalOrder {
		data := allChunks[idx]
		h := sha256.Sum256(data)
		chunkHash := hex.EncodeToString(h[:])

		_, _, _, err := engine.ReceiveChunk(session.SessionID, idx, chunkHash, data)
		require.NoError(t, err, fmt.Sprintf("Failed to receive chunk %d", idx))
	}

	doc, version, err := engine.CompleteUploadSession(session.SessionID)
	require.NoError(t, err)
	assert.Equal(t, 1, version)
	assert.Equal(t, "out_of_order.pdf", doc.Title)

	// Verify sequential assembly in output content
	expectedContent := append(chunk0, chunk1...)
	expectedContent = append(expectedContent, chunk2...)
	expectedContent = append(expectedContent, chunk3...)
	expectedContent = append(expectedContent, chunk4...)

	assert.Equal(t, expectedContent, doc.Content)
}

// TestMimeValidation_DetectMimeType verifies automatic content detection
func TestMimeValidation_DetectMimeType(t *testing.T) {
	testCases := []struct {
		name     string
		content  []byte
		expected string
	}{
		{"PDF header", []byte("%PDF-1.7 mock content"), "application/pdf"},
		{"PNG header", []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00}, "image/png"},
		{"JPEG header", []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10}, "image/jpeg"},
		{"GIF header", []byte("GIF89a mock gif stream"), "image/gif"},
		{"WebP header", append([]byte("RIFF1234WEBP"), []byte("VP8 ...")...), "image/webp"},
		{"MP4 header", []byte{0x00, 0x00, 0x00, 0x20, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'}, "video/mp4"},
		{"MP3 ID3 header", []byte("ID3 mock audio data"), "audio/mpeg"},
		{"WAV header", append([]byte("RIFF1234WAVE"), []byte("fmt ...")...), "audio/wav"},
		{"DOCX zip header", append([]byte{0x50, 0x4B, 0x03, 0x04}, []byte("...word/document.xml...")...), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
		{"XLSX zip header", append([]byte{0x50, 0x4B, 0x03, 0x04}, []byte("...xl/workbook.xml...")...), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
		{"Generic ZIP header", []byte{0x50, 0x4B, 0x03, 0x04, 0x14, 0x00}, "application/zip"},
		{"Plain text", []byte("Plain UTF-8 text without null bytes."), "text/plain"},
		{"Windows PE binary", []byte{0x4D, 0x5A, 0x90, 0x00}, "application/x-dosexec"},
		{"Linux ELF binary", []byte{0x7F, 'E', 'L', 'F', 0x02}, "application/x-executable"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			detected := dms.DetectMimeType(tc.content)
			assert.Equal(t, tc.expected, detected)
		})
	}
}
