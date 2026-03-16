import Link from 'next/link';
import styles from './dashboard.module.css';
import { getRecentLogRows } from '@/lib/sheets';
import { logoutAction } from './login/actions';

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

const VIEW_LABELS = {
  all: 'Everything',
  review: 'Needs review',
  unanswered: 'No bot reply',
  escalated: 'Escalated',
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
  const actionLower = action.toLowerCase();
  const response = row[4] || '';
  const needsReview = (row[11] || '').toUpperCase() === 'YES';

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
    needsReview,
    botAnswered: Boolean(response),
    isEscalated: actionLower.includes('escalat'),
    isModerated: actionLower.includes('hide') || actionLower.includes('block'),
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
      if (entry.isEscalated) acc.escalated += 1;
      if (entry.needsReview) acc.needsReview += 1;
      if (entry.isModerated) acc.moderated += 1;
      if (!entry.botAnswered) acc.unanswered += 1;
      return acc;
    },
    { answered: 0, escalated: 0, needsReview: 0, moderated: 0, unanswered: 0 }
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

function buildHref(platform, channel, view = 'all', q = '') {
  const params = new URLSearchParams();
  params.set('platform', platform);
  if (channel && channel !== 'all') params.set('channel', channel);
  if (view && view !== 'all') params.set('view', view);
  if (q) params.set('q', q);
  const query = params.toString();
  return query ? `/dashboard?${query}` : '/dashboard';
}

