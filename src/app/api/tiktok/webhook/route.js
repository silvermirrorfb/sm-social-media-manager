import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { logToSheet } from '@/lib/sheets';

function parseSignatureHeader(headerValue) {
  if (!headerValue) return null;

  const entries = Object.fromEntries(
    headerValue
      .split(',')
      .map((part) => part.trim())
      .map((part) => part.split('=')),
  );

  if (!entries.t || !entries.s) return null;

  return {
    timestamp: entries.t,
    signature: entries.s,
  };
}

function isFreshTimestamp(timestamp) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;

  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - ts) <= 300;
}

function verifyTikTokSignature(rawBody, headerValue) {
  const clientSecret = getEnv('TIKTOK_CLIENT_SECRET');
  if (!clientSecret) {
    return { ok: true, reason: 'missing_client_secret' };
  }

  const parsed = parseSignatureHeader(headerValue);
  if (!parsed) {
    return { ok: true, reason: 'missing_signature_header' };
  }

  if (!isFreshTimestamp(parsed.timestamp)) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  const signedPayload = `${parsed.timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(signedPayload)
    .digest('hex');

  const actualBuffer = Buffer.from(parsed.signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  if (actualBuffer.length !== expectedBuffer.length) {
    return { ok: false, reason: 'length_mismatch' };
  }

  const ok = crypto.timingSafeEqual(actualBuffer, expectedBuffer);
  return {
    ok,
    reason: ok ? 'verified' : 'signature_mismatch',
  };
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    app: 'sm-social-media-manager',
    route: 'tiktok-webhook',
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('TikTok-Signature');
  const verification = verifyTikTokSignature(rawBody, signatureHeader);

  if (!verification.ok) {
    console.error('[TikTok] Signature validation failed:', verification.reason);
    return NextResponse.json(
      { ok: false, error: 'invalid_signature', reason: verification.reason },
      { status: 401 },
    );
  }

  let payload = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    console.error('[TikTok] Failed to parse webhook payload:', error.message);
  }

  console.log('[TikTok] Webhook received:', {
    event: payload?.event || payload?.type || 'unknown',
    verified: verification.reason,
  });

  await logToSheet({
    type: 'tiktok_webhook',
    username: payload?.open_id || payload?.user_openid || '',
    incomingMessage: rawBody.slice(0, 400),
    response: '',
    action: 'received',
    category: payload?.event || payload?.type || 'webhook',
    reason: verification.reason,
    confidence: '',
    severity: '',
    triggers: 'tiktok',
    needsReview: '',
  });

  return NextResponse.json({ ok: true });
}
