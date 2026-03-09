import { NextResponse } from 'next/server';

export async function GET() {
  const hasGoogleCreds =
    !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    (!!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY);

  const hasMetaToken = !!process.env.INSTAGRAM_ACCESS_TOKEN;
  const hasMetaSecret = !!process.env.META_APP_SECRET;
  const hasVerifyToken = !!process.env.META_VERIFY_TOKEN;
  const hasInstagramAccountId = !!process.env.INSTAGRAM_ACCOUNT_ID;

  return NextResponse.json({
    status: 'ok',
    app: 'sm-social-media-manager',
    timestamp: new Date().toISOString(),
    env: {
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      hasMetaToken,
      hasMetaSecret,
      hasSheetId: !!process.env.GOOGLE_SHEET_ID,
      hasGoogleCreds,
      hasVerifyToken,
      hasInstagramAccountId,
      metaWebhookReady: hasMetaToken && hasMetaSecret && hasVerifyToken && hasInstagramAccountId,
    },
  });
}
