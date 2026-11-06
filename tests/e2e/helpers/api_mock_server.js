/**
 * In-Process REST API Mock Server & Dispatcher
 * Directly executes backend routing logic according to `dokumentasi_api_backend.md`,
 * `PROJECT.md`, and R1-R5 specifications.
 */

const crypto = require('node:crypto');
const { verifyJwt, hasPermission, signJwt } = require('./jwt_oracle');
const { evaluateAccess } = require('./rbac_oracle');
const { applyWatermark, validateWatermarkOptions } = require('./watermark_oracle');
const { validateMagicBytes, detectMimeType } = require('./magic_bytes_oracle');
const { sanitizeFilename, inspectSvgContent, inspectZipOrOffice } = require('./sanitizer_oracle');
const { extractMetadata, classifyDocument } = require('./engine_oracle');

class ApiDispatcher {
  constructor(options = {}) {
    this.jwtSecret = options.jwtSecret || 'brilian_jwt_secret_signing_key_2026_test';
    
    // Seed Users with Division & Level RBAC attributes
    this.users = new Map([
      ['admin_brilian', { id: 'usr-admin-1', role: 'admin', password: 'securepassword', division: 'ALL', level: 'L5', name: 'Budi Santoso' }],
      ['reviewer_1', { id: 'usr-rev-1', role: 'reviewer', password: 'reviewerpass', division: 'Legal', level: 'L3', name: 'Dewi Lestari' }],
      ['uploader_1', { id: 'usr-upl-1', role: 'uploader', password: 'uploaderpass', division: 'HR', level: 'L2', name: 'Ahmad Fauzi' }],
      ['viewer_1', { id: 'usr-viw-1', role: 'viewer', password: 'viewerpass', division: 'Finance', level: 'L2', name: 'Rina Wijaya' }]
    ]);

    // User Storage Quotas (Default 1GB = 1,073,741,824 bytes, per-user tracking)
    this.userQuotas = new Map([
      ['usr-admin-1', { max_bytes: 10 * 1024 * 1024 * 1024, used_bytes: 0 }],
      ['usr-rev-1', { max_bytes: 1024 * 1024 * 1024, used_bytes: 0 }],
      ['usr-upl-1', { max_bytes: 1024 * 1024 * 1024, used_bytes: 0 }],
      ['usr-viw-1', { max_bytes: 512 * 1024 * 1024, used_bytes: 0 }]
    ]);

    // Data Stores
    this.documents = new Map();
    this.documentVersions = new Map(); // docId -> Array of versions
    this.uploadSessions = new Map();   // sessionId -> UploadSession
    this.workflows = new Map();
    this.trash = new Map();            // docId -> deleted document record
    this.auditLogs = [];               // Append-only audit trail
    this.notifications = [];           // Event notifications
    this.watermarkConfig = {
      default_opacity: 0.20,
      default_angle: -45,
      banner_text: 'BRILIAN INTELLIGENT DMS'
    };
  }

  logAuditEvent(actor, action, resourceType, resourceId, details = {}, ip = '127.0.0.1') {
    const entry = {
      id: `audit-${crypto.randomUUID()}`,
      user_id: actor?.sub || actor?.user_id || 'anonymous',
      user_name: actor?.name || actor?.username || 'Unknown',
      user_division: actor?.division || 'General',
      user_level: actor?.level || 'L1',
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details,
      ip_address: ip,
      timestamp: new Date().toISOString()
    };
    this.auditLogs.push(entry);
    return entry;
  }

  addNotification(userId, title, message, eventType, resourceId) {
    const notif = {
      id: `notif-${crypto.randomUUID()}`,
      user_id: userId,
      title,
      message,
      event_type: eventType,
      resource_id: resourceId,
      read: false,
      timestamp: new Date().toISOString()
    };
    this.notifications.push(notif);
    return notif;
  }

  authenticate(req) {
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { error: { status: 401, body: { status: 'error', message: 'Missing or malformed Bearer authorization token' } } };
    }

