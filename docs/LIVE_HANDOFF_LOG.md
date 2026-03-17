# Live Handoff Log

## 2026-03-17 11:12 ET

### Completed
- Tightened automatic spam comment moderation across Instagram and Facebook:
  - added stronger pre-AI spam heuristics for links, external contact info, promo bait, multi-mention bait, emoji bait, and scam language
  - normalized moderation decisions so spam/scam comments are always auto-hidden even if model output drifts
  - added repeat-spam offender tracking with review escalation after the configured threshold
- Added a shared moderation helper:
  - `/src/lib/comment-moderation.js`
  - shared spam counting, action normalization, trigger serialization, and audit-friendly action labels
- Improved moderation audit visibility on the dashboard:
  - new workspace filter: `Spam removed`
  - new overview stat: `Spam removed`
  - moderation log entries now include richer triggers such as `auto_spam_hide`, `spam_count`, and `comment_id`

### QA
- `npm run lint` passed.
- `npm run build` passed.
- Local runtime smoke confirmed:
  - authenticated `/dashboard?platform=instagram&view=spam&range=24h` renders
  - protected `/dashboard/api/outreach/send` still returns `401` when unauthenticated

## 2026-03-17 10:45 ET

### Completed
- Upgraded framework stack to the patched supported line:
  - `next@15.5.10`
  - `react@19.2.4`
  - `react-dom@19.2.4`
  - `eslint-config-next@15.5.10`
- Updated server-side request APIs for Next 15 compatibility:
  - async `cookies()` usage in dashboard pages and login actions
  - async `searchParams` handling in dashboard, login, and TikTok connect pages
- Replaced deprecated `next lint` script with direct ESLint CLI usage.

### Security Notes
- Re-ran `npm audit --omit=dev` before the upgrade:
  - `next` advisories included the self-hosted image optimizer issue and the React Server Components request deserialization DoS issue
  - this app does **not** use `next/image` or `remotePatterns`, so the image optimizer advisory was not the main exposure
  - the App Router / RSC advisory still applied because the app uses the App Router on a Next 14 line that no longer receives fixes
- Upgrading to the patched Next 15 line cleared the audit without forcing a jump to Next 16.

### QA
- `npm audit --omit=dev` now reports `0 vulnerabilities`.
- `npm run lint` passed with the new ESLint CLI script.
- `npm run build` passed on Next 15.5.10 with all routes compiling successfully.

## 2026-03-17 08:45 ET

### Completed
- Added real linting support:
  - `.eslintrc.json`
  - installed compatible `eslint@8.57.0` and `eslint-config-next@14.2.35`
- Improved dashboard UI:
  - active workspace filter summary bar
  - range filters carried across platform/channel/view links
  - scrollable thread list and timeline panels
  - table hover states for faster scanning
- Improved outreach UI:
  - workflow focus tiles
  - send-state legend
  - table hover states
- Added Claude cowork QA prompt pack:
  - `/docs/CLAUDE_COWORK_QA_COMMANDS.md`

### QA
- `npm run lint` passed.
- `npm run build` passed.
- Local authenticated dashboard QA completed using a valid dashboard session cookie:
  - confirmed dashboard renders range filters and workspace filter summary
  - confirmed outreach page renders focus tiles and send-state legend
- `npm audit --omit=dev` completed with one high severity advisory on `next`:
  - current advisory path recommends a breaking major upgrade (`next@16.x`)
  - not auto-applied in this pass

## 2026-03-17 08:03 ET

### Completed
- Added campaign filter to dashboard workspace and logs:
  - query param: `campaign`
  - campaign pills now appear in Conversation Workspace when outreach campaigns are present
  - campaign names in Outreach performance table are clickable filter shortcuts
- Added time-range filtering on dashboard:
  - query param: `range` (`all`, `24h`, `7d`, `30d`)
  - range pills added in Overview panel
- Improved outreach send reliability:
  - retry/backoff for transient send failures (429/5xx/network-like)
  - send logs now include attempt count in triggers
- Improved bot human tone:
  - added response tone polishing/cleanup in `claude.js` for DM replies, outreach drafts, follow-ups, and comment replies
  - improved common smart-router phrasing variety in `dm-smart-router.js`
  - refined hardcoded non-text DM responses and escalation wording in IG/FB DM handlers
  - expanded system prompt with explicit human voice style guardrails

### QA
- `npm run build` passed after all changes.
- Production smoke checks:
  - `/api/health` = 200 OK
  - `/dashboard` = 307 to login
  - `/dashboard/outreach` = 307 to login
  - `/dashboard/api/outreach/generate` = 401 when unauthenticated
  - `/dashboard/api/outreach/followup` = 401 when unauthenticated
  - `/dashboard/api/outreach/send` = 401 when unauthenticated
  - `/api/instagram/webhook` verify with wrong token = 403 (expected)

