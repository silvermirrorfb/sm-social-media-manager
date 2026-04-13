import { sendMessengerMessage, getFacebookUserProfile } from './facebook';
import { generateDMResponse } from './claude';
import { logToSheet } from './sheets';
import { getSmartDMResponse, SMART_ROUTER_IGNORE } from './dm-smart-router';
import { isContactedInfluencer, notifyInboundReply } from './crm-sync';
import { sendEmail } from './email';

// ─── In-memory conversation store ───────────────────────────
// Mirrors the Instagram DM handler pattern.
// TODO: Migrate to Redis for serverless durability
const conversations = new Map();
const CONVERSATION_TTL = 30 * 60 * 1000; // 30 minutes
const ESCALATION_THRESHOLD = 4; // After 4 user messages, offer human handoff

function describeNonTextEvent(event) {
  if (!event.message) {
    if (event.read) return '[read receipt]';
    if (event.delivery) return '[delivery receipt]';
    if (event.postback) return `[postback:${event.postback?.payload || 'unknown'}]`;
    if (event.referral) return '[referral]';
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

// ─── Handle an incoming Messenger event ─────────────────────
export async function handleMessengerMessage(event) {
  const senderId = event.sender?.id;
  const messageText = event.message?.text;
  if (!senderId) {
    console.warn('[FB-DM] Missing sender id; skipping event');
    return;
  }

  // Skip echo messages (messages sent by our own page)
  if (event.message?.is_echo) return;

  // Handle non-text messages
  if (!messageText) {
    const eventLabel = describeNonTextEvent(event);

    // Voice message
    if (event.message?.attachments?.some((a) => a.type === 'audio')) {
      await sendMessengerMessage(
        senderId,
        'Thanks for the voice note 💛 I can’t play audio here yet, but I’m happy to help if you type your question.'
      );
      await logToSheet({
        type: 'FACEBOOK_DM',
        timestamp: new Date().toISOString(),
        username: senderId,
        incomingMessage: '[voice message]',
        response: 'Requested text version',
        action: 'replied',
      }).catch(() => {});
      return;
    }

    // Image
    if (event.message?.attachments?.some((a) => a.type === 'image')) {
      await sendMessengerMessage(
        senderId,
        "Thanks for sharing ✨ For truly personalized guidance, the best next step is an Esthetician's Choice facial so your esthetician can assess your skin in person and customize everything. You can book here: https://booking.silvermirror.com"
      );
      await logToSheet({
        type: 'FACEBOOK_DM',
        timestamp: new Date().toISOString(),
        username: senderId,
        incomingMessage: '[image]',
        response: 'Directed to book Esthetician Choice',
        action: 'replied',
      }).catch(() => {});
      return;
    }

    if (!event.message) {
      console.log(`[FB-DM] Ignoring ${eventLabel} from ${senderId}`);
      return;
    }

    await logToSheet({
      type: 'FACEBOOK_DM',
      timestamp: new Date().toISOString(),
      username: senderId,
      incomingMessage: eventLabel,
      response: '',
      action: 'ignored',
      reason: 'Unsupported non-text Messenger payload',
    }).catch(() => {});

    console.log(`[FB-DM] Skipping unsupported message type ${eventLabel} from ${senderId}`);
    return;
  }

  console.log(`[FB-DM] Received from ${senderId}: ${messageText.substring(0, 80)}...`);

  // === CRM INFLUENCER CHECK — must run before smart router or Claude ===
  try {
    const profile = await getFacebookUserProfile(senderId).catch(() => null);
    const senderUsername = profile?.username || profile?.name || null;
    if (senderUsername) {
      const influencerInfo = await isContactedInfluencer(senderUsername);
      if (influencerInfo) {
        console.log(`[INFLUENCER] Suppressing auto-reply for ${senderUsername} (CRM status: ${influencerInfo.status}, owner: ${influencerInfo.owner})`);
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
        await notifyInboundReply(senderUsername, 'facebook', messageText).catch(() => {});
        await sendEmail({
          to: 'inquiries@silvermirror.com',
          subject: `Influencer ${senderUsername} replied via Facebook Messenger`,
          text: `${senderUsername} (${influencerInfo.name || 'Unknown'}) replied via Messenger.\n\nTheir message:\n"${messageText}"\n\nCRM Status: ${influencerInfo.status}\nAssigned to: ${influencerInfo.owner || 'Clara'}\n\nPlease respond manually — the bot has been suppressed for this conversation.`,
        }).catch((err) => console.error('[INFLUENCER] Email alert failed:', err.message));
        return;
      }
    }
  } catch (crmErr) {
    console.error('[CRM-SYNC] FB-DM check failed, falling through to normal handling:', crmErr.message);
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
      const isSpanish =
        /[áéíóúñ¿¡]/.test(messageText) ||
        /\b(hola|gracias|quiero|puedo|tengo|necesito|cuánto|dónde|cuándo)\b/i.test(messageText);

      if (isSpanish) {
        responseText =
          'Te conecto con nuestro equipo 💛 Para ayuda inmediata en español, llama a Brickell (786) 899-0600 o Coral Gables (786) 988-0520. También puedes compartir tu email y te contactamos.';
      } else {
        responseText = 'I can have a team member follow up with you directly. Can you share the best email for us to reach you? 💛';
      }
      hasEscalated = true;
      escalatedThisMessage = true;
    } else {
      const smartReply = getSmartDMResponse(messageText);

      // ─── Phishing/scam detection: silently ignore ─────────────
      if (smartReply === SMART_ROUTER_IGNORE) {
        const profile = await getFacebookUserProfile(senderId).catch(() => null);
        const displayName = profile?.name || senderId;
        console.log(`[FB-DM] PHISHING/SCAM detected from ${displayName} — ignoring`);
        await logToSheet({
          type: 'FACEBOOK_DM',
          timestamp: new Date().toISOString(),
          username: displayName,
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
        return;
      }

      responseText = smartReply || (await generateDMResponse(messageText, history));
    }

    // Send the reply
    await sendMessengerMessage(senderId, responseText);

    // Update conversation history (keep last 10 messages)
    const updatedHistory = [
      ...history,
      { role: 'user', content: messageText },
      { role: 'assistant', content: responseText },
    ].slice(-10);
    saveConversation(senderId, updatedHistory, userMessageCount, hasEscalated);

    // Get username for logging
    const profile = await getFacebookUserProfile(senderId).catch(() => ({ name: senderId }));

    // Log to Google Sheets
    await logToSheet({
      type: 'FACEBOOK_DM',
      timestamp: new Date().toISOString(),
      username: profile.name || senderId,
      incomingMessage: messageText,
      response: responseText,
      action: escalatedThisMessage ? 'escalated' : 'replied',
      category: '',
      reason: '',
    }).catch((err) => console.error('[FB-DM] Sheet logging failed:', err));

    console.log(`[FB-DM] Replied to ${profile.name || senderId} (msg #${userMessageCount})`);
  } catch (err) {
    console.error('[FB-DM] Handler error:', err);
    await logToSheet({
      type: 'FACEBOOK_DM',
      timestamp: new Date().toISOString(),
      username: senderId,
      incomingMessage: messageText || '[non-text message]',
      response: '',
      action: 'error',
      reason: err instanceof Error ? err.message : 'Unknown FB DM handler error',
      needsReview: 'YES',
    }).catch(() => {});
  }
}
