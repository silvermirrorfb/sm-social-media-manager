import { NextResponse } from 'next/server';
import {
  buildTikTokAuthorizeUrl,
  createPkcePair,
  createState,
  getTikTokClientKey,
} from '@/lib/tiktok';
import { logToSheet } from '@/lib/sheets';

export async function GET() {
  if (!getTikTokClientKey()) {
    await logToSheet({
      type: 'TIKTOK_OAUTH',
      username: '',
      incomingMessage: '',
      response: '',
      action: 'oauth_start_failed',
      category: 'tiktok_oauth',
      reason: 'missing_client_key',
      confidence: '',
      severity: 'high',
      triggers: 'tiktok,oauth',
      needsReview: 'YES',
    });

    return NextResponse.json(
      { error: 'Missing TIKTOK_CLIENT_KEY in environment.' },
      { status: 500 },
    );
  }

  const state = createState();
  const { codeVerifier, codeChallenge } = createPkcePair();
  const redirectUrl = buildTikTokAuthorizeUrl({ state, codeChallenge });

  const response = NextResponse.redirect(redirectUrl);
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  };

  response.cookies.set('tiktok_oauth_state', state, cookieOptions);
  response.cookies.set('tiktok_oauth_verifier', codeVerifier, cookieOptions);

  await logToSheet({
    type: 'TIKTOK_OAUTH',
    username: '',
    incomingMessage: '',
    response: '',
    action: 'oauth_start',
    category: 'tiktok_oauth',
    reason: 'redirected_to_tiktok_authorize',
    confidence: '',
    severity: 'low',
    triggers: 'tiktok,oauth',
    needsReview: '',
  });

  return response;
}
