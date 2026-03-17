import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MODERATION_CONFIG } from './moderation-policy';
import { getEnv } from './env';

const client = new Anthropic({ apiKey: getEnv('ANTHROPIC_API_KEY') });

const VALID_ACTIONS = new Set(['reply', 'hide', 'hide_and_flag', 'ignore', 'block']);
const VALID_CATEGORIES = new Set([
  'positive',
  'negative',
  'spam',
  'question',
  'neutral',
  'profanity',
  'competitor',
  'political',
  'off_topic',
  'scam',
  'ambiguous_negative',
]);

const PROFANITY_PATTERNS = [
  /\bfuck\b/i,
  /\bfucking\b/i,
  /\bshit\b/i,
  /\bbitch\b/i,
  /\basshole\b/i,
  /\bdumbass\b/i,
];

const SCAM_PATTERNS = [
  /dm me/i,
  /promote (it|yourself)/i,
  /crypto/i,
  /forex/i,
  /bitcoin/i,
  /link in bio/i,
  /earn \$?\d+/i,
  /whatsapp/i,
  /telegram/i,
  /\btext me\b/i,
  /\bmessage me on\b/i,
];

const SPAM_PATTERNS = [
  /\bfollow for follow\b/i,
  /\bf4f\b/i,
  /\bcheck (my|out my) profile\b/i,
  /\bpromote (my page|my profile|your page)\b/i,
  /\bsend pic\b/i,
  /\bsend nudes\b/i,
  /\bhot girls?\b/i,
  /\bwork from home\b/i,
  /\bmake money fast\b/i,
  /\bguaranteed returns?\b/i,
  /\bclick (the )?link\b/i,
  /\bvisit my page\b/i,
  /\bcheap followers?\b/i,
  /\bbuy followers?\b/i,
];

const URL_PATTERN = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|co|io|ru|ly|me)\b)/i;
const PHONE_PATTERN = /(\+?\d[\d\s().-]{7,}\d)/;
const HANDLE_PATTERN = /@\w+/g;
const EMOJI_BAIT_PATTERN = /([🔥💰💸📈🚀✨😍])(?:\s*\1){2,}/;

function getSpamHeuristics(commentText) {
  const text = String(commentText || '').trim();
  if (!text) return null;

  const triggers = [];
  let score = 0;

  if (URL_PATTERN.test(text)) {
    triggers.push('suspicious_link');
    score += 2;
  }

  if (PHONE_PATTERN.test(text)) {
    triggers.push('external_contact');
    score += 2;
  }

  const mentions = text.match(HANDLE_PATTERN) || [];
  if (mentions.length >= 2) {
    triggers.push('multi_mention');
    score += 1;
  }

  if (EMOJI_BAIT_PATTERN.test(text)) {
    triggers.push('emoji_bait');
    score += 1;
  }

  if (SPAM_PATTERNS.some((pattern) => pattern.test(text))) {
    triggers.push('promo_bait');
    score += 2;
  }

  if (SCAM_PATTERNS.some((pattern) => pattern.test(text))) {
    triggers.push('scam_signal');
    score += 3;
  }

  const lettersOnly = text.replace(/[^a-z]/gi, '');
  if (lettersOnly.length >= 10) {
    const upperRatio = lettersOnly.replace(/[^A-Z]/g, '').length / lettersOnly.length;
    if (upperRatio > 0.7) {
      triggers.push('shouty_caps');
      score += 1;
    }
  }

  if (score < 2) return null;

  const isScam = triggers.includes('scam_signal');
  return {
    category: isScam ? 'scam' : 'spam',
    confidence: isScam ? 0.99 : 0.97,
    action: 'hide',
    replyText: null,
    triggers,
    severity: isScam ? 'medium' : 'low',
    reason: `Matched spam heuristic (${triggers.join(', ')})`,
  };
}

