import { sendDirectMessage, getUserProfile } from './instagram';
import { generateDMResponse } from './claude';
import { logToSheet } from './sheets';
import { getSmartDMResponse, SMART_ROUTER_IGNORE } from './dm-smart-router';
import { isContactedInfluencer, notifyInboundReply } from './crm-sync';
import { sendEmail } from './email';

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
        "Thanks for the voice note 💛 I can’t play audio here yet, but I’m happy to help if you type your question."
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
        "Thanks for sharing ✨ For truly personalized guidance, the best next step is an Esthetician’s Choice facial so your esthetician can assess your skin in person and customize everything. You can book here: https://booking.silvermirror.com"
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

  // === CRM INFLUENCER CHECK — must run before smart router or Claude ===
  try {
    const profile = await getUserProfile(senderId).catch(() => null);
    const senderUsername = profile?.username || null;
    if (senderUsername) {
      const influencerInfo = await isContactedInfluencer(senderUsername);
      if (influencerInfo) {
        console.log(`[INFLUENCER] Suppressing auto-reply for @${senderUsername} (CRM status: ${influencerInfo.status}, owner: ${influencerInfo.owner})`);
        await logToSheet({
          type: 'INFLUENCER_INBOUND',
          timestamp: new Date().toISOString(),
          username: senderUsername,
          incomingMessage: messageText,
          response: '[SUPPRESSED — Active outreach lead]',
          action: 'suppressed',
          category: 'influencer_outreach',
          reason: `CRM lead (${influencerInfo.status}) — owner: ${influencerInfo.owner || 'unassigned'}`,
          confidence: '1.00',
          severity: 'info',
          triggers: 'crm_sync',
          needsReview: 'YES',
        }).catch(() => {});
        await notifyInboundReply(senderUsername, 'instagram', messageText).catch(() => {});
        await sendEmail({
          to: 'inquiries@silvermirror.com',
          subject: `Influencer @${senderUsername} replied to outreach DM`,
          text: `@${senderUsername} (${influencerInfo.name || 'Unknown'}) replied to an outreach DM.\n\nTheir message:\n"${messageText}"\n\nCRM Status: ${influencerInfo.status}\nAssigned to: ${influencerInfo.owner || 'Clara'}\n\nPlease respond manually — the bot has been suppressed for this conversation.`,
        }).catch((err) => console.error('[INFLUENCER] Email alert failed:', err.message));
        return; // EXIT — do NOT auto-respond
      }
    }
  } catch (crmErr) {
    console.error('[CRM-SYNC] DM check failed, falling through to normal handling:', crmErr.message);
  }
  // === END CRM INFLUENCER CHECK ===

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
        responseText = 'Te conecto con nuestro equipo 💛 Para ayuda inmediata en español, llama a Brickell (786) 899-0600 o Coral Gables (786) 988-0520. También puedes compartir tu email y te contactamos.';
      } else {
        responseText = 'I can have a team member follow up with you directly. Can you share the best email for us to reach you? 💛';
      }
      hasEscalated = true;
      escalatedThisMessage = true;
    } else {
      const smartReply = getSmartDMResponse(messageText);

      // ─── Phishing/scam detection: silently ignore ─────────────
      if (smartReply === SMART_ROUTER_IGNORE) {
        const profile = await getUserProfile(senderId).catch(() => ({ username: senderId }));
        console.log(`[DM] PHISHING/SCAM detected from ${profile.username || senderId} — ignoring`);
        await logToSheet({
          type: 'INSTAGRAM_DM',
          timestamp: new Date().toISOString(),
          username: profile.username || senderId,
          incomingMessage: messageText,
          response: '[IGNORED — Phishing/scam detected]',
          action: 'ignored',
          category: 'phishing',
          reason: 'Smart router flagged as phishing/scam pattern',
          confidence: '1.00',
          severity: 'low',
          triggers: 'phishing_detection',
          needsReview: 'no',
        }).catch(() => {});
        return; // Do NOT reply to phishing DMs
      }

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
