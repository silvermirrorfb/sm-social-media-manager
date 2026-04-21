import { NextResponse } from 'next/server';
import { getInstagramAccountId, hasEnv } from '@/lib/env';
import { hasTikTokSessionCrypto } from '@/lib/tiktok-session';
import { hasValidDashboardSession, getDashboardCookieName } from '@/lib/dashboard-auth';

export async function GET(request) {
  const publicResponse = NextResponse.json({
    status: 'ok',
    app: 'sm-social-media-manager',
    timestamp: new Date().toISOString(),
  });

  const sessionValue = request.cookies.get(getDashboardCookieName())?.value;
  const isAuthenticated = await hasValidDashboardSession(sessionValue);

  if (!isAuthenticated) {
    return publicResponse;
  }

  const hasGoogleCreds =
    hasEnv('GOOGLE_SERVICE_ACCOUNT_JSON') ||
    (hasEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL') && hasEnv('GOOGLE_PRIVATE_KEY'));

  const hasMetaToken = hasEnv('INSTAGRAM_ACCESS_TOKEN');
  const hasMetaSecret = hasEnv('INSTAGRAM_APP_SECRET', 'META_APP_SECRET');
  const hasFacebookAppSecret = hasEnv('FACEBOOK_APP_SECRET');
  const hasVerifyToken = hasEnv('META_VERIFY_TOKEN');
  const hasInstagramAccountId = Boolean(getInstagramAccountId());

  const hasFacebookPageToken = hasEnv('FACEBOOK_PAGE_ACCESS_TOKEN');
  const hasFacebookPageId = hasEnv('FACEBOOK_PAGE_ID');
  const hasTikTokClientKey = hasEnv('TIKTOK_CLIENT_KEY');
  const hasTikTokClientSecret = hasEnv('TIKTOK_CLIENT_SECRET');
  const tikTokOpsQueueReady = hasEnv('GOOGLE_SHEET_ID') && hasGoogleCreds;
  const yelpAppealsReady = hasEnv('GOOGLE_SHEET_ID') && hasGoogleCreds;
  const hasEmailAlerts =
    hasEnv('SMTP_HOST') &&
    hasEnv('SMTP_PORT') &&
    hasEnv('SMTP_USER') &&
    hasEnv('SMTP_PASS') &&
    hasEnv('SMTP_FROM', 'SMTP_USER');

  const hasCrmSync = hasEnv('REPLIT_CRM_BASE_URL') && hasEnv('REPLIT_SYNC_API_KEY');

  return NextResponse.json({
    status: 'ok',
    app: 'sm-social-media-manager',
    timestamp: new Date().toISOString(),
    env: {
      hasAnthropicKey: hasEnv('ANTHROPIC_API_KEY'),
      hasMetaToken,
      hasMetaSecret,
      hasFacebookAppSecret,
      hasSheetId: hasEnv('GOOGLE_SHEET_ID'),
      hasGoogleCreds,
      hasVerifyToken,
      hasInstagramAccountId,
      metaWebhookReady: hasMetaToken && hasMetaSecret && hasVerifyToken && hasInstagramAccountId,
      hasFacebookPageToken,
      hasFacebookPageId,
      facebookWebhookReady: hasFacebookPageToken && hasFacebookPageId && (hasFacebookAppSecret || hasMetaSecret) && hasVerifyToken,
      hasTikTokClientKey,
      hasTikTokClientSecret,
      tikTokOAuthReady: hasTikTokClientKey && hasTikTokClientSecret,
      tikTokOpsQueueReady,
      yelpAppealsReady,
      hasTikTokSessionCrypto: hasTikTokSessionCrypto(),
      hasEmailAlerts,
      hasCrmSync,
    },
  });
}
