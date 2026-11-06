const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { ApiDispatcher } = require('../helpers/api_mock_server');
const { signJwt } = require('../helpers/jwt_oracle');
const { verifyWatermark } = require('../helpers/watermark_oracle');
const { extractMetadata, classifyDocument } = require('../helpers/engine_oracle');

test('Tier 4 - Real-World Multi-Department Enterprise Scenarios', async (t) => {
  const jwtSecret = 'e2e_tier4_enterprise_workflow_jwt_secret_2026';
  const api = new ApiDispatcher({ jwtSecret });

  // Provision Enterprise Actors
  const actors = {
    hrUploader: { id: 'usr-hr-upl', username: 'ahmad_hr', name: 'Ahmad Fauzi', division: 'HR', level: 'L2', role: 'uploader' },
    financeViewer: { id: 'usr-fin-viw', username: 'rina_finance', name: 'Rina Wijaya', division: 'Finance', level: 'L2', role: 'viewer' },
    hrDirector: { id: 'usr-hr-dir', username: 'ratna_director', name: 'Ratna Juwita', division: 'HR', level: 'L5', role: 'reviewer' },
    legalCounsel: { id: 'usr-leg-counsel', username: 'hendra_legal', name: 'Dr. Hendra Gunawan', division: 'Legal', level: 'L4', role: 'uploader' },
    systemAdmin: { id: 'usr-sys-admin', username: 'budi_admin', name: 'Budi Santoso', division: 'ALL', level: 'L5', role: 'admin' }
  };

  for (const [key, actor] of Object.entries(actors)) {
    api.users.set(actor.username, { ...actor, password: 'password123' });
    api.userQuotas.set(actor.id, { max_bytes: 1024 * 1024 * 1024, used_bytes: 0 });
  }

  const hrUploaderToken = signJwt({ sub: actors.hrUploader.id, ...actors.hrUploader }, jwtSecret);
  const financeViewerToken = signJwt({ sub: actors.financeViewer.id, ...actors.financeViewer }, jwtSecret);
  const hrDirectorToken = signJwt({ sub: actors.hrDirector.id, ...actors.hrDirector }, jwtSecret);
  const legalCounselToken = signJwt({ sub: actors.legalCounsel.id, ...actors.legalCounsel }, jwtSecret);
  const adminToken = signJwt({ sub: actors.systemAdmin.id, ...actors.systemAdmin }, jwtSecret);

  // ---------------------------------------------------------------------------
  // Scenario 4.3: Multi-Department Workflow
  // (HR uploader -> L2 viewer with dynamic watermark -> Cross-division block -> HR Director download -> Admin audit inspection)
  // ---------------------------------------------------------------------------
  await t.test('4.3 Scenario: Multi-Department Workflow & Cross-Division Access Enforcement', async () => {
    // -------------------------------------------------------------------------
    // Step 1: HR Uploader uploads Internal employee policy document
    // -------------------------------------------------------------------------
    const init1 = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'Kebijakan_Karyawan_2026.pdf',
      total_size: 1048576, // 1 MB
      mime_type: 'application/pdf',
      classification: 'Internal',
      division: 'HR',
      folder_id: 'fld-hr-policies'
    }, { Authorization: `Bearer ${hrUploaderToken}` });
    assert.equal(init1.status, 201);
    const sid1 = init1.body.session_id;

    const fileBuf1 = Buffer.concat([
      Buffer.from('%PDF-1.7 HR Policy Document: Jam Kerja dan Hak Cuti Karyawan\n'),
      Buffer.alloc(1048576 - 60, 0)
    ]);

    await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: sid1,
      chunk_index: 0,
      file: fileBuf1
    }, { Authorization: `Bearer ${hrUploaderToken}` });

    const comp1 = await api.handleRequest('POST', '/api/v1/documents/upload/complete', {
      session_id: sid1
    }, { Authorization: `Bearer ${hrUploaderToken}` });
    assert.equal(comp1.status, 201);
    const docIdInternal = comp1.body.document_id;
    assert.ok(docIdInternal);

    // -------------------------------------------------------------------------
    // Step 2: L2 Finance Viewer previews the Internal HR document
    // Internal documents allow cross-division viewing. Dynamic watermark is applied.
    // -------------------------------------------------------------------------
    const previewRes = await api.handleRequest('GET', `/api/v1/documents/${docIdInternal}/preview`, {}, {
      Authorization: `Bearer ${financeViewerToken}`
    });
    assert.equal(previewRes.status, 200);
    assert.equal(previewRes.headers['X-Watermark-Applied'], 'true');
    assert.equal(previewRes.body.watermark.FullName, 'Rina Wijaya');
    assert.equal(previewRes.body.watermark.UserID, 'usr-fin-viw');
    assert.equal(previewRes.body.watermark.Opacity, 0.20);

    // -------------------------------------------------------------------------
    // Step 3: L2 Finance Viewer downloads the Internal HR document (L2+ allowed)
    // Downloaded binary is permanently stamped with dynamic watermark.
    // -------------------------------------------------------------------------
    const downloadRes = await api.handleRequest('GET', `/api/v1/documents/${docIdInternal}/download`, {}, {
      Authorization: `Bearer ${financeViewerToken}`
    });
    assert.equal(downloadRes.status, 200);
    assert.equal(downloadRes.headers['X-Watermark-Applied'], 'true');

    const downloadWatermark = verifyWatermark(downloadRes.body.content, {
      FullName: 'Rina Wijaya',
      UserID: 'usr-fin-viw',
      Opacity: 0.20
    });
    assert.equal(downloadWatermark.valid, true);

    // -------------------------------------------------------------------------
    // Step 4: HR Uploader uploads Confidential (Rahasia) compensation document
    // -------------------------------------------------------------------------
    const init2 = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'Evaluasi_Kompensasi_Direksi_2026.pdf',
      total_size: 1048576,
      mime_type: 'application/pdf',
      classification: 'Rahasia',
      division: 'HR',
      folder_id: 'fld-hr-confidential'
    }, { Authorization: `Bearer ${hrUploaderToken}` });
    assert.equal(init2.status, 201);
    const sid2 = init2.body.session_id;

    const fileBuf2 = Buffer.concat([
      Buffer.from('%PDF-1.7 RAHASIA: Struktur Kompensasi dan Bonus Direksi\n'),
      Buffer.alloc(1048576 - 55, 0)
    ]);

    await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: sid2,
      chunk_index: 0,
      file: fileBuf2
    }, { Authorization: `Bearer ${hrUploaderToken}` });

    const comp2 = await api.handleRequest('POST', '/api/v1/documents/upload/complete', {
      session_id: sid2
    }, { Authorization: `Bearer ${hrUploaderToken}` });
    assert.equal(comp2.status, 201);
    const docIdRahasia = comp2.body.document_id;

    // -------------------------------------------------------------------------
    // Step 5: Finance Viewer attempts to access Confidential HR document
    // Cross-division access to Rahasia is strictly denied (403 Forbidden).
    // -------------------------------------------------------------------------
    const blockedPreview = await api.handleRequest('GET', `/api/v1/documents/${docIdRahasia}/preview`, {}, {
      Authorization: `Bearer ${financeViewerToken}`
    });
    assert.equal(blockedPreview.status, 403);
    assert.match(blockedPreview.body.message, /restricted to HR division/i);

    const blockedDownload = await api.handleRequest('GET', `/api/v1/documents/${docIdRahasia}/download`, {}, {
      Authorization: `Bearer ${financeViewerToken}`
    });
    assert.equal(blockedDownload.status, 403);

    // -------------------------------------------------------------------------
    // Step 6: HR Director (Level L5, same division) downloads Rahasia document
    // Permitted! Dynamic watermark stamped with HR Director's identity.
    // -------------------------------------------------------------------------
    const directorDownload = await api.handleRequest('GET', `/api/v1/documents/${docIdRahasia}/download`, {}, {
      Authorization: `Bearer ${hrDirectorToken}`
    });
    assert.equal(directorDownload.status, 200);

    const dirWmark = verifyWatermark(directorDownload.body.content, {
      FullName: 'Ratna Juwita',
      UserID: 'usr-hr-dir',
      Opacity: 0.20
    });
    assert.equal(dirWmark.valid, true);

    // -------------------------------------------------------------------------
    // Step 7: System Admin inspects immutable audit logs
    // Verifies all lifecycle events are present and tamper-resistant.
    // -------------------------------------------------------------------------
    const auditRes = await api.handleRequest('GET', '/api/v1/audit/logs', {}, {
      Authorization: `Bearer ${adminToken}`
    });
    assert.equal(auditRes.status, 200);
    const { logs } = auditRes.body;

    const hrUpload1 = logs.find(l => l.action === 'DOCUMENT_UPLOAD' && l.resource_id === docIdInternal);
    assert.ok(hrUpload1);
    assert.equal(hrUpload1.user_name, 'Ahmad Fauzi');
    assert.equal(hrUpload1.user_division, 'HR');

    const finView = logs.find(l => l.action === 'DOCUMENT_VIEW' && l.resource_id === docIdInternal);
    assert.ok(finView);
    assert.equal(finView.user_name, 'Rina Wijaya');
    assert.equal(finView.user_division, 'Finance');

    const finDownload = logs.find(l => l.action === 'DOCUMENT_DOWNLOAD' && l.resource_id === docIdInternal);
    assert.ok(finDownload);
    assert.equal(finDownload.user_name, 'Rina Wijaya');

    const dirDownloadLog = logs.find(l => l.action === 'DOCUMENT_DOWNLOAD' && l.resource_id === docIdRahasia);
    assert.ok(dirDownloadLog);
    assert.equal(dirDownloadLog.user_name, 'Ratna Juwita');

    // Immutability check: DELETE rejected
    const delAudit = await api.handleRequest('DELETE', '/api/v1/audit/logs', {}, {
      Authorization: `Bearer ${adminToken}`
    });
    assert.equal(delAudit.status, 405);
  });

  // ---------------------------------------------------------------------------
  // Scenario 4.4: Regulatory Legal Audit & Document Provenance Lifecycle
  // ---------------------------------------------------------------------------
  await t.test('4.4 Scenario: Regulatory Legal Audit, Deterministic Extraction & Version Provenance', async () => {
    // -------------------------------------------------------------------------
    // Step 1: Legal Counsel uploads draft agreement
    // -------------------------------------------------------------------------
    const contractText = `SURAT PERJANJIAN KERJASAMA PENGADAAN PERANGKAT LUNAK
Nomor Kontrak: SPK/2026/VND-992
Tanggal Efektif: 06/11/2026
Nilai Kontrak: Rp 1.850.000.000 (Satu Miliar Delapan Ratus Lima Puluh Juta Rupiah)
Denda Keterlambatan: 1.5% per bulan takwim
Pihak Pertama dan Pihak Kedua sepakat menandatangani pada 2026-11-06.`;

    // Extract metadata using deterministic engine (zero LLM calls)
    const metadata = extractMetadata(contractText);
    assert.ok(metadata.dates.includes('06/11/2026'));
    assert.ok(metadata.dates.includes('2026-11-06'));
    assert.ok(metadata.currencies.some(c => c.includes('1.850.000.000')));
    assert.ok(metadata.percentages.includes('1.5%'));
    assert.ok(metadata.identifiers.some(id => id.includes('SPK/2026/VND-992')));

    // Classify document deterministically
    const classification = classifyDocument(contractText, 'kontrak_vendor_2026.docx');
    assert.equal(classification.docType, 'Surat Perjanjian');
    assert.ok(classification.confidence >= 0.80);

    // Upload v1
    const init1 = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'Kontrak_Vendor_Pengadaan_2026.pdf',
      total_size: 512,
      mime_type: 'application/pdf',
      classification: 'Rahasia',
      division: 'Legal',
      folder_id: 'fld-legal-contracts'
    }, { Authorization: `Bearer ${legalCounselToken}` });
    const s1 = init1.body.session_id;

    await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: s1,
      chunk_index: 0,
      file: Buffer.from('%PDF-1.7 ' + contractText)
    }, { Authorization: `Bearer ${legalCounselToken}` });

    const comp1 = await api.handleRequest('POST', '/api/v1/documents/upload/complete', {
      session_id: s1
    }, { Authorization: `Bearer ${legalCounselToken}` });
    const docId = comp1.body.document_id;
    assert.equal(comp1.body.version, 1);

    // -------------------------------------------------------------------------
    // Step 2: Legal Counsel uploads amended contract (same name in same folder)
    // Automatically creates Version 2, preserving Version 1.
    // -------------------------------------------------------------------------
    const init2 = await api.handleRequest('POST', '/api/v1/documents/upload/init', {
      filename: 'Kontrak_Vendor_Pengadaan_2026.pdf',
      total_size: 512,
      mime_type: 'application/pdf',
      classification: 'Rahasia',
      division: 'Legal',
      folder_id: 'fld-legal-contracts'
    }, { Authorization: `Bearer ${legalCounselToken}` });
    const s2 = init2.body.session_id;

    const amendedText = contractText.replace('Rp 1.850.000.000', 'Rp 2.100.000.000');
    await api.handleRequest('POST', '/api/v1/documents/upload/chunk', {
      session_id: s2,
      chunk_index: 0,
      file: Buffer.from('%PDF-1.7 ' + amendedText)
    }, { Authorization: `Bearer ${legalCounselToken}` });

    const comp2 = await api.handleRequest('POST', '/api/v1/documents/upload/complete', {
      session_id: s2
    }, { Authorization: `Bearer ${legalCounselToken}` });
    assert.equal(comp2.body.version, 2);

    // -------------------------------------------------------------------------
    // Step 3: Inadvertent soft-deletion to trash and subsequent recovery
    // -------------------------------------------------------------------------
    const delRes = await api.handleRequest('DELETE', `/api/v1/documents/${docId}`, {}, {
      Authorization: `Bearer ${adminToken}`
    });
    assert.equal(delRes.status, 200);

    // Restore from trash
    await api.handleRequest('POST', `/api/v1/trash/${docId}/restore`, {}, {
      Authorization: `Bearer ${adminToken}`
    });

    // Restore historical Version 1 as active Version 3
    const restoreRes = await api.handleRequest('POST', `/api/v1/documents/${docId}/versions/1/restore`, {}, {
      Authorization: `Bearer ${legalCounselToken}`
    });
    assert.equal(restoreRes.status, 200);
    assert.equal(restoreRes.body.current_version, 3);
    assert.equal(restoreRes.body.restored_from, 1);

    // -------------------------------------------------------------------------
    // Step 4: Auditor inspects complete immutable audit trail
    // -------------------------------------------------------------------------
    const auditRes = await api.handleRequest('GET', '/api/v1/audit/logs', {}, {
      Authorization: `Bearer ${adminToken}`
    });
    const docLogs = auditRes.body.logs.filter(l => l.resource_id === docId);

    assert.ok(docLogs.some(l => l.action === 'DOCUMENT_UPLOAD' && l.details.version === 1));
    assert.ok(docLogs.some(l => l.action === 'DOCUMENT_UPLOAD' && l.details.version === 2));
    assert.ok(docLogs.some(l => l.action === 'DOCUMENT_DELETE'));
    assert.ok(docLogs.some(l => l.action === 'DOCUMENT_RESTORE_TRASH'));
    assert.ok(docLogs.some(l => l.action === 'VERSION_RESTORE' && l.details.new_version === 3));
  });
});
