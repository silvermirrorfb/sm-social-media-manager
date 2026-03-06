import { NextResponse } from 'next/server';

export async function GET() {
  const hasGoogleCreds =
    !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    (!!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY);

  return NextResponse.json({
    status: 'ok',
    app: 'sm-social-media-manager',
    timestamp: new Date().toISOString(),
    env: {
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      hasMetaToken: !!process.env.INSTAGRAM_ACCESS_TOKEN,
      hasMetaSecret: !!process.env.META_APP_SECRET,
      hasSheetId: !!process.env.GOOGLE_SHEET_ID,
      hasGoogleCreds,
      hasVerifyToken: !!process.env.META_VERIFY_TOKEN,
    },
  });
}
