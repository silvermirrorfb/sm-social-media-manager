import Link from 'next/link';
import styles from './dashboard.module.css';
import { getRecentLogRows } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

const PLATFORMS = [
  {
    key: 'instagram',
    name: 'Instagram',
    status: 'live',
    description: 'Live now. DMs and comment moderation are flowing through the production webhook.',
  },
  {
    key: 'facebook',
    name: 'Facebook',
    status: 'pending',
    description: 'Dashboard lane is ready, but Facebook ingestion is not wired into this app yet.',
  },
  {
    key: 'tiktok',
    name: 'TikTok',
    status: 'pending',
    description: 'Reserved for future integration. No TikTok events are being captured yet.',
  },
];

const CHANNEL_LABELS = {
  all: 'All activity',
  dm: 'DMs',
  comment: 'Comments',
};

function getEnvSnapshot() {
  const hasMetaToken = !!process.env.INSTAGRAM_ACCESS_TOKEN;
  const hasMetaSecret = !!process.env.META_APP_SECRET;
  const hasVerifyToken = !!process.env.META_VERIFY_TOKEN;
  const hasInstagramAccountId = !!process.env.INSTAGRAM_ACCOUNT_ID;
  const hasGoogleCreds =
    !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    (!!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY);

  return {
    hasGoogleCreds,
    hasSheetId: !!process.env.GOOGLE_SHEET_ID,
    metaWebhookReady: hasMetaToken && hasMetaSecret && hasVerifyToken && hasInstagramAccountId,
  };
}

function normalizeLogRow(row) {
  const type = (row[1] || '').toUpperCase();
  const channel = type === 'DM' ? 'dm' : type === 'COMMENT' ? 'comment' : 'other';
  const action = row[5] || '';
  const response = row[4] || '';

  return {
    timestamp: row[0] || '',
    platform: 'instagram',
    channel,
    username: row[2] || 'unknown',
    incomingMessage: row[3] || '',
    response,
    action,
    category: row[6] || '',
    reason: row[7] || '',
    confidence: row[8] || '',
    severity: row[9] || '',
    triggers: row[10] || '',
    needsReview: row[11] || '',
    direction: response ? 'incoming-outgoing' : 'incoming-only',
    botAnswered: Boolean(response),
  };
}

function buildChannelCounts(entries) {
  return entries.reduce(
    (acc, entry) => {
      if (entry.channel === 'dm') acc.dm += 1;
      if (entry.channel === 'comment') acc.comment += 1;
      acc.all += 1;
      return acc;
    },
    { all: 0, dm: 0, comment: 0 }
  );
}

function buildSummary(entries) {
  return entries.reduce(
    (acc, entry) => {
      if (entry.botAnswered) acc.answered += 1;
      if ((entry.action || '').toLowerCase().includes('escalat')) acc.escalated += 1;
      if ((entry.needsReview || '').toUpperCase() === 'YES') acc.needsReview += 1;
      if ((entry.action || '').toLowerCase().includes('hide')) acc.moderated += 1;
      return acc;
    },
    { answered: 0, escalated: 0, needsReview: 0, moderated: 0 }
  );
}

