import { sendDirectMessage, getUserProfile } from './instagram';
import { generateDMResponse } from './claude';
import { logToSheet } from './sheets';
import { getSmartDMResponse } from './dm-smart-router';

// ─── In-memory conversation store ───────────────────────────
// TODO: Migrate to Redis for serverless durability
const conversations = new Map();
const CONVERSATION_TTL = 30 * 60 * 1000; // 30 minutes
const ESCALATION_THRESHOLD = 4; // After 4 user messages, offer human handoff

function describeNonTextEvent(event) {
  if (!event.message) {
    if (event.read) return '[read receipt]';
    if (event.delivery) return '[delivery receipt]';
    if (event.postback) return '[postback]';
    if (event.reaction) return `[reaction:${event.reaction.reaction || 'unknown'}]`;
    return '[non-message event]';
  }

  const attachmentTypes = Array.isArray(event.message.attachments)
    ? event.message.attachments.map((attachment) => attachment.type).filter(Boolean)
    : [];

  if (attachmentTypes.length > 0) {
    return `[attachments:${attachmentTypes.join(',')}]`;
  }

  if (event.message.quick_reply?.payload) {
    return `[quick-reply:${event.message.quick_reply.payload}]`;
  }

  return '[message without text]';
}

function getConversation(senderId) {
  const convo = conversations.get(senderId);
  if (!convo) return { messages: [], userMessageCount: 0, hasEscalated: false };
  if (Date.now() - convo.lastActive > CONVERSATION_TTL) {
    conversations.delete(senderId);
    return { messages: [], userMessageCount: 0, hasEscalated: false };
  }
  return convo;
}

function saveConversation(senderId, messages, userMessageCount, hasEscalated) {
  conversations.set(senderId, {
    messages,
    userMessageCount,
    hasEscalated,
    lastActive: Date.now(),
  });
}

// ─── Handle an incoming DM event ────────────────────────────
export async function handleDirectMessage(event) {
  const senderId = event.sender?.id;
  const messageText = event.message?.text;
  if (!senderId) {
    console.warn('[DM] Missing sender id; skipping event');
    return;
  }

  // Skip echo messages (messages sent by our own account)
  if (event.message?.is_echo) return;

  // Handle non-text messages
  if (!messageText) {
    const eventLabel = describeNonTextEvent(event);

    // Voice message
    if (event.message?.attachments?.some(a => a.type === 'audio')) {
      await sendDirectMessage(senderId,
        "I'm not able to listen to voice messages, but I'd love to help! Could you type out your question?"
      );
      await logToSheet({
        type: 'INSTAGRAM_DM',
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
        type: 'INSTAGRAM_DM',
        timestamp: new Date().toISOString(),
        username: senderId,
        incomingMessage: '[image]',
        response: 'Directed to book Esthetician Choice',
        action: 'replied',
      }).catch(() => {});
      return;
    }

    if (!event.message) {
      console.log(`[DM] Ignoring ${eventLabel} from ${senderId}`);
      return;
    }

    await logToSheet({
      type: 'INSTAGRAM_DM',
      timestamp: new Date().toISOString(),
      username: senderId,
      incomingMessage: eventLabel,
      response: '',
      action: 'ignored',
      reason: 'Unsupported non-text DM payload',
    }).catch(() => {});

    console.log(`[DM] Skipping unsupported message type ${eventLabel} from ${senderId}`);
    return;
  }

  console.log(`[DM] Received from ${senderId}: ${messageText.substring(0, 80)}...`);

  try {
    // Get conversation history
    const convo = getConversation(senderId);
    let { messages: history, userMessageCount, hasEscalated } = convo;
    userMessageCount++;

    let responseText;
    let escalatedThisMessage = false;

    // Check if we should escalate to human
    if (userMessageCount >= ESCALATION_THRESHOLD && !hasEscalated) {
      // Detect if Spanish — offer Spanish escalation with Miami store number
      const isSpanish = /[áéíóúñ¿¡]/.test(messageText) ||
        /\b(hola|gracias|quiero|puedo|tengo|necesito|cuánto|dónde|cuándo)\b/i.test(messageText);

      if (isSpanish) {
        responseText = "Me encantaría conectarte con alguien de nuestro equipo. Para ayuda inmediata en español, llama a Brickell al (786) 899-0600 o Coral Gables al (786) 988-0520. También puedes compartir tu email y alguien se comunicará contigo 💛";
      } else {
        responseText = "Let me have someone on our team follow up with you directly. Can you share your email? 💛";
      }
      hasEscalated = true;
      escalatedThisMessage = true;
    } else {
      const smartReply = getSmartDMResponse(messageText);
      responseText = smartReply || await generateDMResponse(messageText, history);
    }

    // Send the reply
    await sendDirectMessage(senderId, responseText);

    // Update conversation history (keep last 10 messages)
    const updatedHistory = [
      ...history,
      { role: 'user', content: messageText },
      { role: 'assistant', content: responseText },
    ].slice(-10);
    saveConversation(senderId, updatedHistory, userMessageCount, hasEscalated);

    // Get username for logging
    const profile = await getUserProfile(senderId).catch(() => ({ username: senderId }));

    // Log to Google Sheets
    await logToSheet({
      type: 'INSTAGRAM_DM',
      timestamp: new Date().toISOString(),
      username: profile.username || senderId,
      incomingMessage: messageText,
      response: responseText,
      action: escalatedThisMessage ? 'escalated' : 'replied',
      category: '',
      reason: '',
    }).catch((err) => console.error('[DM] Sheet logging failed:', err));

    console.log(`[DM] Replied to ${profile.username || senderId} (msg #${userMessageCount})`);
  } catch (err) {
    console.error('[DM] Handler error:', err);
    await logToSheet({
      type: 'INSTAGRAM_DM',
      timestamp: new Date().toISOString(),
      username: senderId,
      incomingMessage: messageText || '[non-text message]',
      response: '',
      action: 'error',
      reason: err instanceof Error ? err.message : 'Unknown DM handler error',
      needsReview: 'YES',
    }).catch(() => {});
  }
}