    const token = authHeader.substring(7);
    try {
      const claims = verifyJwt(token, this.jwtSecret);
      // Ensure defaults for division & level if legacy token
      if (!claims.division) claims.division = claims.role === 'admin' ? 'ALL' : 'General';
      if (!claims.level) claims.level = claims.role === 'admin' ? 'L5' : 'L2';
      if (!claims.user_id) claims.user_id = claims.sub;
      return { claims };
    } catch (err) {
      return { error: { status: 401, body: { status: 'error', message: `Unauthorized: ${err.message}` } } };
    }
  }

  async handleRequest(method, path, body = {}, headers = {}) {
    const req = { method, path, body, headers };

    // =========================================================================
    // 1. POST /api/v1/auth/login (Unauthenticated)
    // =========================================================================
    if (method === 'POST' && path === '/api/v1/auth/login') {
      const { username, password } = body;
      if (!username || !password) {
        return { status: 400, body: { status: 'error', message: 'Username and password required' } };
      }

      const user = this.users.get(username);
      if (!user || user.password !== password) {
        return { status: 401, body: { status: 'error', message: 'Invalid credentials' } };
      }

      const token = signJwt({
        sub: user.id,
        user_id: user.id,
        username,
        role: user.role,
        division: user.division,
        level: user.level,
        name: user.name
      }, this.jwtSecret);

      this.logAuditEvent(user, 'LOGIN_SUCCESS', 'AUTH', user.id, { username });

      return {
        status: 200,
        body: {
          status: 'success',
          token,
          user: {
            id: user.id,
            username,
            role: user.role,
            division: user.division,
            level: user.level,
            name: user.name
          }
        }
      };
    }

    // =========================================================================
    // Authenticated Endpoints Barrier
    // =========================================================================
    const auth = this.authenticate(req);
    if (auth.error) {
      return auth.error;
    }
    const { claims } = auth;

    // =========================================================================
    // 2. Resumable Chunked Upload Protocol
    // =========================================================================

    // 2.1 POST /api/v1/documents/upload/init
    if (method === 'POST' && path === '/api/v1/documents/upload/init') {
      if (!hasPermission(claims.role, 'documents:upload')) {
        return { status: 403, body: { status: 'error', message: 'Forbidden: insufficient role permissions to upload documents' } };
      }

      const { filename, total_size, mime_type, folder_id, classification, division } = body;
      if (!filename || typeof filename !== 'string') {
        return { status: 400, body: { status: 'error', message: 'Valid filename is required' } };
      }
      if (typeof total_size !== 'number' || total_size <= 0) {
        return { status: 400, body: { status: 'error', message: 'total_size must be a positive number' } };
      }

      // Filename sanitization & path traversal check
      let safeName;
      try {
        safeName = sanitizeFilename(filename);
      } catch (err) {
        return { status: 400, body: { status: 'error', message: `Filename rejected: ${err.message}` } };
      }

      // Quota check
      const quota = this.userQuotas.get(claims.user_id) || { max_bytes: 1024 * 1024 * 1024, used_bytes: 0 };
      if (quota.used_bytes + total_size > quota.max_bytes) {
        return {
          status: 413,
          body: {
            status: 'error',
            message: `Storage quota exceeded: max ${quota.max_bytes} bytes, current ${quota.used_bytes} bytes, incoming ${total_size} bytes`
          }
        };
      }

      const chunkSize = 5 * 1024 * 1024; // 5 MB standard chunk
      const totalChunks = Math.ceil(total_size / chunkSize);
      const sessionId = `upload-${crypto.randomUUID()}`;

      this.uploadSessions.set(sessionId, {
        session_id: sessionId,
        filename: safeName,
        total_size,
        mime_type: mime_type || 'application/octet-stream',
        folder_id: folder_id || 'root',
        classification: classification || 'Internal',
        division: division || claims.division || 'General',
        chunk_size: chunkSize,
        total_chunks: totalChunks,
        received_chunks: new Map(),
        status: 'pending',
        user_id: claims.user_id,
        created_at: new Date().toISOString()
      });

      return {
        status: 201,
        body: {
          status: 'success',
          session_id: sessionId,
          chunk_size: chunkSize,
          total_chunks: totalChunks
        }
      };
    }

    // 2.2 POST /api/v1/documents/upload/chunk
    if (method === 'POST' && path === '/api/v1/documents/upload/chunk') {
      const { session_id, chunk_index, chunk_hash, file } = body;
      if (!session_id || !this.uploadSessions.has(session_id)) {
        return { status: 404, body: { status: 'error', message: 'Upload session not found or expired' } };
      }

      const session = this.uploadSessions.get(session_id);
      if (session.user_id !== claims.user_id && claims.role !== 'admin') {
        return { status: 403, body: { status: 'error', message: 'Forbidden: unauthorized session owner' } };
      }

      if (typeof chunk_index !== 'number' || chunk_index < 0 || chunk_index >= session.total_chunks) {
        return { status: 400, body: { status: 'error', message: `Invalid chunk_index: ${chunk_index}` } };
      }

      const chunkBuf = Buffer.isBuffer(file) ? file : Buffer.from(file || '');
      
      // Verify hash if provided
      if (chunk_hash) {
        const computedHash = crypto.createHash('sha256').update(chunkBuf).digest('hex');
        if (computedHash !== chunk_hash) {
          return { status: 400, body: { status: 'error', message: 'Chunk checksum mismatch' } };
        }
      }

      session.received_chunks.set(chunk_index, chunkBuf);
      const receivedCount = session.received_chunks.size;
      const isComplete = receivedCount === session.total_chunks;
      session.status = isComplete ? 'completed' : 'pending';

      return {
        status: 200,
        body: {
          status: 'success',
          received: receivedCount,
          total: session.total_chunks,
          percent: Math.round((receivedCount / session.total_chunks) * 100)
        }
      };
    }

    // 2.3 POST /api/v1/documents/upload/complete
    if (method === 'POST' && path === '/api/v1/documents/upload/complete') {
      const { session_id } = body;
      if (!session_id || !this.uploadSessions.has(session_id)) {
        return { status: 404, body: { status: 'error', message: 'Upload session not found' } };
      }

      const session = this.uploadSessions.get(session_id);
      if (session.received_chunks.size < session.total_chunks) {
        return {
          status: 400,
          body: {
            status: 'error',
            message: `Incomplete upload: received ${session.received_chunks.size} of ${session.total_chunks} chunks`
          }
        };
      }

      // Assemble chunks
      const orderedChunks = [];
      for (let i = 0; i < session.total_chunks; i++) {
        orderedChunks.push(session.received_chunks.get(i));
      }
      const fullBuffer = Buffer.concat(orderedChunks);

      // Magic Bytes & Malware checks
      const magicCheck = validateMagicBytes(fullBuffer, session.mime_type);
      if (!magicCheck.valid && session.mime_type !== 'application/octet-stream') {
        return { status: 415, body: { status: 'error', message: magicCheck.error } };
      }

      // SVG XSS check
      if (session.mime_type === 'image/svg+xml') {
        const svgCheck = inspectSvgContent(fullBuffer);
        if (!svgCheck.safe) {
          return { status: 400, body: { status: 'error', message: `Malicious file rejected: ${svgCheck.reason}` } };
        }
      }

      // Office Macro / Zip bomb check
      const officeCheck = inspectZipOrOffice(fullBuffer, session.filename);
      if (!officeCheck.safe) {
        return { status: 400, body: { status: 'error', message: officeCheck.reason } };
      }

      // Check existing document with same filename in same folder for Versioning
      let existingDoc = null;
      for (const doc of this.documents.values()) {
        if (doc.title === session.filename && doc.folder_id === session.folder_id && !doc.is_deleted) {
          existingDoc = doc;
          break;
        }
      }

      let docRecord;
      let newVersionNum = 1;

      if (existingDoc) {
        // Auto-increment version
        newVersionNum = existingDoc.current_version + 1;
        existingDoc.current_version = newVersionNum;
        existingDoc.file_size = fullBuffer.length;
        existingDoc.updated_at = new Date().toISOString();
        existingDoc.content = fullBuffer;

        const versionsList = this.documentVersions.get(existingDoc.id) || [];
        versionsList.push({
          version_number: newVersionNum,
          file_size: fullBuffer.length,
          created_at: new Date().toISOString(),
          uploaded_by: claims.user_id,
          content: fullBuffer
        });
        this.documentVersions.set(existingDoc.id, versionsList);
        docRecord = existingDoc;
      } else {
        // Create new Document Record
        const docId = `doc-${crypto.randomUUID()}`;
        docRecord = {
          id: docId,
          title: session.filename,
          folder_id: session.folder_id,
          file_size: fullBuffer.length,
          mime_type: session.mime_type,
          classification: session.classification,
          division: session.division,
          current_version: 1,
          status: 'draft',
          uploaded_by: claims.user_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          content: fullBuffer,
          is_deleted: false
        };
        this.documents.set(docId, docRecord);
        this.documentVersions.set(docId, [{
          version_number: 1,
          file_size: fullBuffer.length,
          created_at: new Date().toISOString(),
          uploaded_by: claims.user_id,
          content: fullBuffer
        }]);
      }

      // Update quota usage
      const q = this.userQuotas.get(claims.user_id);
      if (q) q.used_bytes += fullBuffer.length;

      // Clean up session
      this.uploadSessions.delete(session_id);

      // Audit log & notification
      this.logAuditEvent(claims, 'DOCUMENT_UPLOAD', 'DOCUMENT', docRecord.id, {
        filename: session.filename,
        version: newVersionNum,
        size: fullBuffer.length,
        classification: docRecord.classification
      });
      this.addNotification(claims.user_id, 'Upload Selesai', `Dokumen ${docRecord.title} v${newVersionNum} berhasil diunggah.`, 'UPLOAD_SUCCESS', docRecord.id);

      return {
        status: 201,
        body: {
          status: 'success',
          document_id: docRecord.id,
          version: newVersionNum,
          document: {
            id: docRecord.id,
            title: docRecord.title,
            current_version: newVersionNum,
            file_size: docRecord.file_size,
            classification: docRecord.classification,
            division: docRecord.division
          }
        }
      };
    }

    // 2.4 GET /api/v1/documents/upload/status/:id
    const uploadStatusMatch = path.match(/^\/api\/v1\/documents\/upload\/status\/([^/]+)$/);
    if (method === 'GET' && uploadStatusMatch) {
      const sessionId = uploadStatusMatch[1];
      const session = this.uploadSessions.get(sessionId);
      if (!session) {
        return { status: 404, body: { status: 'error', message: 'Upload session not found' } };
      }
      return {
        status: 200,
        body: {
          status: session.status,
          received_chunks: Array.from(session.received_chunks.keys()),
          total_chunks: session.total_chunks,
          percent: Math.round((session.received_chunks.size / session.total_chunks) * 100)
        }
      };
    }

    // =========================================================================
    // 3. Legacy Single-Part Upload (Preserved for existing tests)
    // =========================================================================
    if (method === 'POST' && path === '/api/v1/documents/upload') {
      if (!hasPermission(claims.role, 'documents:upload')) {
        return { status: 403, body: { status: 'error', message: 'Forbidden: insufficient role permissions to upload documents' } };
      }

      const { title, folder_id, file, classification, division } = body;
      if (!title || typeof title !== 'string' || title.trim() === '') {
        return { status: 400, body: { status: 'error', message: 'Invalid or missing title' } };
      }
      if (!folder_id || typeof folder_id !== 'string') {
        return { status: 400, body: { status: 'error', message: 'Invalid or missing folder_id' } };
      }
      if (!file) {
        return { status: 400, body: { status: 'error', message: 'File is required' } };
      }

      const fileBuf = Buffer.isBuffer(file) ? file : Buffer.from(file);
      const docId = `doc-${crypto.randomUUID()}`;
      const docRecord = {
        id: docId,
        title,
        folder_id,
        content: fileBuf,
        file_size: fileBuf.length,
        mime_type: 'application/pdf',
        classification: classification || 'Internal',
        division: division || claims.division || 'General',
        current_version: 1,
        status: 'draft',
        uploaded_by: claims.sub,
        is_deleted: false,
        created_at: new Date().toISOString()
      };

      this.documents.set(docId, docRecord);
      this.documentVersions.set(docId, [{
        version_number: 1,
        file_size: fileBuf.length,
        created_at: new Date().toISOString(),
        uploaded_by: claims.sub,
        content: fileBuf
      }]);

      this.logAuditEvent(claims, 'DOCUMENT_UPLOAD', 'DOCUMENT', docId, { title, size: fileBuf.length, version: 1 });

      return {
        status: 201,
        body: {
          status: 'success',
          document_id: docId,
          message: 'Dokumen berhasil diunggah dan dijadwalkan untuk OCR indexing.'
        }
      };
    }

    // =========================================================================
    // 4. Document Preview & Download with Dynamic Watermarking & RBAC
    // =========================================================================

    // 4.1 GET /api/v1/documents/:id/preview
    const previewMatch = path.match(/^\/api\/v1\/documents\/([^/]+)\/preview$/);
    if (method === 'GET' && previewMatch) {
      const docId = previewMatch[1];
      const doc = this.documents.get(docId);
      if (!doc || doc.is_deleted) {
        return { status: 404, body: { status: 'error', message: 'Document not found' } };
      }

      // Dual-Axis RBAC Check: View
      const access = evaluateAccess(claims, doc.classification, doc.division, 'view');
      if (!access.allowed) {
        return { status: 403, body: { status: 'error', message: `Forbidden: ${access.reason}` } };
      }

      // Mandatory Dynamic Watermarking
      const watermarkOptions = {
        FullName: claims.name || claims.username || 'Authorized User',
        UserID: claims.user_id || claims.sub,
        Timestamp: new Date(),
        Opacity: this.watermarkConfig.default_opacity,
        DiagonalAngle: this.watermarkConfig.default_angle
      };

      const watermarkedBuf = applyWatermark(doc.content, doc.mime_type, watermarkOptions);
      this.logAuditEvent(claims, 'DOCUMENT_VIEW', 'DOCUMENT', docId, { classification: doc.classification });

      return {
        status: 200,
        headers: {
          'Content-Type': doc.mime_type,
          'X-Watermark-Applied': 'true'
        },
        body: {
          status: 'success',
          document_id: docId,
          content: watermarkedBuf,
          watermark: watermarkOptions
        }
      };
    }

    // 4.2 GET /api/v1/documents/:id/download
    const downloadMatch = path.match(/^\/api\/v1\/documents\/([^/]+)\/download$/);
    if (method === 'GET' && downloadMatch) {
      const docId = downloadMatch[1];
      const doc = this.documents.get(docId);
      if (!doc || doc.is_deleted) {
        return { status: 404, body: { status: 'error', message: 'Document not found' } };
      }

      // Dual-Axis RBAC Check: Download
      const access = evaluateAccess(claims, doc.classification, doc.division, 'download');
      if (!access.allowed) {
        return { status: 403, body: { status: 'error', message: `Forbidden: ${access.reason}` } };
      }

      // Mandatory Dynamic Watermarking stamped into downloaded file stream
      const watermarkOptions = {
        FullName: claims.name || claims.username || 'Authorized User',
        UserID: claims.user_id || claims.sub,
        Timestamp: new Date(),
        Opacity: this.watermarkConfig.default_opacity,
        DiagonalAngle: this.watermarkConfig.default_angle
      };

      const watermarkedFile = applyWatermark(doc.content, doc.mime_type, watermarkOptions);
      this.logAuditEvent(claims, 'DOCUMENT_DOWNLOAD', 'DOCUMENT', docId, { classification: doc.classification });

      return {
        status: 200,
        headers: {
          'Content-Type': doc.mime_type,
          'Content-Disposition': `attachment; filename="${doc.title}"`,
          'X-Watermark-Applied': 'true'
        },
        body: {
          status: 'success',
          document_id: docId,
          filename: doc.title,
          content: watermarkedFile,
          watermark: watermarkOptions
        }
      };
    }

    // =========================================================================
    // 5. Version Inspection & Restore Lifecycle
    // =========================================================================

    // 5.1 GET /api/v1/documents/:id/versions
    const versionsMatch = path.match(/^\/api\/v1\/documents\/([^/]+)\/versions$/);
    if (method === 'GET' && versionsMatch) {
      const docId = versionsMatch[1];
      const doc = this.documents.get(docId);
      if (!doc || doc.is_deleted) {
        return { status: 404, body: { status: 'error', message: 'Document not found' } };
      }

      const versions = this.documentVersions.get(docId) || [];
      return {
        status: 200,
        body: {
          status: 'success',
          document_id: docId,
          current_version: doc.current_version,
          versions: versions.map(v => ({
            version_number: v.version_number,
            file_size: v.file_size,
            created_at: v.created_at,
            uploaded_by: v.uploaded_by
          }))
        }
      };
    }

    // 5.2 POST /api/v1/documents/:id/versions/:ver/restore
    const restoreVerMatch = path.match(/^\/api\/v1\/documents\/([^/]+)\/versions\/(\d+)\/restore$/);
    if (method === 'POST' && restoreVerMatch) {
      if (!hasPermission(claims.role, 'documents:upload')) {
        return { status: 403, body: { status: 'error', message: 'Forbidden: insufficient role to restore versions' } };
      }

      const docId = restoreVerMatch[1];
      const targetVer = parseInt(restoreVerMatch[2], 10);
      const doc = this.documents.get(docId);
      if (!doc || doc.is_deleted) {
        return { status: 404, body: { status: 'error', message: 'Document not found' } };
      }

      const versions = this.documentVersions.get(docId) || [];
      const historicalVer = versions.find(v => v.version_number === targetVer);
      if (!historicalVer) {
        return { status: 404, body: { status: 'error', message: `Version ${targetVer} not found` } };
      }

      // Restore creates new incremented version containing historical content
      const newVerNum = doc.current_version + 1;
      doc.current_version = newVerNum;
      doc.content = historicalVer.content;
      doc.file_size = historicalVer.file_size;
      doc.updated_at = new Date().toISOString();

      versions.push({
        version_number: newVerNum,
        file_size: historicalVer.file_size,
        created_at: new Date().toISOString(),
        uploaded_by: claims.user_id,
        content: historicalVer.content
      });

      this.logAuditEvent(claims, 'VERSION_RESTORE', 'DOCUMENT', docId, {
        restored_from: targetVer,
        new_version: newVerNum
      });

      return {
        status: 200,
        body: {
          status: 'success',
          document_id: docId,
          current_version: newVerNum,
          restored_from: targetVer,
          message: `Dokumen berhasil dipulihkan ke Versi ${newVerNum} dari Versi ${targetVer}.`
        }
      };
    }

    // =========================================================================
    // 6. Trash Lifecycle (Soft-Delete, List, Restore, Permanent Purge)
    // =========================================================================

    // 6.1 DELETE /api/v1/documents/:id (Soft-Delete)
    const softDeleteMatch = path.match(/^\/api\/v1\/documents\/([^/]+)$/);
    if (method === 'DELETE' && softDeleteMatch) {
      if (!hasPermission(claims.role, 'documents:delete') && claims.role !== 'admin' && claims.role !== 'reviewer') {
        return { status: 403, body: { status: 'error', message: 'Forbidden: insufficient role to delete documents' } };
      }

      const docId = softDeleteMatch[1];
      const doc = this.documents.get(docId);
      if (!doc || doc.is_deleted) {
        return { status: 404, body: { status: 'error', message: 'Document not found or already deleted' } };
      }

      doc.is_deleted = true;
      doc.deleted_at = new Date().toISOString();
      doc.deleted_by = claims.user_id;

      this.trash.set(docId, doc);
      this.logAuditEvent(claims, 'DOCUMENT_DELETE', 'DOCUMENT', docId, { soft_deleted: true });

      return {
        status: 200,
        body: {
          status: 'success',
          message: 'Dokumen berhasil dipindahkan ke kotak sampah (trash).'
        }
      };
    }

    // 6.2 GET /api/v1/trash (List deleted items)
    if (method === 'GET' && path === '/api/v1/trash') {
      const items = Array.from(this.trash.values()).map(d => ({
        id: d.id,
        title: d.title,
        folder_id: d.folder_id,
        deleted_at: d.deleted_at,
        deleted_by: d.deleted_by,
        file_size: d.file_size
      }));

      return {
        status: 200,
        body: {
          status: 'success',
          trash_items: items,
          count: items.length
        }
      };
    }

    // 6.3 POST /api/v1/trash/:id/restore (Restore from trash)
    const restoreTrashMatch = path.match(/^\/api\/v1\/trash\/([^/]+)\/restore$/);
    if (method === 'POST' && restoreTrashMatch) {
      const docId = restoreTrashMatch[1];
      const doc = this.trash.get(docId);
      if (!doc) {
        return { status: 404, body: { status: 'error', message: 'Item not found in trash' } };
      }

      doc.is_deleted = false;
      delete doc.deleted_at;
      delete doc.deleted_by;

      this.trash.delete(docId);
      this.logAuditEvent(claims, 'DOCUMENT_RESTORE_TRASH', 'DOCUMENT', docId, {});

      return {
        status: 200,
        body: {
          status: 'success',
          document_id: docId,
          message: 'Dokumen berhasil dipulihkan dari kotak sampah.'
        }
      };
    }

    // 6.4 DELETE /api/v1/trash/:id/permanent (Permanent purge - Admin / L5 only)
    const purgeTrashMatch = path.match(/^\/api\/v1\/trash\/([^/]+)\/permanent$/);
    if (method === 'DELETE' && purgeTrashMatch) {
      if (claims.role !== 'admin' && claims.level !== 'L5') {
        return { status: 403, body: { status: 'error', message: 'Forbidden: only Administrator or Level L5 can permanently purge items' } };
      }

      const docId = purgeTrashMatch[1];
      if (!this.trash.has(docId) && !this.documents.has(docId)) {
        return { status: 404, body: { status: 'error', message: 'Item not found' } };
      }

      this.trash.delete(docId);
      this.documents.delete(docId);
      this.documentVersions.delete(docId);

      this.logAuditEvent(claims, 'PERMANENT_PURGE', 'DOCUMENT', docId, {});

      return {
        status: 200,
        body: {
          status: 'success',
          message: 'Dokumen dan seluruh riwayat versi berhasil dihapus secara permanen.'
        }
      };
    }

    // =========================================================================
    // 7. Immutable Audit Trail
    // =========================================================================

    // 7.1 GET /api/v1/audit/logs
    if (method === 'GET' && path === '/api/v1/audit/logs') {
      if (claims.role !== 'admin' && claims.level !== 'L5') {
        return { status: 403, body: { status: 'error', message: 'Forbidden: audit logs restricted to Admin and L5' } };
      }

      return {
        status: 200,
        body: {
          status: 'success',
          logs: this.auditLogs,
          total: this.auditLogs.length
        }
      };
    }

    // 7.2 DELETE /api/v1/audit/logs (Tamper resistance - Strict rejection)
    if (method === 'DELETE' && path.startsWith('/api/v1/audit/logs')) {
      return {
        status: 405,
        body: {
          status: 'error',
          message: 'Method Not Allowed: audit logs are strictly append-only and cannot be deleted or truncated'
        }
      };
    }

    // =========================================================================
    // 8. Admin Management APIs
    // =========================================================================

    // 8.1 GET /api/v1/admin/watermark
    if (method === 'GET' && path === '/api/v1/admin/watermark') {
      if (claims.role !== 'admin') {
        return { status: 403, body: { status: 'error', message: 'Forbidden: admin only' } };
      }
      return {
        status: 200,
        body: {
          status: 'success',
          config: this.watermarkConfig
        }
      };
    }

    // 8.2 PUT /api/v1/admin/watermark (Validates opacity bounds 15%-25%)
    if (method === 'PUT' && path === '/api/v1/admin/watermark') {
      if (claims.role !== 'admin') {
        return { status: 403, body: { status: 'error', message: 'Forbidden: admin only' } };
      }

      const { opacity, angle, banner_text } = body;
      if (opacity !== undefined) {
        if (typeof opacity !== 'number' || opacity < 0.15 || opacity > 0.25) {
          return { status: 400, body: { status: 'error', message: 'Opacity must be bounded strictly between 0.15 and 0.25' } };
        }
        this.watermarkConfig.default_opacity = opacity;
      }
      if (angle !== undefined) {
        this.watermarkConfig.default_angle = angle;
      }
      if (banner_text) {
        this.watermarkConfig.banner_text = banner_text;
      }

      this.logAuditEvent(claims, 'CONFIG_WATERMARK', 'SYSTEM', 'watermark', this.watermarkConfig);

      return {
        status: 200,
        body: {
          status: 'success',
          config: this.watermarkConfig,
          message: 'Watermark configuration updated.'
        }
      };
    }

    // =========================================================================
    // 9. Deterministic Code Engines (Extraction & Classification)
    // =========================================================================

    // 9.1 POST /api/v1/engine/extract
    if (method === 'POST' && path === '/api/v1/engine/extract') {
      const { text } = body;
      if (typeof text !== 'string') {
        return { status: 400, body: { status: 'error', message: 'text field is required' } };
      }
      const extracted = extractMetadata(text);
      return {
        status: 200,
        body: {
          status: 'success',
          extracted
        }
      };
    }

    // 9.2 POST /api/v1/engine/classify
    if (method === 'POST' && path === '/api/v1/engine/classify') {
      const { text, filename } = body;
      if (typeof text !== 'string') {
        return { status: 400, body: { status: 'error', message: 'text field is required' } };
      }
      const classification = classifyDocument(text, filename || '');
      return {
        status: 200,
        body: {
          status: 'success',
          classification
        }
      };
    }

    // =========================================================================
    // 10. AI Compare, Q&A and Workflows (Preserved for existing tests)
    // =========================================================================

    // 10.1 POST /api/v1/ai/compare
    if (method === 'POST' && path === '/api/v1/ai/compare') {
      if (!hasPermission(claims.role, 'ai:compare')) {
        return { status: 403, body: { status: 'error', message: 'Forbidden: role does not have AI compare permission' } };
      }

      const { document_ids, query } = body;
      if (!Array.isArray(document_ids) || document_ids.length < 2) {
        return { status: 400, body: { status: 'error', message: 'At least two document_ids are required for comparison' } };
      }
      if (!query || typeof query !== 'string' || query.trim() === '') {
        return { status: 400, body: { status: 'error', message: 'Query cannot be empty' } };
      }

      return {
        status: 200,
        body: {
          status: 'success',
          comparison_result: '| Parameter | Kontrak 2025 | Kontrak 2026 |\n|---|---|---|\n| Nilai Denda | 1% | 2% |',
          citations: [
            { document_id: document_ids[0], page: 4 },
            { document_id: document_ids[1], page: 5 }
          ]
        }
      };
    }

    // 10.2 POST /api/v1/ai/qa
    if (method === 'POST' && path === '/api/v1/ai/qa') {
      if (!hasPermission(claims.role, 'ai:qa')) {
        return { status: 403, body: { status: 'error', message: 'Forbidden: role does not have AI QA permission' } };
      }

      const { document_id, question } = body;
      if (!document_id || typeof document_id !== 'string') {
        return { status: 400, body: { status: 'error', message: 'document_id is required' } };
      }
      if (!question || typeof question !== 'string' || question.trim() === '') {
        return { status: 400, body: { status: 'error', message: 'question cannot be empty' } };
      }

      return {
        status: 200,
        body: {
          status: 'success',
          answer: 'Tanggal jatuh tempo pembayaran adalah 30 hari setelah invoice diterbitkan.',
          page_reference: 2
        }
      };
    }

    // 10.3 PUT /api/v1/workflows/:id/action
    const workflowMatch = path.match(/^\/api\/v1\/workflows\/([^/]+)\/action$/);
    if (method === 'PUT' && workflowMatch) {
      const workflowId = workflowMatch[1];
      if (!hasPermission(claims.role, 'workflow:action')) {
        return { status: 403, body: { status: 'error', message: 'Forbidden: role does not have workflow action permission' } };
      }

      const { action, notes } = body;
      const validActions = ['approve', 'reject', 'revise'];
      if (!validActions.includes(action)) {
        return { status: 400, body: { status: 'error', message: `Invalid action. Must be one of: ${validActions.join(', ')}` } };
      }

      this.workflows.set(workflowId, {
        id: workflowId,
        last_action: action,
        notes: notes || '',
        action_by: claims.sub,
        updated_at: new Date().toISOString()
      });

      return {
        status: 200,
        body: {
          status: 'success',
          message: 'Status workflow berhasil diperbarui.'
        }
      };
    }

    return {
      status: 404,
      body: { status: 'error', message: `Endpoint not found: ${method} ${path}` }
    };
  }
}

module.exports = {
  ApiDispatcher
};
