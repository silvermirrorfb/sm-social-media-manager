import { replyToComment, hideComment, getComment } from './instagram';
import { classifyComment } from './claude';
import { logToSheet } from './sheets';
import { needsHumanReview, classifySeverity, PARTNER_WHITELIST, BLOCK_LIST } from './moderation-policy';

// ─── In-memory spam tracker ─────────────────────────────────
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

// ─── Handle an incoming comment event ───────────────────────
export async function handleComment(commentData) {
  const commentId = commentData.id;
  const commentText = commentData.text;
  const username = commentData.from?.username || 'unknown';

  // Skip our own replies
  if (commentData.from?.id === process.env.INSTAGRAM_ACCOUNT_ID) return;

  // Skip if on partner whitelist
  if (PARTNER_WHITELIST.includes(`@${username}`)) {
    console.log(`[Comment] Whitelisted partner @${username} — skipping moderation`);
    return;
  }

  console.log(`[Comment] @${username}: ${commentText?.substring(0, 80)}...`);

  if (!commentText) {
    console.log('[Comment] Skipping empty comment');
    return;
  }

  try {
    // Classify the comment using Claude
    const classification = await classifyComment(commentText, username);
    const { category, confidence, action, replyText, triggers, severity, reason } = classification;

    console.log(`[Comment] Classified: ${category} (${(confidence * 100).toFixed(0)}% conf) → ${action}`);

    // Check if needs human review
    const flagForReview = needsHumanReview(confidence, category, triggers || []);
    const computedSeverity = classifySeverity(category, triggers || []);

    // Execute the action
    switch (action) {
      case 'reply':
        if (replyText) {
          await replyToComment(commentId, replyText);
          console.log(`[Comment] Replied to @${username}: ${replyText.substring(0, 60)}...`);
        }
        break;

      case 'hide':
        await hideComment(commentId);
        // Track spam
        if (category === 'spam') {
          const spamCount = incrementSpamCount(username);
          if (spamCount >= 3) {
            console.log(`[Comment] @${username} hit spam threshold (${spamCount}) — should be blocked`);
            // TODO: Implement Instagram block API when available
          }
        }
        console.log(`[Comment] Hidden: @${username} (${category})`);
        break;

      case 'hide_and_flag':
        await hideComment(commentId);
        console.log(`[Comment] Hidden + flagged: @${username} (${category}, severity: ${computedSeverity})`);
        // TODO: Send notification email to team for review
        // TODO: Post to Slack moderation channel
        break;

      case 'block':
        await hideComment(commentId);
        console.log(`[Comment] Blocked: @${username}`);
        // TODO: Implement Instagram block API
        break;

      case 'ignore':
      default:
        console.log(`[Comment] Ignored: @${username} (${category})`);
        break;
    }

    // Log everything to Google Sheets
    await logToSheet({
      type: 'COMMENT',
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
    }).catch((err) => console.error('[Comment] Sheet logging failed:', err));

  } catch (err) {
    console.error('[Comment] Handler error:', err);
  }
}
