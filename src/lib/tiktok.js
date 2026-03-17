import crypto from 'crypto';
import { getEnv } from '@/lib/env';

const DEFAULT_BASE_URL = 'https://sm-social-media-manager.vercel.app';
const DEFAULT_SCOPES = ['user.info.profile', 'video.list'];
const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/';
const VIDEO_LIST_URL = 'https://open.tiktokapis.com/v2/video/list/';

function base64UrlEncode(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function getTikTokClientKey() {
  return getEnv('TIKTOK_CLIENT_KEY');
}

export function getTikTokClientSecret() {
  return getEnv('TIKTOK_CLIENT_SECRET');
}

export function getTikTokScopes() {
  const raw = getEnv('TIKTOK_SCOPES');
  if (!raw) return DEFAULT_SCOPES;

  return raw
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function getTikTokWebhookUri() {
  return `${getAppBaseUrl()}/api/tiktok/webhook`;
}

export function getAppBaseUrl() {
  const configured = getEnv('APP_BASE_URL', 'NEXT_PUBLIC_APP_URL');
  if (configured) return configured.replace(/\/+$/, '');

  const vercelProductionHost = getEnv('VERCEL_PROJECT_PRODUCTION_URL');
  if (vercelProductionHost) {
    return `https://${vercelProductionHost.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  }

  return DEFAULT_BASE_URL;
}

export function getTikTokRedirectUri() {
  return `${getAppBaseUrl()}/api/tiktok/oauth/callback`;
}

export function createPkcePair() {
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const codeChallenge = base64UrlEncode(
    crypto.createHash('sha256').update(codeVerifier).digest(),
  );

  return { codeVerifier, codeChallenge };
}

export function createState() {
  return base64UrlEncode(crypto.randomBytes(24));
}

export function buildTikTokAuthorizeUrl({ state, codeChallenge }) {
  const params = new URLSearchParams({
    client_key: getTikTokClientKey(),
    response_type: 'code',
    scope: getTikTokScopes().join(','),
    redirect_uri: getTikTokRedirectUri(),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken({ code, codeVerifier }) {
  const body = new URLSearchParams({
    client_key: getTikTokClientKey(),
    client_secret: getTikTokClientSecret(),
    code,
    grant_type: 'authorization_code',
    redirect_uri: getTikTokRedirectUri(),
    code_verifier: codeVerifier,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

async function parseJsonResponse(response) {
  const data = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

function buildUserInfoFields(scopes) {
  const baseFields = ['open_id', 'avatar_url', 'display_name'];
  const scopeText = Array.isArray(scopes) ? scopes.join(',') : String(scopes || '');

  if (scopeText.includes('user.info.profile')) {
    baseFields.push('bio_description', 'profile_deep_link', 'profile_web_link', 'is_verified');
  }

  if (scopeText.includes('user.info.stats')) {
    baseFields.push('follower_count', 'following_count', 'likes_count', 'video_count');
  }

  return Array.from(new Set(baseFields));
}

export async function getTikTokUserInfo({ accessToken, scopes }) {
  const fields = buildUserInfoFields(scopes).join(',');
  const response = await fetch(`${USER_INFO_URL}?fields=${encodeURIComponent(fields)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  return parseJsonResponse(response);
}

export async function getTikTokVideoList({ accessToken, maxCount = 6 }) {
  const fields = [
    'id',
    'title',
    'video_description',
    'duration',
    'cover_image_url',
    'share_url',
    'view_count',
    'like_count',
    'comment_count',
    'create_time',
  ].join(',');

  const response = await fetch(`${VIDEO_LIST_URL}?fields=${encodeURIComponent(fields)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      max_count: maxCount,
    }),
  });

  return parseJsonResponse(response);
}
