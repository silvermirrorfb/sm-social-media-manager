import Link from 'next/link';
import styles from './dashboard.module.css';
import { getRecentLogRows } from '@/lib/sheets';
import { logoutAction } from './login/actions';
import { getInstagramAccountId, hasEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

function getPlatforms(env, entries = []) {
  const fbReady = env.facebookWebhookReady;
  const tiktokEvents = entries.filter((entry) => entry.platform === 'tiktok').length;
  const tiktokStatus = env.tikTokOAuthReady
    ? (tiktokEvents > 0 ? 'live' : 'staged')
    : 'pending';

  return [
    {
      key: 'instagram',
      name: 'Instagram',
      status: 'live',
      description:
        'Live now. DMs and comments are reaching production, and the bot is replying in real time.',
    },
    {
      key: 'facebook',
      name: 'Facebook',
      status: fbReady ? 'live' : 'staged',
      description: fbReady
        ? 'Live now. Messenger DMs and Page comments are reaching production, and the bot is replying in real time.'
        : 'Webhook support is ready. Set FACEBOOK_PAGE_ACCESS_TOKEN and FACEBOOK_PAGE_ID on Vercel to go live.',
    },
    {
      key: 'tiktok',
      name: 'TikTok',
      status: tiktokStatus,
      description: !env.tikTokOAuthReady
        ? 'TikTok is not ready yet. Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in Vercel.'
        : tiktokEvents > 0
          ? 'TikTok webhook traffic is reaching production. OAuth and callback routes are active.'
          : 'TikTok credentials are configured. Waiting for first real webhook traffic.',
    },
  ];
}

const CHANNEL_LABELS = {
  all: 'All activity',
  dm: 'DMs',
  comment: 'Comments',
  other: 'System',
};

const VIEW_LABELS = {
  all: 'Everything',
  review: 'Needs review',
  unanswered: 'No bot reply',
  escalated: 'Escalated',
};

const SEVERITY_ORDER = {
  high: 3,
  medium: 2,
  low: 1,
};

function getEnvSnapshot() {
  const hasMetaToken = hasEnv('INSTAGRAM_ACCESS_TOKEN');
  const hasMetaSecret = hasEnv('INSTAGRAM_APP_SECRET', 'META_APP_SECRET');
  const hasVerifyToken = hasEnv('META_VERIFY_TOKEN');
  const hasInstagramAccountId = Boolean(getInstagramAccountId());
  const hasGoogleCreds =
    hasEnv('GOOGLE_SERVICE_ACCOUNT_JSON') ||
    (hasEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL') && hasEnv('GOOGLE_PRIVATE_KEY'));

  const hasFacebookPageToken = hasEnv('FACEBOOK_PAGE_ACCESS_TOKEN');
  const hasFacebookPageId = hasEnv('FACEBOOK_PAGE_ID');
  const hasTikTokClientKey = hasEnv('TIKTOK_CLIENT_KEY');
  const hasTikTokClientSecret = hasEnv('TIKTOK_CLIENT_SECRET');

  return {
    hasGoogleCreds,
    hasSheetId: hasEnv('GOOGLE_SHEET_ID'),
    metaWebhookReady: hasMetaToken && hasMetaSecret && hasVerifyToken && hasInstagramAccountId,
    facebookWebhookReady: hasFacebookPageToken && hasFacebookPageId && hasMetaSecret && hasVerifyToken,
    tikTokOAuthReady: hasTikTokClientKey && hasTikTokClientSecret,
  };
}

function parseType(rawType) {
  const normalized = String(rawType || '').trim().toUpperCase();
  if (!normalized) {
    return { platform: 'instagram', channel: 'other' };
  }

  const [platformPart, channelPart] = normalized.split('_');
  if (channelPart && ['INSTAGRAM', 'FACEBOOK', 'TIKTOK'].includes(platformPart)) {
    return {
      platform: platformPart.toLowerCase(),
      channel: channelPart === 'DM' ? 'dm' : channelPart === 'COMMENT' ? 'comment' : 'other',
    };
  }

  return {
    platform: 'instagram',
    channel: normalized === 'DM' ? 'dm' : normalized === 'COMMENT' ? 'comment' : 'other',
  };
}

function normalizeLogRow(row) {
  const parsed = parseType(row[1]);
  const action = row[5] || '';
  const actionLower = action.toLowerCase();
  const response = row[4] || '';
  const confidence = Number(row[8]);
  const severity = (row[9] || '').toLowerCase();
  const needsReview = (row[11] || '').toUpperCase() === 'YES';

  return {
    id: `${row[0] || 'missing'}-${parsed.platform}-${parsed.channel}-${row[2] || 'unknown'}`,
    timestamp: row[0] || '',
    platform: parsed.platform,
    channel: parsed.channel,
    username: row[2] || 'unknown',
    incomingMessage: row[3] || '',
    response,
    action,
    category: row[6] || '',
    reason: row[7] || '',
    confidence: Number.isFinite(confidence) ? confidence : null,
    severity: severity || 'low',
    triggers: row[10] || '',
    needsReview,
    botAnswered: Boolean(response),
    isEscalated: actionLower.includes('escalat'),
    isModerated: actionLower.includes('hide') || actionLower.includes('block'),
    isError: actionLower.includes('error'),
    isIgnored: actionLower.includes('ignored'),
  };
}

function buildChannelCounts(entries) {
  return entries.reduce(
    (acc, entry) => {
      if (entry.channel === 'dm') acc.dm += 1;
      if (entry.channel === 'comment') acc.comment += 1;
      if (entry.channel === 'other') acc.other += 1;
      acc.all += 1;
      return acc;
    },
    { all: 0, dm: 0, comment: 0, other: 0 }
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
      if (entry.isError) acc.errors += 1;
      return acc;
    },
    { answered: 0, escalated: 0, needsReview: 0, moderated: 0, unanswered: 0, errors: 0 }
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

function formatShortDate(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function toDayKey(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toISOString().slice(0, 10);
}

function getTakeoverStatus(platformKey, env, entries) {
  if (platformKey === 'instagram') {
    if (!env.metaWebhookReady) {
      return {
        label: 'Waiting on platform readiness',
        body: 'Instagram should not be treated as fully owned by the bot until Meta webhook settings and credentials are complete.',
      };
    }
    if (entries.length === 0) {
      return {
        label: 'Configured, watching for traffic',
        body: 'Instagram is configured, but the team should wait for live traffic before treating the bot as fully operational.',
      };
    }
    return {
      label: 'Actively answering',
      body: 'Instagram is live. New DMs and comments are reaching production and the bot is handling them while the team watches the queue here.',
    };
  }

  if (platformKey === 'facebook') {
    if (!env.facebookWebhookReady) {
      return {
        label: 'Waiting on platform readiness',
        body: 'Facebook Page should not be treated as fully owned by the bot until FACEBOOK_PAGE_ACCESS_TOKEN and FACEBOOK_PAGE_ID are set and the Page webhook is subscribed.',
      };
    }
    if (entries.length === 0) {
      return {
        label: 'Configured, watching for traffic',
        body: 'Facebook is configured, but the team should wait for live traffic before treating the bot as fully operational.',
      };
    }
    return {
      label: 'Actively answering',
      body: 'Facebook is live. Messenger DMs and Page comments are reaching production and the bot is handling them while the team watches the queue here.',
    };
  }

  if (platformKey === 'tiktok') {
    if (!env.tikTokOAuthReady) {
      return {
        label: 'Waiting on platform readiness',
        body: 'TikTok will stay staged until TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET are set and validated through the TikTok Connect page.',
      };
    }
    if (entries.length === 0) {
      return {
        label: 'Configured, watching for traffic',
        body: 'TikTok credentials are configured and webhook callback is live. Send a TikTok test event or real event to confirm steady ingestion.',
      };
    }
    return {
      label: 'Actively ingesting',
      body: 'TikTok events are landing in production. Continue monitoring the queue while we complete full DM/comment action automation.',
    };
  }

  return {
    label: 'Staged for rollout',
    body: 'This channel has a seat in the dashboard already, but live ingestion and reply delivery still need platform setup before the bot can take over there.',
  };
}

function buildHref(platform, channel, view = 'all', q = '', thread = '') {
  const params = new URLSearchParams();
  params.set('platform', platform);
  if (channel && channel !== 'all') params.set('channel', channel);
  if (view && view !== 'all') params.set('view', view);
  if (q) params.set('q', q);
  if (thread) params.set('thread', thread);
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

function getFlagText(entry) {
  const parts = [];
  if (entry.needsReview) parts.push('needs review');
  if (entry.isEscalated) parts.push('escalated');
  if (entry.isModerated) parts.push('moderated');
  if (entry.isError) parts.push('error');
  if (!entry.botAnswered) parts.push('no reply logged');
  return parts.join(' • ') || 'normal flow';
}

function buildThreads(entries) {
  const groups = new Map();

  for (const entry of [...entries].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))) {
    const key = `${entry.platform}:${entry.channel}:${entry.username.toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        platform: entry.platform,
        channel: entry.channel,
        username: entry.username,
        entries: [],
        needsReview: false,
        unresolved: false,
        latestSeverity: 'low',
      });
    }

    const thread = groups.get(key);
    thread.entries.push(entry);
    thread.needsReview = thread.needsReview || entry.needsReview;
    thread.unresolved = thread.unresolved || !entry.botAnswered || entry.isError || entry.isEscalated;
    if (SEVERITY_ORDER[entry.severity] > SEVERITY_ORDER[thread.latestSeverity]) {
      thread.latestSeverity = entry.severity;
    }
  }

  return Array.from(groups.values())
    .map((thread) => {
      const lastEntry = thread.entries[thread.entries.length - 1];
      const replyCount = thread.entries.filter((entry) => entry.botAnswered).length;
      return {
        ...thread,
        lastEntry,
        lastSeen: lastEntry?.timestamp || '',
        latestIncoming: lastEntry?.incomingMessage || '',
        latestResponse: lastEntry?.response || '',
        messageCount: thread.entries.length,
        replyCount,
      };
    })
    .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
}

function getTopQueue(entries) {
  return [...entries]
    .filter((entry) => entry.needsReview || !entry.botAnswered || entry.isEscalated || entry.isError)
    .sort((a, b) => {
      const severityDiff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.timestamp) - new Date(a.timestamp);
    })
    .slice(0, 8)
    .map((entry) => ({
      ...entry,
      ownerHint: entry.channel === 'comment' ? 'Social team' : 'Front desk follow-up',
      nextStep: entry.isError
        ? 'Check runtime error and retry manually if needed.'
        : entry.isEscalated
          ? 'Hand off to a human and capture contact details.'
          : entry.needsReview
            ? 'Review tone and decide whether to keep hidden or respond manually.'
            : 'Check why no reply was logged and confirm customer got a response.',
    }));
}

function getVolumeByChannel(entries) {
  const output = [
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
  const otherCount = entries.filter((entry) => entry.channel === 'other').length;
  if (otherCount > 0) {
    output.push({
      key: 'other',
      label: 'System',
      count: otherCount,
    });
  }
  return output;
}

function getAnalytics(entries) {
  const lastSevenDays = [];
  const now = new Date();
  for (let offset = 6; offset >= 0; offset--) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - offset);
    const key = day.toISOString().slice(0, 10);
    lastSevenDays.push({
      key,
      label: formatShortDate(day.toISOString()),
      total: 0,
      answered: 0,
      moderated: 0,
    });
  }

  const dayMap = new Map(lastSevenDays.map((item) => [item.key, item]));
  const categories = new Map();
  const channels = new Map();

  for (const entry of entries) {
    const day = dayMap.get(toDayKey(entry.timestamp));
    if (day) {
      day.total += 1;
      if (entry.botAnswered) day.answered += 1;
      if (entry.isModerated) day.moderated += 1;
    }

    if (entry.category) {
      categories.set(entry.category, (categories.get(entry.category) || 0) + 1);
    }

    const channelStats = channels.get(entry.channel) || { total: 0, answered: 0, review: 0 };
    channelStats.total += 1;
    if (entry.botAnswered) channelStats.answered += 1;
    if (entry.needsReview) channelStats.review += 1;
    channels.set(entry.channel, channelStats);
  }

  return {
    daily: lastSevenDays,
    categories: Array.from(categories.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    channelPerformance: Array.from(channels.entries()).map(([channel, stats]) => ({
      channel,
      total: stats.total,
      answered: stats.answered,
      review: stats.review,
      answerRate: stats.total ? Math.round((stats.answered / stats.total) * 100) : 0,
    })),
  };
}

function getPlatformStatusClass(status) {
  return status === 'live' ? styles.badgeLive : styles.badgePending;
}

function getSeverityClass(severity) {
  if (severity === 'high') return styles.severityHigh;
  if (severity === 'medium') return styles.severityMedium;
  return styles.severityLow;
}

export default async function DashboardPage({ searchParams }) {
  const env = getEnvSnapshot();

  const selectedPlatform = PLATFORMS.some((platform) => platform.key === searchParams?.platform)
    ? searchParams.platform
    : 'instagram';
  const selectedChannel = CHANNEL_LABELS[searchParams?.channel] ? searchParams.channel : 'all';
  const selectedView = VIEW_LABELS[searchParams?.view] ? searchParams.view : 'all';
  const search = typeof searchParams?.q === 'string' ? searchParams.q.trim() : '';
  const selectedThreadKey = typeof searchParams?.thread === 'string' ? searchParams.thread : '';

  const rawRows = await getRecentLogRows(250);
  const entries = rawRows.map(normalizeLogRow);
  const PLATFORMS = getPlatforms(env, entries);

  const platformEntries = entries.filter((entry) => entry.platform === selectedPlatform);
  const channelEntries =
    selectedChannel === 'all'
      ? platformEntries
      : platformEntries.filter((entry) => entry.channel === selectedChannel);
  const visibleEntries = channelEntries
    .filter((entry) => matchesView(entry, selectedView))
    .filter((entry) => matchesSearch(entry, search));

  const visibleThreads = buildThreads(visibleEntries);
  const selectedThread =
    visibleThreads.find((thread) => thread.key === selectedThreadKey) || visibleThreads[0] || null;

  const channelCounts = buildChannelCounts(platformEntries);
  const summary = buildSummary(platformEntries);
  const selectedPlatformConfig =
    PLATFORMS.find((platform) => platform.key === selectedPlatform) || PLATFORMS[0];
  const takeoverStatus = getTakeoverStatus(selectedPlatform, env, platformEntries);
  const topQueue = getTopQueue(platformEntries);
  const volumeByChannel = getVolumeByChannel(platformEntries);
  const analytics = getAnalytics(platformEntries);
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
                This board is built for operators. It shows live traffic, what the bot answered,
                what was hidden, and what still needs a human to step in.
              </p>
            </div>
            <div className={styles.heroActions}>
              <div className={styles.statusPill}>
                Bot status: <strong>{takeoverStatus.label}</strong>
              </div>
              <Link href="/dashboard/outreach" className={styles.logoutButton}>
                Outreach CRM
              </Link>
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
              <h2 className={styles.panelTitle}>Overview</h2>
              <div className={styles.channelPills}>
                {Object.entries(CHANNEL_LABELS).map(([channelKey, label]) => (
                  <Link
                    key={channelKey}
                    href={buildHref(selectedPlatform, channelKey, selectedView, search, selectedThread?.key || '')}
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
                  <span className={styles.statLabel}>Needs review</span>
                  <span className={styles.statValue}>{summary.needsReview}</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Moderated</span>
                  <span className={styles.statValue}>{summary.moderated}</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Escalated</span>
                  <span className={styles.statValue}>{summary.escalated}</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>No reply</span>
                  <span className={styles.statValue}>{summary.unanswered}</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Errors</span>
                  <span className={styles.statValue}>{summary.errors}</span>
                </div>
              </div>
            </div>

            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Readiness</h2>
              <div className={styles.opsList}>
                <div className={styles.opsRow}>
                  <strong>Google logging</strong>
                  <p>{env.hasGoogleCreds && env.hasSheetId ? 'Connected and writable.' : 'Still missing logging setup.'}</p>
                </div>
                <div className={styles.opsRow}>
                  <strong>Instagram takeover</strong>
                  <p>{env.metaWebhookReady ? 'Configured and handling production traffic.' : 'Meta webhook setup is not complete yet.'}</p>
                </div>
                <div className={styles.opsRow}>
                  <strong>Facebook takeover</strong>
                  <p>{env.facebookWebhookReady ? 'Configured and handling production traffic.' : 'Facebook Page credentials not set yet.'}</p>
                </div>
                <div className={styles.opsRow}>
                  <strong>TikTok OAuth</strong>
                  <p>{env.tikTokOAuthReady ? 'Credentials are configured. Use TikTok Connect to validate account data.' : 'Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET to continue.'}</p>
                </div>
                <div className={styles.opsRow}>
                  <strong>Last logged event</strong>
                  <p>{formatTimestamp(entries[0]?.timestamp)}</p>
                </div>
              </div>
              <p className={styles.toolbarText} style={{ marginTop: 12 }}>
                TikTok setup and live account checks:
                {' '}
                <Link href="/tiktok/connect">open TikTok Connect</Link>.
              </p>
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
              <h2 className={styles.panelTitle}>Human review queue</h2>
              {topQueue.length === 0 ? (
                <div className={styles.emptyState}>
                  Nothing is waiting for attention right now. As soon as something needs review,
                  gets escalated, or lands without a reply, it will show up here.
                </div>
              ) : (
                <div className={styles.queueList}>
                  {topQueue.map((entry, index) => (
                    <div className={styles.queueCard} key={`${entry.id}-${index}`}>
                      <div className={styles.queueHeader}>
                        <strong>@{entry.username}</strong>
                        <span className={`${styles.severityPill} ${getSeverityClass(entry.severity)}`}>
                          {entry.severity}
                        </span>
                      </div>
                      <p className={styles.queueMessage}>{entry.incomingMessage || 'No incoming text logged.'}</p>
                      <p className={styles.queueMeta}>
                        {formatTimestamp(entry.timestamp)} {' · '} {entry.channel} {' · '} {getFlagText(entry)}
                      </p>
                      <p className={styles.queueHint}><strong>Next step:</strong> {entry.nextStep}</p>
                      <p className={styles.queueHint}><strong>Owner:</strong> {entry.ownerHint}</p>
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

              <div className={styles.channelPerformance}>
                {analytics.channelPerformance.map((item) => (
                  <div key={item.channel} className={styles.performanceRow}>
                    <div>
                      <strong>{CHANNEL_LABELS[item.channel] || item.channel}</strong>
                      <p>{item.total} total {' · '} {item.review} needing review</p>
                    </div>
                    <div className={styles.performanceValue}>{item.answerRate}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.statsGrid}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Daily trend</h2>
              <div className={styles.dailyGrid}>
                {analytics.daily.map((day) => {
                  const max = Math.max(1, ...analytics.daily.map((item) => item.total));
                  const totalHeight = day.total ? Math.max(18, Math.round((day.total / max) * 120)) : 8;
                  const answeredHeight = day.total ? Math.max(8, Math.round((day.answered / max) * 120)) : 4;
                  return (
                    <div key={day.key} className={styles.dayCard}>
                      <div className={styles.dayBars}>
                        <div className={styles.dayTotal} style={{ height: `${totalHeight}px` }} />
                        <div className={styles.dayAnswered} style={{ height: `${answeredHeight}px` }} />
                      </div>
                      <strong>{day.total}</strong>
                      <span>{day.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Category mix</h2>
              {analytics.categories.length === 0 ? (
                <div className={styles.emptyState}>Categories will appear here once comments are logged and classified.</div>
              ) : (
                <div className={styles.categoryList}>
                  {analytics.categories.map((item) => {
                    const max = analytics.categories[0]?.count || 1;
                    const width = Math.max(12, (item.count / max) * 100);
                    return (
                      <div key={item.label} className={styles.categoryRow}>
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
              )}
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.toolbar}>
            <div>
              <h2 className={styles.sectionTitle}>Conversation workspace</h2>
              <p className={styles.toolbarText}>
                Pick a thread on the left to see what came in, how the bot answered, and whether anything still needs a human.
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
                href={buildHref(selectedPlatform, selectedChannel, viewKey, search, selectedThread?.key || '')}
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
            <div className={styles.workspaceGrid}>
              <div className={styles.panel}>
                <h3 className={styles.panelTitle}>Threads</h3>
                <div className={styles.threadList}>
                  {visibleThreads.map((thread) => (
                    <Link
                      key={thread.key}
                      href={buildHref(selectedPlatform, selectedChannel, selectedView, search, thread.key)}
                      className={`${styles.threadCard} ${selectedThread?.key === thread.key ? styles.threadCardActive : ''}`}
                    >
                      <div className={styles.threadHeader}>
                        <strong>@{thread.username}</strong>
                        <span className={`${styles.severityPill} ${getSeverityClass(thread.latestSeverity)}`}>
                          {thread.latestSeverity}
                        </span>
                      </div>
                      <p className={styles.threadPreview}>{thread.latestIncoming || 'No incoming text logged.'}</p>
                      <p className={styles.threadMeta}>
                        {formatTimestamp(thread.lastSeen)} {' · '} {thread.channel} {' · '} {thread.messageCount} events {' · '} {thread.replyCount} replies
                      </p>
                    </Link>
                  ))}
                </div>
              </div>

              <div className={styles.panel}>
                <h3 className={styles.panelTitle}>Selected thread</h3>
                {!selectedThread ? (
                  <div className={styles.emptyState}>Choose a thread to inspect the full timeline.</div>
                ) : (
                  <>
                    <div className={styles.selectedThreadHeader}>
                      <div>
                        <strong>@{selectedThread.username}</strong>
                        <p className={styles.toolbarText}>
                          {selectedThread.platform} {' · '} {selectedThread.channel} {' · '} last seen {formatTimestamp(selectedThread.lastSeen)}
                        </p>
                      </div>
                      <div className={styles.selectedThreadStats}>
                        <span>{selectedThread.messageCount} events</span>
                        <span>{selectedThread.replyCount} replies</span>
                      </div>
                    </div>
                    <div className={styles.timeline}>
                      {selectedThread.entries.map((entry, index) => (
                        <div key={`${entry.id}-${index}`} className={styles.timelineItem}>
                          <div className={styles.timelineStamp}>{formatTimestamp(entry.timestamp)}</div>
                          <div className={styles.timelineBody}>
                            <div className={styles.timelineBubbleInbound}>
                              <strong>Incoming</strong>
                              <p>{entry.incomingMessage || 'No incoming text logged.'}</p>
                            </div>
                            <div className={styles.timelineBubbleOutbound}>
                              <strong>Bot</strong>
                              <p>{entry.response || 'No bot reply recorded.'}</p>
                            </div>
                            <div className={styles.timelineMeta}>
                              <span>{entry.action || 'none'}</span>
                              {entry.category ? <span>{entry.category}</span> : null}
                              <span>{getFlagText(entry)}</span>
                            </div>
                            {entry.reason ? <p className={styles.timelineReason}>{entry.reason}</p> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Raw activity log</h2>
          {visibleEntries.length === 0 ? (
            <div className={styles.emptyState}>No rows to show for the current filters.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Platform</th>
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
                    <tr key={`${entry.id}-${index}`}>
                      <td>{formatTimestamp(entry.timestamp)}</td>
                      <td>{entry.platform}</td>
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
