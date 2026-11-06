/**
 * Filename Sanitizer & Malicious File Inspector
 * Implements defenses against path traversal, null bytes, zip bombs, SVG XSS, and Office macros.
 */

const path = require('node:path');

const DISALLOWED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.vbs', '.js', '.ps1', '.msi', '.dll', '.jar', '.com', '.scr', '.pif'
]);

const MACRO_EXTENSIONS = new Set([
  '.docm', '.xlsm', '.pptm', '.dotm', '.xltm', '.ppam'
]);

const RESERVED_DEVICE_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);

/**
 * Sanitizes an incoming raw filename.
 * Removes directory traversal sequences, null bytes, and dangerous characters.
 */
function sanitizeFilename(rawFilename) {
  if (!rawFilename || typeof rawFilename !== 'string') {
    throw new Error('Filename must be a non-empty string');
  }

  // Check for null bytes (%00 or \0)
  if (rawFilename.includes('\0') || rawFilename.includes('%00')) {
    throw new Error('Null byte injection detected in filename');
  }

  // Detect path traversal
  if (rawFilename.includes('..') || rawFilename.includes('/') || rawFilename.includes('\\')) {
    // Extract base name securely
    rawFilename = path.basename(rawFilename.replace(/\\/g, '/'));
  }

  // Strip invalid characters: <>:"/\|?* and control characters
  let cleaned = rawFilename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  if (cleaned === '' || cleaned === '.') {
    throw new Error('Sanitization resulted in an empty filename');
  }

  // Check extension
  const ext = path.extname(cleaned).toLowerCase();
  if (DISALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Executable extension '${ext}' is prohibited`);
  }

  // Check reserved Windows device names (e.g. CON.pdf -> safe_CON.pdf)
  const baseName = path.basename(cleaned, ext).toUpperCase();
  if (RESERVED_DEVICE_NAMES.has(baseName)) {
    cleaned = `safe_${cleaned}`;
  }

  return cleaned;
}

/**
 * Inspects SVG content for embedded scripts and executable event handlers.
 */
function inspectSvgContent(svgContent) {
  const content = typeof svgContent === 'string' ? svgContent : Buffer.from(svgContent).toString('utf8');

  // Script tags
  if (/<script\b[^>]*>/i.test(content)) {
    return { safe: false, reason: 'SVG contains executable <script> tag' };
  }

  // Inline event handlers (onload, onerror, onclick, onmouseover, etc.)
  if (/\son[a-z]+\s*=/i.test(content)) {
    return { safe: false, reason: 'SVG contains inline JavaScript event handler' };
  }

  // javascript: URI scheme
  if (/javascript\s*:/i.test(content)) {
    return { safe: false, reason: 'SVG contains javascript: URI scheme' };
  }

  // <foreignObject> embedding
  if (/<foreignObject\b[^>]*>/i.test(content)) {
    return { safe: false, reason: 'SVG contains dangerous <foreignObject> container' };
  }

  return { safe: true };
}

/**
 * Inspects an Office document or zip payload for malicious content (macros, zip bombs).
 */
function inspectZipOrOffice(buffer, filename) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const ext = path.extname(filename).toLowerCase();

  // 1. Prohibit macro extensions
  if (MACRO_EXTENSIONS.has(ext)) {
    return { safe: false, reason: `Macro-enabled file extension '${ext}' is prohibited by security policy` };
  }

  // Only inspect if it is a ZIP or OpenXML document or starts with PK\x03\x04
  const isZipOrOffice = ext === '.zip' || ext === '.docx' || ext === '.xlsx' || ext === '.pptx' ||
    (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04);

  if (!isZipOrOffice) {
    return { safe: true };
  }

  // 2. Check for VBA binary macro payload inside archive
  const str = buf.toString('latin1');
  if (str.includes('vbaProject.bin') || str.includes('word/vbaData.xml') || str.includes('xl/vbaProject.bin')) {
    return { safe: false, reason: 'OpenXML archive contains vbaProject.bin macro code' };
  }

  // 3. Zip bomb ratio check heuristic (e.g. 42.zip or compressed repeated zeros)
  // If the zip header declares huge uncompressed sizes relative to payload size
  if (buf.length > 30 && buf.readUInt32LE(0) === 0x04034b50) {
    // In PK zip local file header: compressed size at offset 18 (4 bytes), uncompressed at 22 (4 bytes)
    const compressedSize = buf.readUInt32LE(18);
    const uncompressedSize = buf.readUInt32LE(22);
    if (compressedSize > 0 && uncompressedSize > 0) {
      const ratio = uncompressedSize / compressedSize;
      if (ratio > 100 || uncompressedSize > 1073741824) { // >100:1 or >1GB
        return { safe: false, reason: `Zip bomb detected: compression ratio ${ratio.toFixed(1)}:1 exceeds limit` };
      }
    }
  }

  return { safe: true };
}

module.exports = {
  sanitizeFilename,
  inspectSvgContent,
  inspectZipOrOffice,
  DISALLOWED_EXTENSIONS,
  MACRO_EXTENSIONS,
  RESERVED_DEVICE_NAMES
};
