import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    app: 'sm-social-media-manager',
    timestamp: new Date().toISOString(),
    env: {
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      hasMetaToken: !!process.env.INSTAGRAM_ACCESS_TOKEN,
      hasMetaSecret: !!process.env.META_APP_SECRET,
      hasSheetId: !!process.env.GOOGLE_SHEET_ID,
      hasVerifyToken: !!process.env.META_VERIFY_TOKEN,
    },
  });
}
