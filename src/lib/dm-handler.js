import { sendDirectMessage, getUserProfile } from './instagram';
import { generateDMResponse } from './claude';
import { logToSheet } from './sheets';

// ─── In-memory conversation store ───────────────────────────
// TODO: Migrate to Redis for serverless durability
const conversations = new Map();
const CONVERSATION_TTL = 30 * 60 * 1000; // 30 minutes
const ESCALATION_THRESHOLD = 4; // After 4 user messages, offer human handoff

function getConversation(senderId) {
  const convo = conversations.get(senderId);
  if (!convo) return { messages: [], userMessageCount: 0 };
  if (Date.now() - convo.lastActive > CONVERSATION_TTL) {
    conversations.delete(senderId);
    return { messages: [], userMessageCount: 0 };
  }
  return convo;
}

function saveConversation(senderId, messages, userMessageCount) {
  conversations.set(senderId, {
    messages,
    userMessageCount,
    lastActive: Date.now(),
  });
}

// ─── Handle an incoming DM event ────────────────────────────
export async function handleDirectMessage(event) {
  const senderId = event.sender?.id;
  const messageText = event.message?.text;

  // Skip echo messages (messages sent by our own account)
  if (event.message?.is_echo) return;

  // Handle non-text messages
  if (!messageText) {
    // Voice message
    if (event.message?.attachments?.some(a => a.type === 'audio')) {
      await sendDirectMessage(senderId,
        "I'm not able to listen to voice messages, but I'd love to help! Could you type out your question?"
      );
      await logToSheet({
        type: 'DM',
        timestamp: new Date().toISOString(),
        username: senderId,
        incomingMessage: '[voice message]',
        response: 'Requested text version',
        action: 'replied',
      }).catch(() => {});
      return;
    }

    // Image / photo of skin
    if (event.message?.attachments?.some(a => a.type === 'image')) {
      await sendDirectMessage(senderId,
        "Thanks for sharing! While I can give general guidance, the best way to get a personalized recommendation is to book an Esthetician's Choice facial — your esthetician will do a full skin analysis and customize the treatment. Book at booking.silvermirror.com!"
      );
      await logToSheet({
        type: 'DM',
        timestamp: new Date().toISOString(),
        username: senderId,
        incomingMessage: '[image]',
        response: 'Directed to book Esthetician Choice',
        action: 'replied',
      }).catch(() => {});
      return;
    }

    console.log('[DM] Skipping unsupported message type from', senderId);
    return;
  }

  console.log(`[DM] Received from ${senderId}: ${messageText.substring(0, 80)}...`);

  try {
    // Get conversation history
    const convo = getConversation(senderId);
    let { messages: history, userMessageCount } = convo;
    userMessageCount++;

    let responseText;

    // Check if we should escalate to human
    if (userMessageCount >= ESCALATION_THRESHOLD && !history.some(
      m => m.role === 'assistant' && m.content.includes('share your email')
    )) {
      // Detect if Spanish — offer Spanish escalation with Miami store number
      const isSpanish = /[áéíóúñ¿¡]/.test(messageText) ||
        /\b(hola|gracias|quiero|puedo|tengo|necesito|cuánto|dónde|cuándo)\b/i.test(messageText);

      if (isSpanish) {
        responseText = "Me encantaría conectarte con alguien de nuestro equipo. Para ayuda inmediata en español, llama a Brickell al (786) 899-0600 o Coral Gables al (786) 988-0520. También puedes compartir tu email y alguien se comunicará contigo 💛";
      } else {
        responseText = "Let me have someone on our team follow up with you directly. Can you share your email? 💛";
      }
    } else {
      // Generate response using Claude with full SM knowledge base
      responseText = await generateDMResponse(messageText, history);
    }

    // Send the reply
    await sendDirectMessage(senderId, responseText);

    // Update conversation history (keep last 10 messages)
    const updatedHistory = [
      ...history,
      { role: 'user', content: messageText },
      { role: 'assistant', content: responseText },
    ].slice(-10);
    saveConversation(senderId, updatedHistory, userMessageCount);

    // Get username for logging
    const profile = await getUserProfile(senderId).catch(() => ({ username: senderId }));

    // Log to Google Sheets
    await logToSheet({
      type: 'DM',
      timestamp: new Date().toISOString(),
      username: profile.username || senderId,
      incomingMessage: messageText,
      response: responseText,
      action: userMessageCount >= ESCALATION_THRESHOLD ? 'escalated' : 'replied',
      category: '',
      reason: '',
    }).catch((err) => console.error('[DM] Sheet logging failed:', err));

    console.log(`[DM] Replied to ${profile.username || senderId} (msg #${userMessageCount})`);
  } catch (err) {
    console.error('[DM] Handler error:', err);
  }
}
