import { cookies } from 'next/headers';
import {
  getTikTokRedirectUri,
  getTikTokScopes,
  getTikTokUserInfo,
  getTikTokVideoList,
  getTikTokWebhookUri,
} from '@/lib/tiktok';
import { readTikTokSessionFromCookieStore } from '@/lib/tiktok-session';

export const dynamic = 'force-dynamic';

const pageStyle = {
  fontFamily: 'system-ui',
  padding: '2rem',
  maxWidth: '880px',
  margin: '0 auto',
  lineHeight: 1.7,
};

const panelStyle = {
  background: '#fff',
  border: '1px solid #e9e3d8',
  borderRadius: '14px',
  padding: '1rem 1.25rem',
  marginTop: '1rem',
};

const buttonStyle = {
  display: 'inline-block',
  marginTop: '0.75rem',
  padding: '0.9rem 1.2rem',
  borderRadius: '999px',
  background: '#111',
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 600,
  border: 0,
  cursor: 'pointer',
};

const secondaryButtonStyle = {
  ...buttonStyle,
  background: '#f5f1e8',
  color: '#111',
  border: '1px solid #d9d1c3',
  marginLeft: '0.5rem',
};

const codeStyle = {
  background: '#f5f1e8',
  padding: '0.2rem 0.4rem',
  borderRadius: '6px',
  fontSize: '0.9rem',
};

const summaryGridStyle = {
  display: 'grid',
  gap: '0.75rem',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
};

