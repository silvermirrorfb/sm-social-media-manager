# Silver Mirror Social Media Manager

AI-powered social inbox and moderation system for Silver Mirror Facial Bar.

## What is live now

- Instagram webhook intake + DM responses
- Facebook Page webhook intake + messaging support
- TikTok Login Kit + webhook callback endpoints (review setup in progress)
- Password-protected operations dashboard
- Google Sheets activity logging for inbound/outbound events and moderation flags

## Core routes

- `/dashboard` operations dashboard
- `/dashboard/outreach` bulk outreach CRM (CSV import, AI drafting, selective live send)
- `/dashboard/api/outreach/generate` outreach draft generation endpoint
- `/dashboard/api/outreach/followup` outreach follow-up draft generation endpoint
- `/dashboard/api/outreach/send` outreach send endpoint
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
- Retry failed live sends in one click
- Live send for Instagram/Facebook rows with `recipient_id`
- Export/copy drafts for manual channels (including TikTok draft mode)
