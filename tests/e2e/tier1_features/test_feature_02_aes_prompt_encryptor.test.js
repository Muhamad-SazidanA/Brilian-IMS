const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { encryptPrompt, decryptPrompt, wipeBytes, tamperPayload, IV_LENGTH, TAG_LENGTH } = require('../helpers/crypto_oracle');

test('Tier 1 - Feature 02: In-Memory AES-256 System Prompt Encryptor', async (t) => {
  const secretKey = crypto.randomBytes(32);
  const promptText = 'You are Brilian Legal AI Assistant. Strictly analyze contract clauses with zero data retention.';

  await t.test('2.1 Standard encryption generates IV + Ciphertext + Tag payload', () => {
    const encrypted = encryptPrompt(promptText, secretKey);
    assert.ok(Buffer.isBuffer(encrypted));
    assert.ok(encrypted.length >= IV_LENGTH + TAG_LENGTH + Buffer.byteLength(promptText), 'Payload must encompass IV, ciphertext, and tag');
  });

  await t.test('2.2 Decryption restores exact prompt string', () => {
    const encrypted = encryptPrompt(promptText, secretKey);
    const decrypted = decryptPrompt(encrypted, secretKey);
    assert.equal(decrypted.toString('utf8'), promptText, 'Decrypted text must match original prompt');
  });

  await t.test('2.3 Rejects tampered ciphertext via GCM authentication tag', () => {
    const encrypted = encryptPrompt(promptText, secretKey);
    const tampered = tamperPayload(encrypted, 20); // modify ciphertext byte

    assert.throws(() => {
      decryptPrompt(tampered, secretKey);
    }, /unsupported state or unable to authenticate data|bad decrypt/i, 'Tampered ciphertext must fail GCM verification');
  });

  await t.test('2.4 Rejects tampered authentication tag', () => {
    const encrypted = encryptPrompt(promptText, secretKey);
    const tamperedTag = tamperPayload(encrypted, encrypted.length - 2); // modify tag byte

    assert.throws(() => {
      decryptPrompt(tamperedTag, secretKey);
    }, /unsupported state or unable to authenticate data|bad decrypt/i, 'Tampered auth tag must fail GCM verification');
  });

  await t.test('2.5 Memory zeroization (WipeBytes) reliably zeros transient RAM buffer', () => {
    const transientBuf = Buffer.from('Sensitive AI System Prompt in Transient Memory');
    assert.ok(transientBuf.toString('utf8').includes('Sensitive'));

    wipeBytes(transientBuf);

    // Verify all bytes are 0x00
    for (let i = 0; i < transientBuf.length; i++) {
      assert.equal(transientBuf[i], 0, `Byte at index ${i} must be zeroized`);
    }
    assert.equal(transientBuf.toString('utf8').replace(/\0/g, ''), '', 'Buffer string representation must be completely wiped');
  });

  await t.test('2.6 Non-32 byte key rejection', () => {
    const invalidShortKey = crypto.randomBytes(16);
    assert.throws(() => {
      encryptPrompt(promptText, invalidShortKey);
    }, /Key must be exactly 32 bytes/i);

    const invalidLongKey = crypto.randomBytes(64);
    assert.throws(() => {
      encryptPrompt(promptText, invalidLongKey);
    }, /Key must be exactly 32 bytes/i);
  });
});
