const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { ApiDispatcher } = require('../helpers/api_mock_server');
const { signJwt } = require('../helpers/jwt_oracle');
const { verifyWatermark } = require('../helpers/watermark_oracle');
const { evaluateAccess } = require('../helpers/rbac_oracle');

test('Tier 3 - Advanced Cross-Feature Pairwise & Pipeline Combinations', async (t) => {
  const jwtSecret = 'e2e_tier3_cross_feature_secret_2026';
  const api = new ApiDispatcher({ jwtSecret });

  const tokens = {
    admin: signJwt({ sub: 'usr-admin-1', user_id: 'usr-admin-1', username: 'admin_brilian', role: 'admin', division: 'ALL', level: 'L5', name: 'Budi Santoso' }, jwtSecret),
    legalL4: signJwt({ sub: 'usr-leg-head', user_id: 'usr-leg-head', username: 'legal_head', role: 'uploader', division: 'Legal', level: 'L4', name: 'Dr. Hendra Gunawan' }, jwtSecret),
    legalL2: signJwt({ sub: 'usr-leg-assoc', user_id: 'usr-leg-assoc', username: 'legal_assoc', role: 'viewer', division: 'Legal', level: 'L2', name: 'Siti Rahma' }, jwtSecret),
    hrL3: signJwt({ sub: 'usr-hr-lead', user_id: 'usr-hr-lead', username: 'hr_lead', role: 'uploader', division: 'HR', level: 'L3', name: 'Agus Pratama' }, jwtSecret)
  };

  // ---------------------------------------------------------------------------
  // 3.3 Upload + Watermark + L1-L5 RBAC + Audit Trail Pipeline
  // ---------------------------------------------------------------------------
  await t.test('3.3 Pipeline: Upload -> L1-L5 RBAC Evaluation -> Dynamic Watermark -> Audit Logging', async () => {
    // 1. Legal Head uploads Rahasia contract
    const initRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'Akta_Perjanjian_Komersial_2026.pdf',
      total_size: 1048576, // 1 MB
      mime_type: 'application/pdf',
      classification: 'Rahasia',
      division: 'Legal',
      folder_id: 'legal-contracts-root'
    }, { Authorization: `Bearer ${tokens.legalL4}` });
    assert.equal(initRes.status, 201);
    const sid = initRes.body.session_id;

    const pdfContent = Buffer.concat([
      Buffer.from('%PDF-1.7 confidential commercial terms\n'),
      Buffer.alloc(1048576 - 36, 0)
    ]);

    await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: sid,
      chunk_index: 0,
      file: pdfContent
    }, { Authorization: `Bearer ${tokens.legalL4}` });

    const compRes = await api.handleRequest('POST', '/api/v1/documents/upload/complete', {
      session_id: sid
    }, { Authorization: `Bearer ${tokens.legalL4}` });
    assert.equal(compRes.status, 201);
    const docId = compRes.body.document_id;

    // 2. Legal Associate (L2) requests preview: Same division L2 allowed for view!
    const previewRes = await api.handleRequest('GET', `/api/v1/documents/${docId}/preview`, {}, {
      Authorization: `Bearer ${tokens.legalL2}`
    });
    assert.equal(previewRes.status, 200);
    assert.equal(previewRes.headers['X-Watermark-Applied'], 'true');
    assert.equal(previewRes.body.watermark.FullName, 'Siti Rahma');
    assert.equal(previewRes.body.watermark.UserID, 'usr-leg-assoc');

    // 3. Legal Associate (L2) attempts download: Denied (Rahasia requires L3+ for download)
    const blockedDownload = await api.handleRequest('GET', `/api/v1/documents/${docId}/download`, {}, {
      Authorization: `Bearer ${tokens.legalL2}`
    });
    assert.equal(blockedDownload.status, 403);
    assert.match(blockedDownload.body.message, /Level L2 has view-only rights/i);

    // 4. Legal Head (L4) requests download: Allowed!
    const allowedDownload = await api.handleRequest('GET', `/api/v1/documents/${docId}/download`, {}, {
      Authorization: `Bearer ${tokens.legalL4}`
    });
    assert.equal(allowedDownload.status, 200);
    assert.equal(allowedDownload.headers['X-Watermark-Applied'], 'true');

    // Verify downloaded binary watermark
    const check = verifyWatermark(allowedDownload.body.content, {
      FullName: 'Dr. Hendra Gunawan',
      UserID: 'usr-leg-head',
      Opacity: 0.20
    });
    assert.equal(check.valid, true);

    // 5. Admin audits immutable log entries
    const auditRes = await api.handleRequest('GET', '/api/v1/audit/logs', {}, {
      Authorization: `Bearer ${tokens.admin}`
    });
    const docLogs = auditRes.body.logs.filter(l => l.resource_id === docId);
    assert.ok(docLogs.some(l => l.action === 'DOCUMENT_UPLOAD' && l.user_name === 'Dr. Hendra Gunawan'));
    assert.ok(docLogs.some(l => l.action === 'DOCUMENT_VIEW' && l.user_name === 'Siti Rahma'));
    assert.ok(docLogs.some(l => l.action === 'DOCUMENT_DOWNLOAD' && l.user_name === 'Dr. Hendra Gunawan'));
  });

  // ---------------------------------------------------------------------------
  // 3.4 Version Restore + Watermark + Trash Lifecycle Combination
  // ---------------------------------------------------------------------------
  await t.test('3.4 Pipeline: Version Increments -> Soft Delete -> Trash Recovery -> Version Restore -> Watermarked Stream', async () => {
    // 1. Upload initial version (v1)
    const init1 = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'Standard_Operating_Procedure.pdf',
      total_size: 512,
      mime_type: 'application/pdf',
      classification: 'Internal',
      folder_id: 'ops-sop-folder'
    }, { Authorization: `Bearer ${tokens.hrL3}` });
    const s1 = init1.body.session_id;

    await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: s1,
      chunk_index: 0,
      file: Buffer.from('%PDF-1.7 Content Version 1: Initial rules\n')
    }, { Authorization: `Bearer ${tokens.hrL3}` });

    const c1 = await api.handleRequest('POST', '/api/v1/documents/upload/complete', { session_id: s1 }, { Authorization: `Bearer ${tokens.hrL3}` });
    const docId = c1.body.document_id;
    assert.equal(c1.body.version, 1);

    // 2. Upload amended version (v2) with same title in same folder
    const init2 = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'Standard_Operating_Procedure.pdf',
      total_size: 512,
      mime_type: 'application/pdf',
      classification: 'Internal',
      folder_id: 'ops-sop-folder'
    }, { Authorization: `Bearer ${tokens.hrL3}` });
    const s2 = init2.body.session_id;

    await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: s2,
      chunk_index: 0,
      file: Buffer.from('%PDF-1.7 Content Version 2: Amended rules\n')
    }, { Authorization: `Bearer ${tokens.hrL3}` });

    const c2 = await api.handleRequest('POST', '/api/v1/documents/upload/complete', { session_id: s2 }, { Authorization: `Bearer ${tokens.hrL3}` });
    assert.equal(c2.body.version, 2);

    // 3. Soft-delete document to trash
    const delRes = await api.handleRequest('DELETE', `/api/v1/documents/${docId}`, {}, {
      Authorization: `Bearer ${tokens.admin}`
    });
    assert.equal(delRes.status, 200);

    // Document is not previewable while in trash
    const previewTrash = await api.handleRequest('GET', `/api/v1/documents/${docId}/preview`, {}, {
      Authorization: `Bearer ${tokens.hrL3}`
    });
    assert.equal(previewTrash.status, 404);

    // 4. Restore from trash
    const restoreTrashRes = await api.handleRequest('POST', `/api/v1/trash/${docId}/restore`, {}, {
      Authorization: `Bearer ${tokens.admin}`
    });
    assert.equal(restoreTrashRes.status, 200);

    // 5. Restore Version 1 as active Version 3
    const restoreVerRes = await api.handleRequest('POST', `/api/v1/documents/${docId}/versions/1/restore`, {}, {
      Authorization: `Bearer ${tokens.hrL3}`
    });
    assert.equal(restoreVerRes.status, 200);
    assert.equal(restoreVerRes.body.current_version, 3);
    assert.equal(restoreVerRes.body.restored_from, 1);

    // 6. Download active Version 3 with watermark
    const downloadRes = await api.handleRequest('GET', `/api/v1/documents/${docId}/download`, {}, {
      Authorization: `Bearer ${tokens.hrL3}`
    });
    assert.equal(downloadRes.status, 200);
    assert.ok(downloadRes.body.content.toString('utf8').includes('Initial rules'));

    const check = verifyWatermark(downloadRes.body.content, {
      FullName: 'Agus Pratama',
      UserID: 'usr-hr-lead',
      Opacity: 0.20
    });
    assert.equal(check.valid, true);
  });

  // ---------------------------------------------------------------------------
  // 3.5 Exhaustive 16-Cell RBAC Combinatorial Matrix
  // ---------------------------------------------------------------------------
  await t.test('3.5 Combinatorial Matrix: Division x Level x Classification x Action Rights', () => {
    const testCases = [
      // Classification, User Div, Doc Div, Level, Action, Expected Allowed
      ['Publik', 'Marketing', 'Finance', 'L1', 'view', true],
      ['Publik', 'Marketing', 'Finance', 'L1', 'download', true],
      ['Internal', 'Marketing', 'Finance', 'L1', 'view', true],
      ['Internal', 'Marketing', 'Finance', 'L1', 'download', false], // L1 download denied
      ['Internal', 'Marketing', 'Finance', 'L2', 'download', true],  // L2 download allowed
      ['Rahasia', 'Finance', 'Finance', 'L1', 'view', false],        // L1 denied
      ['Rahasia', 'Finance', 'Finance', 'L2', 'view', true],         // L2 view allowed
      ['Rahasia', 'Finance', 'Finance', 'L2', 'download', false],    // L2 download denied
      ['Rahasia', 'Finance', 'Finance', 'L3', 'download', true],     // L3 download allowed
      ['Rahasia', 'HR', 'Finance', 'L5', 'view', false],             // Cross-division denied even for L5
      ['Sangat Rahasia', 'Executive', 'Executive', 'L3', 'view', false],     // L1-L3 denied
      ['Sangat Rahasia', 'Executive', 'Executive', 'L4', 'view', true],      // L4 view allowed
      ['Sangat Rahasia', 'Executive', 'Executive', 'L4', 'download', false],  // L4 download denied
      ['Sangat Rahasia', 'Executive', 'Executive', 'L5', 'download', true],  // L5 download allowed
      ['Sangat Rahasia', 'Finance', 'Executive', 'L5', 'view', false]        // Non-exec cross division denied
    ];

    for (const [cls, uDiv, dDiv, lvl, act, expected] of testCases) {
      const user = { user_id: 'u-matrix', division: uDiv, level: lvl, role: 'viewer' };
      const res = evaluateAccess(user, cls, dDiv, act);
      assert.equal(res.allowed, expected, `Case failed: ${cls} | user ${uDiv} ${lvl} | doc ${dDiv} | ${act} => expected ${expected}`);
    }
  });
});
