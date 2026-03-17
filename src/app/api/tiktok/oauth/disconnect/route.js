import { NextResponse } from 'next/server';
import { clearTikTokSessionCookie, readTikTokSessionFromRequest } from '@/lib/tiktok-session';
import { logToSheet } from '@/lib/sheets';

export async function POST(request) {
  const session = readTikTokSessionFromRequest(request);
  const response = NextResponse.redirect(new URL('/tiktok/connect?disconnected=1', request.url));
  clearTikTokSessionCookie(response);

  await logToSheet({
    type: 'TIKTOK_OAUTH',
    username: session?.openId || '',
    incomingMessage: '',
    response: '',
    action: 'oauth_disconnected',
    category: 'tiktok_oauth',
    reason: 'manual_disconnect',
    confidence: '',
    severity: 'low',
    triggers: 'tiktok,oauth',
    needsReview: '',
  });

  return response;
}
