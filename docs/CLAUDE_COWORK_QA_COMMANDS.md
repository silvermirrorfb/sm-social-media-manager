# Claude Cowork QA Commands

Use these as copy-paste prompts for Claude cowork when you want a fresh QA pass and improvement recommendations.

## 1. Full Product QA

```text
Open /Users/mattmaroone/Documents/sm-social-media-manager and do a deep QA pass on the whole app.

Requirements:
- run npm run lint
- run npm run build
- review the dashboard, outreach CRM, Instagram/Facebook webhook handlers, TikTok connect flow, and auth flow
- start the local app if needed and verify protected dashboard pages with the current dashboard credentials
- check for behavioural regressions, weak spots, UX confusion, and operational risks
- prioritize real findings over summaries

Output format:
1. findings ordered by severity with file references
2. gaps in QA coverage
3. top 5 recommended improvements
4. if code changes are needed, implement them and push to main
```

## 2. UI / UX Review

```text
Open /Users/mattmaroone/Documents/sm-social-media-manager and review the operator UI like a head of CX + ops lead.

Focus areas:
- dashboard readability under pressure
- campaign filtering and outreach workflow clarity
- mobile usability
- empty states
- visual hierarchy
- whether the bot activity is easy to audit quickly

Please:
- identify the top UX friction points
- suggest improvements with reasoning
- implement the highest-value UI upgrades you can safely make now
- run npm run lint and npm run build after edits
- push to main if green
```

## 3. Bot Quality Review

```text
Open /Users/mattmaroone/Documents/sm-social-media-manager and review bot response quality.

Please audit:
- DM tone and human-ness
- smart-router coverage
- escalation wording
- Spanish handling
- negative comment moderation behavior
- outreach message quality and follow-up tone

Then:
- propose stronger prompt/routing improvements
- implement the best ones
- QA with realistic example prompts across booking, pricing, complaints, memberships, collaborations, gift cards, and pregnancy-safe facials
- run npm run lint and npm run build
- push to main if green
```

## 4. Production Ops Review

```text
Open /Users/mattmaroone/Documents/sm-social-media-manager and do an ops-focused production readiness review.

Check:
- health endpoint signals
- auth protections on dashboard and outreach APIs
- webhook verification behavior
- logging coverage to Google Sheets
- retry/error handling on outbound sends
- env var assumptions

Deliver:
1. what is solid
2. what is risky
3. what should be monitored next
4. concrete code changes if needed

If you make changes, run npm run lint and npm run build, then push to main.
```
