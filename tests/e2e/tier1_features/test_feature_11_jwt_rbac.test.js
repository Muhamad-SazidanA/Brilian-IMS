const test = require('node:test');
const assert = require('node:assert/strict');
const { signJwt, verifyJwt, hasPermission, VALID_ROLES } = require('../helpers/jwt_oracle');

test('Tier 1 - Feature 11: JWT Authentication & RBAC Middleware', async (t) => {
  const secret = 'super_secret_jwt_key_for_e2e_testing_32chars';

  await t.test('11.1 All 4 documented roles can issue and verify valid JWTs', () => {
    for (const role of VALID_ROLES) {
      const token = signJwt({ sub: `user-${role}-id`, username: `user_${role}`, role }, secret, 3600);
      const claims = verifyJwt(token, secret);
      assert.equal(claims.role, role);
      assert.equal(claims.username, `user_${role}`);
    }
  });

  await t.test('11.2 Rejection of invalid / unauthorized roles', () => {
    assert.throws(() => {
      signJwt({ sub: 'user-hacker', username: 'hacker', role: 'superuser_unauthorized' }, secret);
    }, /Invalid role/);
  });

  await t.test('11.3 Expired token rejection', () => {
    // Generate token expired 10 seconds ago
    const expiredToken = signJwt({ sub: 'u1', username: 'expired_user', role: 'viewer' }, secret, -10);
    assert.throws(() => {
      verifyJwt(expiredToken, secret);
    }, /JWT token has expired/);
  });

  await t.test('11.4 Tampered signature rejection', () => {
    const validToken = signJwt({ sub: 'u1', username: 'legit_user', role: 'viewer' }, secret, 3600);
    const parts = validToken.split('.');
    // Tamper payload to elevate role to admin
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'u1', username: 'legit_user', role: 'admin' })).toString('base64url');
    const forgedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    assert.throws(() => {
      verifyJwt(forgedToken, secret);
    }, /Invalid JWT signature/);
  });

  await t.test('11.5 RBAC Permission Matrix enforcement', () => {
    // Admin permissions
    assert.ok(hasPermission('admin', 'documents:upload'));
    assert.ok(hasPermission('admin', 'workflow:action'));
    assert.ok(hasPermission('admin', 'ai:compare'));

    // Reviewer permissions
    assert.ok(hasPermission('reviewer', 'workflow:action'));
    assert.ok(hasPermission('reviewer', 'ai:compare'));
    assert.ok(!hasPermission('reviewer', 'documents:upload')); // Reviewers do not upload

    // Uploader permissions
    assert.ok(hasPermission('uploader', 'documents:upload'));
    assert.ok(!hasPermission('uploader', 'workflow:action')); // Uploaders cannot approve workflows

    // Viewer permissions
    assert.ok(hasPermission('viewer', 'documents:read'));
    assert.ok(hasPermission('viewer', 'ai:qa'));
    assert.ok(!hasPermission('viewer', 'documents:upload'));
    assert.ok(!hasPermission('viewer', 'workflow:action'));
  });
});
