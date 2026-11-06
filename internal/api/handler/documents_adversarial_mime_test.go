package handler_test

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/company/brilian-dms/internal/api/handler"
	"github.com/company/brilian-dms/internal/api/middleware"
	"github.com/company/brilian-dms/internal/dms"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// makeValidZipPayload constructs a binary slice with a compliant ZIP Local File Header
func makeValidZipPayload(internalPath string, compressedSize, uncompressedSize uint32) []byte {
	hdr := make([]byte, 30)
	hdr[0] = 0x50
	hdr[1] = 0x4B
	hdr[2] = 0x03
	hdr[3] = 0x04
	binary.LittleEndian.PutUint16(hdr[4:6], 20) // version needed
	binary.LittleEndian.PutUint16(hdr[6:8], 0)  // flags
	binary.LittleEndian.PutUint16(hdr[8:10], 8) // compression method (deflate)
	binary.LittleEndian.PutUint16(hdr[10:12], 0)
	binary.LittleEndian.PutUint16(hdr[12:14], 0)
	binary.LittleEndian.PutUint32(hdr[14:18], 0x12345678) // crc32
	binary.LittleEndian.PutUint32(hdr[18:22], compressedSize)
	binary.LittleEndian.PutUint32(hdr[22:26], uncompressedSize)
	binary.LittleEndian.PutUint16(hdr[26:28], uint16(len(internalPath)))
	binary.LittleEndian.PutUint16(hdr[28:30], 0) // extra field length

	payload := append(hdr, []byte(internalPath)...)
	payload = append(payload, bytes.Repeat([]byte{0x55}, int(compressedSize))...)
	return payload
}

// TestNonPdfUploads_AdversarialMimeVerification verifies that uploading non-PDF formats
// succeeds without false-positive MIME spoofing rejections, and that real spoofing is caught.
func TestNonPdfUploads_AdversarialMimeVerification(t *testing.T) {
	docHandler := handler.NewDocumentHandler()

	docxBytes := makeValidZipPayload("word/document.xml", 200, 500)
	xlsxBytes := makeValidZipPayload("xl/workbook.xml", 200, 500)
	zipBytes := makeValidZipPayload("archive/readme.txt", 150, 300)

	nonPdfTestFiles := []struct {
		name         string
		filename     string
		expectedMime string
		content      []byte
	}{
		{
			name:         "Valid DOCX upload",
			filename:     "contract_review.docx",
			expectedMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			content:      docxBytes,
		},
		{
			name:         "Valid XLSX upload",
			filename:     "financial_summary.xlsx",
			expectedMime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			content:      xlsxBytes,
		},
		{
			name:         "Valid PNG image upload",
			filename:     "company_logo.png",
			expectedMime: "image/png",
			content:      []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 'I', 'H', 'D', 'R'},
		},
		{
			name:         "Valid JPEG image upload",
			filename:     "id_photo.jpg",
			expectedMime: "image/jpeg",
			content:      []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00},
		},
		{
			name:         "Valid Plain Text upload",
			filename:     "meeting_notes.txt",
			expectedMime: "text/plain",
			content:      []byte("Catatan Rapat Tim Engineering Brilian IDMS Tanggal 6 November 2026."),
		},
		{
			name:         "Valid WebP image upload",
			filename:     "screenshot.webp",
			expectedMime: "image/webp",
			content:      append([]byte("RIFF1234WEBP"), []byte("VP8 chunk")...),
		},
		{
			name:         "Valid MP4 video upload",
			filename:     "tutorial.mp4",
			expectedMime: "video/mp4",
			content:      []byte{0x00, 0x00, 0x00, 0x18, 'f', 't', 'y', 'p', 'm', 'p', '4', '2'},
		},
		{
			name:         "Valid generic ZIP upload",
			filename:     "bundle.zip",
			expectedMime: "application/zip",
			content:      zipBytes,
		},
	}

	for _, tc := range nonPdfTestFiles {
		t.Run("Direct Multipart: "+tc.name, func(t *testing.T) {
			body := &bytes.Buffer{}
			writer := multipart.NewWriter(body)
			_ = writer.WriteField("title", tc.filename)
			_ = writer.WriteField("folder_id", "fld-nonpdf-test")
			_ = writer.WriteField("classification", "Internal")
			_ = writer.WriteField("division", "Engineering")

			part, err := writer.CreateFormFile("file", tc.filename)
			require.NoError(t, err)
			_, _ = part.Write(tc.content)
			_ = writer.Close()

			req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/documents/upload", body, middleware.RoleUploader, "usr-upl-1")
			req.Header.Set("Content-Type", writer.FormDataContentType())
			rec := httptest.NewRecorder()

			docHandler.Upload(rec, req)

			assert.Equal(t, http.StatusCreated, rec.Code, "Direct upload must succeed with 201 Created")

			var res map[string]any
			err = json.Unmarshal(rec.Body.Bytes(), &res)
			require.NoError(t, err)
			assert.Equal(t, "success", res["status"])

			docID, ok := res["document_id"].(string)
			require.True(t, ok)
			savedDoc, exists := docHandler.Engine().GetDocument(docID)
			require.True(t, exists)
			assert.Equal(t, tc.expectedMime, savedDoc.MimeType, "Dynamic MIME detection must detect %s", tc.expectedMime)
			assert.Equal(t, tc.content, savedDoc.Content)
		})
	}
}