### Note
- `npm run lint` could not be executed non-interactively because Next.js prompted for first-time ESLint setup (no existing lint config committed yet).

## 2026-03-17 07:09 ET

### Completed
- Added campaign-level outreach analytics to `/dashboard`:
  - outreach KPI tiles (drafts, follow-ups, sent, failed, unique contacts, total events)
  - per-campaign outreach table with last activity timestamp
- Analytics are filtered by the currently selected platform tab (Instagram/Facebook/TikTok).

### Validation
- `npm run build` passed after adding outreach analytics section.

## 2026-03-17 00:18 ET

### Completed
- Finished Outreach CRM advanced controls in production UI:
  - saved templates (save/apply/delete)
  - segment selectors (all/sendable/failed/platform/custom query)
  - follow-up draft generation controls
  - retry failed sends button
- Added follow-up generation route:
  - `/dashboard/api/outreach/followup`
- Added Claude helper for follow-up message generation:
  - `generateOutreachFollowUpMessage(...)` in `/src/lib/claude.js`
- Hardened send result mapping:
  - send route now returns `id`
  - UI reconciles send statuses by `id` first, then key fallback
- Fixed retry race condition:
  - removed async `setTimeout` selection dependency
  - retry now sends deterministic failed-sendable batch

### Validation
- `npm run build` completed successfully on 2026-03-17 with all routes compiling.

### Next
- Monitor live Outreach CRM usage and adjust rate limits if operators run very large send batches.
- Add outreach analytics rollups on `/dashboard` (campaign-level sent/failed/replied views).

## 2026-03-16 22:20 ET

### Completed
- TikTok URL verification file served from production:
  - `/tiktokEl4ESS41IqmIJGXXpWyPnM98LmHy9KJM.txt`
- TikTok OAuth flow added:
  - `/api/tiktok/oauth/start`
  - `/api/tiktok/oauth/callback`
- TikTok webhook callback route added:
  - `/api/tiktok/webhook`
- TikTok connect operations page added:
  - `/tiktok/connect`
- TikTok env readiness added to health endpoint:
  - `hasTikTokClientKey`, `hasTikTokClientSecret`, `tikTokOAuthReady`

### In Progress
- TikTok app review submitted in TikTok Developer Portal.
- Webhook test event currently returns `200 OK` from TikTok portal.

### Notes
- TikTok Login Kit redirect URI must stay:
  - `https://sm-social-media-manager.vercel.app/api/tiktok/oauth/callback`
- TikTok Webhooks callback URL must stay:
  - `https://sm-social-media-manager.vercel.app/api/tiktok/webhook`

### Next
- Finalize TikTok connection state persistence and status endpoint.
- Continue expanding dashboard operational visibility for TikTok events.

## 2026-03-16 22:18 ET

### Completed
- Added encrypted TikTok OAuth session support:
  - `/src/lib/tiktok-session.js`
- Upgraded TikTok connect operations page:
  - `/tiktok/connect`
  - now shows portal values, connection status, profile snapshot, and recent videos
- Added TikTok OAuth operational routes:
  - `/api/tiktok/oauth/status`
  - `/api/tiktok/oauth/disconnect`
- Enhanced OAuth event logging into Google Sheets:
  - start, success, failure, disconnect
- Expanded dashboard readiness to include TikTok OAuth configuration and system-channel visibility.
- Added health signal:
  - `hasTikTokSessionCrypto`

### Deploy
- Pushed to `main`:
  - `725d5a2` Expand TikTok ops flow with session status and dashboard readiness

### Open Items
- `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` are not visible in current Vercel env list yet.
- Without those, TikTok OAuth cannot complete in production even though webhook callback testing is working.

## 2026-03-16 22:33 ET

### Completed
- Added Outreach CRM workspace:
  - `/dashboard/outreach`
- Added secure dashboard-scoped outreach API routes:
  - `/dashboard/api/outreach/generate`
  - `/dashboard/api/outreach/send`
- Outreach supports:
  - paste/import CSV contacts
  - AI-personalized bulk draft generation from one base pitch
  - selective live sending for Instagram/Facebook rows with recipient IDs
  - draft copy/export CSV workflow for manual send paths
- Added Claude outreach generator:
  - `generateOutreachMessage(...)` in `/src/lib/claude.js`
- Added dashboard navigation entry to Outreach CRM.

