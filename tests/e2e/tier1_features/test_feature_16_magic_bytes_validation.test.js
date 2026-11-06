const test = require('node:test');
const assert = require('node:assert/strict');
const { validateMagicBytes, detectMimeType } = require('../helpers/magic_bytes_oracle');

test('Tier 1 - Feature 16: Content-Based File Validation via Magic Bytes', async (t) => {
  await t.test('16.1 Valid PDF with %PDF- header accepted', () => {
    const validPdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj');
    const res = validateMagicBytes(validPdf, 'application/pdf');
    assert.equal(res.valid, true);
    assert.equal(res.detected, 'application/pdf');
  });

  await t.test('16.2 Executable PE binary spoofed as PDF rejected (MIME spoofing detection)', () => {
    // Windows PE executable starts with "MZ" (0x4D, 0x5A)
    const spoofedPdf = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const res = validateMagicBytes(spoofedPdf, 'application/pdf');
    assert.equal(res.valid, false);
    assert.match(res.error, /MIME spoofing detected/i);
  });

  await t.test('16.3 Image magic bytes validation (PNG, JPEG, GIF, WebP)', () => {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
    assert.equal(validateMagicBytes(png, 'image/png').valid, true);

    // JPEG: FF D8 FF
    const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    assert.equal(validateMagicBytes(jpeg, 'image/jpeg').valid, true);

    // GIF: GIF89a
    const gif = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00');
    assert.equal(validateMagicBytes(gif, 'image/gif').valid, true);

    // WebP: RIFF....WEBP
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
    assert.equal(validateMagicBytes(webp, 'image/webp').valid, true);
  });

  await t.test('16.4 Media magic bytes validation (MP4, MP3, WAV)', () => {
    // MP4: offset 4 contains 'ftyp'
    const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom')]);
    assert.equal(validateMagicBytes(mp4, 'video/mp4').valid, true);

    // MP3: ID3 header
    const mp3 = Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00');
    assert.equal(validateMagicBytes(mp3, 'audio/mpeg').valid, true);

    // WAV: RIFF....WAVE
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')]);
    assert.equal(validateMagicBytes(wav, 'audio/wav').valid, true);
  });

  await t.test('16.5 OpenXML Office files validation (DOCX, XLSX, PPTX)', () => {
    // DOCX: PK\x03\x04 with word/
    const docx = Buffer.concat([Buffer.from([0x50, 0x4B, 0x03, 0x04]), Buffer.from('dummy_data_word/document.xml')]);
    assert.equal(validateMagicBytes(docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document').valid, true);

    // XLSX: PK\x03\x04 with xl/
    const xlsx = Buffer.concat([Buffer.from([0x50, 0x4B, 0x03, 0x04]), Buffer.from('dummy_data_xl/workbook.xml')]);
    assert.equal(validateMagicBytes(xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').valid, true);

    // PPTX: PK\x03\x04 with ppt/
    const pptx = Buffer.concat([Buffer.from([0x50, 0x4B, 0x03, 0x04]), Buffer.from('dummy_data_ppt/presentation.xml')]);
    assert.equal(validateMagicBytes(pptx, 'application/vnd.openxmlformats-officedocument.presentationml.presentation').valid, true);
  });

  await t.test('16.6 Plain text UTF-8 accepted, null-byte binary rejected', () => {
    const validText = Buffer.from('Dokumen laporan internal tahun 2026.', 'utf8');
    assert.equal(validateMagicBytes(validText, 'text/plain').valid, true);

    const binaryWithNull = Buffer.from('text\x00binary\x00data');
    assert.equal(detectMimeType(binaryWithNull), 'application/octet-stream');
  });
});
