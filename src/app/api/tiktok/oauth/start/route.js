import { NextResponse } from 'next/server';
import {
  buildTikTokAuthorizeUrl,
  createPkcePair,
  createState,
  getTikTokClientKey,
} from '@/lib/tiktok';

export async function GET() {
  if (!getTikTokClientKey()) {
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

  return response;
}
