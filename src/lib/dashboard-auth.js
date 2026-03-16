import { getEnv } from './env';

const DASHBOARD_COOKIE_NAME = 'sm_dashboard_session';
const DASHBOARD_AUTH_SALT = 'sm-dashboard-v1';
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
