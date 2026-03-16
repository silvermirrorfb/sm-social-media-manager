import { replyToPageComment, hidePageComment } from './facebook';
import { classifyComment } from './claude';
import { logToSheet } from './sheets';
import {
  AUTO_HIDE_CATEGORIES,
  needsHumanReview,
  classifySeverity,
  PARTNER_WHITELIST,
  BLOCK_LIST,
} from './moderation-policy';
import { getEnv } from './env';

// ─── In-memory spam tracker ─────────────────────────────────
// Mirrors the Instagram comment handler pattern.
// TODO: Move to Redis for durability in serverless
const spamTracker = new Map();

function incrementSpamCount(username) {
  const entry = spamTracker.get(username) || { count: 0, firstSeen: Date.now() };
  const windowMs = 30 * 24 * 60 * 60 * 1000; // 30 days
  if (Date.now() - entry.firstSeen > windowMs) {
    entry.count = 0;
    entry.firstSeen = Date.now();
  }
  entry.count++;
  spamTracker.set(username, entry);
  return entry.count;
}

// ─── Handle an incoming Facebook Page comment event ─────────
export async function handleFacebookComment(commentData) {
  const commentId = commentData.comment_id;
  const commentText = commentData.message;
  const username = commentData.from?.name || 'unknown';
  const senderId = commentData.from?.id;

  // Skip our own replies
  const pageId = getEnv('FACEBOOK_PAGE_ID');
  if (senderId && senderId === pageId) return;

  // Skip if on partner whitelist (check by name since FB doesn't expose usernames)
  if (PARTNER_WHITELIST.includes(`@${username}`)) {
    console.log(`[FB-Comment] Whitelisted partner ${username} — skipping moderation`);
    return;
  }

  if (BLOCK_LIST.includes(`@${username}`)) {
    await hidePageComment(commentId);
    await logToSheet({
      type: 'FACEBOOK_COMMENT',
      timestamp: new Date().toISOString(),
      username,
      incomingMessage: commentText || '',
      response: '',
      action: 'block',
      category: 'spam',
      reason: 'Matched manual block list',
      confidence: '1.00',
      severity: 'high',
      triggers: 'manual_block_list',
      needsReview: 'YES',
    }).catch(() => {});
    console.log(`[FB-Comment] Hidden comment from blocked user ${username}`);
    return;
  }

  console.log(`[FB-Comment] ${username}: ${commentText?.substring(0, 80)}...`);

  if (!commentText) {
    console.log('[FB-Comment] Skipping empty comment');
    return;
  }

  try {
    // Classify the comment using Claude (same classifier as Instagram)
    const classification = await classifyComment(commentText, username);
    let { category, confidence, action, replyText, triggers, severity, reason } = classification;

    if (AUTO_HIDE_CATEGORIES.includes(category) && action === 'reply') {
      action = category === 'negative' ? 'hide_and_flag' : 'hide';
      replyText = null;
      reason = `${reason || 'policy override'}; auto-hide override`;
    }

    if (category === 'negative' && action !== 'hide_and_flag') {
      action = 'hide_and_flag';
      replyText = null;
    }

    console.log(`[FB-Comment] Classified: ${category} (${(confidence * 100).toFixed(0)}% conf) → ${action}`);

    // Check if needs human review
    const flagForReview = needsHumanReview(confidence, category, triggers || []);
    const computedSeverity = classifySeverity(category, triggers || []);

    // Execute the action
    switch (action) {
      case 'reply':
        if (replyText) {
          await replyToPageComment(commentId, replyText);
          console.log(`[FB-Comment] Replied to ${username}: ${replyText.substring(0, 60)}...`);
        }
        break;

      case 'hide':
        await hidePageComment(commentId);
        if (category === 'spam') {
          const spamCount = incrementSpamCount(username);
          if (spamCount >= 3) {
            console.log(`[FB-Comment] ${username} hit spam threshold (${spamCount}) — should be blocked`);
          }
        }
        console.log(`[FB-Comment] Hidden: ${username} (${category})`);
        break;

      case 'hide_and_flag':
        await hidePageComment(commentId);
        console.log(`[FB-Comment] Hidden + flagged: ${username} (${category}, severity: ${computedSeverity})`);
        break;

      case 'block':
        await hidePageComment(commentId);
        console.log(`[FB-Comment] Blocked: ${username}`);
        break;

      case 'ignore':
      default:
        console.log(`[FB-Comment] Ignored: ${username} (${category})`);
        break;
    }

    // Log everything to Google Sheets
    await logToSheet({
      type: 'FACEBOOK_COMMENT',
      timestamp: new Date().toISOString(),
      username,
      incomingMessage: commentText,
      response: replyText || '',
      action: flagForReview ? `${action} + FLAGGED` : action,
      category,
      reason: reason || '',
      confidence: confidence?.toFixed(2) || '',
      severity: computedSeverity,
      triggers: (triggers || []).join(', '),
      needsReview: flagForReview ? 'YES' : 'no',
    }).catch((err) => console.error('[FB-Comment] Sheet logging failed:', err));
  } catch (err) {
    console.error('[FB-Comment] Handler error:', err);
  }
}
