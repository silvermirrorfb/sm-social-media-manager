import { sendDirectMessage, getUserProfile } from './instagram';
import { generateDMResponse } from './claude';
import { logToSheet } from './sheets';

// ─── In-memory conversation store ───────────────────────────
// TODO: Migrate to Redis for serverless durability (same issue as cancel bot)
const conversations = new Map();
const CONVERSATION_TTL = 30 * 60 * 1000; // 30 minutes

function getConversation(senderId) {
  const convo = conversations.get(senderId);
  if (!convo) return [];
  // Expire old conversations
  if (Date.now() - convo.lastActive > CONVERSATION_TTL) {
    conversations.delete(senderId);
    return [];
  }
  return convo.messages;
}

function saveConversation(senderId, messages) {
  conversations.set(senderId, { messages, lastActive: Date.now() });
}

// ─── Handle an incoming DM event ────────────────────────────
export async function handleDirectMessage(event) {
  const senderId = event.sender?.id;
  const messageText = event.message?.text;

  // Skip echo messages (messages sent by our own account)
  if (event.message?.is_echo) return;

  // Skip non-text messages (stickers, images, etc.) for now
  if (!messageText) {
    console.log('[DM] Skipping non-text message from', senderId);
    return;
  }

  console.log(`[DM] Received from ${senderId}: ${messageText.substring(0, 80)}...`);

  try {
    // Get conversation history for context
    const history = getConversation(senderId);

    // Generate response using Claude with full SM knowledge base
    const responseText = await generateDMResponse(messageText, history);

    // Send the reply
    await sendDirectMessage(senderId, responseText);

    // Update conversation history
    const updatedHistory = [
      ...history,
      { role: 'user', content: messageText },
      { role: 'assistant', content: responseText },
    ].slice(-10); // Keep last 10 messages for context window
    saveConversation(senderId, updatedHistory);

    // Get username for logging
    const profile = await getUserProfile(senderId).catch(() => ({ username: senderId }));

    // Log to Google Sheets
    await logToSheet({
      type: 'DM',
      timestamp: new Date().toISOString(),
      username: profile.username || senderId,
      incomingMessage: messageText,
      response: responseText,
      action: 'replied',
    }).catch((err) => console.error('[DM] Sheet logging failed:', err));

    console.log(`[DM] Replied to ${profile.username || senderId}`);
  } catch (err) {
    console.error('[DM] Handler error:', err);
  }
}
