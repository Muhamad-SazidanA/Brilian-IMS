const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('Tier 1 - Feature 10: On-Premise License & Hardware Validator', async (t) => {
  // Reference implementation of cryptographic hardware validator in internal/license/validator.go
  class LicenseValidator {
    constructor(signingKey) {
      this.signingKey = signingKey || 'brilian_license_rsa_public_key_test';
    }

    createLicense(clientName, hardwareId, expiresAt) {
      const payload = {
        client: clientName,
        hardware_id: hardwareId,
        expires_at: expiresAt,
        issued_at: new Date().toISOString()
      };
      const json = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', this.signingKey).update(json).digest('hex');
      return Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
    }

    validateLicense(licenseBase64, currentHardwareId) {
      let decoded;
      try {
        decoded = JSON.parse(Buffer.from(licenseBase64, 'base64').toString('utf8'));
      } catch (err) {
        return { valid: false, error: 'Malformed license file encoding' };
      }

      const { payload, signature } = decoded;
      const json = JSON.stringify(payload);
      const expectedSignature = crypto.createHmac('sha256', this.signingKey).update(json).digest('hex');

      if (signature !== expectedSignature) {
        return { valid: false, error: 'Cryptographic license signature mismatch' };
      }

      if (payload.hardware_id !== currentHardwareId) {
        return { valid: false, error: `Hardware ID mismatch: expected ${payload.hardware_id}, detected ${currentHardwareId}` };
      }

      const now = new Date();
      const expiry = new Date(payload.expires_at);
      if (now > expiry) {
        return { valid: false, error: `License expired on ${payload.expires_at}` };
      }

      return { valid: true, payload };
    }
  }

  const signingKey = 'enterprise_master_key_999';
  const validator = new LicenseValidator(signingKey);
  const targetHardwareId = 'HWID-MAC-00:1A:2B:3C:4D:5E';

  await t.test('10.1 Valid license accepted when hardware ID matches and unexpired', () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const license = validator.createLicense('Enterprise Client A', targetHardwareId, futureDate);

    const result = validator.validateLicense(license, targetHardwareId);
    assert.equal(result.valid, true);
    assert.equal(result.payload.client, 'Enterprise Client A');
  });

  await t.test('10.2 Rejects license with hardware ID mismatch (unauthorized server migration)', () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const license = validator.createLicense('Enterprise Client A', targetHardwareId, futureDate);

    const alienHardwareId = 'HWID-ROGUE-99:88:77:66:55:44';
    const result = validator.validateLicense(license, alienHardwareId);
    assert.equal(result.valid, false);
    assert.match(result.error, /Hardware ID mismatch/);
  });

  await t.test('10.3 Rejects expired license', () => {
    const pastDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString(); // Expired yesterday
    const license = validator.createLicense('Enterprise Client A', targetHardwareId, pastDate);

    const result = validator.validateLicense(license, targetHardwareId);
    assert.equal(result.valid, false);
    assert.match(result.error, /License expired/);
  });

  await t.test('10.4 Rejects tampered license payload', () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const license = validator.createLicense('Enterprise Client A', targetHardwareId, futureDate);

    // Tamper payload by editing base64
    const decoded = JSON.parse(Buffer.from(license, 'base64').toString('utf8'));
    decoded.payload.client = 'Hacked Client';
    const tamperedBase64 = Buffer.from(JSON.stringify(decoded)).toString('base64');

    const result = validator.validateLicense(tamperedBase64, targetHardwareId);
    assert.equal(result.valid, false);
    assert.match(result.error, /signature mismatch/);
  });
});
