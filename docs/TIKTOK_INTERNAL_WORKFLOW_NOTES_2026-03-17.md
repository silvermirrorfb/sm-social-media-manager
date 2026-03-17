# TikTok Internal Workflow Notes

Date: 2026-03-17

## Why this document exists

This captures the key decisions and constraints discussed while shifting the project from an Instagram-first automation tool toward an internal TikTok operations workflow.

## Product scope confirmed in discussion

The TikTok version of this product is intended for internal Silver Mirror use only.

The desired workflows are:

1. Answer inbound TikTok DMs.
2. Send outbound TikTok DMs to influencers.
3. Monitor negative TikTok comments and remove them when appropriate.

## TikTok review and platform constraint summary

TikTok rejected the production app update with feedback that the app was not acceptable for personal or internal company use.

The core issue is not just wording in the app description. The product, as described and scoped, is internal social operations software for one company account.

We also checked the publicly documented TikTok developer surface while discussing the next step. The practical conclusion was:

- Public TikTok docs do not appear to expose a normal official API flow for live DM inbox access.
- Public TikTok docs do not appear to expose a normal official API flow for sending outbound DMs.
- Public TikTok docs do not appear to expose a normal official API flow for comment moderation actions analogous to the Instagram Graph API hide/reply flow.

Because of that, the internal TikTok workflow should not be planned as a clean direct API integration in the same way the Instagram workflow was built.

## Decision made

We are proceeding with an internal-only TikTok workflow anyway.

Important operating assumption:

- The human operator will log into TikTok manually.
- The system should remind the operator to log in when they open the dashboard.
- We are not depending on TikTok login automation.

## Chosen architecture

The current approved direction is a human-in-the-loop system:

- Internal web dashboard for queueing, drafts, notes, status tracking, and audit history.
- Human operator stays logged into TikTok in a browser session.
- Dashboard tracks what needs to happen.
- Final TikTok actions are performed manually by the operator.
- A future browser extension or local agent can feed TikTok page context into the dashboard, but that is not required for the first usable version.

## What was implemented in this repo

The first internal TikTok workflow increment is now in place:

- `/dashboard` is now a TikTok ops console.
- The dashboard reminds the operator to log into TikTok.
- The dashboard supports three work lanes:
  - inbound DMs
  - influencer outreach
  - negative comment review
- Tasks can be created manually and updated through the dashboard.
- Queue data is stored in Google Sheets.
- `/api/tiktok/ops` now provides queue read/create/update endpoints.

## Current limitations

These are expected and were accepted during discussion:

- No official TikTok DM or comment moderation API integration is wired in.
- No browser extension or local agent exists yet.
- TikTok task intake is manual for now.
- The human operator must carry out the final TikTok action manually.
- Dashboard auth is not implemented yet.

## Practical operating model

For now, the coordinator workflow is:

1. Log into the internal dashboard.
2. Log into TikTok manually in the same browser.
3. Acknowledge the login reminder in the dashboard.
4. Add or review queue items for inbound DMs, influencer outreach, and negative comments.
5. Use the suggested reply and suggested action fields as the operating draft.
6. Perform the action in TikTok manually.
7. Mark the queue item with the updated status and outcome.

## Recommended next build step

The next major implementation should be a browser extension or local browser agent that can:

- read the current TikTok inbox/comment page context
- let the operator send selected text into the dashboard queue
- preserve the human-in-the-loop model instead of trying to fully automate login or posting

This keeps the system aligned with the current operating assumption: the human stays in control of the TikTok session.

## Assessment of the "browser with agent" opinion

An opinion was reviewed that proposed three implementation paths:

1. Chrome extension that reads TikTok page context and sends items into the dashboard queue.
2. Playwright/Puppeteer-style browser automation that reads and acts inside TikTok directly.
3. A vision-based AI agent that operates the browser from screenshots.

### What that opinion gets right

- The extension-first direction is the best fit for the current product goals.
- The repo's chosen architecture already points in that direction: dashboard queue first, human login/manual TikTok action second, browser-side helper later.
- Full browser automation and vision-agent control are both materially higher-risk than an operator-assisted extension.

### What that opinion overstates

- It says Claude is "already the agent" for the TikTok workflow. That is not true in the current codebase.
- The current TikTok workflow does not generate drafts automatically.
- `/api/tiktok/ops` is currently only a queue read/create/update API.
- The TikTok queue stores `suggestedReply` and `suggestedAction`, but those are manual fields today.
- Claude is currently wired only into the Instagram flow.

Relevant files:

