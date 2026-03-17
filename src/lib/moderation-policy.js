// ─── Moderation Policy Configuration ────────────────────────
// Implements the aggressive moderation rules agreed upon with Matt.
// Anything not clearly positive is hidden. Legitimate complaints
// are hidden AND flagged for human review.

export const MODERATION_CONFIG = {
  // ── Confidence Thresholds ──
  // >= 0.85: auto-action (hide or reply)
  // 0.50-0.84: queue for human review
  // < 0.50: default hide + flag for review
  autoActionThreshold: 0.85,
  humanReviewThreshold: 0.50,

  // ── Spam Tracking ──
  // After 3 spam hits in 30 days, auto-block
  spamBlockThreshold: 3,
  spamWindowDays: 30,

  // ── Verified Account Flagging ──
  // Flag accounts with this many+ followers for priority review
  verifiedFollowerThreshold: 10000,

  // ── Escalation SLOs ──
  slos: {
    high: '1 business hour',    // Health/safety, legal, high-severity complaints
    medium: '4 business hours', // Ambiguous flags, moderate complaints
    low: '24-48 business hours', // Routine mentions, low-severity
  },

  // ── Record Retention ──
  retentionDays: 90,
};

// ── Auto-Hide Rules ──
// These categories are hidden automatically (aggressive moderation)
export const AUTO_HIDE_CATEGORIES = [
  'spam',           // Links, promotions, bots
  'profanity',      // Hate speech, profanity
  'negative',       // Negative reviews, complaints
  'competitor',     // Competitor mentions or promotions
  'political',      // Political or controversial content
  'off_topic',      // Unrelated or off-topic
  'scam',           // "DM me", scam bait
  'ambiguous_negative', // Ambiguous negative emojis like 💀 😬
];

// ── Flag for Human Review (even if hidden) ──
export const HUMAN_REVIEW_TRIGGERS = [
  'legitimate_complaint',      // Real experience complaint
  'staff_mention',             // Mentions specific staff by name
  'health_safety',             // Health or safety concerns
  'verified_large_account',    // High-follower accounts
  'low_confidence',            // Classifier unsure
  'repeat_spam_offender',      // Same account repeatedly drops spam
];

// ── Partner Brand Whitelist ──
// Comments from these accounts should NEVER be hidden
export const PARTNER_WHITELIST = [
  // TODO: Matt to confirm — e.g., Revision Skincare, IS Clinical, etc.
  // '@revisionskincare',
  // '@isclinical',
];

// ── Known Troll / Block List ──
export const BLOCK_LIST = [
  // TODO: Matt to confirm known troll accounts
];

// ── Comment Reply Rules ──
export const REPLY_RULES = {
  useEmoji: true,               // Yes, limited to ✨ 💛 and similar
  maxEmojiPerReply: 1,
  mentionProducts: true,        // If relevant to what commenter said
  includeLinks: false,          // Only if someone asks directly
  tagCommenter: false,          // Instagram auto-threads, tagging is redundant
  maxReplyLength: 200,          // Characters — 1-2 sentences
};

// ── Escalation Contacts ──
export const ESCALATION_CONTACTS = {
  general: {
    email: 'hello@silvermirror.com',
    phone: '(888) 677-0055',
  },
  memberships: {
    email: 'memberships@silvermirror.com',
    phone: '(888) 677-0055',
  },
  collaborations: {
    name: 'Sierra Case',
    email: 'sierra.case@silvermirror.com',
  },
  events: {
    name: 'Rachael',
    email: 'hello@silvermirror.com',
  },
  qa: {
    email: 'qatesting@silvermirror.com',
  },
  // Moderation log reviewer — checks daily
  socialMediaManager: {
    name: 'Sierra Case',
    email: 'sierra.case@silvermirror.com',
  },
};

// ── Severity Classification ──
export function classifySeverity(category, triggers) {
  if (triggers.includes('health_safety') || triggers.includes('legal')) {
    return 'high';
  }
  if (triggers.includes('legitimate_complaint') || triggers.includes('staff_mention')) {
    return 'medium';
  }
  if (triggers.includes('verified_large_account')) {
    return 'medium';
  }
  if (triggers.includes('repeat_spam_offender') || category === 'scam') {
    return 'medium';
  }
  return 'low';
}

// ── Should Auto-Action? ──
export function shouldAutoAction(confidence, category) {
  if (confidence >= MODERATION_CONFIG.autoActionThreshold) {
    return true;
  }
  if (confidence < MODERATION_CONFIG.humanReviewThreshold) {
    // Low confidence — hide and flag
    return true; // hide is the safe default
  }
  // Mid-range confidence — needs human review
  return false;
}

// ── Needs Human Review? ──
export function needsHumanReview(confidence, category, triggers = []) {
  // Always review these
  if (HUMAN_REVIEW_TRIGGERS.some(t => triggers.includes(t))) {
    return true;
  }
  // Mid-range confidence
  if (confidence >= MODERATION_CONFIG.humanReviewThreshold &&
      confidence < MODERATION_CONFIG.autoActionThreshold) {
    return true;
  }
  // Low confidence
  if (confidence < MODERATION_CONFIG.humanReviewThreshold) {
    return true;
  }
  return false;
}
