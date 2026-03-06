# Silver Mirror Social Media Manager

AI-powered Instagram DM handling and comment moderation for Silver Mirror Facial Bar.

## What it does

- **Instagram DMs** — Automatically responds to direct messages using Claude AI with the full Silver Mirror knowledge base (services, pricing, locations, routing).
- **Comment Moderation** — Classifies every new comment (positive, negative, spam, question) and takes action: replies to positive comments, hides negative/spam, flags complaints for human review.
- **Activity Logging** — Every DM and moderation action is logged to Google Sheets for monitoring.

## Architecture

Built on the same stack as the SM Member Cancel bot:

- **Next.js 14** (App Router) on **Vercel**
- **Claude API** (Sonnet) for response generation + comment classification
- **Meta Instagram Graph API** for DMs and comment management
- **Google Sheets** for activity logging

## Setup

1. Clone: `git clone https://github.com/silvermirrorfb/sm-social-media-manager.git`
2. Install: `npm install`
3. Copy `.env.example` → `.env` and fill in credentials
4. Dev: `npm run dev`

## Environment Variables

| Variable | Description |
|---|---|
| `META_APP_SECRET` | From Meta Developer Dashboard |
| `META_VERIFY_TOKEN` | Random string you choose for webhook verification |
| `INSTAGRAM_ACCESS_TOKEN` | Long-lived token from Meta |
| `INSTAGRAM_ACCOUNT_ID` | Your Instagram Business account ID |
| `ANTHROPIC_API_KEY` | Claude API key |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | For Sheets logging |
| `GOOGLE_PRIVATE_KEY` | For Sheets logging |
| `GOOGLE_SHEET_ID` | Target spreadsheet ID |

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/instagram/webhook` | GET | Meta webhook verification |
| `/api/instagram/webhook` | POST | Receives DM + comment events |
| `/api/health` | GET | Health check + env status |
| `/dashboard` | — | Monitoring dashboard |
