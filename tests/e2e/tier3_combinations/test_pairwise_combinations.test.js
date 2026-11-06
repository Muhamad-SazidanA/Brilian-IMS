const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { signJwt, verifyJwt, hasPermission } = require('../helpers/jwt_oracle');
const { ApiDispatcher } = require('../helpers/api_mock_server');
const { encryptPrompt, decryptPrompt, wipeBytes } = require('../helpers/crypto_oracle');
const { computeHighlightRectangles } = require('../helpers/wasm_oracle');

test('Tier 3 - Cross-Feature Pairwise Combinations', async (t) => {
  const jwtSecret = 'e2e_cross_feature_jwt_secret_12345';
  const api = new ApiDispatcher({ jwtSecret });
  const aesKey = crypto.randomBytes(32);

  // Issue tokens for all 4 roles
  const tokens = {
    admin: signJwt({ sub: 'u-admin', username: 'admin_user', role: 'admin' }, jwtSecret),
    reviewer: signJwt({ sub: 'u-rev', username: 'reviewer_user', role: 'reviewer' }, jwtSecret),
    uploader: signJwt({ sub: 'u-upl', username: 'uploader_user', role: 'uploader' }, jwtSecret),
    viewer: signJwt({ sub: 'u-viw', username: 'viewer_user', role: 'viewer' }, jwtSecret)
  };

  await t.test('3.1 PAIR-01..10: Role x Workflow Action Matrix Combinations', async () => {
    // PAIR-01: Admin can upload
    const p1 = await api.handleRequest('POST', '/api/v1/documents/upload', {
      title: 'Admin Document.pdf',
      folder_id: 'fld-1',
      file: 'data'
    }, { Authorization: `Bearer ${tokens.admin}` });
    assert.equal(p1.status, 201);

    // PAIR-02: Admin can perform workflow action
    const p2 = await api.handleRequest('PUT', '/api/v1/workflows/wf-1/action', {
      action: 'approve',
      notes: 'Admin approved'
    }, { Authorization: `Bearer ${tokens.admin}` });
    assert.equal(p2.status, 200);

    // PAIR-03: Reviewer cannot upload documents
    const p3 = await api.handleRequest('POST', '/api/v1/documents/upload', {
      title: 'Reviewer Doc.pdf',
      folder_id: 'fld-1',
      file: 'data'
    }, { Authorization: `Bearer ${tokens.reviewer}` });
    assert.equal(p3.status, 403);

    // PAIR-04: Reviewer can approve workflow
    const p4 = await api.handleRequest('PUT', '/api/v1/workflows/wf-1/action', {
      action: 'approve',
      notes: 'Reviewer approved'
    }, { Authorization: `Bearer ${tokens.reviewer}` });
    assert.equal(p4.status, 200);

    // PAIR-05: Reviewer can reject workflow
    const p5 = await api.handleRequest('PUT', '/api/v1/workflows/wf-1/action', {
      action: 'reject',
      notes: 'Reviewer rejected'
    }, { Authorization: `Bearer ${tokens.reviewer}` });
    assert.equal(p5.status, 200);

    // PAIR-06: Uploader can upload documents
    const p6 = await api.handleRequest('POST', '/api/v1/documents/upload', {
      title: 'Uploader Doc.pdf',
      folder_id: 'fld-1',
      file: 'data'
    }, { Authorization: `Bearer ${tokens.uploader}` });
    assert.equal(p6.status, 201);

    // PAIR-07: Uploader cannot approve workflow
    const p7 = await api.handleRequest('PUT', '/api/v1/workflows/wf-1/action', {
      action: 'approve',
      notes: 'Self-approval attempt'
    }, { Authorization: `Bearer ${tokens.uploader}` });
    assert.equal(p7.status, 403);

    // PAIR-08: Viewer can query AI Q&A
    const p8 = await api.handleRequest('POST', '/api/v1/ai/qa', {
      document_id: 'doc-1',
      question: 'Berapa tanggal jatuh tempo pembayaran?'
    }, { Authorization: `Bearer ${tokens.viewer}` });
    assert.equal(p8.status, 200);

    // PAIR-09: Viewer cannot upload documents
    const p9 = await api.handleRequest('POST', '/api/v1/documents/upload', {
      title: 'Viewer Doc.pdf',
      folder_id: 'fld-1',
      file: 'data'
    }, { Authorization: `Bearer ${tokens.viewer}` });
    assert.equal(p9.status, 403);

    // PAIR-10: Viewer cannot perform workflow action
    const p10 = await api.handleRequest('PUT', '/api/v1/workflows/wf-1/action', {
      action: 'revise',
      notes: 'Viewer revise attempt'
    }, { Authorization: `Bearer ${tokens.viewer}` });
    assert.equal(p10.status, 403);
  });

  await t.test('3.2 Cross-Feature: Encrypted System Prompt -> AI Compare -> Wasm Highlight Pipeline', async () => {
    // 1. Decrypt prompt transiently in memory
    const systemPromptPlaintext = 'Brilian Core AI: Extract tabular delta and provide exact page coordinates.';
    const encryptedPromptBlob = encryptPrompt(systemPromptPlaintext, aesKey);

    const transientPromptBuf = decryptPrompt(encryptedPromptBlob, aesKey);
    assert.equal(transientPromptBuf.toString('utf8'), systemPromptPlaintext);

    // 2. Execute AI Compare API
    const compareRes = await api.handleRequest('POST', '/api/v1/ai/compare', {
      document_ids: ['doc-v1', 'doc-v2'],
      query: 'Bandingkan nilai denda'
    }, { Authorization: `Bearer ${tokens.reviewer}` });

    assert.equal(compareRes.status, 200);
    const { citations } = compareRes.body;
    assert.equal(citations.length, 2);

    // 3. Immediately zeroize decrypted transient prompt from RAM
    wipeBytes(transientPromptBuf);
    assert.equal(transientPromptBuf[0], 0);

    // 4. Pass citations to Wasm Highlight transform
    const mockCitationBoundingBoxes = JSON.stringify([
      { page: citations[0].page, x: 100, y: 250, width: 350, height: 60 },
      { page: citations[1].page, x: 100, y: 300, width: 350, height: 60 }
    ]);

    const renderedRectsJson = computeHighlightRectangles(mockCitationBoundingBoxes, 1200, 1600, 1.25);
    const rects = JSON.parse(renderedRectsJson);

    assert.equal(rects.length, 2);
    assert.equal(rects[0].page, 4);
    assert.equal(rects[0].x, 125);
    assert.equal(rects[0].width, 437.5);
    assert.equal(rects[1].page, 5);
  });
});