function matchesSearch(entry, search) {
  if (!search) return true;
  const haystack = [
    entry.username,
    entry.incomingMessage,
    entry.response,
    entry.action,
    entry.category,
    entry.reason,
    entry.triggers,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

function matchesView(entry, view) {
  if (view === 'review') return entry.needsReview;
  if (view === 'unanswered') return !entry.botAnswered;
  if (view === 'escalated') return entry.isEscalated;
  return true;
}

function getTopQueue(entries) {
  return entries
    .filter((entry) => entry.needsReview || !entry.botAnswered || entry.isEscalated)
    .slice(0, 5);
}

function getVolumeByChannel(entries) {
  return [
    {
      key: 'dm',
      label: 'DMs',
      count: entries.filter((entry) => entry.channel === 'dm').length,
    },
    {
      key: 'comment',
      label: 'Comments',
      count: entries.filter((entry) => entry.channel === 'comment').length,
    },
  ];
}

function getPlatformStatusClass(status) {
  return status === 'live' ? styles.badgeLive : styles.badgePending;
}

function getFlagText(entry) {
  const parts = [];
  if (entry.needsReview) parts.push('needs review');
  if (entry.isEscalated) parts.push('escalated');
  if (entry.isModerated) parts.push('moderated');
  if (!entry.botAnswered) parts.push('no reply logged');
  return parts.join(' • ') || 'normal flow';
}

export default async function DashboardPage({ searchParams }) {
  const selectedPlatform = PLATFORMS.some((platform) => platform.key === searchParams?.platform)
    ? searchParams.platform
    : 'instagram';
  const selectedChannel = CHANNEL_LABELS[searchParams?.channel] ? searchParams.channel : 'all';
  const selectedView = VIEW_LABELS[searchParams?.view] ? searchParams.view : 'all';
  const search = typeof searchParams?.q === 'string' ? searchParams.q.trim() : '';

  const rawRows = await getRecentLogRows(200);
  const entries = rawRows.map(normalizeLogRow);
  const env = getEnvSnapshot();

  const platformEntries = entries.filter((entry) => entry.platform === selectedPlatform);
  const channelEntries =
    selectedChannel === 'all'
      ? platformEntries
      : platformEntries.filter((entry) => entry.channel === selectedChannel);
  const visibleEntries = channelEntries
    .filter((entry) => matchesView(entry, selectedView))
    .filter((entry) => matchesSearch(entry, search));

  const channelCounts = buildChannelCounts(platformEntries);
  const summary = buildSummary(platformEntries);
  const selectedPlatformConfig =
    PLATFORMS.find((platform) => platform.key === selectedPlatform) || PLATFORMS[0];
  const takeoverStatus = getTakeoverStatus(selectedPlatform, env, platformEntries);
  const topQueue = getTopQueue(platformEntries);
  const volumeByChannel = getVolumeByChannel(platformEntries);
  const answerRate = platformEntries.length
    ? Math.round((summary.answered / platformEntries.length) * 100)
    : 0;

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
            <div className={styles.heroActions}>
              <div className={styles.statusPill}>
                Bot status: <strong>{takeoverStatus.label}</strong>
              </div>
              <form action={logoutAction}>
                <button className={styles.logoutButton} type="submit">
                  Log out
                </button>
              </form>
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
              <span className={styles.heroLabel}>Answer rate</span>
              <div className={styles.heroValue}>{answerRate}%</div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Platforms</h2>
          <div className={styles.platformGrid}>
            {PLATFORMS.map((platform) => (
              <Link
                key={platform.key}
                href={buildHref(platform.key, 'all', 'all', '')}
                className={`${styles.platformCard} ${
                  selectedPlatform === platform.key ? styles.platformCardActive : ''
                }`}
              >
                <div className={styles.platformHeader}>
                  <h3 className={styles.platformName}>{platform.name}</h3>
                  <span className={`${styles.badge} ${getPlatformStatusClass(platform.status)}`}>
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
                    href={buildHref(selectedPlatform, channelKey, selectedView, search)}
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
          <div className={styles.statsGrid}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Triage queue</h2>
              {topQueue.length === 0 ? (
                <div className={styles.emptyState}>
                  Nothing is waiting for attention right now. As soon as something needs review, gets escalated, or
                  comes in without a reply logged, it will show up here.
                </div>
              ) : (
                <div className={styles.opsList}>
                  {topQueue.map((entry, index) => (
                    <div className={styles.opsRow} key={`${entry.timestamp}-${entry.username}-${index}`}>
                      <strong>@{entry.username}</strong>
                      <p>{entry.incomingMessage || 'No incoming text logged.'}</p>
                      <p className={styles.inlineMeta}>
                        {formatTimestamp(entry.timestamp)} {' · '} {entry.channel} {' · '} {getFlagText(entry)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Volume snapshot</h2>
              <div className={styles.barList}>
                {volumeByChannel.map((item) => {
                  const width = platformEntries.length ? Math.max(12, (item.count / platformEntries.length) * 100) : 12;
                  return (
                    <div key={item.key} className={styles.barRow}>
                      <div className={styles.barMeta}>
                        <span>{item.label}</span>
                        <strong>{item.count}</strong>
                      </div>
                      <div className={styles.barTrack}>
                        <div className={styles.barFill} style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.toolbar}>
            <div>
              <h2 className={styles.sectionTitle}>Conversation log</h2>
              <p className={styles.toolbarText}>
                Filter this to what your team actually needs to work right now.
              </p>
            </div>
            <form action="/dashboard" className={styles.searchForm}>
              <input type="hidden" name="platform" value={selectedPlatform} />
              {selectedChannel !== 'all' ? <input type="hidden" name="channel" value={selectedChannel} /> : null}
              {selectedView !== 'all' ? <input type="hidden" name="view" value={selectedView} /> : null}
              <input
                className={styles.searchInput}
                type="search"
                name="q"
                defaultValue={search}
                placeholder="Search username, message, reply, category..."
              />
              <button className={styles.searchButton} type="submit">
                Filter
              </button>
            </form>
          </div>

          <div className={styles.viewPills}>
            {Object.entries(VIEW_LABELS).map(([viewKey, label]) => (
              <Link
                key={viewKey}
                href={buildHref(selectedPlatform, selectedChannel, viewKey, search)}
                className={`${styles.channelPill} ${selectedView === viewKey ? styles.channelPillActive : ''}`}
              >
                {label}
              </Link>
            ))}
          </div>

          {visibleEntries.length === 0 ? (
            <div className={styles.emptyState}>
              No {selectedPlatformConfig.name} {CHANNEL_LABELS[selectedChannel].toLowerCase()} match this view right now.
              Try removing filters or wait for the next event to come in.
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
                        <div>{getFlagText(entry)}</div>
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
