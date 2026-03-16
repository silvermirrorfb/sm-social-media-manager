# Silver Mirror Social Media Manager

AI-powered Instagram DM handling, comment moderation, and social media management for Silver Mirror Facial Bar.

## What It Does

### Instagram DMs
- Automatically responds to direct messages using Claude AI with the full Silver Mirror knowledge base (10 locations, services, pricing, skin concern recommendations)
- Smart routing: membership questions → memberships@, collaborations → Sierra, complaints → location phone, etc.
- Handles voice messages, images, and non-text messages gracefully
- Auto-escalates to human after 4 unresolved exchanges

### Comment Moderation (Aggressive Mode)
- Classifies every comment: positive, negative, spam, question, profanity, competitor, political, off-topic, scam
- **Aggressive moderation**: hides anything not clearly positive
- Replies to positive comments with warm, on-brand responses (30 pre-built templates)
- Hides + flags legitimate complaints for human review with severity levels
- Tracks spam count per user — auto-blocks after 3 spam comments in 30 days
- Confidence-based thresholds: auto-action at ≥85%, human review queue for 50-84%

### Logging & Monitoring
- Every DM and moderation action logged to Google Sheets with 12 columns
- Confidence scores, severity, triggers, and human review flags tracked
- Dashboard for quick status checks

## Architecture

| Component | Technology |
|-----------|-----------|
| Runtime | Next.js 14 (App Router) on Vercel |
| AI | Claude Sonnet via Anthropic API |
| Messaging | Meta Instagram Graph API |
| Logging | Google Sheets API |
| Moderation | Claude classifier + policy engine |

## File Structure

```
src/
├── app/
│   ├── api/
│   │   ├── instagram/webhook/route.js   # Meta webhook (GET verify + POST events)
│   │   └── health/route.js              # Health check + env status
│   ├── dashboard/page.js                # Monitoring dashboard
│   ├── layout.js
│   └── page.js
└── lib/
    ├── claude.js              # Claude API — DM responses + comment classifier
    ├── comment-handler.js     # Comment moderation with policy enforcement
    ├── dm-handler.js          # DM routing, escalation, conversation tracking
    ├── instagram.js           # Instagram Graph API helpers (send, reply, hide)
    ├── moderation-policy.js   # Rules, thresholds, severity, escalation config
    ├── routing.js             # 10 locations + contact directory + fuzzy matching
    ├── sheets.js              # Google Sheets logging (12-column schema)
    ├── system-prompt.txt      # Full SM knowledge base + routing + scenarios
    └── templates.js           # 30 pre-built reply templates
```

## Setup

1. `git clone https://github.com/silvermirrorfb/sm-social-media-manager.git`
2. `npm install`
3. Copy `.env.example` → `.env` and fill in credentials
4. `npm run dev`

Meta env note:
- Preferred: `INSTAGRAM_APP_SECRET` and `INSTAGRAM_ACCOUNT`
- Legacy fallback still supported: `META_APP_SECRET` and `INSTAGRAM_ACCOUNT_ID`

## 10 Locations

NYC: Upper East Side, Flatiron, Bryant Park, Manhattan West, Upper West Side
DC: Dupont Circle, Navy Yard, Penn Quarter
Miami: Brickell, Coral Gables
