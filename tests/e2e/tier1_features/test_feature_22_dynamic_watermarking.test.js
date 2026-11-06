const test = require('node:test');
const assert = require('node:assert/strict');
const { ApiDispatcher } = require('../helpers/api_mock_server');
const { signJwt } = require('../helpers/jwt_oracle');
const { validateWatermarkOptions, applyWatermark, verifyWatermark } = require('../helpers/watermark_oracle');

test('Tier 1 - Feature 22: Mandatory Dynamic Diagonal Watermarking', async (t) => {
  const jwtSecret = 'e2e_watermark_test_secret_2026';
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

  const viewerToken = signJwt({
    sub: 'usr-viw-1',
    user_id: 'usr-viw-1',
    username: 'viewer_1',
    role: 'viewer',
    division: 'Finance',
    level: 'L3',
    name: 'Rina Wijaya'
  }, jwtSecret);

  // Seed a document
  const seedRes = await api.handleRequest('POST', '/api/v1/documents/upload', {
    title: 'Financial_Policy_2026.pdf',
    folder_id: 'fld-root',
    file: Buffer.from('%PDF-1.7 standard confidential body content\n'),
    classification: 'Publik'
  }, { Authorization: `Bearer ${adminToken}` });
  const docId = seedRes.body.document_id;

  await t.test('22.1 Mandatory dynamic watermark applied to document preview', async () => {
    const res = await api.handleRequest('GET', `/api/v1/documents/${docId}/preview`, {}, {
      Authorization: `Bearer ${viewerToken}`
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers['X-Watermark-Applied'], 'true');
    assert.ok(res.body.content);
    assert.equal(res.body.watermark.FullName, 'Rina Wijaya');
    assert.equal(res.body.watermark.UserID, 'usr-viw-1');
  });

  await t.test('22.2 Preview content includes accessor identity and timestamp', async () => {
    const res = await api.handleRequest('GET', `/api/v1/documents/${docId}/preview`, {}, {
      Authorization: `Bearer ${viewerToken}`
    });

    const contentStr = res.body.content.toString('utf8');
    assert.ok(contentStr.includes('Rina Wijaya'), 'Preview stream must contain accessor full name');
    assert.ok(contentStr.includes('usr-viw-1'), 'Preview stream must contain accessor User ID');
  });

  await t.test('22.3 Watermark opacity validation enforces bounds strictly between 15% and 25%', () => {
    // Valid opacities
    assert.doesNotThrow(() => validateWatermarkOptions({ FullName: 'Alice', UserID: 'u1', Opacity: 0.15 }));
    assert.doesNotThrow(() => validateWatermarkOptions({ FullName: 'Alice', UserID: 'u1', Opacity: 0.20 }));
    assert.doesNotThrow(() => validateWatermarkOptions({ FullName: 'Alice', UserID: 'u1', Opacity: 0.25 }));

    // Out-of-bounds opacities
    assert.throws(() => validateWatermarkOptions({ FullName: 'Alice', UserID: 'u1', Opacity: 0.05 }), /strictly between 0.15 and 0.25/);
    assert.throws(() => validateWatermarkOptions({ FullName: 'Alice', UserID: 'u1', Opacity: 0.14 }), /strictly between 0.15 and 0.25/);
    assert.throws(() => validateWatermarkOptions({ FullName: 'Alice', UserID: 'u1', Opacity: 0.26 }), /strictly between 0.15 and 0.25/);
    assert.throws(() => validateWatermarkOptions({ FullName: 'Alice', UserID: 'u1', Opacity: 0.80 }), /strictly between 0.15 and 0.25/);
  });

  await t.test('22.4 Permanent watermark embedded into downloaded binary stream', async () => {
    const res = await api.handleRequest('GET', `/api/v1/documents/${docId}/download`, {}, {
      Authorization: `Bearer ${viewerToken}`
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers['X-Watermark-Applied'], 'true');

    const verification = verifyWatermark(res.body.content, {
      FullName: 'Rina Wijaya',
      UserID: 'usr-viw-1',
      Opacity: 0.20
    });

    assert.equal(verification.valid, true);
    assert.equal(verification.hasName, true);
    assert.equal(verification.hasId, true);
  });

  await t.test('22.5 Direct URL access without JWT authentication rejected (cannot bypass watermark)', async () => {
    const unauthPreview = await api.handleRequest('GET', `/api/v1/documents/${docId}/preview`, {});
    assert.equal(unauthPreview.status, 401);

    const unauthDownload = await api.handleRequest('GET', `/api/v1/documents/${docId}/download`, {});
    assert.equal(unauthDownload.status, 401);
  });

  await t.test('22.6 Admin watermark configuration updates opacity within valid range', async () => {
    const updateRes = await api.handleRequest('PUT', '/api/v1/admin/watermark', {
      opacity: 0.22,
      angle: -45,
      banner_text: 'BRILIAN CONFIDENTIAL'
    }, {
      Authorization: `Bearer ${adminToken}`
    });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.config.default_opacity, 0.22);

    // Reject out-of-bounds admin update
    const badUpdate = await api.handleRequest('PUT', '/api/v1/admin/watermark', {
      opacity: 0.50
    }, {
      Authorization: `Bearer ${adminToken}`
    });
    assert.equal(badUpdate.status, 400);
  });
});
