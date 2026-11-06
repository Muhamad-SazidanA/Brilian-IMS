const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { ApiDispatcher } = require('../helpers/api_mock_server');
const { signJwt } = require('../helpers/jwt_oracle');

test('Tier 1 - Feature 17: Storage Quota & File Size Enforcement', async (t) => {
  const jwtSecret = 'e2e_quota_test_secret_999';
  const api = new ApiDispatcher({ jwtSecret });

  // Register user with 50 MB quota cap
  const userId = 'usr-quota-target';
  api.users.set('target_uploader', {
    id: userId,
    role: 'uploader',
    password: 'pass',
    division: 'Finance',
    level: 'L2',
    name: 'Target Uploader'
  });
  api.userQuotas.set(userId, {
    max_bytes: 50 * 1024 * 1024, // 50 MB
    used_bytes: 40 * 1024 * 1024  // 40 MB already used (10 MB remaining)
  });

  const token = signJwt({
    sub: userId,
    user_id: userId,
    username: 'target_uploader',
    role: 'uploader',
    division: 'Finance',
    level: 'L2',
    name: 'Target Uploader'
  }, jwtSecret);

  await t.test('17.1 Pre-upload quota check rejects file exceeding remaining quota (413)', async () => {
    // Attempt to upload 12 MB file (remaining quota is only 10 MB)
    const res = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'oversized_budget.pdf',
      total_size: 12 * 1024 * 1024,
      mime_type: 'application/pdf',
      folder_id: 'finance-folder'
    }, {
      Authorization: `Bearer ${token}`
    });

    assert.equal(res.status, 413, 'Must return 413 Payload Too Large');
    assert.match(res.body.message, /Storage quota exceeded/i);
  });

  await t.test('17.2 Permitted upload within remaining quota succeeds (201)', async () => {
    // Attempt to upload 5 MB file (within 10 MB remaining)
    const totalSize = 5 * 1024 * 1024;
    const initRes = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'valid_budget.pdf',
      total_size: totalSize,
      mime_type: 'application/pdf',
      folder_id: 'finance-folder'
    }, {
      Authorization: `Bearer ${token}`
    });

    assert.equal(initRes.status, 201);
    const sessionId = initRes.body.session_id;

    // Send single chunk
    const fileBuf = Buffer.concat([Buffer.from('%PDF-1.7 standard header\n'), Buffer.alloc(totalSize - 25, 0)]);
    const chunkRes = await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: sessionId,
      chunk_index: 0,
      chunk_hash: crypto.createHash('sha256').update(fileBuf).digest('hex'),
      file: fileBuf
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(chunkRes.status, 200);

    const completeRes = await api.handleRequest('POST', '/api/v1/documents/upload/complete', {
      session_id: sessionId
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(completeRes.status, 201);
  });

  await t.test('17.3 Running storage usage reflects updated byte count', () => {
    const quota = api.userQuotas.get(userId);
    assert.equal(quota.used_bytes, (40 + 5) * 1024 * 1024, 'Used bytes must increment by 5MB');
  });

  await t.test('17.4 Subsequent upload exceeding newly diminished quota is rejected', async () => {
    // Remaining quota is now 5 MB. Attempting 6 MB must fail.
    const res = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'another_file.pdf',
      total_size: 6 * 1024 * 1024,
      mime_type: 'application/pdf',
      folder_id: 'finance-folder'
    }, {
      Authorization: `Bearer ${token}`
    });

    assert.equal(res.status, 413);
  });
});
