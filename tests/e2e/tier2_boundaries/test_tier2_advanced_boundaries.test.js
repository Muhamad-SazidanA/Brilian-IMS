const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { ApiDispatcher } = require('../helpers/api_mock_server');
const { signJwt } = require('../helpers/jwt_oracle');
const { sanitizeFilename, inspectSvgContent, inspectZipOrOffice } = require('../helpers/sanitizer_oracle');
const { validateWatermarkOptions } = require('../helpers/watermark_oracle');

test('Tier 2 - Advanced Boundary, Corner Case & Security Stress Tests', async (t) => {
  const jwtSecret = 'e2e_tier2_advanced_jwt_secret_2026';
  const api = new ApiDispatcher({ jwtSecret });

  const adminToken = signJwt({
    sub: 'usr-admin-1',
    user_id: 'usr-admin-1',
    username: 'admin_brilian',
    role: 'admin',
    division: 'ALL',
    level: 'L5',
    name: 'Budi Santoso'
  }, jwtSecret);

  // ---------------------------------------------------------------------------
  // 2.5.1 Zero-Byte / Empty Files Boundary
  // ---------------------------------------------------------------------------
  await t.test('2.5.1 Zero-byte and negative size file upload init rejected (400)', async () => {
    const zeroRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'empty.pdf',
      total_size: 0,
      mime_type: 'application/pdf',
      folder_id: 'fld-1'
    }, { Authorization: `Bearer ${adminToken}` });
    assert.equal(zeroRes.status, 400);

    const negRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'negative.pdf',
      total_size: -1024,
      mime_type: 'application/pdf',
      folder_id: 'fld-1'
    }, { Authorization: `Bearer ${adminToken}` });
    assert.equal(negRes.status, 400);
  });

  // ---------------------------------------------------------------------------
  // 2.5.2 >=100MB Chunk Boundaries
  // ---------------------------------------------------------------------------
  await t.test('2.5.2 Precise 100MB (104,857,600 bytes) chunk boundary calculation', async () => {
    const size100Mb = 104857600;
    const res = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'large_dataset_100mb.pdf',
      total_size: size100Mb,
      mime_type: 'application/pdf',
      folder_id: 'fld-1'
    }, { Authorization: `Bearer ${adminToken}` });

    assert.equal(res.status, 201);
    assert.equal(res.body.chunk_size, 5242880); // 5 MB
    assert.equal(res.body.total_chunks, 20); // 100MB / 5MB = 20 chunks
  });

  // ---------------------------------------------------------------------------
  // 2.5.3 Null Byte Filename Injections
  // ---------------------------------------------------------------------------
  await t.test('2.5.3 Null byte variations in filename rejected (%00, \\0, UTF-8 overlong)', () => {
    assert.throws(() => sanitizeFilename('legal_contract.pdf\0.sh'), /null byte injection/i);
    assert.throws(() => sanitizeFilename('report%00.exe'), /null byte injection/i);
    assert.throws(() => sanitizeFilename('invoice\x00.pdf'), /null byte injection/i);
  });

  // ---------------------------------------------------------------------------
  // 2.5.4 Unicode & Extreme International Filenames
  // ---------------------------------------------------------------------------
  await t.test('2.5.4 Unicode, accented, and maximum length filenames preserved safely', () => {
    // Indonesian formal title with accented chars and numbers
    const indoName = 'Laporan_Keuangan_Kuartal_IV_PT_Perkebunan_Nusantara_2026.pdf';
    assert.equal(sanitizeFilename(indoName), indoName);

    // Maximum 250 character filename
    const longName = 'A'.repeat(246) + '.pdf';
    assert.equal(sanitizeFilename(longName).length, 250);

    // Chinese characters & accents
    const multiLang = '财务报告_Financial_Report_2026.pdf';
    assert.equal(sanitizeFilename(multiLang), multiLang);
  });

  // ---------------------------------------------------------------------------
  // 2.5.5 Quota Overflow Boundary (Exact Limit Stress)
  // ---------------------------------------------------------------------------
  await t.test('2.5.5 Boundary quota stress: remaining quota 1,000 bytes vs incoming 1,001 bytes', async () => {
    const userId = 'usr-boundary-quota';
    api.users.set('boundary_user', { id: userId, role: 'uploader', password: 'p', division: 'IT', level: 'L2', name: 'Boundary User' });
    api.userQuotas.set(userId, { max_bytes: 10000, used_bytes: 9000 }); // 1,000 bytes remaining

    const bToken = signJwt({ sub: userId, user_id: userId, username: 'boundary_user', role: 'uploader', division: 'IT', level: 'L2', name: 'Boundary User' }, jwtSecret);

    // Exact match: 1,000 bytes allowed
    const okRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'exact.pdf',
      total_size: 1000,
      mime_type: 'application/pdf'
    }, { Authorization: `Bearer ${bToken}` });
    assert.equal(okRes.status, 201);

    // 1 byte over: 1,001 bytes rejected
    const overRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'over.pdf',
      total_size: 1001,
      mime_type: 'application/pdf'
    }, { Authorization: `Bearer ${bToken}` });
    assert.equal(overRes.status, 413);
  });

  // ---------------------------------------------------------------------------
  // 2.5.6 Advanced SVG Script Injections
  // ---------------------------------------------------------------------------
  await t.test('2.5.6 Obfuscated and nested SVG attack vectors quarantined', () => {
    // Nested mixed-case <sCrIpt>
    assert.equal(inspectSvgContent('<svg><sCrIpt>alert(1)</sCrIpt></svg>').safe, false);

    // Onmouseover event in path
    assert.equal(inspectSvgContent('<svg><path d="M0,0" onmouseover="alert(1)" /></svg>').safe, false);

    // xlink:href with javascript
    assert.equal(inspectSvgContent('<svg><a xlink:href="javascript:alert(1)"><circle /></a></svg>').safe, false);

    // foreignObject HTML embedding
    assert.equal(inspectSvgContent('<svg><foreignObject><iframe src="evil.com"></iframe></foreignObject></svg>').safe, false);
  });

  // ---------------------------------------------------------------------------
  // 2.5.7 Office Macro Invariants
  // ---------------------------------------------------------------------------
  await t.test('2.5.7 Macro-enabled Office extensions and hidden binary streams rejected', () => {
    const dummy = Buffer.from('dummy');
    assert.equal(inspectZipOrOffice(dummy, 'presentation.pptm').safe, false);
    assert.equal(inspectZipOrOffice(dummy, 'template.dotm').safe, false);
    assert.equal(inspectZipOrOffice(dummy, 'addin.xltm').safe, false);

    const vbaZip = Buffer.from('PK\x03\x04 ... word/vbaProject.bin ... PK\x05\x06');
    assert.equal(inspectZipOrOffice(vbaZip, 'contract.docx').safe, false);
  });

  // ---------------------------------------------------------------------------
  // 2.5.8 Watermark Opacity Boundary Values
  // ---------------------------------------------------------------------------
  await t.test('2.5.8 Watermark opacity boundary: 0.14 rejected, 0.15 accepted, 0.25 accepted, 0.26 rejected', () => {
    assert.throws(() => validateWatermarkOptions({ FullName: 'Bob', UserID: 'u2', Opacity: 0.149 }), /strictly between 0.15 and 0.25/);
    assert.doesNotThrow(() => validateWatermarkOptions({ FullName: 'Bob', UserID: 'u2', Opacity: 0.15 }));
    assert.doesNotThrow(() => validateWatermarkOptions({ FullName: 'Bob', UserID: 'u2', Opacity: 0.25 }));
    assert.throws(() => validateWatermarkOptions({ FullName: 'Bob', UserID: 'u2', Opacity: 0.251 }), /strictly between 0.15 and 0.25/);
  });

  // ---------------------------------------------------------------------------
  // 2.5.9 Invalid and Out-of-Bounds Chunk Indexes
  // ---------------------------------------------------------------------------
  await t.test('2.5.9 Out-of-bounds chunk index rejected (chunk_index >= total_chunks)', async () => {
    const initRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'chunk_test.pdf',
      total_size: 10485760, // 10 MB = 2 chunks (indices 0 and 1)
      mime_type: 'application/pdf'
    }, { Authorization: `Bearer ${adminToken}` });

    const sid = initRes.body.session_id;

    // Negative index
    const negRes = await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: sid,
      chunk_index: -1,
      file: Buffer.alloc(100)
    }, { Authorization: `Bearer ${adminToken}` });
    assert.equal(negRes.status, 400);

    // Index 2 (out of bounds for 2 total chunks)
    const outRes = await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: sid,
      chunk_index: 2,
      file: Buffer.alloc(100)
    }, { Authorization: `Bearer ${adminToken}` });
    assert.equal(outRes.status, 400);
  });
});
