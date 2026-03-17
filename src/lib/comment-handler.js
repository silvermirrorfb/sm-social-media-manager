import { replyToComment, hideComment } from './instagram';
import { classifyComment } from './claude';
import { logToSheet } from './sheets';
import {
  needsHumanReview,
  classifySeverity,
  PARTNER_WHITELIST,
  BLOCK_LIST,
  MODERATION_CONFIG,
} from './moderation-policy';
import { getInstagramAccountId } from './env';
import {
  buildLoggedModerationAction,
  incrementSpamCount,
  normalizeCommentDecision,
  serializeModerationTriggers,
  shouldEscalateRepeatSpammer,
} from './comment-moderation';
import { ESCALATION_CONTACTS } from './moderation-policy';
import { sendEmail } from './email';

async function sendRepeatSpamAlert({
  platform,
  username,
  commentId,
  commentText,
  spamCount,
  triggers,
  reason,
}) {
  const recipient = ESCALATION_CONTACTS.socialMediaManager?.email || 'sierra.case@silvermirror.com';
  const safeComment = String(commentText || '(empty)')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const result = await sendEmail({
    to: recipient,
    subject: `[Silver Mirror Moderation] Repeat spam offender on ${platform}`,
    text: [
      `A repeat spam offender hit the moderation threshold on ${platform}.`,
      '',
      `Username: @${username}`,
      `Comment ID: ${commentId}`,
      `Spam count: ${spamCount}`,
      `Triggers: ${(triggers || []).join(', ') || 'none'}`,
      `Reason: ${reason || 'repeat spam threshold reached'}`,
      '',
      'Latest comment:',
      commentText || '(empty)',
    ].join('\n'),
    html: `
      <p>A repeat spam offender hit the moderation threshold on <strong>${platform}</strong>.</p>
      <ul>
        <li><strong>Username:</strong> @${username}</li>
        <li><strong>Comment ID:</strong> ${commentId}</li>
        <li><strong>Spam count:</strong> ${spamCount}</li>
        <li><strong>Triggers:</strong> ${(triggers || []).join(', ') || 'none'}</li>
        <li><strong>Reason:</strong> ${reason || 'repeat spam threshold reached'}</li>
      </ul>
      <p><strong>Latest comment</strong></p>
      <blockquote>${safeComment}</blockquote>
    `,
  });

  return { recipient, ...result };
}

// ─── Handle an incoming comment event ───────────────────────
export async function handleComment(commentData) {
  const commentId = commentData.id;
  const commentText = commentData.text;
  const username = commentData.from?.username || 'unknown';

  // Skip our own replies
  if (commentData.from?.id === getInstagramAccountId()) return;

  // Skip if on partner whitelist
  if (PARTNER_WHITELIST.includes(`@${username}`)) {
    console.log(`[Comment] Whitelisted partner @${username} — skipping moderation`);
    return;
  }

  if (BLOCK_LIST.includes(`@${username}`)) {
    await hideComment(commentId);
    await logToSheet({
      type: 'INSTAGRAM_COMMENT',
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
    console.log(`[Comment] Hidden comment from blocked user @${username}`);
    return;
  }

  console.log(`[Comment] @${username}: ${commentText?.substring(0, 80)}...`);

  if (!commentText) {
    console.log('[Comment] Skipping empty comment');
    return;
  }

  try {
    const classification = await classifyComment(commentText, username);
    let { category, confidence, action, replyText, triggers, reason } =
      normalizeCommentDecision(classification);

    console.log(`[Comment] Classified: ${category} (${(confidence * 100).toFixed(0)}% conf) → ${action}`);

    let spamCount = 0;
    const isSpamCategory = category === 'spam' || category === 'scam';

    if ((action === 'hide' || action === 'block') && isSpamCategory) {
      spamCount = incrementSpamCount('instagram', username);
      if (!triggers.includes('auto_spam_hide')) {
        triggers.push('auto_spam_hide');
      }
      if (shouldEscalateRepeatSpammer(spamCount) && !triggers.includes('repeat_spam_offender')) {
        triggers.push('repeat_spam_offender');
        reason = `${reason || 'spam enforcement'}; repeat spam threshold ${MODERATION_CONFIG.spamBlockThreshold}/${MODERATION_CONFIG.spamWindowDays}d`;
      }
    }

    if (isSpamCategory && spamCount === MODERATION_CONFIG.spamBlockThreshold) {
      const alertResult = await sendRepeatSpamAlert({
        platform: 'instagram',
        username,
        commentId,
        commentText,
        spamCount,
        triggers,
        reason,
      });

      await logToSheet({
        type: 'INSTAGRAM_COMMENT',
        timestamp: new Date().toISOString(),
        username,
        incomingMessage: commentText,
        response: alertResult.ok
          ? `Repeat spam alert emailed to ${alertResult.recipient}`
          : `Repeat spam alert failed: ${alertResult.reason || 'email_send_failed'}`,
        action: alertResult.ok ? 'repeat_spam_alert_sent' : 'repeat_spam_alert_failed',
        category,
        reason: reason || '',
        confidence: confidence?.toFixed(2) || '',
        severity: 'medium',
        triggers: serializeModerationTriggers(triggers, {
          comment_id: commentId,
          spam_count: spamCount,
          moderation_alert_email: alertResult.recipient,
        }),
        needsReview: alertResult.ok ? 'no' : 'YES',
      }).catch(() => {});
    }

    const flagForReview =
      needsHumanReview(confidence, category, triggers || []) ||
      (isSpamCategory && shouldEscalateRepeatSpammer(spamCount));
    const computedSeverity = classifySeverity(category, triggers || []);
    const loggedAction = buildLoggedModerationAction(action, category);
    const serializedTriggers = serializeModerationTriggers(triggers, {
      comment_id: commentId,
      spam_count: spamCount || undefined,
    });

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
        if (isSpamCategory && shouldEscalateRepeatSpammer(spamCount)) {
          console.log(`[Comment] @${username} hit spam threshold (${spamCount}) — queueing for repeat-offender review`);
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
      type: 'INSTAGRAM_COMMENT',
      timestamp: new Date().toISOString(),
      username,
      incomingMessage: commentText,
      response: replyText || '',
      action: flagForReview ? `${loggedAction} + FLAGGED` : loggedAction,
      category,
      reason: reason || '',
      confidence: confidence?.toFixed(2) || '',
      severity: computedSeverity,
      triggers: serializedTriggers,
      needsReview: flagForReview ? 'YES' : 'no',
    }).catch((err) => console.error('[Comment] Sheet logging failed:', err));

  } catch (err) {
    console.error('[Comment] Handler error:', err);
  }
}
