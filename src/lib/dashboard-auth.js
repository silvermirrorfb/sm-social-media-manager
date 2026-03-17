import { getEnv } from './env';

const DASHBOARD_COOKIE_NAME = 'sm_dashboard_session';
const DASHBOARD_AUTH_SALT = 'sm-dashboard-v1';
const DASHBOARD_BRIDGE_SALT = 'sm-dashboard-bridge-v1';
const DEFAULT_USERNAME = 'admin';
const DEFAULT_CREDENTIAL_HASH = '834ebf8cc81f54a710ed350f65fecdee329a710c089c72a660922639b31944b6';

function getAuthSource() {
  const username = getEnv('DASHBOARD_USERNAME');
  const password = getEnv('DASHBOARD_PASSWORD');

  if (username && password) {
    return {
      username,
      seed: `${username}:${password}:${DASHBOARD_AUTH_SALT}`,
      mode: 'env',
    };
  }

  return {
    username: DEFAULT_USERNAME,
    hash: DEFAULT_CREDENTIAL_HASH,
    mode: 'fallback',
  };
}

async function sha256Hex(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function toBase64Url(value) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(`${normalized}${'='.repeat(padLength)}`, 'base64').toString('utf8');
}

export function getDashboardUsername() {
  return getAuthSource().username;
}

export async function getExpectedCredentialHash() {
  const authSource = getAuthSource();
  if (authSource.mode === 'env') {
    return sha256Hex(authSource.seed);
  }

  return authSource.hash;
}

export async function verifyDashboardCredentials(username, password) {
  const attemptedHash = await sha256Hex(`${username.trim()}:${password}:${DASHBOARD_AUTH_SALT}`);
  const expectedHash = await getExpectedCredentialHash();
  return attemptedHash === expectedHash;
}

export async function createDashboardSessionValue() {
  const credentialHash = await getExpectedCredentialHash();
  return sha256Hex(`${credentialHash}:session`);
}

export async function createDashboardBridgeToken({
  purpose = 'generic',
  maxAgeSeconds = 60 * 60 * 12,
} = {}) {
  const credentialHash = await getExpectedCredentialHash();
  const payload = {
    purpose,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = await sha256Hex(`${credentialHash}:${DASHBOARD_BRIDGE_SALT}:${encodedPayload}`);
  return `${encodedPayload}.${signature}`;
}

export async function verifyDashboardBridgeToken(token, expectedPurpose = 'generic') {
  if (!token || !String(token).includes('.')) return { ok: false, reason: 'missing_token' };

  const [encodedPayload, signature] = String(token).split('.');
  if (!encodedPayload || !signature) return { ok: false, reason: 'invalid_token_shape' };

  const credentialHash = await getExpectedCredentialHash();
  const expectedSignature = await sha256Hex(`${credentialHash}:${DASHBOARD_BRIDGE_SALT}:${encodedPayload}`);
  if (expectedSignature !== signature) {
    return { ok: false, reason: 'invalid_signature' };
  }

  let payload;
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload));
  } catch {
    return { ok: false, reason: 'invalid_payload' };
  }

  if (payload.purpose !== expectedPurpose) {
    return { ok: false, reason: 'wrong_purpose' };
  }

  if (!payload.exp || Math.floor(Date.now() / 1000) > Number(payload.exp)) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, payload };
}

export async function hasValidDashboardSession(sessionValue) {
  if (!sessionValue) return false;
  const expectedValue = await createDashboardSessionValue();
  return sessionValue === expectedValue;
}

export function getDashboardCookieName() {
  return DASHBOARD_COOKIE_NAME;
}

export function getDashboardCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/dashboard',
    maxAge: 60 * 60 * 12,
  };
}
