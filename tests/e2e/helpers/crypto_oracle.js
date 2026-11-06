/**
 * Crypto Oracle for AES-256-GCM & Memory Zeroization
 * Matches Go's crypto/cipher GCM implementation with 12-byte nonce and 16-byte tag.
 */
const crypto = require('node:crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard GCM nonce length in Go
const TAG_LENGTH = 16; // Standard GCM auth tag length in Go

/**
 * Encrypts plaintext string with 32-byte key using AES-256-GCM.
 * Payload layout: IV (12 bytes) || Ciphertext (variable) || AuthTag (16 bytes).
 * Matches Go's seal := gcm.Seal(nonce, nonce, plaintext, nil)
 */
function encryptPrompt(plaintext, key) {
  if (!key) {
    throw new Error('Key must be exactly 32 bytes (256 bits)');
  }
  let keyBuf;
  if (typeof key === 'string') {
    keyBuf = key.length === 64 ? Buffer.from(key, 'hex') : Buffer.from(key, 'utf8');
  } else if (Buffer.isBuffer(key) || key instanceof Uint8Array) {
    keyBuf = Buffer.from(key);
  } else {
    throw new Error('Key must be a string or Buffer');
  }

  if (keyBuf.length !== 32) {
    throw new Error('Key must be exactly 32 bytes (256 bits)');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuf, iv, { authTagLength: TAG_LENGTH });
  
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Combine: [IV (12)] + [Ciphertext (N)] + [Tag (16)]
  return Buffer.concat([iv, encrypted, tag]);
}

/**
 * Decrypts binary payload using 32-byte key.
 * Extracts IV from first 12 bytes, Tag from last 16 bytes.
 */
function decryptPrompt(payload, key) {
  if (!Buffer.isBuffer(payload)) {
    payload = Buffer.from(payload);
  }
  if (payload.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Ciphertext payload too short');
  }

  const keyBuf = typeof key === 'string' 
    ? (key.length === 64 ? Buffer.from(key, 'hex') : Buffer.from(key, 'utf-8'))
    : key;

  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(payload.length - TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH, payload.length - TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuf, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted;
}

/**
 * Securely overwrites memory buffer with zeros.
 * Matches Go's WipeBytes implementation.
 */
function wipeBytes(buf) {
  if (Buffer.isBuffer(buf)) {
    buf.fill(0);
  } else if (buf instanceof Uint8Array) {
    buf.fill(0);
  }
}

/**
 * Simulates tampering with ciphertext or auth tag to verify integrity failure.
 */
function tamperPayload(payload, offset = 15) {
  const tampered = Buffer.from(payload);
  if (tampered.length > offset) {
    tampered[offset] ^= 0x55; // Flip bits
  }
  return tampered;
}

module.exports = {
  encryptPrompt,
  decryptPrompt,
  wipeBytes,
  tamperPayload,
  IV_LENGTH,
  TAG_LENGTH
};
