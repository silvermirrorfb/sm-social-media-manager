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

function polishOutreachCopy(text, { maxChars = 500 } = {}) {
  let output = toCleanText(text);
  if (!output) return output;

  const replacements = [
    { pattern: /\bhope you(?:'re| are) well\b[,.!\s-]*/gi, value: '' },
    { pattern: /\bjust reaching out\b/gi, value: 'reaching out' },
    { pattern: /\bcircling back\b/gi, value: 'following up' },
    { pattern: /\bbumping this\b/gi, value: 'following up' },
    { pattern: /\bin case this got buried\b/gi, value: 'when you have a moment' },
  ];

  replacements.forEach(({ pattern, value }) => {
    output = output.replace(pattern, value);
  });

  output = output
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/([!?]){3,}/g, '$1$1')
    .trim();

  return truncateNicely(output, maxChars);
}

function buildOutreachFitLine(contact = {}) {
  const note = toCleanText(contact.notes || '').replace(/[.?!]+$/g, '');
  if (!note) return 'Your content feels like a natural fit for Silver Mirror.';

  if (/\bcreator\b|\baudience\b|\bcontent\b/i.test(note)) {
    return 'Your content feels like a natural fit for Silver Mirror.';
  }

  const compactNote = truncateNicely(note, 70).replace(/[.?!]+$/g, '');
  return `Your content feels like a natural fit for Silver Mirror, especially around ${compactNote}.`;
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
  const fitLine = buildOutreachFitLine(contact);
  return polishOutreachCopy(
    `${greeting}\n\n${fitLine} ${pitch}\n\nIf it feels like a fit, I'd be happy to share details.`,
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
- Write like a thoughtful partnership lead from a premium brand, not a mass template.
- Open with first name when available.
- If notes are provided, weave in one concrete relevant detail naturally.
- If notes are not provided, do not invent specifics.
- Do not sound robotic, mass-mailed, or overly salesy.
- Avoid filler like "hope you're well," "just reaching out," or anything that reads like spam.
- Do not use hashtags.
- Do not include more than one emoji.
- Prefer two short paragraphs at most.
- Include a soft CTA at the end.
- A strong close is: "If it feels like a fit, I'd be happy to share details."
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

    return polishOutreachCopy(text, { maxChars: 500 });
  } catch (error) {
    console.error('[Claude] Outreach generation failed:', error?.message || error);
    return fallbackOutreachMessage(basePitch, contact);
  }
}

function fallbackOutreachFollowUpMessage(contact = {}, followUpGoal = '') {
  const firstName = contact.firstName || contact.name?.split(' ')[0] || '';
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const goal = String(followUpGoal || 'Wanted to follow up and see if this could be a fit.').trim();
  return polishOutreachCopy(
    `${greeting}\n\nWanted to follow up in case the timing is right. ${goal}\n\nIf helpful, I can send a few more details.`,
    { maxChars: 360 }
  );
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
    return fallbackOutreachFollowUpMessage(contact, followUpGoal);
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
- Write like the same thoughtful partnership lead as the first message.
- No pressure language.
- Avoid phrases like "bumping this", "circling back", "hope you're well", or "in case this got buried".
- No more than one emoji.
- End with a clear but soft CTA.
- Keep it crisp enough for a second touchpoint, not a rewrite of the first message.
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

    return polishOutreachCopy(text || fallbackOutreachFollowUpMessage(contact, followUpGoal), { maxChars: 360 });
  } catch (error) {
    console.error('[Claude] Outreach follow-up generation failed:', error?.message || error);
    return fallbackOutreachFollowUpMessage(contact, followUpGoal);
  }
}

