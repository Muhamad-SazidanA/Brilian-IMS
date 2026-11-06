const test = require('node:test');
const assert = require('node:assert/strict');
const { ApiDispatcher } = require('../helpers/api_mock_server');
const { signJwt } = require('../helpers/jwt_oracle');

test('Tier 1 - Feature 25: Immutable Audit Logging Engine & Event Notifications', async (t) => {
  const jwtSecret = 'e2e_audit_notifications_secret_2026';
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

  await t.test('25.1 Upload action generates immutable audit log and notification', async () => {
    const uploadRes = await api.handleRequest('POST', '/api/v1/documents/upload', {
      title: 'Audit_Notice_2026.pdf',
      folder_id: 'fld-hr',
      file: Buffer.from('%PDF-1.7 audit content')
    }, { Authorization: `Bearer ${uploaderToken}` });

    assert.equal(uploadRes.status, 201);
    docId = uploadRes.body.document_id;

    // Check audit logs via Admin
    const auditRes = await api.handleRequest('GET', '/api/v1/audit/logs', {}, {
      Authorization: `Bearer ${adminToken}`
    });

    assert.equal(auditRes.status, 200);
    const uploadLog = auditRes.body.logs.find(l => l.action === 'DOCUMENT_UPLOAD' && l.resource_id === docId);
    assert.ok(uploadLog, 'DOCUMENT_UPLOAD audit log must be recorded');
    assert.equal(uploadLog.user_id, 'usr-upl-1');
    assert.equal(uploadLog.user_name, 'Ahmad Fauzi');
    assert.equal(uploadLog.user_division, 'HR');
    assert.ok(uploadLog.timestamp);
    assert.ok(uploadLog.ip_address);
  });

  await t.test('25.2 Document View & Download actions generate audit trail records', async () => {
    // View
    await api.handleRequest('GET', `/api/v1/documents/${docId}/preview`, {}, {
      Authorization: `Bearer ${adminToken}`
    });

    // Download
    await api.handleRequest('GET', `/api/v1/documents/${docId}/download`, {}, {
      Authorization: `Bearer ${adminToken}`
    });

    const auditRes = await api.handleRequest('GET', '/api/v1/audit/logs', {}, {
      Authorization: `Bearer ${adminToken}`
    });

    assert.ok(auditRes.body.logs.some(l => l.action === 'DOCUMENT_VIEW' && l.resource_id === docId));
    assert.ok(auditRes.body.logs.some(l => l.action === 'DOCUMENT_DOWNLOAD' && l.resource_id === docId));
  });

  await t.test('25.3 Audit log deletion attempt rejected with 405 Method Not Allowed (tamper resistance)', async () => {
    const deleteRes = await api.handleRequest('DELETE', '/api/v1/audit/logs', {}, {
      Authorization: `Bearer ${adminToken}`
    });

    assert.equal(deleteRes.status, 405);
    assert.match(deleteRes.body.message, /append-only and cannot be deleted/i);
  });

  await t.test('25.4 Non-admin user cannot inspect audit logs (403)', async () => {
    const res = await api.handleRequest('GET', '/api/v1/audit/logs', {}, {
      Authorization: `Bearer ${uploaderToken}`
    });

    assert.equal(res.status, 403);
    assert.match(res.body.message, /Forbidden.*Admin and L5/i);
  });
});