// TestChunkedUpload_AdversarialMimeSpoofingAndHashCasing tests chunked resumable upload
// with case-insensitive SHA-256 chunk hashing and adversarial MIME spoofing rejection.
func TestChunkedUpload_AdversarialMimeSpoofingAndHashCasing(t *testing.T) {
	engine := dms.NewEngine()
	uploadHandler := handler.NewUploadHandler(engine)
	userID := "usr-upl-1"

	// 1. Chunk upload with uppercase & mixed-case SHA-256 hash must succeed
	t.Run("Chunk hash casing resilience (strings.EqualFold)", func(t *testing.T) {
		chunkData := []byte("Chunk content for checksum testing.")
		h := sha256.Sum256(chunkData)
		upperHash := strings.ToUpper(hex.EncodeToString(h[:]))

		session, err := engine.InitUploadSession(userID, "hash_casing.txt", int64(len(chunkData)), "text/plain", "root", "Internal", "Engineering")
		require.NoError(t, err)

		reqBody := map[string]any{
			"session_id":  session.SessionID,
			"chunk_index": 0,
			"chunk_hash":  upperHash,
			"file":        string(chunkData),
		}
		jsonBytes, _ := json.Marshal(reqBody)

		req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/documents/upload/chunk", bytes.NewReader(jsonBytes), middleware.RoleUploader, userID)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		uploadHandler.Chunk(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code, "Uppercase SHA-256 chunk hash must be accepted")
	})

	// 2. Adversarial MIME spoofing: claimed PDF but containing PNG bytes must be rejected
	t.Run("Spoofed MIME: Claimed PDF containing PNG bytes rejected on complete", func(t *testing.T) {
		pngBytes := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00}
		session, err := engine.InitUploadSession(userID, "fake_invoice.pdf", int64(len(pngBytes)), "application/pdf", "root", "Internal", "Engineering")
		require.NoError(t, err)

		// Upload chunk
		_, _, _, err = engine.ReceiveChunk(session.SessionID, 0, "", pngBytes)
		require.NoError(t, err)

		// Complete upload request
		compBody := map[string]string{"session_id": session.SessionID}
		jsonBytes, _ := json.Marshal(compBody)

		req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/documents/upload/complete", bytes.NewReader(jsonBytes), middleware.RoleUploader, userID)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		uploadHandler.Complete(rec, req)
		assert.Equal(t, http.StatusUnsupportedMediaType, rec.Code, "MIME spoofing must be rejected with 415 Unsupported Media Type")
		assert.Contains(t, rec.Body.String(), "MIME spoofing detected")
	})

	// 3. Adversarial MIME spoofing: claimed DOCX containing DOS MZ executable rejected
	t.Run("Spoofed MIME: Claimed DOCX containing PE executable rejected on complete", func(t *testing.T) {
		peBytes := []byte{0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00}
		session, err := engine.InitUploadSession(userID, "contract.docx", int64(len(peBytes)), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "root", "Internal", "Engineering")
		require.NoError(t, err)

		_, _, _, err = engine.ReceiveChunk(session.SessionID, 0, "", peBytes)
		require.NoError(t, err)

		compBody := map[string]string{"session_id": session.SessionID}
		jsonBytes, _ := json.Marshal(compBody)

		req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/documents/upload/complete", bytes.NewReader(jsonBytes), middleware.RoleUploader, userID)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		uploadHandler.Complete(rec, req)
		assert.Equal(t, http.StatusUnsupportedMediaType, rec.Code, "Executable disguised as DOCX must be rejected with 415")
		assert.Contains(t, rec.Body.String(), "MIME spoofing detected")
	})

	// 4. Legitimate chunked DOCX upload must complete with 201 Created
	t.Run("Legitimate chunked DOCX upload completes with 201", func(t *testing.T) {
		docxBytes := makeValidZipPayload("word/document.xml", 200, 500)
		session, err := engine.InitUploadSession(userID, "real_contract.docx", int64(len(docxBytes)), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "root", "Internal", "Engineering")
		require.NoError(t, err)

		_, _, _, err = engine.ReceiveChunk(session.SessionID, 0, "", docxBytes)
		require.NoError(t, err)

		compBody := map[string]string{"session_id": session.SessionID}
		jsonBytes, _ := json.Marshal(compBody)

		req := createAuthenticatedContextRequest(http.MethodPost, "/api/v1/documents/upload/complete", bytes.NewReader(jsonBytes), middleware.RoleUploader, userID)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		uploadHandler.Complete(rec, req)
		assert.Equal(t, http.StatusCreated, rec.Code, "Valid chunked DOCX must complete with 201 Created")
		assert.Contains(t, rec.Body.String(), "real_contract.docx")
	})
}
