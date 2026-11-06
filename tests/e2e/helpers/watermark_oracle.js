/**
 * Dynamic Diagonal Repeating Watermark Oracle
 * Generates and validates mandatory dynamic watermarks according to PROJECT.md § Watermark Engine Contract.
 */

const MIN_OPACITY = 0.15;
const MAX_OPACITY = 0.25;
const DEFAULT_ANGLE = -45;

/**
 * Validates watermark configuration options.
 */
function validateWatermarkOptions(options) {
  if (!options || typeof options !== 'object') {
    throw new Error('Watermark options must be an object');
  }
  if (!options.FullName || typeof options.FullName !== 'string' || options.FullName.trim() === '') {
    throw new Error('Watermark FullName is mandatory and cannot be empty');
  }
  if (!options.UserID || typeof options.UserID !== 'string' || options.UserID.trim() === '') {
    throw new Error('Watermark UserID is mandatory and cannot be empty');
  }

  const opacity = options.Opacity !== undefined ? options.Opacity : 0.20;
  if (typeof opacity !== 'number' || opacity < MIN_OPACITY || opacity > MAX_OPACITY) {
    throw new Error(`Watermark opacity must be strictly between ${MIN_OPACITY} and ${MAX_OPACITY} (inclusive), got ${opacity}`);
  }

  const angle = options.DiagonalAngle !== undefined ? options.DiagonalAngle : DEFAULT_ANGLE;
  const timestamp = options.Timestamp ? new Date(options.Timestamp).toISOString() : new Date().toISOString();

  return {
    FullName: options.FullName.trim(),
    UserID: options.UserID.trim(),
    Timestamp: timestamp,
    Opacity: opacity,
    DiagonalAngle: angle
  };
}

/**
 * Formats standard watermark text pattern: FullName | UserID | Timestamp
 */
function formatWatermarkText(options) {
  const opts = validateWatermarkOptions(options);
  return `${opts.FullName} | ${opts.UserID} | ${opts.Timestamp}`;
}

/**
 * Applies dynamic watermark to a file buffer (PDF, image, text, Office XML).
 * Returns stamped buffer.
 */
function applyWatermark(content, mimeType, options) {
  const opts = validateWatermarkOptions(options);
  const text = formatWatermarkText(opts);
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);

  if (mimeType === 'application/pdf') {
    // Stamp PDF with watermark metadata and trailer text annotation
    const stamp = Buffer.from(
      `\n% BRILIAN_DYNAMIC_WATERMARK: ${text} [opacity=${opts.Opacity}, angle=${opts.DiagonalAngle}]\n` +
      `<< /Type /Annot /Subtype /Watermark /Rect [0 0 595 842] /Contents (${text}) /CA ${opts.Opacity} >>\n`
    );
    return Buffer.concat([buf, stamp]);
  }

  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    const stamp = Buffer.from(`/* BRILIAN_DYNAMIC_WATERMARK: ${text} */\n`);
    return Buffer.concat([stamp, buf]);
  }

  if (mimeType === 'image/svg+xml') {
    const stamp = Buffer.from(
      `<g class="brilian-watermark" opacity="${opts.Opacity}" transform="rotate(${opts.DiagonalAngle})">\n` +
      `  <text font-size="14" fill="#14161B" font-family="IBM Plex Sans, sans-serif">${text}</text>\n` +
      `</g>\n</svg>`
    );
    const contentStr = buf.toString('utf8').replace(/<\/svg>\s*$/i, '');
    return Buffer.from(contentStr + '\n' + stamp.toString('utf8'));
  }

  // Generic binary stamp trailer
  const trailer = Buffer.from(`\n__BRILIAN_WATERMARK__[${text};opacity=${opts.Opacity};angle=${opts.DiagonalAngle}]__\n`);
  return Buffer.concat([buf, trailer]);
}

/**
 * Verifies that a buffer contains the required dynamic watermark credentials.
 */
function verifyWatermark(buffer, options) {
  const opts = validateWatermarkOptions(options);
  const str = buffer.toString('utf8');

  const hasName = str.includes(opts.FullName);
  const hasId = str.includes(opts.UserID);
  const hasOpacity = str.includes(`opacity=${opts.Opacity}`) || str.includes(`/CA ${opts.Opacity}`);

  return {
    valid: hasName && hasId,
    hasName,
    hasId,
    hasOpacity
  };
}

module.exports = {
  applyWatermark,
  verifyWatermark,
  formatWatermarkText,
  validateWatermarkOptions,
  MIN_OPACITY,
  MAX_OPACITY,
  DEFAULT_ANGLE
};
