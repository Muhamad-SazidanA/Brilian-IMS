package ai_test

import (
	"context"
	"testing"

	"github.com/company/brilian-dms/internal/ai"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSummarizer_DeterministicFallback(t *testing.T) {
	s := ai.NewSummarizer()

	docText := `SURAT PERJANJIAN KERJASAMA PENGADAAN PERANGKAT LUNAK
Nomor Kontrak: SPK/2026/VND-992
Tanggal Efektif: 06/11/2026
Nilai Kontrak: Rp 1.850.000.000
Denda Keterlambatan: 1.5% per bulan takwim
PASAL 1: Ketentuan Umum Pengadaan Server
PASAL 2: Tata Cara Pembayaran Dilakukan 30 Hari Kerja
PASAL 3: Ketentuan Denda dan Garansi`

	res, err := s.Summarize(context.Background(), ai.SummarizeRequest{
		DocumentID: "doc-test-1",
		Text:       docText,
		MaxTokens:  300,
	})

	require.NoError(t, err)
	assert.Equal(t, "success", res.Status)
	assert.Contains(t, res.Summary, "Surat Perjanjian")
	assert.Contains(t, res.Summary, "SPK/2026/VND-992")
	assert.Contains(t, res.Summary, "Rp 1.850.000.000")
	assert.True(t, res.TokenCount > 0)
	assert.True(t, res.TokenCount <= 300)
}

func TestSummarizer_EmptyTextError(t *testing.T) {
	s := ai.NewSummarizer()

	_, err := s.Summarize(context.Background(), ai.SummarizeRequest{
		DocumentID: "empty-doc",
		Text:       "",
	})

	assert.Error(t, err)
}
