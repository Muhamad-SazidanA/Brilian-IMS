package engine_test

import (
	"testing"

	"github.com/company/brilian-dms/internal/engine"
	"github.com/stretchr/testify/assert"
)

func TestExtractMetadata_Dates(t *testing.T) {
	text := "Surat ditandatangani pada 17-08-1945 di Jakarta, berlaku hingga 31/12/2026. Revisi ISO 2026-11-06 dan rapat 24 Agustus 2026."
	data := engine.ExtractMetadata(text)

	assert.Contains(t, data.Dates, "17-08-1945")
	assert.Contains(t, data.Dates, "31/12/2026")
	assert.Contains(t, data.Dates, "2026-11-06")
	assert.Contains(t, data.Dates, "24 Agustus 2026")
}

func TestExtractMetadata_CurrenciesAndPercentages(t *testing.T) {
	text := "Nomor Kontrak: SPK/2026/LEG-089. Total pembayaran denda Rp 2.500.000 dengan bunga 1.5% atau IDR 10.000.000 dan USD $120,000.00."
	data := engine.ExtractMetadata(text)

	assert.True(t, len(data.Currencies) >= 2)
	assert.True(t, func() bool {
		for _, c := range data.Currencies {
			if assert.ObjectsAreEqual(c, "Rp 2.500.000") || assert.ObjectsAreEqual(c, "IDR 10.000.000") {
				return true
			}
		}
		return false
	}())

	assert.Contains(t, data.Percentages, "1.5%")
	assert.True(t, func() bool {
		for _, id := range data.Identifiers {
			if id == "SPK/2026/LEG-089" || id == "Nomor: SPK/2026/LEG-089" {
				return true
			}
		}
		return false
	}())
}

func TestExtractMetadata_IdentifiersNPWP_NIK_UUID(t *testing.T) {
	text := "Dokumen NPWP: 01.234.567.8-901.000, NIK: 3171012304950001, referensi id c56a4180-65aa-42ec-a945-5fd21dec0538."
	data := engine.ExtractMetadata(text)

	assert.Contains(t, data.Identifiers, "01.234.567.8-901.000")
	assert.Contains(t, data.Identifiers, "c56a4180-65aa-42ec-a945-5fd21dec0538")
}

func TestExtractMetadata_EmptyAndEdgeCases(t *testing.T) {
	emptyData := engine.ExtractMetadata("")
	assert.Empty(t, emptyData.Dates)
	assert.Empty(t, emptyData.Currencies)
	assert.Empty(t, emptyData.Percentages)
	assert.Empty(t, emptyData.Identifiers)

	whitespaceData := engine.ExtractMetadata("   \n\t  ")
	assert.Empty(t, whitespaceData.Dates)
}