export async function generateTikTokDraft(task = {}) {
  if (!getEnv('ANTHROPIC_API_KEY')) {
    throw new Error('ANTHROPIC_API_KEY is required for TikTok draft generation');
  }

  const workflowGuidance = {
    inbound_dm: [
      'Write a short, warm customer-facing reply.',
      'Keep the tone casual, polished, and native to TikTok DMs.',
      'Prefer 1-3 sentences and stay under 280 characters unless the question truly needs more.',
    ],
    influencer_dm: [
      'Write a concise outbound influencer outreach message from Silver Mirror.',
      'Sound premium, friendly, and low-pressure.',
      'Mention one concrete reason the creator is a fit if the context supports it.',
      'Stay under 320 characters.',
    ],
    comment_review: [
      'Do not default to replying.',
      'Primary output is the safest operator action inside TikTok: remove, report, ignore, or escalate.',
      'Only provide a reply if the safest action is to respond publicly.',
    ],
  };

  const taskContext = [
    `Workflow: ${task.workflow || 'inbound_dm'}`,
    `Handle: ${task.handle || 'unknown'}`,
    `Author: ${task.author || 'unknown'}`,
    `Message: ${task.message || '(empty)'}`,
    `Existing note: ${task.note || '(none)'}`,
    `Current suggested reply: ${task.suggestedReply || '(none)'}`,
    `Current suggested action: ${task.suggestedAction || '(none)'}`,
  ].join('\n');

  const userPrompt = `You are helping Silver Mirror's internal TikTok ops team.

Use the brand facts below when they are relevant:
${getSystemPrompt()}

Task guidance:
${(workflowGuidance[task.workflow] || workflowGuidance.inbound_dm).map((line) => `- ${line}`).join('\n')}

Task context:
${taskContext}

Respond in JSON only:
{
  "suggestedReply": "reply text or empty string",
  "suggestedAction": "clear operator action inside TikTok",
  "reason": "brief internal reason"
}

Rules:
- Never invent Silver Mirror policies, pricing, or promo claims.
- If the user needs booking or human support, route them cleanly using the existing Silver Mirror contacts from the brand facts.
- For negative or sensitive comments, prefer moderation guidance over public argument.
- For influencer outreach, avoid sounding automated or mass-blasted.
- Keep copy concise and operational.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    temperature: 0.35,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  const fallback = {
    suggestedReply: '',
    suggestedAction:
      task.workflow === 'comment_review'
        ? 'Review in TikTok manually and decide whether to remove, report, or escalate.'
        : 'Review in TikTok manually and draft the response by hand.',
    reason: 'parse error',
  };

  let parsed;
  try {
    parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (error) {
    console.error('[Claude] Failed to parse TikTok draft:', text);
    parsed = fallback;
  }

  return {
    suggestedReply: toCleanText(parsed.suggestedReply || ''),
    suggestedAction: toCleanText(parsed.suggestedAction || fallback.suggestedAction),
    reason: toCleanText(parsed.reason || fallback.reason),
  };
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

export async function generateYelpAppeal(task = {}) {
  if (!getEnv('ANTHROPIC_API_KEY')) {
    throw new Error('ANTHROPIC_API_KEY is required for Yelp appeal generation');
  }

  const reviewContext = [
    `Location: ${task.locationName || 'unknown'}`,
    `Reviewer: ${task.reviewerName || 'unknown'}`,
    `Reviewer profile: ${task.reviewerProfileUrl || '(none)'}`,
    `Star rating: ${task.starRating || 'unknown'}`,
    `Review date: ${task.reviewDate || 'unknown'}`,
    `Review text: ${task.reviewText || '(empty)'}`,
  ].join('\n');

  const userPrompt = `You are helping Silver Mirror Facial Bar appeal a 5-star customer review that Yelp has filtered into the "not currently recommended" section on one of our business pages.

About Silver Mirror:
${getSystemPrompt()}

The hidden review:
${reviewContext}

Write an appeal message that Silver Mirror's team will submit through Yelp Business. The appeal should:
- Be professional, respectful, and concise (under 500 words)
- Reference specific, verifiable details from the review itself to show this is a genuine customer
- Note that the reviewer appears to have a real profile (if reviewerProfileUrl is present)
- Not argue with Yelp's algorithm or complain — focus on why this specific review is authentic
- Not promise anything, offer incentives, or sound transactional
- Not use generic "please restore our review" language — tailor it to this review
- Match a calm, professional small-business voice

Respond in JSON only:
{
  "suggestedAppeal": "the appeal text, ready to paste into Yelp Business",
  "confidence": "high | medium | low — how confident you are this review is genuine based on its content",
  "reason": "brief internal note on why you made the choices you did"
}

Rules:
- Never invent customer details not present in the review
- Never fabricate dates or visits
- If the review seems borderline (very short, could be spam), lower confidence to "low" and keep the appeal generic
- Do not quote more than 15 words of the review verbatim`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 900,
    temperature: 0.3,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  const fallback = {
    suggestedAppeal: '',
    confidence: 'low',
    reason: 'parse error',
  };

  let parsed;
  try {
    parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    parsed = fallback;
  }

  return {
    suggestedAppeal: parsed.suggestedAppeal || fallback.suggestedAppeal,
    confidence: parsed.confidence || fallback.confidence,
    reason: parsed.reason || fallback.reason,
  };
}