function formatTimestamp(timestamp) {
  if (!timestamp) return 'Waiting for traffic';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getTakeoverStatus(platformKey, env, entries) {
  if (platformKey !== 'instagram') {
    return {
      label: 'Not taking over yet',
      body: 'This channel is not integrated into the app yet. The dashboard is ready for it, but the bot cannot answer there today.',
    };
  }

  if (!env.metaWebhookReady) {
    return {
      label: 'Waiting on Meta readiness',
      body: 'Instagram is close, but the bot should not be treated as live-answering until Meta webhook setup is complete and a real event has been confirmed.',
    };
  }

  if (entries.length === 0) {
    return {
      label: 'Ready to take over',
      body: 'Instagram is configured and can answer as soon as real DMs or comments arrive. The next step is just confirming traffic shows up in this dashboard.',
    };
  }

  return {
    label: 'Actively taking over',
    body: 'Instagram traffic is reaching the app and the bot is already logging incoming and outgoing activity. Your team can use this board to audit what it saw and how it answered.',
  };
}

function buildHref(platform, channel) {
  const params = new URLSearchParams();
  params.set('platform', platform);
  if (channel && channel !== 'all') params.set('channel', channel);
  const query = params.toString();
  return query ? `/dashboard?${query}` : '/dashboard';
}

export default async function DashboardPage({ searchParams }) {
  const selectedPlatform = PLATFORMS.some((platform) => platform.key === searchParams?.platform)
    ? searchParams.platform
    : 'instagram';
  const selectedChannel = CHANNEL_LABELS[searchParams?.channel] ? searchParams.channel : 'all';

  const rawRows = await getRecentLogRows(160);
  const entries = rawRows.map(normalizeLogRow);
  const env = getEnvSnapshot();

  const platformEntries = entries.filter((entry) => entry.platform === selectedPlatform);
  const visibleEntries =
    selectedChannel === 'all'
      ? platformEntries
      : platformEntries.filter((entry) => entry.channel === selectedChannel);

  const channelCounts = buildChannelCounts(platformEntries);
  const summary = buildSummary(platformEntries);
  const selectedPlatformConfig =
    PLATFORMS.find((platform) => platform.key === selectedPlatform) || PLATFORMS[0];
  const takeoverStatus = getTakeoverStatus(selectedPlatform, env, platformEntries);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Silver Mirror social operations</p>
          <div className={styles.titleRow}>
            <div>
              <h1 className={styles.title}>See what came in, what went out, and what the bot decided.</h1>
              <p className={styles.lede}>
                This board is built for your team, not engineers. Instagram is live now. Facebook and TikTok
                are staged so the view can expand cleanly as soon as those channels are wired in.
              </p>
            </div>
            <div className={styles.statusPill}>
              Bot status: <strong>{takeoverStatus.label}</strong>
            </div>
          </div>

          <div className={styles.heroMeta}>
            <div className={styles.heroCard}>
              <span className={styles.heroLabel}>Selected platform</span>
              <div className={styles.heroValue}>{selectedPlatformConfig.name}</div>
            </div>
            <div className={styles.heroCard}>
              <span className={styles.heroLabel}>Recent activity</span>
              <div className={styles.heroValue}>{platformEntries.length}</div>
            </div>
            <div className={styles.heroCard}>
              <span className={styles.heroLabel}>Bot answered</span>
              <div className={styles.heroValue}>{summary.answered}</div>
            </div>
            <div className={styles.heroCard}>
              <span className={styles.heroLabel}>Needs review</span>
              <div className={styles.heroValue}>{summary.needsReview}</div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Platforms</h2>
          <div className={styles.platformGrid}>
            {PLATFORMS.map((platform) => (
              <Link
                key={platform.key}
                href={buildHref(platform.key, 'all')}
                className={`${styles.platformCard} ${
                  selectedPlatform === platform.key ? styles.platformCardActive : ''
                }`}
              >
                <div className={styles.platformHeader}>
                  <h3 className={styles.platformName}>{platform.name}</h3>
                  <span
                    className={`${styles.badge} ${
                      platform.status === 'live' ? styles.badgeLive : styles.badgePending
                    }`}
                  >
                    {platform.status}
                  </span>
                </div>
                <p className={styles.platformText}>{platform.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.statsGrid}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Split by message type</h2>
              <div className={styles.channelPills}>
                {Object.entries(CHANNEL_LABELS).map(([channelKey, label]) => (
                  <Link
                    key={channelKey}
                    href={buildHref(selectedPlatform, channelKey)}
                    className={`${styles.channelPill} ${
                      selectedChannel === channelKey ? styles.channelPillActive : ''
                    }`}
                  >
                    {label}
                    {' · '}
                    <strong>{channelCounts[channelKey] || 0}</strong>
                  </Link>
                ))}
              </div>

              <div className={styles.statsList} style={{ marginTop: 16 }}>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Answered</span>
                  <span className={styles.statValue}>{summary.answered}</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Escalated</span>
                  <span className={styles.statValue}>{summary.escalated}</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Moderated</span>
                  <span className={styles.statValue}>{summary.moderated}</span>
                </div>
              </div>
            </div>

            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Readiness</h2>
              <div className={styles.opsList}>
                <div className={styles.opsRow}>
                  <strong>Google logging</strong>
                  <p>{env.hasGoogleCreds && env.hasSheetId ? 'Connected and readable.' : 'Still missing logging setup.'}</p>
                </div>
                <div className={styles.opsRow}>
                  <strong>Instagram takeover</strong>
                  <p>{env.metaWebhookReady ? 'Webhook is configured and ready for production traffic.' : 'Meta webhook setup is not complete yet.'}</p>
                </div>
                <div className={styles.opsRow}>
                  <strong>Last logged event</strong>
                  <p>{formatTimestamp(entries[0]?.timestamp)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.takeover}>
            <strong>When does the bot take over answering?</strong>
            <p>{takeoverStatus.body}</p>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Conversation log</h2>
          {visibleEntries.length === 0 ? (
            <div className={styles.emptyState}>
              No {selectedPlatformConfig.name} {CHANNEL_LABELS[selectedChannel].toLowerCase()} have been logged yet.
              Once activity comes in, your team will be able to see the incoming message, the bot response, and
              any moderation/escalation decision here.
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Channel</th>
                    <th>From</th>
                    <th>Incoming</th>
                    <th>Bot answer</th>
                    <th>Action</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries.map((entry, index) => (
                    <tr key={`${entry.timestamp}-${entry.username}-${index}`}>
                      <td>{formatTimestamp(entry.timestamp)}</td>
                      <td>{entry.channel}</td>
                      <td>@{entry.username}</td>
                      <td>{entry.incomingMessage || 'No incoming text logged'}</td>
                      <td>{entry.response || 'No bot reply recorded'}</td>
                      <td>
                        <div>{entry.action || 'none'}</div>
                        {entry.category ? <div className={styles.mono}>{entry.category}</div> : null}
                      </td>
                      <td>
                        <div>{entry.needsReview || 'no review flag'}</div>
                        {entry.triggers ? <div className={styles.mono}>{entry.triggers}</div> : null}
                        {entry.reason ? <div className={styles.mono}>{entry.reason}</div> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
