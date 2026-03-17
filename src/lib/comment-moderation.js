import { AUTO_HIDE_CATEGORIES, MODERATION_CONFIG } from './moderation-policy';

const spamTracker = new Map();
const SPAM_TRACKER_MAX_ENTRIES = 5000;

// Periodic cleanup: evict expired entries to prevent unbounded memory growth
function pruneSpamTracker() {
  if (spamTracker.size <= SPAM_TRACKER_MAX_ENTRIES) return;
  const windowMs = MODERATION_CONFIG.spamWindowDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const [key, entry] of spamTracker) {
    if (now - entry.firstSeen > windowMs) {
      spamTracker.delete(key);
    }
  }
  // If still over limit after expiring old entries, drop oldest half
  if (spamTracker.size > SPAM_TRACKER_MAX_ENTRIES) {
    const entries = Array.from(spamTracker.entries())
      .sort((a, b) => a[1].firstSeen - b[1].firstSeen);
    const toRemove = Math.floor(entries.length / 2);
    for (let i = 0; i < toRemove; i++) {
      spamTracker.delete(entries[i][0]);
    }
  }
}

function appendReason(reason, addition) {
  const base = String(reason || '').trim();
  if (!addition) return base;
  return base ? `${base}; ${addition}` : addition;
}

export function incrementSpamCount(platformKey, username) {
  const normalizedUsername = String(username || 'unknown').trim().toLowerCase();
  const trackerKey = `${platformKey}:${normalizedUsername}`;
  const entry = spamTracker.get(trackerKey) || { count: 0, firstSeen: Date.now() };
  const windowMs = MODERATION_CONFIG.spamWindowDays * 24 * 60 * 60 * 1000;

  if (Date.now() - entry.firstSeen > windowMs) {
    entry.count = 0;
    entry.firstSeen = Date.now();
  }

  entry.count += 1;
  spamTracker.set(trackerKey, entry);
  pruneSpamTracker();
  return entry.count;
}

export function normalizeCommentDecision(classification = {}) {
  const category = String(classification.category || 'neutral').toLowerCase();
  const triggers = Array.from(
    new Set(
      (Array.isArray(classification.triggers) ? classification.triggers : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );

  let action = String(classification.action || 'hide');
  let replyText = classification.replyText || null;
  let reason = String(classification.reason || '').trim();

  if (AUTO_HIDE_CATEGORIES.includes(category) && action === 'reply') {
    action = category === 'negative' || category === 'ambiguous_negative' ? 'hide_and_flag' : 'hide';
    replyText = null;
    reason = appendReason(reason, 'policy override');
  }

  if ((category === 'negative' || category === 'ambiguous_negative') && action !== 'hide_and_flag') {
    action = 'hide_and_flag';
    replyText = null;
    reason = appendReason(reason, 'complaint routed to hidden review flow');
  }

  if ((category === 'spam' || category === 'scam') && action !== 'hide') {
    action = 'hide';
    replyText = null;
    reason = appendReason(reason, 'auto-hidden as spam');
  }

  return {
    ...classification,
    category,
    action,
    replyText,
    triggers,
    reason,
  };
}

export function buildLoggedModerationAction(action, category) {
  if ((category === 'spam' || category === 'scam') && action === 'hide') {
    return 'hide_auto_spam';
  }
  return action;
}

export function serializeModerationTriggers(triggers = [], extras = {}) {
  const parts = [];

  for (const trigger of triggers) {
    const value = String(trigger || '').trim();
    if (value) parts.push(value);
  }

  for (const [key, rawValue] of Object.entries(extras)) {
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;
    parts.push(`${key}:${rawValue}`);
  }

  return Array.from(new Set(parts)).join('; ');
}

export function shouldEscalateRepeatSpammer(spamCount) {
  return Number(spamCount) >= MODERATION_CONFIG.spamBlockThreshold;
}