- `src/app/api/tiktok/ops/route.js`
- `src/lib/tiktok-ops.js`
- `src/lib/claude.js`
- `src/lib/dm-handler.js`
- `src/lib/comment-handler.js`

### Important compliance/risk correction

The opinion says the extension path "doesn't violate TikTok's API terms" because it is user-operated and not an automated bot.

That claim is too confident.

What we can say from TikTok's public developer docs is:

- TikTok documents official developer products such as Login Kit, Display API, Content Posting API, Webhooks, Research tools, and Data Portability API.
- Public docs do not document an official browser-extension pattern for inbox scraping, DM send, or comment moderation on TikTok web.
- Public docs also do not document official live DM send/reply or moderation endpoints analogous to the Instagram Graph API workflow.

So the safer conclusion is:

- a user-operated extension is likely lower risk than full browser automation
- but it should still be treated as a gray-area workaround, not as a clearly blessed official integration path

### Recommendation after review

The best current plan remains:

1. Build the Chrome extension/content bridge first.
2. Keep the operator in control of the final TikTok action.
3. Add server-side AI drafting explicitly as a later feature, rather than assuming it already exists.
4. Avoid promising that the extension approach is formally approved by TikTok.

### Clarification on "what agent is it using once a user signs up?"

That framing does not match the current product.

- There is no end-user signup flow implemented in this repo.
- There is no TikTok agent currently running after signup.
- The current system is an internal dashboard for a human operator.

If we add AI assistance for TikTok tasks later, the most likely design is:

- browser extension captures selected TikTok page context
- extension posts that context to the dashboard/backend
- backend calls Claude to draft a reply or suggest an action
- human operator reviews the output and completes the action manually in TikTok

## Assessment of the downloaded Chrome extension spec

The downloaded spec at `SM_TikTok_Chrome_Extension_Spec.md` has a useful core idea but should not be treated as repo-grounded without revision.

### What is strong

- The extension-first architecture is still the right next move.
- The compliance section is materially more honest than the earlier opinion and correctly treats the extension as a gray-area workaround.
- The staged build sequence is directionally sensible: backend drafting and queue shape first, then extension PoC, then drift hardening.

### What is wrong or outdated

- The "current backend state" table does not match this repo.
- It claims multiple TikTok/OAuth/auth/outreach components already exist when they do not.
- It also says `/api/tiktok/ops`, `src/lib/tiktok-ops.js`, and TikTok dashboard lanes do not exist yet, but they do exist now.
- It assumes a `generateOutreachMessage()` function already exists in `claude.js`; that is not present in the current repo.

### Practical consequence

The spec is usable as an architectural strawman, but not as an implementation source of truth.

Before building from it, it needs to be rewritten to match the actual repo in three areas:

1. current backend state
2. queue item schema and workflow names
3. API contract for `/api/tiktok/ops` and the future draft endpoint

## Assessment of Claude's follow-up correction to the spec

Claude's follow-up correction is mostly right and materially better than the original spec.

### What is now accurate

- It correctly admits the backend-state table was inverted.
- It correctly admits the invented `generateOutreachMessage()` claim was unsupported.
- It correctly admits the API/schema sections were drifting away from the actual repo.
- It correctly identifies the next step as rewriting the spec against the real files now in this worktree.

### Remaining nits

- It says Claude is wired into "Instagram and Facebook flows." In the current repo, Claude is wired into the Instagram DM/comment path only.
- It mentions an "outreach generate route" as the source of the mistaken assumption, but there is no outreach route in this repo.
- "Pull the latest" is the wrong framing for this environment; the right step is simply to read the current worktree files directly.

## Clarification after conflicting thread reports

There was a later conflict between thread reports about what "exists in the repo."

The correct reconciliation is:

- In this exact worktree, the TikTok queue/draft/dashboard/docs work does exist on disk.
- It is currently local and uncommitted on top of commit `7c2d448`, which is also where `main` points in this checkout.
- `git status` shows the TikTok work as working-tree changes and untracked files, not as committed history.

Examples present in this worktree:

- `src/app/api/tiktok/ops/route.js`
- `src/app/api/tiktok/ops/draft/route.js`
- `src/lib/tiktok-ops.js`
- `src/lib/claude.js` with `generateTikTokDraft()`
- `docs/TIKTOK_SOCIAL_COORDINATOR_GUIDE.md`

So a thread that inspected committed `main` or another clean checkout could miss this local work.

However, a thread claiming this repo currently has TikTok OAuth/connect/webhook/session/auth modules is also not describing this worktree accurately. Those files are not present here.
