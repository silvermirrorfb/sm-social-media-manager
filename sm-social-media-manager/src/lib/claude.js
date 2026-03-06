import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MODERATION_CONFIG } from './moderation-policy';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

// ─── Generate a DM response ────────────────────────────────
export async function generateDMResponse(userMessage, conversationHistory = []) {
  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: getSystemPrompt(),
    messages,
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return text;
}

// ─── Classify a comment ─────────────────────────────────────
// Returns: { category, confidence, action, replyText, triggers, severity, reason }
export async function classifyComment(commentText, username, followerCount = null) {
  const classifierPrompt = `You are a comment moderator for Silver Mirror Facial Bar, a luxury facial bar brand.

Classify this Instagram comment and decide the action. AGGRESSIVE moderation is enabled — hide anything that isn't clearly positive or a genuine question.

Comment by @${username}${followerCount ? ` (${followerCount} followers)` : ''}: "${commentText}"

Respond in JSON only, no other text:
{
  "category": "positive" | "negative" | "spam" | "question" | "neutral" | "profanity" | "competitor" | "political" | "off_topic" | "scam",
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
- Ambiguous negative emojis (💀 😬 etc.) → hide

Special triggers to include in the triggers array:
- "legitimate_complaint" — if it's a real customer complaint about an experience
- "staff_mention" — if a specific staff member is mentioned by name
- "health_safety" — if health or safety is mentioned
- "verified_large_account" — if the account has ${MODERATION_CONFIG.verifiedFollowerThreshold}+ followers
- "low_confidence" — if you're unsure about the classification

NEVER reply publicly to complaints. Hide them and flag for human review.
Keep positive replies to 1-2 sentences, max 200 characters.
Do NOT tag the commenter — Instagram auto-threads replies.
Do NOT include links unless the person specifically asked.

Respond ONLY with the JSON object.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    messages: [{ role: 'user', content: classifierPrompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  try {
    const result = JSON.parse(text.replace(/```json|```/g, '').trim());
    // Add follower-based trigger if applicable
    if (followerCount && followerCount >= MODERATION_CONFIG.verifiedFollowerThreshold) {
      if (!result.triggers.includes('verified_large_account')) {
        result.triggers.push('verified_large_account');
      }
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
