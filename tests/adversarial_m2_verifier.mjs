import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Import test helpers
const { ApiDispatcher } = createRequire(import.meta.url)('./e2e/helpers/api_mock_server.js');
const { signJwt } = createRequire(import.meta.url)('./e2e/helpers/jwt_oracle.js');
const {
  sanitizeFilename,
  inspectSvgContent,
  inspectZipOrOffice,
  MACRO_EXTENSIONS,
  DISALLOWED_EXTENSIONS
} = createRequire(import.meta.url)('./e2e/helpers/sanitizer_oracle.js');

async function runAdversarialM2Verification() {
  console.log('===============================================================');
  console.log('   Adversarial Empirical Verification Harness: Milestone 2    ');
  console.log('===============================================================\n');

  let passedChecks = 0;
  let totalChecks = 0;
  const findings = [];

  function check(name, fn) {
    totalChecks++;
    try {
      fn();
      console.log(`  ✔ [PASS] ${name}`);
      passedChecks++;
    } catch (err) {
      console.error(`  ✖ [FAIL] ${name}: ${err.message}`);
      findings.push({ name, error: err.message });
    }
  }

  async function checkAsync(name, fn) {
    totalChecks++;
    try {
      await fn();
      console.log(`  ✔ [PASS] ${name}`);
      passedChecks++;
    } catch (err) {
      console.error(`  ✖ [FAIL] ${name}: ${err.message}`);
      findings.push({ name, error: err.message });
    }
  }

  const jwtSecret = 'adversarial_m2_test_secret_2026';
  const api = new ApiDispatcher({ jwtSecret });

  const adminL5Token = signJwt({
    sub: 'usr-admin-1',
    user_id: 'usr-admin-1',
    username: 'admin_brilian',
    role: 'admin',
    division: 'ALL',
    level: 'L5',
    name: 'Budi Santoso'
  }, jwtSecret);

  const uploaderL2Token = signJwt({
    sub: 'usr-upl-1',
    user_id: 'usr-upl-1',
    username: 'uploader_1',
    role: 'uploader',
    division: 'HR',
    level: 'L2',
    name: 'Ahmad Fauzi'
  }, jwtSecret);

  const reviewerL3Token = signJwt({
    sub: 'usr-rev-1',
    user_id: 'usr-rev-1',
    username: 'reviewer_1',
    role: 'reviewer',
    division: 'HR',
    level: 'L3',
    name: 'Siti Rahma'
  }, jwtSecret);

  const directorL5NonAdminToken = signJwt({
    sub: 'usr-dir-1',
    user_id: 'usr-dir-1',
    username: 'director_hr',
    role: 'reviewer',
    division: 'HR',
    level: 'L5',
    name: 'Dr. Hendra Wijaya'
  }, jwtSecret);

  const viewerL1Token = signJwt({
    sub: 'usr-viw-1',
    user_id: 'usr-viw-1',
    username: 'viewer_1',
    role: 'viewer',
    division: 'HR',
    level: 'L1',
    name: 'Doni Pratama'
  }, jwtSecret);

  // Helper for chunked upload
  async function performChunkedUpload(token, filename, content, mimeType = 'application/pdf', folderId = 'fld-test') {
    const totalSize = content.length;
    const initRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename,
      total_size: totalSize,
      mime_type: mimeType,
      folder_id: folderId
    }, { Authorization: `Bearer ${token}` });

    if (initRes.status !== 201) {
      return initRes;
    }

    const sid = initRes.body.session_id;
    const chunkSize = initRes.body.chunk_size;
    const totalChunks = initRes.body.total_chunks;

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, totalSize);
      const chunkData = content.subarray(start, end);

      const chunkRes = await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
        session_id: sid,
        chunk_index: i,
        file: chunkData
      }, { Authorization: `Bearer ${token}` });

      if (chunkRes.status !== 200) {
        return chunkRes;
      }
    }

    const compRes = await api.handleRequest('POST', '/api/v1/documents/upload/complete', {
      session_id: sid
    }, { Authorization: `Bearer ${token}` });

    return compRes;
  }

  // =========================================================================
  // SECTION 1: Quarantine Mechanisms (Zip Bombs, SVG XSS, Office Macros)
  // =========================================================================
  console.log('--- Section 1: Malicious Quarantine Mechanisms ---');

  check('Zip Bomb: detects high compression ratio (>100:1)', () => {
    const header = Buffer.alloc(32);
    header.writeUInt32LE(0x04034B50, 0); // PK\x03\x04
    header.writeUInt32LE(1000, 18);      // Compressed = 1,000 bytes
    header.writeUInt32LE(100100, 22);    // Uncompressed = 100,100 bytes (100.1:1)

    const res = inspectZipOrOffice(header, 'ratio_bomb.zip');
    assert.equal(res.safe, false, 'Must reject ratio > 100:1');
    assert.match(res.reason, /Zip bomb detected/i);
  });

  check('Zip Bomb: accepts safe compression ratio (<=100:1 and <=1GB)', () => {
    const header = Buffer.alloc(32);
    header.writeUInt32LE(0x04034B50, 0);
    header.writeUInt32LE(1000, 18);      // Compressed = 1,000 bytes
    header.writeUInt32LE(50000, 22);     // Uncompressed = 50,000 bytes (50:1)

    const res = inspectZipOrOffice(header, 'safe_archive.zip');
    assert.equal(res.safe, true, 'Must accept safe compression ratio');
  });

  check('Zip Bomb: detects uncompressed size exceeding 1GB limit', () => {
    const header = Buffer.alloc(32);
    header.writeUInt32LE(0x04034B50, 0);
    header.writeUInt32LE(20000000, 18);  // Compressed = 20 MB
    header.writeUInt32LE(1073741825, 22);// Uncompressed = 1GB + 1 byte

    const res = inspectZipOrOffice(header, 'gigabyte_bomb.zip');
    assert.equal(res.safe, false, 'Must reject uncompressed size > 1GB');
    assert.match(res.reason, /Zip bomb detected/i);
  });

  check('SVG Quarantine: detects <script> tag regardless of case and attributes', () => {
    const testCases = [
      '<svg><script>alert(1)</script></svg>',
      '<svg><SCRIPT src="evil.js"></SCRIPT></svg>',
      '<svg><ScRiPt type="application/javascript">console.log(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><script \n async>fetch("x")</script></svg>'
    ];

    for (const svg of testCases) {
      const res = inspectSvgContent(svg);
      assert.equal(res.safe, false, `Failed to reject: ${svg}`);
      assert.match(res.reason, /<script> tag/i);
    }
  });

  check('SVG Quarantine: detects inline JavaScript event handlers (onload, onerror, etc.)', () => {
    const testCases = [
      '<svg onload="alert(1)"><circle r="10"/></svg>',
      '<svg><image href="x.png" onerror="stealCookies()"/></svg>',
      '<svg><rect onmouseover="evil()" width="10" height="10"/></svg>',
      '<svg \n  onload = "evil()"></svg>',
      '<svg><animate onbegin="alert(1)"/></svg>'
    ];

    for (const svg of testCases) {
      const res = inspectSvgContent(svg);
      assert.equal(res.safe, false, `Failed to reject inline event: ${svg}`);
      assert.match(res.reason, /inline JavaScript event handler/i);
    }
  });

  check('SVG Quarantine: detects javascript: URI schemes and foreignObject containers', () => {
    const uriSvg = '<svg><a href="javascript:alert(document.domain)"><text>Link</text></a></svg>';
    const uriRes = inspectSvgContent(uriSvg);
    assert.equal(uriRes.safe, false);
    assert.match(uriRes.reason, /javascript: URI scheme/i);

    const mixedUriSvg = '<svg><a href="JaVaScRiPt:evil()"><text>Link</text></a></svg>';
    const mixedRes = inspectSvgContent(mixedUriSvg);
    assert.equal(mixedRes.safe, false);

    const foreignSvg = '<svg><foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml"><iframe src="evil.html"/></body></foreignObject></svg>';
    const foreignRes = inspectSvgContent(foreignSvg);
    assert.equal(foreignRes.safe, false);
    assert.match(foreignRes.reason, /foreignObject/i);
  });

  check('SVG Quarantine: permits clean benign vector drawings', () => {
    const cleanSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M10 10 H 90 V 90 H 10 Z" fill="#2F5DFF" stroke="#14161B" stroke-width="2"/>
      <circle cx="50" cy="50" r="30" fill="#FFFFFF"/>
      <text x="50" y="55" font-family="IBM Plex Sans" text-anchor="middle">Brilian</text>
    </svg>`;

    const res = inspectSvgContent(cleanSvg);
    assert.equal(res.safe, true, 'Clean SVG should be accepted');
  });

  check('Office Macro: rejects dangerous macro file extensions (.docm, .xlsm, .pptm, etc.)', () => {
    const dummy = Buffer.from('dummy binary content');
    const dangerousExts = ['.docm', '.xlsm', '.pptm', '.dotm', '.xltm', '.ppam', '.DOCM', '.XLSM'];

    for (const ext of dangerousExts) {
      const res = inspectZipOrOffice(dummy, `sample_document${ext}`);
      assert.equal(res.safe, false, `Failed to reject extension: ${ext}`);
      assert.match(res.reason, /Macro-enabled file extension/i);
    }
  });

  check('Office Macro: detects embedded vbaProject.bin inside disguised .docx / .xlsx files', () => {
    const disguisedDocx = Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x03, 0x04]),
      Buffer.from('word/document.xml ... word/vbaProject.bin ... [Content_Types].xml')
    ]);

    const resDocx = inspectZipOrOffice(disguisedDocx, 'innocent_contract.docx');
    assert.equal(resDocx.safe, false);
    assert.match(resDocx.reason, /vbaProject\.bin macro code/i);

    const disguisedXlsx = Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x03, 0x04]),
      Buffer.from('xl/workbook.xml ... xl/vbaProject.bin ...')
    ]);
    const resXlsx = inspectZipOrOffice(disguisedXlsx, 'innocent_budget.xlsx');
    assert.equal(resXlsx.safe, false);
    assert.match(resXlsx.reason, /vbaProject\.bin macro code/i);
  });

  check('Office Macro: accepts legitimate OpenXML .docx without macros', () => {
    const cleanDocx = Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x03, 0x04]),
      Buffer.from('word/document.xml ... word/styles.xml ... word/fontTable.xml')
    ]);

    const res = inspectZipOrOffice(cleanDocx, 'clean_report.docx');
    assert.equal(res.safe, true, 'Clean OpenXML docx should be accepted');
  });

  // =========================================================================
  // SECTION 2: Document Versioning Auto-Increment & Restoration Semantics
  // =========================================================================
  console.log('\n--- Section 2: Document Versioning & Restoration Semantics ---');

  let testDocId;

  await checkAsync('Versioning: initial upload creates Version 1', async () => {
    const v1Data = Buffer.from('%PDF-1.7 Empirical Version 1 initial contract clause.\n');
    const res = await performChunkedUpload(uploaderL2Token, 'Procurement_Contract.pdf', v1Data, 'application/pdf', 'fld-procurement');

    assert.equal(res.status, 201);
    assert.equal(res.body.version, 1);
    testDocId = res.body.document_id;
    assert.ok(testDocId, 'Must return document_id');
  });

  await checkAsync('Versioning: re-upload in same folder increments to Version 2 preserving Version 1', async () => {
    const v2Data = Buffer.from('%PDF-1.7 Empirical Version 2 amended pricing clause.\n');
    const res = await performChunkedUpload(uploaderL2Token, 'Procurement_Contract.pdf', v2Data, 'application/pdf', 'fld-procurement');

    assert.equal(res.status, 201);
    assert.equal(res.body.document_id, testDocId, 'Must maintain identical document_id');
    assert.equal(res.body.version, 2, 'Must increment current_version to 2');

    // Verify version history has both versions
    const histRes = await api.handleRequest('GET', `/api/v1/documents/${testDocId}/versions`, {}, {
      Authorization: `Bearer ${uploaderL2Token}`
    });
    assert.equal(histRes.status, 200);
    assert.equal(histRes.body.current_version, 2);
    assert.equal(histRes.body.versions.length, 2);
    assert.equal(histRes.body.versions[0].version_number, 1);
    assert.equal(histRes.body.versions[1].version_number, 2);
  });

  await checkAsync('Versioning: re-upload same filename in DIFFERENT folder creates a separate doc at Version 1', async () => {
    const otherFolderData = Buffer.from('%PDF-1.7 Procurement in Finance folder.\n');
    const res = await performChunkedUpload(uploaderL2Token, 'Procurement_Contract.pdf', otherFolderData, 'application/pdf', 'fld-finance');

    assert.equal(res.status, 201);
    assert.notEqual(res.body.document_id, testDocId, 'Different folder must create a different document');
    assert.equal(res.body.version, 1, 'New folder instance must start at version 1');
  });

  await checkAsync('Versioning: restoring Version 1 advances active version to Version 3 with Version 1 content', async () => {
    const restoreRes = await api.handleRequest('POST', `/api/v1/documents/${testDocId}/versions/1/restore`, {}, {
      Authorization: `Bearer ${uploaderL2Token}`
    });

    assert.equal(restoreRes.status, 200);
    assert.equal(restoreRes.body.current_version, 3, 'Restoration must advance active version to 3');
    assert.equal(restoreRes.body.restored_from, 1);

    // Verify history now records 3 versions
    const histRes = await api.handleRequest('GET', `/api/v1/documents/${testDocId}/versions`, {}, {
      Authorization: `Bearer ${uploaderL2Token}`
    });
    assert.equal(histRes.body.versions.length, 3);
    assert.equal(histRes.body.versions[2].version_number, 3);
    // Version 3 must match Version 1 file size
    assert.equal(histRes.body.versions[2].file_size, histRes.body.versions[0].file_size);
  });

  await checkAsync('Versioning: restoring non-existent version returns 404', async () => {
    const restoreRes = await api.handleRequest('POST', `/api/v1/documents/${testDocId}/versions/99/restore`, {}, {
      Authorization: `Bearer ${uploaderL2Token}`
    });
    assert.equal(restoreRes.status, 404);
    assert.match(restoreRes.body.message, /Version 99 not found/i);
  });

  // =========================================================================
  // SECTION 3: Trash Lifecycle & Permanent Purge Authorization Gating
  // =========================================================================
  console.log('\n--- Section 3: Trash Lifecycle & Purge Authorization Gating ---');

  let trashDocId;

  await checkAsync('Trash: setup upload a document for trash testing', async () => {
    const docData = Buffer.from('%PDF-1.7 Temporary policy document to be trashed.\n');
    const res = await performChunkedUpload(uploaderL2Token, 'Obsolete_HR_Policy.pdf', docData, 'application/pdf', 'fld-hr');
    assert.equal(res.status, 201);
    trashDocId = res.body.document_id;
    assert.ok(trashDocId);
  });

  await checkAsync('Trash: soft-delete moves document to trash and hides from active listings', async () => {
    const delRes = await api.handleRequest('DELETE', `/api/v1/documents/${trashDocId}`, {}, {
      Authorization: `Bearer ${adminL5Token}`
    });
    assert.equal(delRes.status, 200);
    assert.match(delRes.body.message, /kotak sampah/i);

    // Document must be omitted from active preview and download
    const prevRes = await api.handleRequest('GET', `/api/v1/documents/${trashDocId}/preview`, {}, {
      Authorization: `Bearer ${adminL5Token}`
    });
    assert.equal(prevRes.status, 404);

    const downRes = await api.handleRequest('GET', `/api/v1/documents/${trashDocId}/download`, {}, {
      Authorization: `Bearer ${adminL5Token}`
    });
    assert.equal(downRes.status, 404);

    // Versions endpoint also returns 404 for soft-deleted document
    const versRes = await api.handleRequest('GET', `/api/v1/documents/${trashDocId}/versions`, {}, {
      Authorization: `Bearer ${adminL5Token}`
    });
    assert.equal(versRes.status, 404);
  });

  await checkAsync('Trash: item is listed in GET /api/v1/trash', async () => {
    const trashRes = await api.handleRequest('GET', '/api/v1/trash', {}, {
      Authorization: `Bearer ${adminL5Token}`
    });
    assert.equal(trashRes.status, 200);
    const item = trashRes.body.trash_items.find(i => i.id === trashDocId);
    assert.ok(item, 'Item must be in trash items list');
    assert.equal(item.title, 'Obsolete_HR_Policy.pdf');
  });

  await checkAsync('Trash: restore from trash recovers document to active state', async () => {
    const restoreRes = await api.handleRequest('POST', `/api/v1/trash/${trashDocId}/restore`, {}, {
      Authorization: `Bearer ${adminL5Token}`
    });
    assert.equal(restoreRes.status, 200);
    assert.match(restoreRes.body.message, /dipulihkan/i);

    // Active preview works again
    const prevRes = await api.handleRequest('GET', `/api/v1/documents/${trashDocId}/preview`, {}, {
      Authorization: `Bearer ${adminL5Token}`
    });
    assert.equal(prevRes.status, 200);

    // Removed from trash list
    const trashRes = await api.handleRequest('GET', '/api/v1/trash', {}, {
      Authorization: `Bearer ${adminL5Token}`
    });
    assert.equal(trashRes.body.trash_items.some(i => i.id === trashDocId), false);
  });

  await checkAsync('Trash: soft-delete again for purge authorization tests', async () => {
    const delRes = await api.handleRequest('DELETE', `/api/v1/documents/${trashDocId}`, {}, {
      Authorization: `Bearer ${adminL5Token}`
    });
    assert.equal(delRes.status, 200);
  });

  await checkAsync('Trash Gating: Uploader (Role Uploader, Level L2) REJECTED on permanent purge (403)', async () => {
    const purgeRes = await api.handleRequest('DELETE', `/api/v1/trash/${trashDocId}/permanent`, {}, {
      Authorization: `Bearer ${uploaderL2Token}`
    });
    assert.equal(purgeRes.status, 403, 'Uploader L2 must receive 403 Forbidden');
    assert.match(purgeRes.body.message, /Forbidden.*Administrator or Level L5/i);
  });

  await checkAsync('Trash Gating: Reviewer (Role Reviewer, Level L3) REJECTED on permanent purge (403)', async () => {
    const purgeRes = await api.handleRequest('DELETE', `/api/v1/trash/${trashDocId}/permanent`, {}, {
      Authorization: `Bearer ${reviewerL3Token}`
    });
    assert.equal(purgeRes.status, 403, 'Reviewer L3 must receive 403 Forbidden');
    assert.match(purgeRes.body.message, /Forbidden.*Administrator or Level L5/i);
  });

  await checkAsync('Trash Gating: Viewer (Role Viewer, Level L1) REJECTED on permanent purge (403)', async () => {
    const purgeRes = await api.handleRequest('DELETE', `/api/v1/trash/${trashDocId}/permanent`, {}, {
      Authorization: `Bearer ${viewerL1Token}`
    });
    assert.equal(purgeRes.status, 403, 'Viewer L1 must receive 403 Forbidden');
    assert.match(purgeRes.body.message, /Forbidden.*Administrator or Level L5/i);
  });

  await checkAsync('Trash Gating: Non-Admin Director at Level L5 ALLOWED to permanently purge (200)', async () => {
    // Requirements explicitly gate permanent purge to Admin OR Level L5
    const purgeRes = await api.handleRequest('DELETE', `/api/v1/trash/${trashDocId}/permanent`, {}, {
      Authorization: `Bearer ${directorL5NonAdminToken}`
    });
    assert.equal(purgeRes.status, 200, 'Level L5 user must be authorized to purge');
    assert.match(purgeRes.body.message, /dihapus secara permanen/i);
  });

  await checkAsync('Trash Purge: document and all version history completely eradicated', async () => {
    // 1. Not in trash
    const trashRes = await api.handleRequest('GET', '/api/v1/trash', {}, {
      Authorization: `Bearer ${adminL5Token}`
    });
    assert.equal(trashRes.body.trash_items.some(i => i.id === trashDocId), false);

    // 2. Not in active documents
    const prevRes = await api.handleRequest('GET', `/api/v1/documents/${trashDocId}/preview`, {}, {
      Authorization: `Bearer ${adminL5Token}`
    });
    assert.equal(prevRes.status, 404);

    // 3. Versions gone
    const versRes = await api.handleRequest('GET', `/api/v1/documents/${trashDocId}/versions`, {}, {
      Authorization: `Bearer ${adminL5Token}`
    });
    assert.equal(versRes.status, 404);

    // 4. Repeated purge returns 404
    const purgeAgain = await api.handleRequest('DELETE', `/api/v1/trash/${trashDocId}/permanent`, {}, {
      Authorization: `Bearer ${adminL5Token}`
    });
    assert.equal(purgeAgain.status, 404);
  });

  // =========================================================================
  // SECTION 4: Codebase Integrity & Implementation Review
  // =========================================================================
  console.log('\n--- Section 4: Go Codebase & Frontend UI Conformance Review ---');

  check('Go DMS package files exist under internal/dms/', () => {
    const requiredFiles = [
      'engine.go',
      'magic_bytes.go',
      'quarantine.go',
      'sanitizer.go',
      'types.go'
    ];
    for (const f of requiredFiles) {
      const p = path.join(ROOT, 'internal', 'dms', f);
      assert.ok(fs.existsSync(p), `Missing internal/dms/${f}`);
    }
  });

  check('Go API handlers for upload and documents exist under internal/api/handler/', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'internal', 'api', 'handler', 'upload.go')), 'upload.go missing');
    assert.ok(fs.existsSync(path.join(ROOT, 'internal', 'api', 'handler', 'documents.go')), 'documents.go missing');
  });

  check('Frontend DMS UI components exist under frontend/src/components/', () => {
    const requiredUI = [
      'components/dms/DmsExplorer.tsx',
      'components/dms/TrashModal.tsx',
      'components/dms/RenameModal.tsx',
      'components/dms/MoveModal.tsx',
      'components/upload/ResumableUploader.tsx',
      'components/viewer/DocumentViewer.tsx',
      'components/viewer/WatermarkOverlay.tsx'
    ];
    for (const f of requiredUI) {
      const p = path.join(ROOT, 'frontend', 'src', f);
      assert.ok(fs.existsSync(p), `Missing frontend/src/${f}`);
    }
  });

  console.log('\n===============================================================');
  console.log(`   Verification Summary: ${passedChecks}/${totalChecks} checks passed cleanly.`);
  if (findings.length > 0) {
    console.log(`   Vulnerabilities / Failures Detected: ${findings.length}`);
    findings.forEach(f => console.log(`     - ${f.name}: ${f.error}`));
  } else {
    console.log('   Zero Failures Detected. All Adversarial Stress Tests Passed.');
  }
  console.log('===============================================================\n');

  if (findings.length > 0) {
    process.exit(1);
  }
}

runAdversarialM2Verification().catch(err => {
  console.error('\nAdversarial verification run error:', err);
  process.exit(1);
});
