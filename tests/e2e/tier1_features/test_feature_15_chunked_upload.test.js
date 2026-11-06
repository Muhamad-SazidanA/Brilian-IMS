const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { ApiDispatcher } = require('../helpers/api_mock_server');
const { signJwt } = require('../helpers/jwt_oracle');

test('Tier 1 - Feature 15: Resumable Chunked Upload Engine (>=100MB)', async (t) => {
  const jwtSecret = 'e2e_chunked_upload_jwt_secret_2026';
  const api = new ApiDispatcher({ jwtSecret });

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
    division: 'Operations',
    level: 'L2',
    name: 'Rina Wijaya'
  }, jwtSecret);

  let sessionId;
  const totalFileSize = 104857600; // Exactly 100 MB
  const chunkSize = 5242880; // 5 MB chunks
  const totalChunks = 20;

  await t.test('15.1 Resumable upload init validates session creation, chunk size, total chunks', async () => {
    const res = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'financial_audit_2026_large.pdf',
      total_size: totalFileSize,
      mime_type: 'application/pdf',
      folder_id: 'folder-audit-2026',
      classification: 'Internal'
    }, {
      Authorization: `Bearer ${uploaderToken}`
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'success');
    assert.ok(res.body.session_id);
    assert.equal(res.body.chunk_size, chunkSize);
    assert.equal(res.body.total_chunks, totalChunks);

    sessionId = res.body.session_id;
  });

  await t.test('15.2 Ingestion of multi-chunk stream with offset and progress tracking', async () => {
    // Transmit first 3 chunks (15% progress)
    for (let i = 0; i < 3; i++) {
      const chunkBuf = Buffer.alloc(chunkSize, i);
      const chunkHash = crypto.createHash('sha256').update(chunkBuf).digest('hex');

      const chunkRes = await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
        session_id: sessionId,
        chunk_index: i,
        chunk_hash: chunkHash,
        file: chunkBuf
      }, {
        Authorization: `Bearer ${uploaderToken}`
      });

      assert.equal(chunkRes.status, 200);
      assert.equal(chunkRes.body.status, 'success');
      assert.equal(chunkRes.body.received, i + 1);
      assert.equal(chunkRes.body.total, totalChunks);
    }
  });

  await t.test('15.3 Client connection pause/resume status query', async () => {
    const statusRes = await api.handleRequest('GET', `/api/v1/documents/upload/status/${sessionId}`, {}, {
      Authorization: `Bearer ${uploaderToken}`
    });

    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.status, 'pending');
    assert.equal(statusRes.body.percent, 15);
    assert.deepEqual(statusRes.body.received_chunks, [0, 1, 2]);
  });

  await t.test('15.4 Incomplete chunked upload completion rejection (400)', async () => {
    const completeRes = await api.handleRequest('POST', '/api/v1/documents/upload/complete', {
      session_id: sessionId
    }, {
      Authorization: `Bearer ${uploaderToken}`
    });

    assert.equal(completeRes.status, 400);
    assert.match(completeRes.body.message, /Incomplete upload/);
  });

  await t.test('15.5 Upload remaining chunks and complete assembly into document record', async () => {
    // Send remaining chunks 3 to 19 (chunk 0 must start with %PDF- to satisfy magic bytes)
    // Overwrite chunk 0 with PDF magic header
    const pdfHeaderChunk = Buffer.concat([Buffer.from('%PDF-1.7 standard header\n'), Buffer.alloc(chunkSize - 25, 0)]);
    await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: sessionId,
      chunk_index: 0,
      chunk_hash: crypto.createHash('sha256').update(pdfHeaderChunk).digest('hex'),
      file: pdfHeaderChunk
    }, {
      Authorization: `Bearer ${uploaderToken}`
    });

    for (let i = 3; i < totalChunks; i++) {
      const chunkBuf = Buffer.alloc(chunkSize, i);
      const chunkHash = crypto.createHash('sha256').update(chunkBuf).digest('hex');

      const chunkRes = await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
        session_id: sessionId,
        chunk_index: i,
        chunk_hash: chunkHash,
        file: chunkBuf
      }, {
        Authorization: `Bearer ${uploaderToken}`
      });

      assert.equal(chunkRes.status, 200);
    }

    const completeRes = await api.handleRequest('POST', '/api/v1/documents/upload/complete', {
      session_id: sessionId
    }, {
      Authorization: `Bearer ${uploaderToken}`
    });

    assert.equal(completeRes.status, 201);
    assert.equal(completeRes.body.status, 'success');
    assert.ok(completeRes.body.document_id);
    assert.equal(completeRes.body.version, 1);
    assert.equal(completeRes.body.document.file_size, totalFileSize);
  });

  await t.test('15.6 Unauthorized uploader role check for chunked upload init', async () => {
    const res = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'illegal.pdf',
      total_size: 1000000,
      mime_type: 'application/pdf'
    }, {
      Authorization: `Bearer ${viewerToken}`
    });

    assert.equal(res.status, 403);
    assert.match(res.body.message, /insufficient role permissions/i);
  });
});
