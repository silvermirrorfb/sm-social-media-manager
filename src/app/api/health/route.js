import { NextResponse } from 'next/server';
import { getInstagramAccountId, hasEnv } from '@/lib/env';

export async function GET() {
  const hasGoogleCreds =
    hasEnv('GOOGLE_SERVICE_ACCOUNT_JSON') ||
    (hasEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL') && hasEnv('GOOGLE_PRIVATE_KEY'));

  const hasMetaToken = hasEnv('INSTAGRAM_ACCESS_TOKEN');
  const hasMetaSecret = hasEnv('INSTAGRAM_APP_SECRET', 'META_APP_SECRET');
  const hasVerifyToken = hasEnv('META_VERIFY_TOKEN');
  const hasInstagramAccountId = Boolean(getInstagramAccountId());

  // Facebook Page env checks
  const hasFacebookPageToken = hasEnv('FACEBOOK_PAGE_ACCESS_TOKEN');
  const hasFacebookPageId = hasEnv('FACEBOOK_PAGE_ID');

  return NextResponse.json({
    status: 'ok',
    app: 'sm-social-media-manager',
    timestamp: new Date().toISOString(),
    env: {
      hasAnthropicKey: hasEnv('ANTHROPIC_API_KEY'),
      hasMetaToken,
      hasMetaSecret,
      hasSheetId: hasEnv('GOOGLE_SHEET_ID'),
      hasGoogleCreds,
      hasVerifyToken,
      hasInstagramAccountId,
      metaWebhookReady: hasMetaToken && hasMetaSecret && hasVerifyToken && hasInstagramAccountId,
      hasFacebookPageToken,
      hasFacebookPageId,
      facebookWebhookReady: hasFacebookPageToken && hasFacebookPageId && hasMetaSecret && hasVerifyToken,
    },
  });
}