function formatDateTime(value) {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatUnixSeconds(seconds) {
  if (!seconds) return 'n/a';
  return formatDateTime(Number(seconds) * 1000);
}

async function getTikTokLiveData(session) {
  if (!session?.accessToken) {
    return {
      connected: false,
      reason: 'No TikTok session has been established for this dashboard login yet.',
      profile: null,
      videos: [],
      errors: [],
    };
  }

  if (session.expiresAt && Date.now() > Number(session.expiresAt)) {
    return {
      connected: false,
      reason: 'Your TikTok connection has expired. Reconnect to continue.',
      profile: null,
      videos: [],
      errors: ['Session expired'],
    };
  }

  const scopes = session.scope || getTikTokScopes().join(',');
  const [profileResult, videosResult] = await Promise.all([
    getTikTokUserInfo({ accessToken: session.accessToken, scopes }),
    getTikTokVideoList({ accessToken: session.accessToken, maxCount: 6 }),
  ]);

  const profile = profileResult.data?.data?.user || null;
  const videos = videosResult.data?.data?.videos || [];
  const errors = [];

  if (!profileResult.ok) {
    errors.push(`Profile request failed (${profileResult.status})`);
  }
  if (!videosResult.ok) {
    errors.push(`Video list request failed (${videosResult.status})`);
  }

  return {
    connected: Boolean(profileResult.ok || videosResult.ok),
    reason: profileResult.ok || videosResult.ok
      ? 'Connected and fetching data from TikTok APIs.'
      : 'Connected session exists, but TikTok API calls failed.',
    profile,
    videos,
    errors,
  };
}

export const metadata = {
  title: 'TikTok Connect | Silver Mirror Social Media Manager',
  description: 'TikTok authorization and webhook operations for Silver Mirror Social Media Manager.',
};

export default async function TikTokConnectPage({ searchParams }) {
  const redirectUri = getTikTokRedirectUri();
  const webhookUri = getTikTokWebhookUri();
  const scopes = getTikTokScopes();
  const resolvedSearchParams = await searchParams;
  const cookieStore = await cookies();
  const session = readTikTokSessionFromCookieStore(cookieStore);
  const liveData = await getTikTokLiveData(session);

  const connectedParam = resolvedSearchParams?.connected === '1';
  const disconnectedParam = resolvedSearchParams?.disconnected === '1';

  return (
    <main style={pageStyle}>
      <h1>TikTok Connect</h1>
      <p>
        This page is now your TikTok operations hub: OAuth connect, webhook callback reference,
        connection health, and a quick check that TikTok APIs are returning real data.
      </p>

      <div style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Status</h2>
        <p>
          <strong>{liveData.connected ? 'Connected' : 'Not connected'}</strong>
          {' · '}
          {liveData.reason}
        </p>
        {connectedParam ? <p>OAuth callback finished successfully for this session.</p> : null}
        {disconnectedParam ? <p>TikTok session has been disconnected for this session.</p> : null}
        {liveData.errors.length > 0 ? (
          <p>
            <strong>Warnings:</strong>
            {' '}
            {liveData.errors.join(' | ')}
          </p>
        ) : null}

        <a href="/api/tiktok/oauth/start" style={buttonStyle}>
          Connect TikTok
        </a>
        <form action="/api/tiktok/oauth/disconnect" method="post" style={{ display: 'inline' }}>
          <button type="submit" style={secondaryButtonStyle}>
            Disconnect
          </button>
        </form>
      </div>

      <div style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>TikTok Portal Values</h2>
        <p>
          Login Kit Redirect URI:
          {' '}
          <code style={codeStyle}>{redirectUri}</code>
        </p>
        <p>
          Webhooks Callback URL:
          {' '}
          <code style={codeStyle}>{webhookUri}</code>
        </p>
        <p>
          Requested scopes:
          {' '}
          <code style={codeStyle}>{scopes.join(', ')}</code>
        </p>
      </div>

      <div style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Connection Snapshot</h2>
        <div style={summaryGridStyle}>
          <div>
            <strong>Open ID</strong>
            <div>{session?.openId || liveData.profile?.open_id || 'n/a'}</div>
          </div>
          <div>
            <strong>Scopes</strong>
            <div>{session?.scope || 'n/a'}</div>
          </div>
          <div>
            <strong>Session Expires</strong>
            <div>{formatDateTime(session?.expiresAt)}</div>
          </div>
          <div>
            <strong>Latest Video Count</strong>
            <div>{Array.isArray(liveData.videos) ? liveData.videos.length : 0}</div>
          </div>
        </div>
      </div>

      <div style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Profile Data</h2>
        {!liveData.profile ? (
          <p>No profile payload loaded yet. Connect TikTok and refresh this page.</p>
        ) : (
          <div style={summaryGridStyle}>
            <div>
              <strong>Display Name</strong>
              <div>{liveData.profile.display_name || 'n/a'}</div>
            </div>
            <div>
              <strong>Verified</strong>
              <div>{String(liveData.profile.is_verified ?? 'n/a')}</div>
            </div>
            <div>
              <strong>Followers</strong>
              <div>{liveData.profile.follower_count ?? 'n/a'}</div>
            </div>
            <div>
              <strong>Following</strong>
              <div>{liveData.profile.following_count ?? 'n/a'}</div>
            </div>
            <div>
              <strong>Likes</strong>
              <div>{liveData.profile.likes_count ?? 'n/a'}</div>
            </div>
            <div>
              <strong>Video count</strong>
              <div>{liveData.profile.video_count ?? 'n/a'}</div>
            </div>
          </div>
        )}
      </div>

      <div style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Recent TikTok Videos</h2>
        {!liveData.videos?.length ? (
          <p>No videos returned yet (or scope approval is still pending).</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {liveData.videos.map((video) => (
              <div key={video.id} style={{ border: '1px solid #ece3d3', borderRadius: 10, padding: '0.75rem' }}>
                <strong>{video.title || video.video_description || 'Untitled video'}</strong>
                <div style={{ fontSize: '0.92rem', color: '#5e5548' }}>
                  ID: <code style={codeStyle}>{video.id}</code>
                </div>
                <div style={{ fontSize: '0.92rem', color: '#5e5548' }}>
                  Created: {formatUnixSeconds(video.create_time)} {' · '}
                  Views: {video.view_count ?? 'n/a'} {' · '}
                  Likes: {video.like_count ?? 'n/a'} {' · '}
                  Comments: {video.comment_count ?? 'n/a'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
