/**
 * JWT & RBAC Oracle for Token Generation, Verification & Role Matrix Validation
 * Compliant with RFC 7519 and Brilian RBAC specifications.
 */
const crypto = require('node:crypto');

const DEFAULT_SECRET = 'brilian_jwt_secret_signing_key_2026_test';

const VALID_ROLES = ['admin', 'reviewer', 'uploader', 'viewer'];

// Role Permissions Matrix
const ROLE_PERMISSIONS = {
  admin: [
    'auth:manage',
    'documents:read',
    'documents:upload',
    'documents:delete',
    'folders:manage',
    'workflow:action',
    'ai:compare',
    'ai:qa',
    'system:admin'
  ],
  reviewer: [
    'documents:read',
    'workflow:action',
    'ai:compare',
    'ai:qa'
  ],
  uploader: [
    'documents:read',
    'documents:upload',
    'folders:manage',
    'workflow:submit',
    'ai:qa'
  ],
  viewer: [
    'documents:read',
    'ai:qa'
  ]
};

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString('utf8');
}

/**
 * Signs a JWT payload with HS256.
 */
function signJwt(payload, secret = DEFAULT_SECRET, expiresInSec = 3600) {
  if (!VALID_ROLES.includes(payload.role)) {
    throw new Error(`Invalid role: ${payload.role}. Must be one of ${VALID_ROLES.join(', ')}`);
  }

  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    ...payload,
    iat: now,
    exp: now + expiresInSec
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(claims));
  const data = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${data}.${signature}`;
}

/**
 * Verifies JWT token string and returns parsed claims.
 */
function verifyJwt(token, secret = DEFAULT_SECRET) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token must be a non-empty string');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT token structure');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (signature !== expectedSignature) {
    throw new Error('Invalid JWT signature');
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp && payload.exp < now) {
    throw new Error('JWT token has expired');
  }

  return payload;
}

/**
 * Checks if a role has the required permission.
 */
function hasPermission(role, permission) {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

module.exports = {
  signJwt,
  verifyJwt,
  hasPermission,
  VALID_ROLES,
  ROLE_PERMISSIONS,
  DEFAULT_SECRET
};
