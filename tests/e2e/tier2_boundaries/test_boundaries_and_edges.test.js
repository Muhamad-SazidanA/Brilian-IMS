const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { encryptPrompt, decryptPrompt, wipeBytes, IV_LENGTH, TAG_LENGTH } = require('../helpers/crypto_oracle');
const { computeHighlightRectangles } = require('../helpers/wasm_oracle');
const { signJwt, verifyJwt, hasPermission } = require('../helpers/jwt_oracle');
const { ApiDispatcher } = require('../helpers/api_mock_server');

test('Tier 2 - Boundary Value Analysis & Corner Case Tests', async (t) => {
  const secretKey = crypto.randomBytes(32);
  const jwtSecret = 'e2e_boundary_test_jwt_secret_99999';
  const api = new ApiDispatcher({ jwtSecret });
  const adminToken = signJwt({ sub: 'admin-1', username: 'admin', role: 'admin' }, jwtSecret);

  // --- 2.1 AES-256-GCM Boundary Values ---
  await t.test('2.1.1 Empty string plaintext handles encryption and decryption without crash', () => {
    const emptyPlaintext = '';
    const encrypted = encryptPrompt(emptyPlaintext, secretKey);
    assert.equal(encrypted.length, IV_LENGTH + TAG_LENGTH, 'Encrypted empty string should only contain IV and Tag');

    const decrypted = decryptPrompt(encrypted, secretKey);
    assert.equal(decrypted.toString('utf8'), '');
  });

  await t.test('2.1.2 Extremely large system prompt (100KB) encryption round-trip', () => {
    const largePrompt = 'Enterprise policy guidelines. '.repeat(3500); // ~105 KB
    const encrypted = encryptPrompt(largePrompt, secretKey);
    const decrypted = decryptPrompt(encrypted, secretKey);
    assert.equal(decrypted.toString('utf8'), largePrompt);
  });

  await t.test('2.1.3 Truncated payload below minimum length (IV + Tag) rejected', () => {
    const tooShort = Buffer.from('too_short_bytes');
    assert.throws(() => {
      decryptPrompt(tooShort, secretKey);
    }, /Ciphertext payload too short/i);
  });

  await t.test('2.1.4 Precise 31-byte and 33-byte keys rejected', () => {
    const key31 = crypto.randomBytes(31);
    const key33 = crypto.randomBytes(33);

    assert.throws(() => encryptPrompt('test', key31), /Key must be exactly 32 bytes/i);
    assert.throws(() => encryptPrompt('test', key33), /Key must be exactly 32 bytes/i);
  });

  // --- 2.2 Rust Wasm Bounding Box Boundary Values ---
  await t.test('2.2.1 Empty boxes JSON array returns empty result', () => {
    const res = computeHighlightRectangles('[]', 800, 600, 1.0);
    assert.equal(res, '[]');
  });

  await t.test('2.2.2 Extreme negative coordinates clamped to zero', () => {
    const boxes = JSON.stringify([{ page: 1, x: -99999, y: -99999, width: 200, height: 100 }]);
    const res = JSON.parse(computeHighlightRectangles(boxes, 1000, 1000, 1.0));
    assert.equal(res[0].x, 0);
    assert.equal(res[0].y, 0);
    assert.equal(res[0].width, 200);
    assert.equal(res[0].height, 100);
  });

  await t.test('2.2.3 Box coordinates far exceeding viewport boundaries clamped to max available', () => {
    const boxes = JSON.stringify([{ page: 1, x: 1500, y: 1200, width: 500, height: 500 }]);
    const res = JSON.parse(computeHighlightRectangles(boxes, 1000, 1000, 1.0));
    assert.equal(res[0].x, 1000);
    assert.equal(res[0].y, 1000);
    assert.equal(res[0].width, 0);
    assert.equal(res[0].height, 0);
  });

  await t.test('2.2.4 Boundary value: box touching exact viewport right edge', () => {
    const boxes = JSON.stringify([{ page: 1, x: 700, y: 100, width: 300, height: 50 }]);
    const res = JSON.parse(computeHighlightRectangles(boxes, 1000, 1000, 1.0));
    assert.equal(res[0].x, 700);
    assert.equal(res[0].width, 300); // 700 + 300 = 1000 (exact edge)
  });

  await t.test('2.2.5 Microscopic and high zoom scaling boundaries', () => {
    const boxes = JSON.stringify([{ page: 1, x: 100, y: 100, width: 200, height: 50 }]);
    
    // Zoom 0.01
    const micro = JSON.parse(computeHighlightRectangles(boxes, 1000, 1000, 0.01));
    assert.equal(micro[0].x, 1);
    assert.equal(micro[0].width, 2);

    // Zoom 20.0 (x = 2000, scaled width 4000 clamped to remaining viewport width 5000 - 2000 = 3000)
    const macro = JSON.parse(computeHighlightRectangles(boxes, 5000, 5000, 20.0));
    assert.equal(macro[0].x, 2000);
    assert.equal(macro[0].width, 3000);
  });

  // --- 2.3 JWT & RBAC Boundary Values ---
  await t.test('2.3.1 Missing and malformed Authorization headers', async () => {
    const noHeader = await api.handleRequest('POST', '/api/v1/documents/upload', {});
    assert.equal(noHeader.status, 401);

    const badBearer = await api.handleRequest('POST', '/api/v1/documents/upload', {}, { Authorization: 'Basic dXNlcjpwYXNz' });
    assert.equal(badBearer.status, 401);

    const malformedToken = await api.handleRequest('POST', '/api/v1/documents/upload', {}, { Authorization: 'Bearer this_is_not_a_valid_jwt' });
    assert.equal(malformedToken.status, 401);
  });

  await t.test('2.3.2 Non-existent permissions return 403 or false', () => {
    assert.equal(hasPermission('viewer', 'documents:destroy_universe'), false);
    assert.equal(hasPermission('unknown_role', 'documents:read'), false);
  });

  // --- 2.4 REST API Parameter Boundaries ---
  await t.test('2.4.1 Document upload with empty string title or missing folder_id rejected (400)', async () => {
    const res1 = await api.handleRequest('POST', '/api/v1/documents/upload', {
      title: '   ',
      folder_id: 'fld-1',
      file: 'data'
    }, { Authorization: `Bearer ${adminToken}` });
    assert.equal(res1.status, 400);

    const res2 = await api.handleRequest('POST', '/api/v1/documents/upload', {
      title: 'Valid Title',
      folder_id: null,
      file: 'data'
    }, { Authorization: `Bearer ${adminToken}` });
    assert.equal(res2.status, 400);
  });

  await t.test('2.4.2 AI compare with less than 2 document IDs rejected (400)', async () => {
    const res = await api.handleRequest('POST', '/api/v1/ai/compare', {
      document_ids: ['doc-only-one'],
      query: 'Compare this single document'
    }, { Authorization: `Bearer ${adminToken}` });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /At least two document_ids are required/);
  });

  await t.test('2.4.3 AI Q&A with empty or whitespace-only question rejected (400)', async () => {
    const res = await api.handleRequest('POST', '/api/v1/ai/qa', {
      document_id: 'doc-uuid-1',
      question: '    '
    }, { Authorization: `Bearer ${adminToken}` });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /question cannot be empty/);
  });

  await t.test('2.4.4 Workflow action with unauthorized verb rejected (400)', async () => {
    const res = await api.handleRequest('PUT', '/api/v1/workflows/wf-1/action', {
      action: 'delete_database',
      notes: 'Malicious attempt'
    }, { Authorization: `Bearer ${adminToken}` });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /Invalid action/);
  });
});
