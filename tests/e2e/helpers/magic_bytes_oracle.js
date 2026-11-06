/**
 * Content-Based File Magic Bytes Inspector & MIME Spoofing Detector
 * Inspects leading byte signatures according to PROJECT.md § Feature 5.
 */

const SIGNATURES = [
  { mime: 'application/pdf', check: (buf) => buf.subarray(0, 1024).includes(Buffer.from('%PDF-')) },
  { mime: 'image/png', check: (buf) => buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) },
  { mime: 'image/jpeg', check: (buf) => buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF },
  { mime: 'image/gif', check: (buf) => buf.length >= 6 && (buf.subarray(0, 6).toString('ascii') === 'GIF87a' || buf.subarray(0, 6).toString('ascii') === 'GIF89a') },
  { mime: 'image/webp', check: (buf) => buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP' },
  { mime: 'video/mp4', check: (buf) => buf.length >= 8 && buf.subarray(4, 8).toString('ascii') === 'ftyp' },
  { mime: 'audio/mpeg', check: (buf) => (buf.length >= 3 && buf.subarray(0, 3).toString('ascii') === 'ID3') || (buf.length >= 2 && buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) },
  { mime: 'audio/wav', check: (buf) => buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WAVE' },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    check: (buf) => buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04 && buf.toString('utf8').includes('word/')
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    check: (buf) => buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04 && buf.toString('utf8').includes('xl/')
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    check: (buf) => buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04 && buf.toString('utf8').includes('ppt/')
  },
  {
    mime: 'application/zip',
    check: (buf) => buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04
  },
  {
    mime: 'text/plain',
    check: (buf) => {
      // Must not contain null bytes within first 1024 bytes and must be valid ascii/utf-8
      const slice = buf.subarray(0, Math.min(buf.length, 1024));
      return !slice.includes(0x00);
    }
  }
];

/**
 * Detects MIME type from buffer binary content.
 */
function detectMimeType(buffer) {
  if (!buffer || buffer.length === 0) {
    return 'application/octet-stream';
  }
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  for (const sig of SIGNATURES) {
    try {
      if (sig.check(buf)) {
        return sig.mime;
      }
    } catch {
      // Continue check
    }
  }

  return 'application/octet-stream';
}

/**
 * Validates declared MIME type against buffer magic bytes.
 */
function validateMagicBytes(buffer, declaredMime) {
  const detected = detectMimeType(buffer);

  if (!declaredMime) {
    return { valid: false, error: 'Declared MIME type is required', detected };
  }

  // Exact match
  if (detected === declaredMime) {
    return { valid: true, detected };
  }

  // OpenXML family match with generic zip
  if (detected === 'application/zip' && declaredMime.startsWith('application/vnd.openxmlformats-officedocument')) {
    return { valid: true, detected: declaredMime };
  }

  // Text variations
  if (declaredMime.startsWith('text/') && detected === 'text/plain') {
    return { valid: true, detected: declaredMime };
  }

  return {
    valid: false,
    error: `MIME spoofing detected: file claims to be '${declaredMime}' but binary magic bytes match '${detected}'`,
    detected,
    declared: declaredMime
  };
}

module.exports = {
  detectMimeType,
  validateMagicBytes,
  SIGNATURES
};
