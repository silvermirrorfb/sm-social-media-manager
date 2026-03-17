# Silver Mirror Social Media Manager

AI-powered social inbox and moderation system for Silver Mirror Facial Bar.

## What is live now

- Instagram webhook intake + DM responses
- Facebook Page webhook intake + messaging support
- TikTok Login Kit + webhook callback endpoints (review setup in progress)
- TikTok human-in-the-loop ops console with queue + AI draft generation
- Password-protected operations dashboard
- Google Sheets activity logging for inbound/outbound events and moderation flags

## Core routes

- `/dashboard` operations dashboard
- `/dashboard/outreach` bulk outreach CRM (CSV import, AI drafting, selective live send)
- `/dashboard/tiktok` TikTok ops console (queue, draft generation, operator workflow)
- `/dashboard/api/outreach/generate` outreach draft generation endpoint
- `/dashboard/api/outreach/followup` outreach follow-up draft generation endpoint
- `/dashboard/api/outreach/send` outreach send endpoint
- `/dashboard/api/tiktok/ops` TikTok queue read/create/update endpoint
- `/dashboard/api/tiktok/ops/draft` TikTok draft generation endpoint
- `/tiktok/connect` TikTok connect and live account check
- `/api/instagram/webhook` Meta webhook callback (Instagram + Facebook payloads)
- `/api/tiktok/oauth/start` TikTok OAuth start
- `/api/tiktok/oauth/callback` TikTok OAuth callback
- `/api/tiktok/webhook` TikTok webhook callback
- `/api/health` environment readiness snapshot
- `/privacy` and `/terms` public policy pages for platform review

## Environment variables

See `.env.example` for the complete list. Key groups:

- Meta/Instagram/Facebook:
  - `INSTAGRAM_ACCESS_TOKEN`
  - `INSTAGRAM_APP_SECRET` (or `META_APP_SECRET`)
  - `META_VERIFY_TOKEN`
  - `INSTAGRAM_ACCOUNT` or `INSTAGRAM_ACCOUNT_ID` (numeric)
  - `FACEBOOK_PAGE_ACCESS_TOKEN`
  - `FACEBOOK_PAGE_ID`
  - `FACEBOOK_APP_SECRET` (if Facebook uses a different Meta app)
- TikTok:
  - `TIKTOK_CLIENT_KEY`
  - `TIKTOK_CLIENT_SECRET`
  - `TIKTOK_SCOPES` (optional, comma-separated)
  - `TIKTOK_SESSION_SECRET` (optional)
  - `TIKTOK_OPS_SHEET_NAME` (optional queue tab override)
- Sheets + AI:
  - `GOOGLE_SHEET_ID`
  - `GOOGLE_SERVICE_ACCOUNT_JSON` (or split email/private key vars)
  - `ANTHROPIC_API_KEY`

## Local run

1. `git clone https://github.com/silvermirrorfb/sm-social-media-manager.git`
2. `npm install`
3. Copy `.env.example` to `.env.local`
4. `npm run dev`

## Outreach CRM workflow

- Parse contacts from pasted CSV or uploaded file
- Generate AI-personalized first-touch drafts in bulk
- Save and reuse campaign templates (pitch + defaults)
- Apply segment-based selection (sendable, failed, platform, custom query)
- Generate follow-up drafts for selected recipients
- Retry failed live sends in one click (with transient retry/backoff on API sends)
- Live send for Instagram/Facebook rows with `recipient_id`
- Export/copy drafts for manual channels (including TikTok draft mode)

## TikTok ops workflow

- Human-in-the-loop queue for inbound DMs, influencer outreach, and negative comment review
- Queue data stored in Google Sheets
- AI-assisted draft generation for saved TikTok tasks
- Manual TikTok login and final action still stay with the operator
- Browser extension/content bridge is the next planned automation step

## Dashboard ops filters

- Platform tabs: Instagram, Facebook, TikTok
- Channel filters: all, DMs, comments, system
- View filters: all, needs review, unanswered, escalated
- Range filters: all time, 24h, 7d, 30d
- Campaign filters: appears automatically when outreach campaign logs are present