const NEGATIVE_PATTERNS = [
  /\bterrible\b/i,
  /\bawful\b/i,
  /\bhorrible\b/i,
  /\bworst\b/i,
  /\brude\b/i,
  /\bdisappointed\b/i,
  /\bdisappointing\b/i,
  /\bscam\b/i,
  /\bnever again\b/i,
  /\brefund\b/i,
  /\bcharged me\b/i,
  /\bbad experience\b/i,
  /\bunacceptable\b/i,
  /\bhurt\b/i,
  /\bburned\b/i,
];

function normalizeClassification(raw) {
  const confidenceValue = Number(raw?.confidence);
  const confidence = Number.isFinite(confidenceValue)
    ? Math.max(0, Math.min(1, confidenceValue))
    : 0;

  const triggers = Array.isArray(raw?.triggers)
    ? raw.triggers.filter((item) => typeof item === 'string')
    : [];

  const category = VALID_CATEGORIES.has(raw?.category) ? raw.category : 'neutral';
  const action = VALID_ACTIONS.has(raw?.action) ? raw.action : 'hide';
  const severity = ['high', 'medium', 'low'].includes(raw?.severity) ? raw.severity : 'low';
  const replyText = typeof raw?.replyText === 'string' ? raw.replyText : null;
  const reason = typeof raw?.reason === 'string' ? raw.reason : 'normalized fallback';

  return { category, confidence, action, replyText, triggers, severity, reason };
}

function preclassifyComment(commentText) {
  const spamHeuristic = getSpamHeuristics(commentText);
  if (spamHeuristic) {
    return spamHeuristic;
  }

  if (PROFANITY_PATTERNS.some((pattern) => pattern.test(commentText))) {
    return {
      category: 'profanity',
      confidence: 0.99,
      action: 'hide',
      replyText: null,
      triggers: [],
      severity: 'high',
      reason: 'Matched profanity heuristic',
    };
  }

  if (SCAM_PATTERNS.some((pattern) => pattern.test(commentText))) {
    return {
      category: 'scam',
      confidence: 0.99,
      action: 'hide',
      replyText: null,
      triggers: [],
      severity: 'medium',
      reason: 'Matched scam heuristic',
    };
  }

  if (NEGATIVE_PATTERNS.some((pattern) => pattern.test(commentText))) {
    return {
      category: 'negative',
      confidence: 0.97,
      action: 'hide_and_flag',
      replyText: null,
      triggers: ['legitimate_complaint'],
      severity: 'high',
      reason: 'Matched negative-feedback heuristic',
    };
  }

  return null;
}

// Load system prompt once at startup
let systemPrompt = null;
function getSystemPrompt() {
  if (!systemPrompt) {
    systemPrompt = readFileSync(
      join(process.cwd(), 'src', 'lib', 'system-prompt.txt'),
      'utf-8'
    );
  }
  return systemPrompt;
}

function toCleanText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncateNicely(text, maxChars) {
  if (!text || text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const boundary = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('? '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('\n')
  );
  if (boundary > Math.floor(maxChars * 0.55)) {
    return cut.slice(0, boundary + 1).trim();
  }
  return `${cut.trim().replace(/[,:;]$/, '')}…`;
}

function polishHumanTone(text, { maxChars = 420 } = {}) {
  let output = toCleanText(text);
  if (!output) return output;

  const replacements = [
    { pattern: /\bplease let me know if you have any other questions\b[.!]?/gi, value: 'Happy to help with anything else.' },
    { pattern: /\bif you need any further assistance\b[.!]?/gi, value: 'If you want, I can help with that too.' },
    { pattern: /\bas an ai\b[^.?!]*/gi, value: '' },
    { pattern: /\bi am an ai\b[^.?!]*/gi, value: '' },
    { pattern: /\bI apologize for any inconvenience\b[.!]?/gi, value: "I'm sorry about that." },
    { pattern: /\bwe appreciate your patience\b[.!]?/gi, value: 'Thanks for your patience.' },
    { pattern: /\bkindly\b/gi, value: 'please' },
  ];

  replacements.forEach(({ pattern, value }) => {
    output = output.replace(pattern, value);
  });

  output = output
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/([!?]){3,}/g, '$1$1')
    .replace(/\.\.\.+/g, '…')
    .trim();

  return truncateNicely(output, maxChars);
}

