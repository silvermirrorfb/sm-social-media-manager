import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';

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
// Uses the full Silver Mirror knowledge base to answer DMs.
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
// Returns: { category, action, replyText }
//   category: "positive" | "negative" | "spam" | "question" | "neutral"
//   action:   "reply" | "hide" | "hide_and_flag" | "ignore"
//   replyText: string or null
export async function classifyComment(commentText, username) {
  const classifierPrompt = `You are a comment moderator for Silver Mirror Facial Bar, a luxury facial bar brand.

Classify this Instagram comment and decide the action. Be AGGRESSIVE with moderation — hide anything that isn't clearly positive or a genuine question.

Comment by @${username}: "${commentText}"

Respond in JSON only, no other text:
{
  "category": "positive" | "negative" | "spam" | "question" | "neutral",
  "action": "reply" | "hide" | "hide_and_flag" | "ignore",
  "replyText": "your reply text here or null",
  "reason": "brief explanation"
}

Rules:
- POSITIVE comments → reply with a brief, warm, on-brand response (use emojis sparingly ✨💛). Keep under 150 chars.
- QUESTIONS → reply helpfully using Silver Mirror knowledge. Direct to DMs for complex topics.
- NEGATIVE comments (complaints, bad reviews, criticism) → hide_and_flag (team will review)
- SPAM (promos, bots, irrelevant links, follow-for-follow) → hide
- NEUTRAL (tags, single emojis, ambiguous) → ignore

Respond ONLY with the JSON object.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{ role: 'user', content: classifierPrompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (err) {
    console.error('[Claude] Failed to parse classification:', text);
    return { category: 'neutral', action: 'ignore', replyText: null, reason: 'parse error' };
  }
}
