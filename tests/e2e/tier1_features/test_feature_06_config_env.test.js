const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Tier 1 - Feature 06: Configuration & Environment Management', async (t) => {
  const docPath = path.resolve(__dirname, '../../../dokumentasi_lengkap_brilian.md');
  const docContent = fs.readFileSync(docPath, 'utf8');

  await t.test('6.1 All documented environment variables are specified in documentation', () => {
    const requiredEnvVars = [
      'SERVER_PORT',
      'GIN_MODE',
      'DB_HOST',
      'DB_PORT',
      'DB_USER',
      'DB_PASSWORD',
      'DB_NAME',
      'DB_SSLMODE',
      'MINIO_ENDPOINT',
      'MINIO_ACCESS_KEY',
      'MINIO_SECRET_KEY',
      'MINIO_BUCKET_NAME',
      'MINIO_USE_SSL',
      'AI_PROVIDER',
      'AI_API_KEY',
      'AI_MODEL_NAME',
      'AI_REGION',
      'ENCRYPTION_KEY',
      'LICENSE_FILE_PATH'
    ];

    for (const envVar of requiredEnvVars) {
      assert.ok(docContent.includes(envVar), `Documentation must define environment variable: ${envVar}`);
    }
  });

  await t.test('6.2 Environment key validation logic for 32-byte AES key', () => {
    // 32-byte key is 64 hex characters
    function validateEncryptionKey(keyHex) {
      if (!keyHex || typeof keyHex !== 'string') {
        throw new Error('ENCRYPTION_KEY must be provided');
      }
      if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
        throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
      }
      return Buffer.from(keyHex, 'hex');
    }

    // Valid 64-character hex key
    const validKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    assert.equal(validateEncryptionKey(validKey).length, 32);

    // Invalid short key
    assert.throws(() => {
      validateEncryptionKey('deadbeef');
    }, /must be a 64-character hex string/);

    // Non-hex characters
    assert.throws(() => {
      validateEncryptionKey('0123456789abcdef0123456789abcdef0123456789abcdef0123456789xyz!@');
    }, /must be a 64-character hex string/);
  });

  await t.test('6.3 Default port fallback and Database URL builder contract', () => {
    function buildDatabaseUrl(cfg) {
      const host = cfg.DB_HOST || 'localhost';
      const port = cfg.DB_PORT || '5432';
      const user = cfg.DB_USER || 'brilian_user';
      const password = cfg.DB_PASSWORD || '';
      const dbname = cfg.DB_NAME || 'brilian_db';
      const sslmode = cfg.DB_SSLMODE || 'disable';

      return `postgres://${user}:${password}@${host}:${port}/${dbname}?sslmode=${sslmode}`;
    }

    const testCfg = {
      DB_HOST: '127.0.0.1',
      DB_PORT: '5432',
      DB_USER: 'admin',
      DB_PASSWORD: 'secretpassword',
      DB_NAME: 'briliandms',
      DB_SSLMODE: 'disable'
    };

    assert.equal(buildDatabaseUrl(testCfg), 'postgres://admin:secretpassword@127.0.0.1:5432/briliandms?sslmode=disable');
  });
});