// ─── Generate a DM response ────────────────────────────────
export async function generateDMResponse(userMessage, conversationHistory = []) {
  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    temperature: 0.2,
    system: getSystemPrompt(),
    messages,
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return polishHumanTone(text, { maxChars: 420 });
}

function fallbackOutreachMessage(basePitch, contact = {}) {
  const firstName = contact.firstName || contact.name?.split(' ')[0] || '';
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const pitch = String(basePitch || '').trim();
  return polishHumanTone(
    `${greeting}\n\n${pitch}\n\nIf this sounds interesting, I'd love to share more details.`,
    { maxChars: 500 }
  );
}

export async function generateOutreachMessage({ basePitch, contact = {}, campaignName = '' }) {
  if (!basePitch || !String(basePitch).trim()) {
    return '';
  }

  const noApiKey = !getEnv('ANTHROPIC_API_KEY');
  if (noApiKey) {
    return fallbackOutreachMessage(basePitch, contact);
  }

  const name = contact.name || '';
  const firstName = contact.firstName || '';
  const username = contact.username || '';
  const notes = contact.notes || '';
  const platform = contact.platform || 'instagram';

  const prompt = `You are writing short, premium, human-sounding influencer outreach DMs for Silver Mirror Facial Bar.

Campaign name: ${campaignName || 'General Outreach'}
Platform: ${platform}

Base pitch:
"""${String(basePitch).trim()}"""

Contact context:
- Name: ${name || 'unknown'}
- First name: ${firstName || 'unknown'}
- Username: ${username || 'unknown'}
- Notes: ${notes || 'none'}

Instructions:
- Keep the message under 450 characters.
- Keep tone warm, confident, premium, and personal.
- Open with first name when available.
- Do not sound robotic, mass-mailed, or overly salesy.
- Do not use hashtags.
- Do not include more than one emoji.
- Include a soft CTA at the end.
- Return ONLY the final message text.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 250,
      temperature: 0.45,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!text) {
      return fallbackOutreachMessage(basePitch, contact);
    }

    return polishHumanTone(text, { maxChars: 500 });
  } catch (error) {
    console.error('[Claude] Outreach generation failed:', error?.message || error);
    return fallbackOutreachMessage(basePitch, contact);
  }
}

export async function generateOutreachFollowUpMessage({
  priorMessage = '',
  followUpGoal = '',
  contact = {},
  campaignName = '',
  followUpNumber = 1,
}) {
  const prior = String(priorMessage || '').trim();
  if (!prior) return '';

  const noApiKey = !getEnv('ANTHROPIC_API_KEY');
  if (noApiKey) {
    return polishHumanTone(
      `Just following up in case this got buried. ${
        String(followUpGoal || 'Would love to connect if you are open to it.').trim()
      }`,
      { maxChars: 360 }
    );
  }

  const name = contact.name || '';
  const firstName = contact.firstName || '';
  const username = contact.username || '';
  const notes = contact.notes || '';
  const platform = contact.platform || 'instagram';

  const prompt = `Write follow-up message #${followUpNumber} for an influencer outreach campaign.

Campaign name: ${campaignName || 'General Outreach'}
Platform: ${platform}
Contact:
- Name: ${name || 'unknown'}
- First name: ${firstName || 'unknown'}
- Username: ${username || 'unknown'}
- Notes: ${notes || 'none'}

Original outreach message:
"""${prior}"""

Follow-up goal:
"""${String(followUpGoal || 'Nudge gently and offer a quick next step.').trim()}"""

Rules:
- Keep under 350 characters.
- Do not repeat the original wording.
- Warm, concise, premium tone.
- No pressure language.
- No more than one emoji.
- End with a clear but soft CTA.
- Return only the final follow-up message text.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      temperature: 0.45,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    return polishHumanTone(text || 'Just following up in case this got buried.', { maxChars: 360 });
  } catch (error) {
    console.error('[Claude] Outreach follow-up generation failed:', error?.message || error);
    return polishHumanTone('Just following up in case this got buried.', { maxChars: 360 });
  }
}

