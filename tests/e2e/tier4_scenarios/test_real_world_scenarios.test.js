const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { ApiDispatcher } = require('../helpers/api_mock_server');
const { signJwt, verifyJwt } = require('../helpers/jwt_oracle');
const { encryptPrompt, decryptPrompt, wipeBytes, tamperPayload } = require('../helpers/crypto_oracle');
const { computeHighlightRectangles } = require('../helpers/wasm_oracle');

test('Tier 4 - Real-World End-to-End Enterprise Scenarios', async (t) => {
  const jwtSecret = 'production_grade_jwt_secret_e2e_enterprise_scenario';
  const aesKey = crypto.randomBytes(32);
  const api = new ApiDispatcher({ jwtSecret });

  await t.test('4.1 Scenario 1: End-to-End Enterprise Document Lifecycle (Upload -> Compare -> Wasm View -> Approval -> Q&A)', async () => {
    // -------------------------------------------------------------
    // Step 1: Uploader Authentication
    // -------------------------------------------------------------
    const loginUploader = await api.handleRequest('POST', '/api/v1/auth/login', {
      username: 'uploader_1',
      password: 'uploaderpass'
    });
    assert.equal(loginUploader.status, 200);
    const uploaderToken = loginUploader.body.token;
    assert.ok(uploaderToken);

    // -------------------------------------------------------------
    // Step 2: Document Ingestion (PDF Upload)
    // -------------------------------------------------------------
    const uploadRes = await api.handleRequest('POST', '/api/v1/documents/upload', {
      title: 'Perjanjian Lisensi Perangkat Lunak 2026.pdf',
      folder_id: 'folder-legal-2026-uuid',
      file: Buffer.from('%PDF-1.7 ... Mock Binary Content ...')
    }, {
      Authorization: `Bearer ${uploaderToken}`
    });
    assert.equal(uploadRes.status, 201);
    const docId2026 = uploadRes.body.document_id;
    assert.ok(docId2026);

    // -------------------------------------------------------------
    // Step 3: Simulated Layout-Aware OCR & Vector Chunking
    // -------------------------------------------------------------
    const mockChunks = [
      {
        id: crypto.randomUUID(),
        document_id: docId2026,
        chunk_index: 0,
        content: 'Pasal 5: Denda keterlambatan pembayaran adalah 2% per bulan takwim.',
        embedding: new Array(1536).fill(0.0123) // 1536-dimensional vector
      }
    ];
    assert.equal(mockChunks[0].embedding.length, 1536, 'Vector embedding must match pgvector(1536)');

    // -------------------------------------------------------------
    // Step 4: Reviewer Logs In & Executes AI Multi-Document Compare
    // -------------------------------------------------------------
    const loginReviewer = await api.handleRequest('POST', '/api/v1/auth/login', {
      username: 'reviewer_1',
      password: 'reviewerpass'
    });
    assert.equal(loginReviewer.status, 200);
    const reviewerToken = loginReviewer.body.token;

    // Transient prompt decryption in RAM
    const encryptedSystemPrompt = encryptPrompt('You are Brilian Contract Comparison Engine.', aesKey);
    const transientRamPrompt = decryptPrompt(encryptedSystemPrompt, aesKey);
    assert.ok(transientRamPrompt.toString('utf8').includes('Contract Comparison Engine'));

    const compareRes = await api.handleRequest('POST', '/api/v1/ai/compare', {
      document_ids: ['doc-contracts-2025-uuid', docId2026],
      query: 'Bandingkan nilai klausul denda keterlambatan pada kedua kontrak.'
    }, {
      Authorization: `Bearer ${reviewerToken}`
    });

    // Zeroize decrypted prompt immediately after AI inference
    wipeBytes(transientRamPrompt);
    assert.equal(transientRamPrompt[0], 0);

    assert.equal(compareRes.status, 200);
    assert.ok(compareRes.body.comparison_result);
    assert.equal(compareRes.body.citations.length, 2);

    // -------------------------------------------------------------
    // Step 5: Rust Wasm Bounding Box Highlight Calculation for React UI
    // -------------------------------------------------------------
    const citationBoxes = JSON.stringify([
      { page: compareRes.body.citations[0].page, x: 72, y: 150, width: 450, height: 40 },
      { page: compareRes.body.citations[1].page, x: 72, y: 220, width: 450, height: 40 }
    ]);
    const highlightsJson = computeHighlightRectangles(citationBoxes, 1200, 1600, 1.5);
    const highlights = JSON.parse(highlightsJson);
    assert.equal(highlights.length, 2);
    assert.equal(highlights[0].x, 108); // 72 * 1.5
    assert.equal(highlights[0].width, 675); // 450 * 1.5

    // -------------------------------------------------------------
    // Step 6: Multi-Stage Workflow Approval by Reviewer
    // -------------------------------------------------------------
    const wfActionRes = await api.handleRequest('PUT', `/api/v1/workflows/wf-${docId2026}/action`, {
      action: 'approve',
      notes: 'Klausul denda 2% telah disetujui oleh Direksi Legal.'
    }, {
      Authorization: `Bearer ${reviewerToken}`
    });
    assert.equal(wfActionRes.status, 200);
    assert.equal(wfActionRes.body.status, 'success');

    // -------------------------------------------------------------
    // Step 7: Viewer Logs In & Queries AI Q&A on Approved Document
    // -------------------------------------------------------------
    const loginViewer = await api.handleRequest('POST', '/api/v1/auth/login', {
      username: 'viewer_1',
      password: 'viewerpass'
    });
    assert.equal(loginViewer.status, 200);
    const viewerToken = loginViewer.body.token;

    const qaRes = await api.handleRequest('POST', '/api/v1/ai/qa', {
      document_id: docId2026,
      question: 'Berapa tanggal jatuh tempo pembayaran?'
    }, {
      Authorization: `Bearer ${viewerToken}`
    });
    assert.equal(qaRes.status, 200);
    assert.ok(qaRes.body.answer);
    assert.equal(qaRes.body.page_reference, 2);
  });

  await t.test('4.2 Scenario 2: Adversarial Security & License Tampering Defense', async () => {
    // 1. Storage Tampering: Malicious byte modification of AES storage ciphertext
    const validCiphertext = encryptPrompt('Confidential enterprise memo', aesKey);
    const tamperedCiphertext = tamperPayload(validCiphertext, 18);

    assert.throws(() => {
      decryptPrompt(tamperedCiphertext, aesKey);
    }, /unsupported state or unable to authenticate data|bad decrypt/i, 'Storage tampering must be caught by GCM auth tag');

    // 2. Privilege Escalation: Viewer attempts to modify workflow
    const viewerToken = signJwt({ sub: 'u-viewer', username: 'viewer_1', role: 'viewer' }, jwtSecret);
    const unauthorizedWf = await api.handleRequest('PUT', '/api/v1/workflows/wf-critical/action', {
      action: 'approve',
      notes: 'Unauthorized approval attempt'
    }, {
      Authorization: `Bearer ${viewerToken}`
    });
    assert.equal(unauthorizedWf.status, 403, 'Privilege escalation must be denied with 403 Forbidden');
  });
});
