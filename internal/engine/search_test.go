package engine_test

import (
	"strings"
	"testing"

	"github.com/company/brilian-dms/internal/engine"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)


func TestSearchEngine_IndexingAndQuery(t *testing.T) {
	se := engine.NewSearchEngine()

	se.IndexDocument(engine.DocumentIndexItem{
		DocID:          "doc-1",
		Title:          "Perjanjian Pengadaan Server",
		Content:        "Ketentuan pembayaran dilakukan bertahap selama 30 hari kalender dengan denda 2%.",
		FolderID:       "fld-1",
		Division:       "Legal",
		Classification: "Internal",
		DocType:        "Surat Perjanjian",
	})

	se.IndexDocument(engine.DocumentIndexItem{
		DocID:          "doc-2",
		Title:          "Laporan Keuangan Tahunan",
		Content:        "Neraca laba rugi konsolidasi menunjukkan margin operasional positif.",
		FolderID:       "fld-2",
		Division:       "Finance",
		Classification: "Rahasia",
		DocType:        "Laporan Keuangan",
	})

	// 1. Search for keyword "server"
	res1 := se.Search("server", engine.SearchFilter{})
	require.NotEmpty(t, res1)
	assert.Equal(t, "doc-1", res1[0].DocID)
	assert.Contains(t, strings.ToLower(res1[0].Snippet), "<mark>server</mark>")

	// 2. Search for keyword "neraca"
	res2 := se.Search("neraca", engine.SearchFilter{})
	require.NotEmpty(t, res2)
	assert.Equal(t, "doc-2", res2[0].DocID)

	// 3. Search with filter matching
	resFiltered := se.Search("pembayaran", engine.SearchFilter{
		Division: "Legal",
	})
	require.NotEmpty(t, resFiltered)
	assert.Equal(t, "doc-1", resFiltered[0].DocID)

	// 4. Search with filter excluding
	resFilteredOut := se.Search("pembayaran", engine.SearchFilter{
		Division: "Finance",
	})
	assert.Empty(t, resFilteredOut)
}

func TestSearchEngine_RemoveDocument(t *testing.T) {
	se := engine.NewSearchEngine()
	se.IndexDocument(engine.DocumentIndexItem{
		DocID:   "doc-temp",
		Title:   "Temporary Memo",
		Content: "Ini dokumen sementara untuk dihapus dari indeks.",
	})

	assert.NotEmpty(t, se.Search("sementara", engine.SearchFilter{}))

	se.RemoveDocument("doc-temp")
	assert.Empty(t, se.Search("sementara", engine.SearchFilter{}))
}
