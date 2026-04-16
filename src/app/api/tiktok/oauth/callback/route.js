import { NextResponse } from 'next/server';
import { exchangeCodeForToken, getTikTokRedirectUri } from '@/lib/tiktok';
import { clearTikTokSessionCookie, setTikTokSessionCookie } from '@/lib/tiktok-session';
import { logToSheet } from '@/lib/sheets';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHtml({ title, body, details = [] }) {
  const detailsHtml = details.length
    ? `<ul>${details.map((detail) => `<li>${detail}</li>`).join('')}</ul>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #f7f4ee; color: #1b1b1b; margin: 0; }
      main { max-width: 760px; margin: 4rem auto; padding: 2rem; background: white; border-radius: 18px; box-shadow: 0 12px 40px rgba(0,0,0,0.08); }
      h1 { margin-top: 0; }
      code { background: #f1ede5; padding: 0.2rem 0.4rem; border-radius: 6px; }
      a { color: #8a5a20; }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${body}</p>
      ${detailsHtml}
      <p><a href="/tiktok/connect">Back to TikTok Connect</a></p>
    </main>
  </body>
</html>`;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  if (error) {
    await logToSheet({
      type: 'TIKTOK_OAUTH',
      username: '',
      incomingMessage: '',
      response: '',
      action: 'oauth_error',
      category: 'tiktok_oauth',
      reason: errorDescription || error,
      confidence: '',
      severity: 'medium',
      triggers: 'tiktok,oauth',
      needsReview: 'YES',
    });

    return new NextResponse(
      renderHtml({
        title: 'TikTok Authorization Error',
        body: escapeHtml(errorDescription || error),
      }),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const expectedState = request.cookies.get('tiktok_oauth_state')?.value;
  const codeVerifier = request.cookies.get('tiktok_oauth_verifier')?.value;

  if (!code || !state || !expectedState || state !== expectedState || !codeVerifier) {
    await logToSheet({
      type: 'TIKTOK_OAUTH',
      username: '',
      incomingMessage: '',
      response: '',
      action: 'oauth_incomplete',
      category: 'tiktok_oauth',
      reason: 'state_or_pkce_mismatch',
      confidence: '',
      severity: 'medium',
      triggers: 'tiktok,oauth',
      needsReview: 'YES',
    });

    return new NextResponse(
      renderHtml({
        title: 'TikTok Authorization Incomplete',
        body: 'TikTok redirected back, but the OAuth state or PKCE verifier was missing or did not match.',
        details: [
          `Registered redirect URI should be <code>${escapeHtml(getTikTokRedirectUri())}</code>`,
        ],
      }),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const tokenResult = await exchangeCodeForToken({ code, codeVerifier });
  const expiresIn = Number(tokenResult?.data?.expires_in || 0);
  const expiresAt = expiresIn ? Date.now() + (expiresIn * 1000) : null;

  const response = new NextResponse(
    renderHtml(
      tokenResult.ok
        ? {
            title: 'TikTok Connected',
            body: 'TikTok authorization completed successfully. The app received an authorization code and exchanged it for tokens.',
            details: [
              `Scopes granted: <code>${escapeHtml(tokenResult.data.scope || 'n/a')}</code>`,
              `Open ID: <code>${escapeHtml(tokenResult.data.open_id || 'n/a')}</code>`,
              `Expires in: <code>${escapeHtml(tokenResult.data.expires_in || 'n/a')}</code> seconds`,
              'Session was stored securely for this dashboard login.',
            ],
          }
        : {
            title: 'TikTok Token Exchange Failed',
            body: 'TikTok returned an error when the app tried to exchange the authorization code for tokens.',
            details: [
              `HTTP status: <code>${escapeHtml(tokenResult.status)}</code>`,
              `Response: <code>${escapeHtml(JSON.stringify(tokenResult.data))}</code>`,
            ],
          },
    ),
    {
      status: tokenResult.ok ? 200 : 502,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  );

  response.cookies.set('tiktok_oauth_state', '', { path: '/', maxAge: 0 });
  response.cookies.set('tiktok_oauth_verifier', '', { path: '/', maxAge: 0 });
  clearTikTokSessionCookie(response);

  if (tokenResult.ok && tokenResult?.data?.access_token) {
    setTikTokSessionCookie(response, {
      accessToken: tokenResult.data.access_token,
      refreshToken: tokenResult.data.refresh_token || '',
      openId: tokenResult.data.open_id || '',
      scope: tokenResult.data.scope || '',
      expiresIn,
      expiresAt,
      createdAt: Date.now(),
    });

    await logToSheet({
      type: 'TIKTOK_OAUTH',
      username: tokenResult.data.open_id || '',
      incomingMessage: '',
      response: '',
      action: 'oauth_connected',
      category: 'tiktok_oauth',
      reason: 'token_exchange_success',
      confidence: '',
      severity: 'low',
      triggers: 'tiktok,oauth',
      needsReview: '',
    });
  } else {
    await logToSheet({
      type: 'TIKTOK_OAUTH',
      username: '',
      incomingMessage: '',
      response: '',
      action: 'oauth_failed',
      category: 'tiktok_oauth',
      reason: tokenResult?.data?.error_description || JSON.stringify(tokenResult.data || {}),
      confidence: '',
      severity: 'high',
      triggers: 'tiktok,oauth',
      needsReview: 'YES',
    });
  }

  return response;
}
