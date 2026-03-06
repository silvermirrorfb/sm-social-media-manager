import { replyToComment, hideComment, getComment } from './instagram';
import { classifyComment } from './claude';
import { logToSheet } from './sheets';

// ─── Handle an incoming comment event ───────────────────────
export async function handleComment(commentData) {
  const commentId = commentData.id;
  const commentText = commentData.text;
  const username = commentData.from?.username || 'unknown';

  // Skip our own replies
  if (commentData.from?.id === process.env.INSTAGRAM_ACCOUNT_ID) return;

  console.log(`[Comment] @${username}: ${commentText?.substring(0, 80)}...`);

  if (!commentText) {
    console.log('[Comment] Skipping empty comment');
    return;
  }

  try {
    // Classify the comment using Claude
    const classification = await classifyComment(commentText, username);
    console.log(`[Comment] Classified as: ${classification.category} → ${classification.action}`);

    // Execute the action
    switch (classification.action) {
      case 'reply':
        if (classification.replyText) {
          await replyToComment(commentId, classification.replyText);
        }
        break;

      case 'hide':
        await hideComment(commentId);
        break;

      case 'hide_and_flag':
        await hideComment(commentId);
        // TODO: Send notification email to team for review
        break;

      case 'ignore':
      default:
        break;
    }

    // Log everything to Google Sheets
    await logToSheet({
      type: 'COMMENT',
      timestamp: new Date().toISOString(),
      username,
      incomingMessage: commentText,
      response: classification.replyText || '',
      action: classification.action,
      category: classification.category,
      reason: classification.reason || '',
    }).catch((err) => console.error('[Comment] Sheet logging failed:', err));
  } catch (err) {
    console.error('[Comment] Handler error:', err);
  }
}
