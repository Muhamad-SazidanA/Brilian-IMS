const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { ApiDispatcher } = require('../helpers/api_mock_server');
const { signJwt } = require('../helpers/jwt_oracle');

test('Tier 1 - Feature 20: Automatic Document Versioning & History Lifecycle', async (t) => {
  const jwtSecret = 'e2e_versioning_secret_2026';
  const api = new ApiDispatcher({ jwtSecret });

  const uploaderToken = signJwt({
    sub: 'usr-upl-1',
    user_id: 'usr-upl-1',
    username: 'uploader_1',
    role: 'uploader',
    division: 'Legal',
    level: 'L3',
    name: 'Dewi Lestari'
  }, jwtSecret);

  let docId;

  await t.test('20.1 Automatic Version 1 creation on initial upload', async () => {
    // Helper to upload via chunked protocol
    const initRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'Standard_Employment_Agreement.pdf',
      total_size: 1024,
      mime_type: 'application/pdf',
      folder_id: 'fld-legal'
    }, { Authorization: `Bearer ${uploaderToken}` });
    assert.equal(initRes.status, 201);
    const sid = initRes.body.session_id;

    const v1Content = Buffer.from('%PDF-1.7 Clause 1: Initial draft content.\n');
    await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: sid,
      chunk_index: 0,
      file: v1Content
    }, { Authorization: `Bearer ${uploaderToken}` });

    const compRes = await api.handleRequest('POST', '/api/v1/documents/upload/complete', {
      session_id: sid
    }, { Authorization: `Bearer ${uploaderToken}` });

    assert.equal(compRes.status, 201);
    assert.equal(compRes.body.version, 1);
    docId = compRes.body.document_id;
    assert.ok(docId);
  });

  await t.test('20.2 Re-uploading with identical title in folder increments to Version 2 preserving Version 1', async () => {
    // Re-upload with same filename in same folder
    const initRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'Standard_Employment_Agreement.pdf',
      total_size: 2048,
      mime_type: 'application/pdf',
      folder_id: 'fld-legal'
    }, { Authorization: `Bearer ${uploaderToken}` });
    const sid = initRes.body.session_id;

    const v2Content = Buffer.from('%PDF-1.7 Clause 1: Revised draft with amended salary.\n');
    await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: sid,
      chunk_index: 0,
      file: v2Content
    }, { Authorization: `Bearer ${uploaderToken}` });

    const compRes = await api.handleRequest('POST', '/api/v1/documents/upload/complete', {
      session_id: sid
    }, { Authorization: `Bearer ${uploaderToken}` });

    assert.equal(compRes.status, 201);
    assert.equal(compRes.body.document_id, docId, 'Must keep identical document_id');
    assert.equal(compRes.body.version, 2, 'Must increment current_version to 2');
  });

  await t.test('20.3 Version history inspection lists all immutable historical versions', async () => {
    const res = await api.handleRequest('GET', `/api/v1/documents/${docId}/versions`, {}, {
      Authorization: `Bearer ${uploaderToken}`
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.current_version, 2);
    assert.equal(res.body.versions.length, 2);
    assert.equal(res.body.versions[0].version_number, 1);
    assert.equal(res.body.versions[1].version_number, 2);
  });

  await t.test('20.4 Restoring Version 1 creates Version 3 containing historical contents', async () => {
    const res = await api.handleRequest('POST', `/api/v1/documents/${docId}/versions/1/restore`, {}, {
      Authorization: `Bearer ${uploaderToken}`
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.current_version, 3, 'Restoration must advance active version to 3');
    assert.equal(res.body.restored_from, 1);

    // Verify document history now contains 3 records
    const histRes = await api.handleRequest('GET', `/api/v1/documents/${docId}/versions`, {}, {
      Authorization: `Bearer ${uploaderToken}`
    });
    assert.equal(histRes.body.versions.length, 3);
  });
});