// ─── Classify a comment ─────────────────────────────────────
// Returns: { category, confidence, action, replyText, triggers, severity, reason }
export async function classifyComment(commentText, username, followerCount = null) {
  const heuristic = preclassifyComment(commentText);
  if (heuristic) {
    return heuristic;
  }

  const classifierPrompt = `You are a comment moderator for Silver Mirror Facial Bar, a luxury facial bar brand.

Classify this Instagram comment and decide the action. AGGRESSIVE moderation is enabled — hide anything that isn't clearly positive or a genuine question.

Comment by @${username}${followerCount ? ` (${followerCount} followers)` : ''}: "${commentText}"

Respond in JSON only, no other text:
{
  "category": "positive" | "negative" | "spam" | "question" | "neutral" | "profanity" | "competitor" | "political" | "off_topic" | "scam" | "ambiguous_negative",
  "confidence": 0.0 to 1.0,
  "action": "reply" | "hide" | "hide_and_flag" | "ignore" | "block",
  "replyText": "your reply text here or null",
  "triggers": ["list of any special triggers"],
  "severity": "high" | "medium" | "low",
  "reason": "brief explanation"
}

Rules:
- POSITIVE comments (love, praise, hearts, tagging friends positively) → reply with brief, warm, on-brand response. Use max 1 emoji (✨ or 💛). Keep under 200 chars.
- QUESTIONS about services, pricing, booking → reply helpfully from Silver Mirror knowledge. Direct to DMs for complex topics.
- NEGATIVE comments (complaints, bad reviews, criticism of real experiences) → hide_and_flag, severity medium or high. These need human review.
- SPAM (promos, bots, irrelevant links, follow-for-follow, "DM me" scam bait) → hide
- PROFANITY or hate speech → hide
- COMPETITOR mentions or promotions → hide
- POLITICAL or controversial content → hide
- OFF-TOPIC or unrelated → hide
- NEUTRAL (single emoji tags, ambiguous) → hide (aggressive moderation)
- Ambiguous negative emojis (💀 😬 etc.) → category ambiguous_negative, action hide

Special triggers to include in the triggers array:
- "legitimate_complaint" — if it's a real customer complaint about an experience
- "staff_mention" — if a specific staff member is mentioned by name
- "health_safety" — if health or safety is mentioned
- "verified_large_account" — if the account has ${MODERATION_CONFIG.verifiedFollowerThreshold}+ followers
- "low_confidence" — if you're unsure about the classification
- "suspicious_link" / "external_contact" / "multi_mention" / "emoji_bait" / "promo_bait" — if spam signals are present

NEVER reply publicly to complaints. Hide them and flag for human review.
Keep positive replies to 1-2 sentences, max 200 characters.
Do NOT tag the commenter — Instagram auto-threads replies.
Do NOT include links unless the person specifically asked.

Respond ONLY with the JSON object.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    temperature: 0,
    messages: [{ role: 'user', content: classifierPrompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    const result = normalizeClassification(parsed);

    // Add follower-based trigger if applicable
    if (followerCount && followerCount >= MODERATION_CONFIG.verifiedFollowerThreshold) {
      if (!result.triggers.includes('verified_large_account')) {
        result.triggers.push('verified_large_account');
      }
    }
    if (result.replyText) {
      result.replyText = polishHumanTone(result.replyText, { maxChars: 200 });
    }
    return result;
  } catch (err) {
    console.error('[Claude] Failed to parse classification:', text);
    return {
      category: 'neutral',
      confidence: 0.0,
      action: 'hide',
      replyText: null,
      triggers: ['low_confidence'],
      severity: 'low',
      reason: 'parse error — defaulting to hide',
    };
  }
}
