import { NextResponse } from 'next/server';
import { getInstagramAccountId, hasEnv } from '@/lib/env';
import { hasTikTokSessionCrypto } from '@/lib/tiktok-session';

export async function GET() {
  const hasGoogleCreds =
    hasEnv('GOOGLE_SERVICE_ACCOUNT_JSON') ||
    (hasEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL') && hasEnv('GOOGLE_PRIVATE_KEY'));

  const hasMetaToken = hasEnv('INSTAGRAM_ACCESS_TOKEN');
  const hasMetaSecret = hasEnv('INSTAGRAM_APP_SECRET', 'META_APP_SECRET');
  const hasFacebookAppSecret = hasEnv('FACEBOOK_APP_SECRET');
  const hasVerifyToken = hasEnv('META_VERIFY_TOKEN');
  const hasInstagramAccountId = Boolean(getInstagramAccountId());

  // Facebook Page env checks
  const hasFacebookPageToken = hasEnv('FACEBOOK_PAGE_ACCESS_TOKEN');
  const hasFacebookPageId = hasEnv('FACEBOOK_PAGE_ID');
  const hasTikTokClientKey = hasEnv('TIKTOK_CLIENT_KEY');
  const hasTikTokClientSecret = hasEnv('TIKTOK_CLIENT_SECRET');
  const hasEmailAlerts =
    hasEnv('SMTP_HOST') &&
    hasEnv('SMTP_PORT') &&
    hasEnv('SMTP_USER') &&
    hasEnv('SMTP_PASS') &&
    hasEnv('SMTP_FROM', 'SMTP_USER');

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
      hasTikTokSessionCrypto: hasTikTokSessionCrypto(),
      hasEmailAlerts,
    },
  });
}
