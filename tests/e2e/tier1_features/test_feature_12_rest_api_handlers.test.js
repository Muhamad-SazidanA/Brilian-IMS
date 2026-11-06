const test = require('node:test');
const assert = require('node:assert/strict');
const { ApiDispatcher } = require('../helpers/api_mock_server');
const { signJwt } = require('../helpers/jwt_oracle');

test('Tier 1 - Feature 12: REST API Handlers & HTTP Router', async (t) => {
  const jwtSecret = 'e2e_api_test_secret_12345';
  const api = new ApiDispatcher({ jwtSecret });

  let adminToken;
  let uploaderToken;
  let reviewerToken;
  let viewerToken;

  await t.test('12.1 POST /api/v1/auth/login authenticates valid user', async () => {
    const res = await api.handleRequest('POST', '/api/v1/auth/login', {
      username: 'admin_brilian',
      password: 'securepassword'
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.ok(res.body.token, 'Response must return JWT token');
    adminToken = res.body.token;

    // Issue tokens for other roles
    uploaderToken = signJwt({ sub: 'usr-upl-1', username: 'uploader_1', role: 'uploader' }, jwtSecret);
    reviewerToken = signJwt({ sub: 'usr-rev-1', username: 'reviewer_1', role: 'reviewer' }, jwtSecret);
    viewerToken = signJwt({ sub: 'usr-viw-1', username: 'viewer_1', role: 'viewer' }, jwtSecret);
  });

  await t.test('12.2 POST /api/v1/auth/login rejects invalid password', async () => {
    const res = await api.handleRequest('POST', '/api/v1/auth/login', {
      username: 'admin_brilian',
      password: 'wrong_password_here'
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.status, 'error');
  });

  await t.test('12.3 POST /api/v1/documents/upload creates document for uploader', async () => {
    const res = await api.handleRequest('POST', '/api/v1/documents/upload', {
      title: 'Perjanjian Kerjasama 2026.pdf',
      folder_id: 'fld-uuid-1234',
      file: 'binary_content_stream'
    }, {
      Authorization: `Bearer ${uploaderToken}`
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'success');
    assert.ok(res.body.document_id);
    assert.match(res.body.message, /Dokumen berhasil diunggah/);
  });

  await t.test('12.4 POST /api/v1/documents/upload rejects viewer role (403)', async () => {
    const res = await api.handleRequest('POST', '/api/v1/documents/upload', {
      title: 'Illegal Upload.pdf',
      folder_id: 'fld-uuid-1234',
      file: 'data'
    }, {
      Authorization: `Bearer ${viewerToken}`
    });

    assert.equal(res.status, 403);
    assert.match(res.body.message, /insufficient role permissions/i);
  });

  await t.test('12.5 POST /api/v1/ai/compare compares two documents', async () => {
    const res = await api.handleRequest('POST', '/api/v1/ai/compare', {
      document_ids: ['doc-v1-uuid', 'doc-v2-uuid'],
      query: 'Bandingkan perubahan nilai klausul denda pada kedua kontrak ini.'
    }, {
      Authorization: `Bearer ${reviewerToken}`
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.match(res.body.comparison_result, /\| Parameter \| Kontrak 2025 \| Kontrak 2026 \|/);
    assert.equal(res.body.citations.length, 2);
    assert.equal(res.body.citations[0].page, 4);
  });

  await t.test('12.6 POST /api/v1/ai/qa answers question on document', async () => {
    const res = await api.handleRequest('POST', '/api/v1/ai/qa', {
      document_id: 'doc-v1-uuid',
      question: 'Berapa tanggal jatuh tempo pembayaran?'
    }, {
      Authorization: `Bearer ${viewerToken}`
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.match(res.body.answer, /30 hari setelah invoice diterbitkan/);
    assert.equal(res.body.page_reference, 2);
  });

  await t.test('12.7 PUT /api/v1/workflows/:id/action updates workflow approval', async () => {
    const res = await api.handleRequest('PUT', '/api/v1/workflows/wf-9988/action', {
      action: 'approve',
      notes: 'Dokumen sudah sesuai dengan ketentuan hukum.'
    }, {
      Authorization: `Bearer ${reviewerToken}`
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.match(res.body.message, /Status workflow berhasil diperbarui/);
  });

  await t.test('12.8 PUT /api/v1/workflows/:id/action rejects invalid action verb', async () => {
    const res = await api.handleRequest('PUT', '/api/v1/workflows/wf-9988/action', {
      action: 'destroy_file',
      notes: 'Invalid action'
    }, {
      Authorization: `Bearer ${reviewerToken}`
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /Invalid action/);
  });
});
