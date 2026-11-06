package engine_test

import (
	"testing"

	"github.com/company/brilian-dms/internal/engine"
	"github.com/stretchr/testify/assert"
)

func TestClassifyDocument_StandardCategories(t *testing.T) {
	contractDoc := "SURAT PERJANJIAN KERJASAMA PENGADAAN PERANGKAT LUNAK ANTARA PIHAK PERTAMA DAN PIHAK KEDUA PASAL 1"
	res := engine.ClassifyDocument(contractDoc, "kontrak.pdf")
	assert.Equal(t, "Surat Perjanjian", res.DocType)
	assert.True(t, res.Confidence >= 0.80)

	invoiceDoc := "INVOICE TAGIHAN PEMBAYARAN JATUH TEMPO TOTAL PEMBAYARAN REKENING BANK MANDIRI"
	res = engine.ClassifyDocument(invoiceDoc, "inv-001.pdf")
	assert.Equal(t, "Invoice / Tagihan", res.DocType)
	assert.True(t, res.Confidence >= 0.80)

	skDoc := "SURAT KEPUTUSAN DIREKSI MEMUTUSKAN DAN MENETAPKAN STRUKTUR ORGANISASI"
	res = engine.ClassifyDocument(skDoc, "sk.pdf")
	assert.Equal(t, "Surat Keputusan", res.DocType)
	assert.True(t, res.Confidence >= 0.80)

	sopDoc := "STANDAR OPERASIONAL PROSEDUR PENYIMPANAN DOKUMEN DIGITAL RUANG LINGKUP SOP"
	res = engine.ClassifyDocument(sopDoc, "sop.pdf")
	assert.Equal(t, "SOP / Pedoman", res.DocType)
	assert.True(t, res.Confidence >= 0.80)

	financialDoc := "LAPORAN KEUANGAN TAHUNAN NERACA LABA RUGI DAN ARUS KAS"
	res = engine.ClassifyDocument(financialDoc, "laporan.pdf")
	assert.Equal(t, "Laporan Keuangan", res.DocType)
	assert.True(t, res.Confidence >= 0.80)

	hrDoc := "FORMULIR PENGAJUAN CUTI TAHUNAN KARYAWAN SLIP GAJI"
	res = engine.ClassifyDocument(hrDoc, "cuti.pdf")
	assert.Equal(t, "Formulir HR", res.DocType)
	assert.True(t, res.Confidence >= 0.80)
}

func TestClassifyDocument_FallbackGeneral(t *testing.T) {
	unrelatedDoc := "Halo dunia ini teks biasa tanpa kata kunci spesifik dokumen hukum atau finansial."
	res := engine.ClassifyDocument(unrelatedDoc, "catatan.txt")
	assert.Equal(t, "Dokumen Umum", res.DocType)
	assert.Equal(t, 0.20, res.Confidence)
}
