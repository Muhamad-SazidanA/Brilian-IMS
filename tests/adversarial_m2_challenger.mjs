import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const req = createRequire(import.meta.url);

const { ApiDispatcher } = req('./e2e/helpers/api_mock_server');
const { signJwt } = req('./e2e/helpers/jwt_oracle');
const { validateMagicBytes, detectMimeType, SIGNATURES } = req('./e2e/helpers/magic_bytes_oracle');
const { sanitizeFilename, inspectSvgContent, inspectZipOrOffice } = req('./e2e/helpers/sanitizer_oracle');

async function runChallengerM2Harness() {
  console.log('===============================================================');
  console.log('   Empirical Challenger Harness: Milestone 2 Adversarial Run  ');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;
  const failureList = [];

  function check(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✔ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✖ [FAIL] ${name}: ${err.message}`);
      failureList.push({ name, err: err.message });
    }
  }

  async function checkAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✔ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✖ [FAIL] ${name}: ${err.message}`);
      failureList.push({ name, err: err.message });
    }
  }

  const jwtSecret = 'challenger_m2_empirical_jwt_secret_2026';
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

  const uploaderToken = signJwt({
    sub: 'usr-upl-1',
    user_id: 'usr-upl-1',
    username: 'uploader_1',
    role: 'uploader',
    division: 'Operations',
    level: 'L2',
    name: 'Ahmad Fauzi'
  }, jwtSecret);

  const viewerToken = signJwt({
    sub: 'usr-viw-1',
    user_id: 'usr-viw-1',
    username: 'viewer_1',
    role: 'viewer',
    division: 'Finance',
    level: 'L2',
    name: 'Rina Wijaya'
  }, jwtSecret);

  // =========================================================================
  // 1. Chunked Upload Logic, Offsets, Boundary & SHA-256 Validation
  // =========================================================================
  console.log('--- Domain 1: Chunked Upload Logic & Boundary Stress ---');

  await checkAsync('1.1 100MB chunk boundary: 104,857,600 bytes = exactly 20 chunks of 5,242,880 bytes', async () => {
    const totalBytes = 104857600; // 100 MB
    const res = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'annual_audit_100mb.pdf',
      total_size: totalBytes,
      mime_type: 'application/pdf'
    }, { Authorization: `Bearer ${uploaderToken}` });

    assert.equal(res.status, 201);
    assert.equal(res.body.chunk_size, 5242880);
    assert.equal(res.body.total_chunks, 20);
    assert.ok(res.body.session_id);
  });

  await checkAsync('1.2 100MB + 1 byte: 104,857,601 bytes = exactly 21 chunks', async () => {
    const totalBytes = 104857601; // 100MB + 1
    const res = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'overflow_100mb.pdf',
      total_size: totalBytes,
      mime_type: 'application/pdf'
    }, { Authorization: `Bearer ${uploaderToken}` });

    assert.equal(res.status, 201);
    assert.equal(res.body.total_chunks, 21);
  });

  await checkAsync('1.3 Empty file (0 bytes) and negative sizes rejected (400)', async () => {
    const zeroRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'empty.pdf',
      total_size: 0,
      mime_type: 'application/pdf'
    }, { Authorization: `Bearer ${uploaderToken}` });
    assert.equal(zeroRes.status, 400);

    const negRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'neg.pdf',
      total_size: -100,
      mime_type: 'application/pdf'
    }, { Authorization: `Bearer ${uploaderToken}` });
    assert.equal(negRes.status, 400);
  });

  await checkAsync('1.4 Chunk index bounds: chunk_index < 0 or >= total_chunks rejected with 400', async () => {
    const initRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'chunk_bounds.pdf',
      total_size: 10485760, // 10MB = 2 chunks (indices 0, 1)
      mime_type: 'application/pdf'
    }, { Authorization: `Bearer ${uploaderToken}` });
    const sid = initRes.body.session_id;

    const negRes = await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: sid,
      chunk_index: -1,
      file: Buffer.alloc(100)
    }, { Authorization: `Bearer ${uploaderToken}` });
    assert.equal(negRes.status, 400);

    const overRes = await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: sid,
      chunk_index: 2,
      file: Buffer.alloc(100)
    }, { Authorization: `Bearer ${uploaderToken}` });
    assert.equal(overRes.status, 400);
  });

  await checkAsync('1.5 Out-of-order chunk upload: chunks arriving 2, 0, 1 assembled strictly in sequential order (0, 1, 2)', async () => {
    const part0 = Buffer.from('%PDF-1.7\nChunk 0: Header Section\n');
    const part1 = Buffer.from('Chunk 1: Middle Body Content Section\n');
    const part2 = Buffer.from('Chunk 2: Footer & Trailer %%EOF\n');

    const initRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'out_of_order_doc.pdf',
      total_size: 15728640, // 3 chunks
      mime_type: 'application/pdf'
    }, { Authorization: `Bearer ${uploaderToken}` });
    const sid = initRes.body.session_id;

    // Send chunk 2
    const res2 = await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: sid,
      chunk_index: 2,
      file: part2
    }, { Authorization: `Bearer ${uploaderToken}` });
    assert.equal(res2.status, 200);

    // Send chunk 0
    const res0 = await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: sid,
      chunk_index: 0,
      file: part0
    }, { Authorization: `Bearer ${uploaderToken}` });
    assert.equal(res0.status, 200);

    // Status shows 2 chunks received
    const statusRes = await api.handleRequest('GET', `/api/v1/documents/upload/status/${sid}`, {}, {
      Authorization: `Bearer ${uploaderToken}`
    });
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.percent, 67);

    // Send chunk 1
    const res1 = await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: sid,
      chunk_index: 1,
      file: part1
    }, { Authorization: `Bearer ${uploaderToken}` });
    assert.equal(res1.status, 200);

    // Complete upload
    const compRes = await api.handleRequest('POST', '/api/v1/documents/upload/complete', {
      session_id: sid
    }, { Authorization: `Bearer ${uploaderToken}` });
    assert.equal(compRes.status, 201);

    // Check assembled content order in document store
    const doc = api.documents.get(compRes.body.document_id);
    assert.ok(doc);
    const expected = Buffer.concat([part0, part1, part2]);
    assert.deepEqual(doc.content, expected);
  });

  await checkAsync('1.6 SHA-256 chunk integrity: matches pass, altered chunk fails checksum (400)', async () => {
    const data = Buffer.from('%PDF-1.7\nReal untampered content');
    const realHash = crypto.createHash('sha256').update(data).digest('hex').toLowerCase();
    const fakeHash = '0000000000000000000000000000000000000000000000000000000000000000';

    const initRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'sha256_check.pdf',
      total_size: 5242880,
      mime_type: 'application/pdf'
    }, { Authorization: `Bearer ${uploaderToken}` });
    const sid = initRes.body.session_id;

    // Tampered checksum
    const failRes = await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: sid,
      chunk_index: 0,
      chunk_hash: fakeHash,
      file: data
    }, { Authorization: `Bearer ${uploaderToken}` });
    assert.equal(failRes.status, 400);
    assert.match(failRes.body.message, /checksum mismatch/i);

    // Correct checksum
    const passRes = await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: sid,
      chunk_index: 0,
      chunk_hash: realHash,
      file: data
    }, { Authorization: `Bearer ${uploaderToken}` });
    assert.equal(passRes.status, 200);
  });

  await checkAsync('1.7 Session isolation: foreign user cannot inject chunks into session (403)', async () => {
    const initRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'hr_payroll.pdf',
      total_size: 5242880,
      mime_type: 'application/pdf'
    }, { Authorization: `Bearer ${uploaderToken}` });
    const sid = initRes.body.session_id;

    const hijackRes = await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: sid,
      chunk_index: 0,
      file: Buffer.from('%PDF-1.7\nInjected')
    }, { Authorization: `Bearer ${viewerToken}` });

    assert.equal(hijackRes.status, 403);
    assert.match(hijackRes.body.message, /unauthorized session owner/i);
  });

  await checkAsync('1.8 Premature complete call on incomplete session rejected (400)', async () => {
    const initRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'unfinished.pdf',
      total_size: 15728640, // 3 chunks
      mime_type: 'application/pdf'
    }, { Authorization: `Bearer ${uploaderToken}` });
    const sid = initRes.body.session_id;

    // Only upload chunk 0
    await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: sid,
      chunk_index: 0,
      file: Buffer.from('%PDF-1.7\n')
    }, { Authorization: `Bearer ${uploaderToken}` });

    const compRes = await api.handleRequest('POST', '/api/v1/documents/upload/complete', {
      session_id: sid
    }, { Authorization: `Bearer ${uploaderToken}` });

    assert.equal(compRes.status, 400);
    assert.match(compRes.body.message, /Incomplete upload/i);
  });

  await checkAsync('1.9 Quota boundary: exact remaining quota accepted, 1 byte overflow rejected with 413', async () => {
    const qUserId = 'usr-quota-stress-1';
    api.users.set('q_stress_user', { id: qUserId, role: 'uploader', password: 'p', division: 'Legal', level: 'L2', name: 'Quota Stress' });
    api.userQuotas.set(qUserId, { max_bytes: 20000, used_bytes: 15000 }); // 5,000 bytes available
    const qToken = signJwt({ sub: qUserId, user_id: qUserId, username: 'q_stress_user', role: 'uploader', division: 'Legal', level: 'L2', name: 'Quota Stress' }, jwtSecret);

    // Exact remaining 5,000 bytes -> 201 Created
    const okRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'fit.pdf',
      total_size: 5000,
      mime_type: 'application/pdf'
    }, { Authorization: `Bearer ${qToken}` });
    assert.equal(okRes.status, 201);

    // 5,001 bytes -> 413 Payload Too Large
    const overRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'over.pdf',
      total_size: 5001,
      mime_type: 'application/pdf'
    }, { Authorization: `Bearer ${qToken}` });
    assert.equal(overRes.status, 413);
  });

  // =========================================================================
  // 2. Magic Bytes Validation Stress Against Spoofed Binaries
  // =========================================================================
  console.log('\n--- Domain 2: Magic Bytes Stress Against Spoofed Binaries ---');

  check('2.1 Windows PE (MZ) binary spoofed as PDF, PNG, JPEG, DOCX, XLSX, PPTX rejected', () => {
    const peBinary = Buffer.from([
      0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00,
      0x04, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00,
      0xB8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);

    const claimedMimes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'video/mp4',
      'audio/mpeg',
      'audio/wav',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ];

    for (const m of claimedMimes) {
      const res = validateMagicBytes(peBinary, m);
      assert.equal(res.valid, false, `Must reject PE binary claimed as ${m}`);
      assert.match(res.error, /MIME spoofing detected/i);
    }
  });

  check('2.2 Linux ELF executable spoofed as PDF or Office rejected', () => {
    const elfBinary = Buffer.from([
      0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);

    assert.equal(validateMagicBytes(elfBinary, 'application/pdf').valid, false);
    assert.equal(validateMagicBytes(elfBinary, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document').valid, false);
    assert.equal(validateMagicBytes(elfBinary, 'image/png').valid, false);
  });

  check('2.3 All 12 supported format signatures verified authentic', () => {
    // PDF
    assert.equal(validateMagicBytes(Buffer.from('%PDF-1.7\n...'), 'application/pdf').valid, true);
    // PNG
    assert.equal(validateMagicBytes(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), 'image/png').valid, true);
    // JPEG
    assert.equal(validateMagicBytes(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), 'image/jpeg').valid, true);
    // GIF
    assert.equal(validateMagicBytes(Buffer.from('GIF89a\x01\x00'), 'image/gif').valid, true);
    // WebP
    assert.equal(validateMagicBytes(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]), 'image/webp').valid, true);
    // MP4
    assert.equal(validateMagicBytes(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypmp42')]), 'video/mp4').valid, true);
    // MP3 (ID3)
    assert.equal(validateMagicBytes(Buffer.from('ID3\x04\x00'), 'audio/mpeg').valid, true);
    // MP3 (sync frame FF FB)
    assert.equal(validateMagicBytes(Buffer.from([0xFF, 0xFB, 0x90, 0x64]), 'audio/mpeg').valid, true);
    // WAV
    assert.equal(validateMagicBytes(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]), 'audio/wav').valid, true);
    // DOCX
    assert.equal(validateMagicBytes(Buffer.concat([Buffer.from([0x50, 0x4B, 0x03, 0x04]), Buffer.from('word/document.xml')]), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document').valid, true);
    // XLSX
    assert.equal(validateMagicBytes(Buffer.concat([Buffer.from([0x50, 0x4B, 0x03, 0x04]), Buffer.from('xl/workbook.xml')]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').valid, true);
    // PPTX
    assert.equal(validateMagicBytes(Buffer.concat([Buffer.from([0x50, 0x4B, 0x03, 0x04]), Buffer.from('ppt/presentation.xml')]), 'application/vnd.openxmlformats-officedocument.presentationml.presentation').valid, true);
    // Plain text UTF-8
    assert.equal(validateMagicBytes(Buffer.from('Plain text report without nulls', 'utf8'), 'text/plain').valid, true);
  });

  check('2.4 Malformed / corrupt binary headers rejected for declared format', () => {
    // Corrupt PDF
    assert.equal(validateMagicBytes(Buffer.from('%PDX-1.7\nCorrupt header'), 'application/pdf').valid, false);
    // Corrupt PNG
    assert.equal(validateMagicBytes(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x00, 0x00, 0x00, 0x00]), 'image/png').valid, false);
    // Text containing null bytes
    assert.equal(validateMagicBytes(Buffer.from('hello\x00world'), 'text/plain').valid, false);
  });

  check('2.5 SVG XSS payloads quarantined, clean SVG admitted', () => {
    // Script tag
    assert.equal(inspectSvgContent('<svg><script>alert(1)</script></svg>').safe, false);
    // Mixed case script tag
    assert.equal(inspectSvgContent('<svg><ScRiPt>alert(1)</sCrIpT></svg>').safe, false);
    // Onload handler
    assert.equal(inspectSvgContent('<svg onload="alert(1)"></svg>').safe, false);
    // Onerror handler
    assert.equal(inspectSvgContent('<svg><image src="x" onerror="alert(1)"/></svg>').safe, false);
    // javascript: URI
    assert.equal(inspectSvgContent('<svg><a href="javascript:alert(1)">link</a></svg>').safe, false);
    // foreignObject
    assert.equal(inspectSvgContent('<svg><foreignObject><body>x</body></foreignObject></svg>').safe, false);
    // Clean SVG
    assert.equal(inspectSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>').safe, true);
  });

  check('2.6 Office macros (.docm/.xlsm/vbaProject.bin) and zip bombs quarantined', () => {
    // Macro extensions
    assert.equal(inspectZipOrOffice(Buffer.from('d'), 'test.docm').safe, false);
    assert.equal(inspectZipOrOffice(Buffer.from('d'), 'test.xlsm').safe, false);
    assert.equal(inspectZipOrOffice(Buffer.from('d'), 'test.pptm').safe, false);

    // Embedded vbaProject.bin inside DOCX
    const vbaDocx = Buffer.from('PK\x03\x04 word/vbaProject.bin PK\x05\x06');
    assert.equal(inspectZipOrOffice(vbaDocx, 'contract.docx').safe, false);

    // Zip bomb ratio (>100:1)
    const bombHdr = Buffer.alloc(32);
    bombHdr.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    bombHdr.writeUInt32LE(100, 18);        // compressed = 100
    bombHdr.writeUInt32LE(5000000, 22);    // uncompressed = 5,000,000 (ratio 50,000:1)
    assert.equal(inspectZipOrOffice(bombHdr, 'file.zip').safe, false);
  });

  // =========================================================================
  // 3. Filename Sanitization: Traversal, Null Bytes, Reserved Names
  // =========================================================================
  console.log('\n--- Domain 3: Filename Sanitization Stress ---');

  check('3.1 Path traversal vectors stripped to basename', () => {
    assert.equal(sanitizeFilename('../../../../../etc/passwd'), 'passwd');
    assert.equal(sanitizeFilename('..\\..\\..\\windows\\system32\\drivers\\etc\\hosts'), 'hosts');
    assert.equal(sanitizeFilename('....//....//nested/file.pdf'), 'file.pdf');
    assert.equal(sanitizeFilename('/root/confidential/memo.docx'), 'memo.docx');
    assert.throws(() => sanitizeFilename('.'), /empty filename/i);
    assert.throws(() => sanitizeFilename('/'), /empty filename/i);
    assert.throws(() => sanitizeFilename('   '), /empty filename/i);
  });

  check('3.2 Null byte injections strictly rejected (%00, \\0, \\x00)', () => {
    assert.throws(() => sanitizeFilename('malware.pdf\0.exe'), /null byte injection/i);
    assert.throws(() => sanitizeFilename('payload%00.sh'), /null byte injection/i);
    assert.throws(() => sanitizeFilename('\x00exploit.docx'), /null byte injection/i);
    assert.throws(() => sanitizeFilename('test.pdf%00'), /null byte injection/i);
  });

  check('3.3 Windows reserved device names prefixed with safe_ (case-insensitive)', () => {
    const devices = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    for (const dev of devices) {
      // Uppercase
      assert.equal(sanitizeFilename(`${dev}.txt`), `safe_${dev}.txt`);
      // Lowercase
      assert.equal(sanitizeFilename(`${dev.toLowerCase()}.pdf`), `safe_${dev.toLowerCase()}.pdf`);
    }
  });

  check('3.4 Prohibited executable extensions strictly rejected', () => {
    const prohibited = ['.exe', '.bat', '.cmd', '.sh', '.vbs', '.js', '.ps1', '.msi', '.dll', '.jar', '.com', '.scr', '.pif'];
    for (const ext of prohibited) {
      assert.throws(() => sanitizeFilename(`evil${ext}`), /prohibited/i);
      assert.throws(() => sanitizeFilename(`EVIL${ext.toUpperCase()}`), /prohibited/i);
    }
  });

  check('3.5 Filesystem invalid characters sanitized, Indonesian and international names preserved', () => {
    assert.equal(sanitizeFilename('report<2026>:draft*final?.pdf'), 'report_2026__draft_final_.pdf');
    assert.equal(sanitizeFilename('Laporan Keuangan Tahunan PT Brilian Solusi 2026.pdf'), 'Laporan Keuangan Tahunan PT Brilian Solusi 2026.pdf');
    assert.equal(sanitizeFilename('Surat_Keputusan_Direksi_No_001_SK_DIR_2026.docx'), 'Surat_Keputusan_Direksi_No_001_SK_DIR_2026.docx');
  });

  console.log('\n===============================================================');
  console.log(`   Challenger Harness Execution Summary: ${passed}/${total} Checks Passed`);
  if (failureList.length > 0) {
    console.log(`   Failures Detected: ${failureList.length}`);
    failureList.forEach(f => console.log(`     - ${f.name}: ${f.err}`));
    process.exit(1);
  } else {
    console.log('   Zero Failures Detected. All 21 Challenger Checks Passed.');
    console.log('===============================================================\n');
  }
}

runChallengerM2Harness().catch(err => {
  console.error('\nFatal test harness error:', err);
  process.exit(1);
});
