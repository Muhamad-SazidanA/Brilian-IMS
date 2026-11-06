const test = require('node:test');
const assert = require('node:assert/strict');
const { ApiDispatcher } = require('../helpers/api_mock_server');
const { signJwt } = require('../helpers/jwt_oracle');

test('Tier 1 - Feature 21: Trash Lifecycle, Soft-Delete & Permanent Purge', async (t) => {
  const jwtSecret = 'e2e_trash_lifecycle_secret_2026';
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
    division: 'HR',
    level: 'L2',
    name: 'Ahmad Fauzi'
  }, jwtSecret);

  let docId;

  // Setup: create test document
  const uploadRes = await api.handleRequest('POST', '/api/v1/documents/upload', {
    title: 'Trash_Test_Doc.pdf',
    folder_id: 'fld-hr',
    file: Buffer.from('%PDF-1.7 temporary content')
  }, { Authorization: `Bearer ${uploaderToken}` });
  docId = uploadRes.body.document_id;

  await t.test('21.1 Soft-delete moves document to trash (DELETE /documents/:id)', async () => {
    const deleteRes = await api.handleRequest('DELETE', `/api/v1/documents/${docId}`, {}, {
      Authorization: `Bearer ${adminToken}`
    });

    assert.equal(deleteRes.status, 200);
    assert.match(deleteRes.body.message, /kotak sampah/i);
  });

  await t.test('21.2 Soft-deleted document is omitted from active preview/download', async () => {
    const previewRes = await api.handleRequest('GET', `/api/v1/documents/${docId}/preview`, {}, {
      Authorization: `Bearer ${adminToken}`
    });
    assert.equal(previewRes.status, 404);

    const downloadRes = await api.handleRequest('GET', `/api/v1/documents/${docId}/download`, {}, {
      Authorization: `Bearer ${adminToken}`
    });
    assert.equal(downloadRes.status, 404);
  });

  await t.test('21.3 Trash bin endpoint lists soft-deleted documents with metadata', async () => {
    const trashRes = await api.handleRequest('GET', '/api/v1/trash', {}, {
      Authorization: `Bearer ${adminToken}`
    });

    assert.equal(trashRes.status, 200);
    assert.ok(trashRes.body.trash_items.some(item => item.id === docId));
  });

  await t.test('21.4 Restoring from trash returns document to active state', async () => {
    const restoreRes = await api.handleRequest('POST', `/api/v1/trash/${docId}/restore`, {}, {
      Authorization: `Bearer ${adminToken}`
    });

    assert.equal(restoreRes.status, 200);
    assert.match(restoreRes.body.message, /dipulihkan/i);

    // Active preview works again
    const previewRes = await api.handleRequest('GET', `/api/v1/documents/${docId}/preview`, {}, {
      Authorization: `Bearer ${adminToken}`
    });
    assert.equal(previewRes.status, 200);
  });

  await t.test('21.5 Non-admin / L2 user cannot permanently purge documents (403)', async () => {
    // Soft delete again
    await api.handleRequest('DELETE', `/api/v1/documents/${docId}`, {}, { Authorization: `Bearer ${adminToken}` });

    const purgeRes = await api.handleRequest('DELETE', `/api/v1/trash/${docId}/permanent`, {}, {
      Authorization: `Bearer ${uploaderToken}`
    });

    assert.equal(purgeRes.status, 403);
    assert.match(purgeRes.body.message, /Forbidden.*Administrator or Level L5/i);
  });

  await t.test('21.6 Admin / Level L5 permanently purges document and history', async () => {
    const purgeRes = await api.handleRequest('DELETE', `/api/v1/trash/${docId}/permanent`, {}, {
      Authorization: `Bearer ${adminToken}`
    });

    assert.equal(purgeRes.status, 200);
    assert.match(purgeRes.body.message, /dihapus secara permanen/i);

    // Completely gone from trash
    const trashRes = await api.handleRequest('GET', '/api/v1/trash', {}, { Authorization: `Bearer ${adminToken}` });
    assert.ok(!trashRes.body.trash_items.some(item => item.id === docId));
  });
});