### Notes
- TikTok remains draft/export-only for outbound in this app until an approved direct send path is implemented.
- Outreach events log into Sheets under `*_OUTREACH` types for traceability.

### Hotfix
- Fixed dashboard runtime crash caused by platform list initialization order.
- Added explicit server-side dashboard session checks for:
  - `/dashboard`
  - `/dashboard/outreach`
  - `/dashboard/api/outreach/generate`
  - `/dashboard/api/outreach/send`

## 2026-03-17 11:47 EDT

### Completed
- Added SMTP-backed moderation alert helper:
  - `/src/lib/email.js`
- Repeat-spam threshold alerts now email Sierra automatically when the same account crosses the moderation threshold:
  - `/src/lib/comment-handler.js`
  - `/src/lib/fb-comment-handler.js`
- Added moderation alert readiness visibility:
  - `/api/health`
  - `/dashboard`
  - new flag: `hasEmailAlerts`
- Strengthened Outreach CRM operator QA flow:
  - duplicate contact import cleanup
  - row-level review flags
  - better send eligibility checks
  - clearer status messaging
  - review-first selection workflow
  - inline draft editing with length warnings
- Strengthened outreach/follow-up copy quality:
  - more human partnership tone
  - softer CTA defaults
  - reduced generic phrasing in prompts and fallbacks
- Added moderation alert audit logging for sent/failed repeat-spam emails.

### QA
- `npm run lint` passed
- `npm run build` passed
- Clean local production-style smoke checks passed after regenerating `.next`
- Verified locally:
  - `/api/health` includes `hasEmailAlerts`
  - `/dashboard` shows `Spam removed` and `Moderation alerts`
  - `/dashboard/outreach` shows `Needs Review`, `Review first`, and new operator QA copy
  - outreach generate fallback returns cleaner premium copy when Anthropic is unavailable

### Notes
- Sierra alert destination currently resolves from `ESCALATION_CONTACTS.socialMediaManager.email`
  - fallback remains `sierra.case@silvermirror.com`
- Email alerts will stay dormant until SMTP vars exist in production:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `SMTP_FROM` (or fallback to `SMTP_USER`)

### Next
- Push this batch to `main` and confirm Vercel deploy goes green.
- Once production SMTP vars are present, verify `/api/health` shows `hasEmailAlerts: true`.

## 2026-03-17 12:30 EDT

### Completed
- Corrected Facebook readiness reporting so production treats either `FACEBOOK_APP_SECRET` or `META_APP_SECRET` as valid for Facebook webhook readiness:
  - `/src/app/api/health/route.js`
  - `/src/app/dashboard/page.js`
- Improved Google Sheets compatibility:
  - new writes go to `Moderation Log`
  - dashboard reads merge `Moderation Log` + legacy `Instagram Log`
  - `/src/lib/sheets.js`
- Added spam tracker pruning to cap in-memory moderation state growth:
  - `/src/lib/comment-moderation.js`
- Fixed non-clickable bare URLs in DM image replies:
  - `/src/lib/dm-handler.js`
  - `/src/lib/fb-dm-handler.js`
- Added confirm dialogs before live outreach send and failed-send retry:
  - `/src/app/dashboard/outreach/OutreachClient.js`
- Fixed bare URLs in shared reply/routing content so Instagram/Facebook render them as clickable links:
  - `/src/lib/templates.js`
  - `/src/lib/routing.js`

### QA
- `npm run lint` passed
- `npm run build` passed
- Production health verification reported:
  - `facebookWebhookReady: true`
  - `hasEmailAlerts: true`
  - `metaWebhookReady: true`

### Notes
- One cowork-introduced regression was corrected before ship:
  - smart quotes in `/src/lib/fb-dm-handler.js` were replaced with a normal JS string literal

## 2026-03-17 13:30 EDT

### Completed
- Tightened Outreach CRM live-send gating so drafts with review flags no longer count as sendable or get included in live-send / retry batches:
  - `/src/app/dashboard/outreach/OutreachClient.js`
- Improved generation status copy so operators can see how many drafts are truly live-send ready vs. still needing review.

### QA
- `npm run lint` passed
- `npm run build` passed
- Production moderation verification via Vercel logs confirmed Instagram webhook processed the live test sequence from `@thelastexit`:
  - positive question
  - complaint
  - spam hit 1
  - spam hit 2
  - spam hit 3
- Production logs also confirmed repeat-spam threshold handling:
  - `[Comment] @thelastexit hit spam threshold (3) — queueing for repeat-offender review`

### Notes
- I could confirm webhook ingestion and threshold hit from Vercel logs, but I could not directly confirm the Google Sheet row or Sierra inbox delivery from this environment because Google API access is blocked here.
