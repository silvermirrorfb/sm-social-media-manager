import { getTikTokRedirectUri, getTikTokScopes } from '@/lib/tiktok';

const pageStyle = {
  fontFamily: 'system-ui',
  padding: '2rem',
  maxWidth: '760px',
  margin: '0 auto',
  lineHeight: 1.7,
};

const buttonStyle = {
  display: 'inline-block',
  marginTop: '1rem',
  padding: '0.9rem 1.2rem',
  borderRadius: '999px',
  background: '#111',
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 600,
};

export const metadata = {
  title: 'TikTok Connect | Silver Mirror Social Media Manager',
  description: 'TikTok authorization flow for Silver Mirror Social Media Manager.',
};

export default function TikTokConnectPage() {
  const scopes = getTikTokScopes();
  const redirectUri = getTikTokRedirectUri();

  return (
    <main style={pageStyle}>
      <h1>TikTok Connect</h1>
      <p>
        This page starts the TikTok Login Kit flow for Silver Mirror Social Media Manager.
        It is the web entry point used for TikTok app review and OAuth verification.
      </p>

      <p>
        Redirect URI:
        {' '}
        <code>{redirectUri}</code>
      </p>

      <p>
        Requested scopes:
        {' '}
        <code>{scopes.join(', ')}</code>
      </p>

      <a href="/api/tiktok/oauth/start" style={buttonStyle}>
        Connect TikTok
      </a>
    </main>
  );
}
