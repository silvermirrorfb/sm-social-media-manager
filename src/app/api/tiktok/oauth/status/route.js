import { NextResponse } from 'next/server';
import { getTikTokScopes, getTikTokUserInfo, getTikTokVideoList } from '@/lib/tiktok';
import { readTikTokSessionFromRequest } from '@/lib/tiktok-session';

function isExpired(session) {
  if (!session?.expiresAt) return false;
  return Date.now() > Number(session.expiresAt);
}

export async function GET(request) {
  const session = readTikTokSessionFromRequest(request);
  if (!session?.accessToken) {
    return NextResponse.json({
      connected: false,
      reason: 'no_session',
    });
  }

  if (isExpired(session)) {
    return NextResponse.json({
      connected: false,
      reason: 'expired',
      openId: session.openId || '',
    });
  }

  const scopes = session.scope || getTikTokScopes().join(',');
  const [profileResult, videosResult] = await Promise.all([
    getTikTokUserInfo({ accessToken: session.accessToken, scopes }),
    getTikTokVideoList({ accessToken: session.accessToken, maxCount: 6 }),
  ]);

  const profile = profileResult.data?.data?.user || null;
  const videos = videosResult.data?.data?.videos || [];

  return NextResponse.json({
    connected: profileResult.ok || videosResult.ok,
    reason: profileResult.ok || videosResult.ok ? 'ok' : 'api_error',
    openId: session.openId || profile?.open_id || '',
    scope: session.scope || '',
    expiresAt: session.expiresAt || null,
    profile,
    videos,
    errors: {
      profile: profileResult.ok ? null : profileResult.data,
      videos: videosResult.ok ? null : videosResult.data,
    },
  });
}
