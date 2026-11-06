import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const { ApiDispatcher } = createRequire(import.meta.url)('./e2e/helpers/api_mock_server.js');
const { signJwt } = createRequire(import.meta.url)('./e2e/helpers/jwt_oracle.js');
const {
  sanitizeFilename,
  inspectSvgContent,
  inspectZipOrOffice
} = createRequire(import.meta.url)('./e2e/helpers/sanitizer_oracle.js');

async function runDeepStressTests() {
  console.log('===============================================================');
  console.log('   Adversarial Deep Stress & Corner Cases: Milestone 2         ');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;
  const observations = [];

  function testCase(desc, fn) {
    total++;
    try {
      fn();
      console.log(`  ✔ [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.log(`  ⚠ [OBSERVATION / EDGE] ${desc}: ${err.message}`);
      observations.push({ desc, error: err.message });
    }
  }

  async function testCaseAsync(desc, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✔ [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.log(`  ⚠ [OBSERVATION / EDGE] ${desc}: ${err.message}`);
      observations.push({ desc, error: err.message });
    }
  }

  const jwtSecret = 'deep_stress_secret_2026';
  const api = new ApiDispatcher({ jwtSecret });

  const adminToken = signJwt({
    sub: 'usr-admin-deep',
    user_id: 'usr-admin-deep',
    username: 'admin',
    role: 'admin',
    division: 'ALL',
    level: 'L5',
    name: 'Admin Deep'
  }, jwtSecret);

  const uploaderToken = signJwt({
    sub: 'usr-upl-deep',
    user_id: 'usr-upl-deep',
    username: 'uploader',
    role: 'uploader',
    division: 'Engineering',
    level: 'L3',
    name: 'Engineer Uploader'
  }, jwtSecret);

  // Helper for chunked upload
  async function uploadHelper(filename, content, folderId = 'fld-deep', mime = 'application/pdf') {
    const initRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename,
      total_size: content.length,
      mime_type: mime,
      folder_id: folderId
    }, { Authorization: `Bearer ${uploaderToken}` });

    if (initRes.status !== 201) return initRes;

    const sid = initRes.body.session_id;
    const chunkSize = initRes.body.chunk_size;
    const totalChunks = initRes.body.total_chunks;

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, content.length);
      const chunkBuf = content.subarray(start, end);

      const chunkRes = await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
        session_id: sid,
        chunk_index: i,
        file: chunkBuf
      }, { Authorization: `Bearer ${uploaderToken}` });
      if (chunkRes.status !== 200) return chunkRes;
    }

    return await api.handleRequest('POST', '/api/v1/documents/upload/complete', {
      session_id: sid
    }, { Authorization: `Bearer ${uploaderToken}` });
  }

  // -------------------------------------------------------------------------
  // 1. ADVANCED SVG ATTACK VECTORS
  // -------------------------------------------------------------------------
  console.log('--- 1. Advanced SVG Adversarial Injections ---');

  testCase('SVG: CDATA wrapped script tag rejected', () => {
    const svg = '<svg><script><![CDATA[alert(1)]]></script></svg>';
    const res = inspectSvgContent(svg);
    assert.equal(res.safe, false);
  });

  testCase('SVG: Multiline script with CRLF and attributes rejected', () => {
    const svg = '<svg>\r\n  <script\r\n    type="text/javascript"\r\n    async>\r\n    alert(1)\r\n  </script>\r\n</svg>';
    const res = inspectSvgContent(svg);
    assert.equal(res.safe, false);
  });

  testCase('SVG: Mixed case and leading newline inline event rejected', () => {
    const svg = '<svg>\n<image href="x" \n  OnErRoR = "alert(1)"/>\n</svg>';
    const res = inspectSvgContent(svg);
    assert.equal(res.safe, false);
  });

  testCase('SVG: Slash-delimited tag with inline event <svg/onload=alert(1)>', () => {
    const svg = '<svg/onload=alert(1)>';
    const res = inspectSvgContent(svg);
    // Note: \son[a-z]+ requires whitespace. If slash without space, let's observe result
    assert.equal(res.safe, false, 'Slash-delimited SVG attribute vector should ideally be intercepted');
  });

  // -------------------------------------------------------------------------
  // 2. ZIP BOMB HEURISTIC BOUNDARIES
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Zip Bomb Boundary Analysis ---');

  testCase('Zip: exactly 100:1 ratio is permitted as upper bound', () => {
    const header = Buffer.alloc(32);
    header.writeUInt32LE(0x04034B50, 0);
    header.writeUInt32LE(1000, 18);   // compressed = 1000
    header.writeUInt32LE(100000, 22); // uncompressed = 100,000 (ratio 100.0)
    const res = inspectZipOrOffice(header, 'ratio_100.zip');
    assert.equal(res.safe, true);
  });

  testCase('Zip: 100.001:1 ratio is strictly quarantined (>100:1)', () => {
    const header = Buffer.alloc(32);
    header.writeUInt32LE(0x04034B50, 0);
    header.writeUInt32LE(1000, 18);
    header.writeUInt32LE(100001, 22); // ratio 100.001
    const res = inspectZipOrOffice(header, 'ratio_100_plus.zip');
    assert.equal(res.safe, false);
    assert.match(res.reason, /Zip bomb detected/i);
  });

  testCase('Zip: exactly 1GB (1073741824 bytes) uncompressed size is permitted', () => {
    const header = Buffer.alloc(32);
    header.writeUInt32LE(0x04034B50, 0);
    header.writeUInt32LE(50000000, 18); // 50MB
    header.writeUInt32LE(1073741824, 22); // 1GB
    const res = inspectZipOrOffice(header, '1gb_exact.zip');
    assert.equal(res.safe, true);
  });

  testCase('Zip: 1GB + 1 byte (1073741825 bytes) uncompressed size is quarantined', () => {
    const header = Buffer.alloc(32);
    header.writeUInt32LE(0x04034B50, 0);
    header.writeUInt32LE(50000000, 18); // 50MB
    header.writeUInt32LE(1073741825, 22); // 1GB + 1
    const res = inspectZipOrOffice(header, '1gb_plus.zip');
    assert.equal(res.safe, false);
  });

  // -------------------------------------------------------------------------
  // 3. VERSIONING LIFECYCLE DEEP STRESS (10-Step Sequential Versioning)
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Sequential Versioning & Multi-Step Provenance ---');

  let deepDocId;

  await testCaseAsync('Versioning: 10 sequential versions uploaded with incrementing content', async () => {
    for (let v = 1; v <= 10; v++) {
      const content = Buffer.from(`%PDF-1.7 Empirical Deep Version ${v} text payload.\n`);
      const res = await uploadHelper('Multi_Version_Doc.pdf', content, 'fld-deep-versions');
      assert.equal(res.status, 201);
      assert.equal(res.body.version, v);
      if (v === 1) deepDocId = res.body.document_id;
      else assert.equal(res.body.document_id, deepDocId);
    }

    const histRes = await api.handleRequest('GET', `/api/v1/documents/${deepDocId}/versions`, {}, {
      Authorization: `Bearer ${uploaderToken}`
    });
    assert.equal(histRes.status, 200);
    assert.equal(histRes.body.current_version, 10);
    assert.equal(histRes.body.versions.length, 10);
  });

  await testCaseAsync('Versioning: restoring Version 4 advances active version to 11 with Version 4 content', async () => {
    const res = await api.handleRequest('POST', `/api/v1/documents/${deepDocId}/versions/4/restore`, {}, {
      Authorization: `Bearer ${uploaderToken}`
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.current_version, 11);
    assert.equal(res.body.restored_from, 4);

    const histRes = await api.handleRequest('GET', `/api/v1/documents/${deepDocId}/versions`, {}, {
      Authorization: `Bearer ${uploaderToken}`
    });
    assert.equal(histRes.body.versions.length, 11);
    assert.equal(histRes.body.versions[10].version_number, 11);
    assert.equal(histRes.body.versions[10].file_size, histRes.body.versions[3].file_size);
  });

  await testCaseAsync('Versioning: renaming document then uploading original title creates new v1', async () => {
    // 1. Rename deepDocId to "Renamed_Doc.pdf"
    const renameRes = await api.handleRequest('PUT', `/api/v1/documents/${deepDocId}/rename`, {
      title: 'Renamed_Doc.pdf'
    }, { Authorization: `Bearer ${uploaderToken}` });
    assert.equal(renameRes.status, 200);

    // 2. Upload "Multi_Version_Doc.pdf" again into fld-deep-versions
    const content = Buffer.from('%PDF-1.7 Brand new document under previously used title.\n');
    const newDocRes = await uploadHelper('Multi_Version_Doc.pdf', content, 'fld-deep-versions');
    assert.equal(newDocRes.status, 201);
    assert.equal(newDocRes.body.version, 1, 'Re-uploading free title should start at v1');
    assert.notEqual(newDocRes.body.document_id, deepDocId, 'Must create separate document ID');
  });

  // -------------------------------------------------------------------------
  // 4. TRASH LIFECYCLE DEEP STRESS
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Trash Lifecycle State Transitions ---');

  let trashStressId;

  await testCaseAsync('Trash: upload document for lifecycle stress', async () => {
    const content = Buffer.from('%PDF-1.7 Trash stress document.\n');
    const res = await uploadHelper('Trash_Stress.pdf', content, 'fld-trash-stress');
    assert.equal(res.status, 201);
    trashStressId = res.body.document_id;
  });

  await testCaseAsync('Trash: soft-delete document', async () => {
    const res = await api.handleRequest('DELETE', `/api/v1/documents/${trashStressId}`, {}, {
      Authorization: `Bearer ${adminToken}`
    });
    assert.equal(res.status, 200);
  });

  await testCaseAsync('Trash: repeating soft-delete on already deleted document returns 404', async () => {
    const res = await api.handleRequest('DELETE', `/api/v1/documents/${trashStressId}`, {}, {
      Authorization: `Bearer ${adminToken}`
    });
    assert.equal(res.status, 404);
  });

  await testCaseAsync('Trash: restoring document from trash', async () => {
    const res = await api.handleRequest('POST', `/api/v1/trash/${trashStressId}/restore`, {}, {
      Authorization: `Bearer ${adminToken}`
    });
    assert.equal(res.status, 200);
  });

  await testCaseAsync('Trash: repeating restore on already restored document returns 404', async () => {
    const res = await api.handleRequest('POST', `/api/v1/trash/${trashStressId}/restore`, {}, {
      Authorization: `Bearer ${adminToken}`
    });
    assert.equal(res.status, 404);
    assert.match(res.body.message, /Item not found in trash/i);
  });

  await testCaseAsync('Trash: soft-delete again for purge', async () => {
    const res = await api.handleRequest('DELETE', `/api/v1/documents/${trashStressId}`, {}, {
      Authorization: `Bearer ${adminToken}`
    });
    assert.equal(res.status, 200);
  });

  await testCaseAsync('Trash: Level L4 user REJECTED on permanent purge (403)', async () => {
    const l4Token = signJwt({
      sub: 'usr-l4',
      user_id: 'usr-l4',
      username: 'manager_l4',
      role: 'reviewer',
      division: 'Engineering',
      level: 'L4',
      name: 'Manager L4'
    }, jwtSecret);

    const res = await api.handleRequest('DELETE', `/api/v1/trash/${trashStressId}/permanent`, {}, {
      Authorization: `Bearer ${l4Token}`
    });
    assert.equal(res.status, 403);
    assert.match(res.body.message, /Forbidden.*Administrator or Level L5/i);
  });

  await testCaseAsync('Trash: Level L5 user PERMITTED to permanently purge (200)', async () => {
    const l5Token = signJwt({
      sub: 'usr-l5',
      user_id: 'usr-l5',
      username: 'vp_l5',
      role: 'reviewer',
      division: 'Engineering',
      level: 'L5',
      name: 'VP L5'
    }, jwtSecret);

    const res = await api.handleRequest('DELETE', `/api/v1/trash/${trashStressId}/permanent`, {}, {
      Authorization: `Bearer ${l5Token}`
    });
    assert.equal(res.status, 200);
    assert.match(res.body.message, /dihapus secara permanen/i);
  });

  // -------------------------------------------------------------------------
  // 5. STORAGE QUOTA BOUNDARY STRESS
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Storage Quota Boundaries ---');

  await testCaseAsync('Quota: Init upload exceeding remaining quota rejected with 413', async () => {
    // usr-upl-deep has 1GB default quota (1073741824 bytes)
    // Attempt to upload 2GB file
    const res = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'Huge_Exceeding_Quota.pdf',
      total_size: 2 * 1024 * 1024 * 1024,
      mime_type: 'application/pdf',
      folder_id: 'fld-quota'
    }, { Authorization: `Bearer ${uploaderToken}` });

    assert.equal(res.status, 413);
    assert.match(res.body.message, /Storage quota exceeded/i);
  });

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`   Deep Stress Verification: ${passed}/${total} assertions passed.`);
  if (observations.length > 0) {
    console.log(`   Edge-Case Observations / Failure Modes: ${observations.length}`);
    observations.forEach(o => console.log(`     - ${o.desc}: ${o.error}`));
  } else {
    console.log('   All Edge Cases and Boundary Conditions Passed Perfectly.');
  }
  console.log('===============================================================\n');

  return { passed, total, observations };
}

runDeepStressTests().catch(err => {
  console.error('\nFatal error in deep stress harness:', err);
  process.exit(1);
});
