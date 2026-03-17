import crypto from 'crypto';
import { getEnv } from '@/lib/env';

const COOKIE_NAME = 'tiktok_oauth_session';

function encodeBase64Url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

function getSessionKey() {
  const secret = getEnv(
    'TIKTOK_SESSION_SECRET',
    'DASHBOARD_PASSWORD',
    'INSTAGRAM_APP_SECRET',
    'META_APP_SECRET',
  );

  if (!secret) return null;
  return crypto.createHash('sha256').update(secret).digest();
}

function getCookieConfig(maxAgeSeconds = 60 * 60 * 24 * 30) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

function encryptSession(payload) {
  const key = getSessionKey();
  if (!key) return '';

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${encodeBase64Url(iv)}.${encodeBase64Url(tag)}.${encodeBase64Url(encrypted)}`;
}

function decryptSession(value) {
  const key = getSessionKey();
  if (!key || !value) return null;

  const parts = value.split('.');
  if (parts.length !== 3) return null;

  try {
    const iv = decodeBase64Url(parts[0]);
    const tag = decodeBase64Url(parts[1]);
    const encrypted = decodeBase64Url(parts[2]);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return null;
  }
}

export function setTikTokSessionCookie(response, session) {
  const encrypted = encryptSession(session);
  if (!encrypted) return false;

  const maxAgeSeconds = Math.max(
    60,
    Math.min(60 * 60 * 24 * 30, Number(session.expiresIn || 0) || 60 * 60 * 24),
  );
  response.cookies.set(COOKIE_NAME, encrypted, getCookieConfig(maxAgeSeconds));
  return true;
}

export function clearTikTokSessionCookie(response) {
  response.cookies.set(COOKIE_NAME, '', { ...getCookieConfig(), maxAge: 0 });
}

export function readTikTokSessionFromRequest(request) {
  const raw = request.cookies.get(COOKIE_NAME)?.value;
  return decryptSession(raw);
}

export function readTikTokSessionFromCookieStore(cookieStore) {
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  return decryptSession(raw);
}

export function hasTikTokSessionCrypto() {
  return Boolean(getSessionKey());
}
