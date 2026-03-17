import { NextResponse } from 'next/server';
import { sendDirectMessage } from '@/lib/instagram';
import { sendMessengerMessage } from '@/lib/facebook';
import { logToSheet } from '@/lib/sheets';
import { getDashboardCookieName, hasValidDashboardSession } from '@/lib/dashboard-auth';

const MAX_SEND_BATCH = 60;
const MAX_SEND_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 350;

function normalizePlatform(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (['instagram', 'facebook', 'tiktok'].includes(value)) return value;
  return '';
}

async function sendToPlatform({ platform, recipientId, message }) {
  if (platform === 'instagram') {
    return sendDirectMessage(recipientId, message);
  }
  if (platform === 'facebook') {
    return sendMessengerMessage(recipientId, message);
  }
  throw new Error('TikTok outbound sending is not enabled in this app yet.');
}

function shouldRetrySend(error) {
  const message = String(error?.message || '');
  return (
    /429/.test(message) ||
    /50\d/.test(message) ||
    /timeout/i.test(message) ||
    /network/i.test(message) ||
    /fetch failed/i.test(message)
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendToPlatformWithRetry(payload) {
  let attempt = 0;
  while (attempt < MAX_SEND_ATTEMPTS) {
    attempt += 1;
    try {
      await sendToPlatform(payload);
      return { attempt };
    } catch (error) {
      const isLastAttempt = attempt >= MAX_SEND_ATTEMPTS;
      if (isLastAttempt || !shouldRetrySend(error)) {
        const baseMessage = error instanceof Error ? error.message : 'send_failed';
        throw new Error(`${baseMessage} (attempt ${attempt}/${MAX_SEND_ATTEMPTS})`);
      }
      await wait(BASE_BACKOFF_MS * attempt);
    }
  }
  throw new Error('send_failed');
}

export async function POST(request) {
  try {
    const sessionValue = request.cookies.get(getDashboardCookieName())?.value;
    if (!(await hasValidDashboardSession(sessionValue))) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [];
    const campaignName = String(body.campaignName || '').trim() || 'manual_campaign';

    if (items.length === 0) {
      return NextResponse.json({ ok: false, error: 'No outreach items were provided.' }, { status: 400 });
    }

    if (items.length > MAX_SEND_BATCH) {
      return NextResponse.json({
        ok: false,
        error: `Please keep each send batch at ${MAX_SEND_BATCH} or fewer.`,
      }, { status: 400 });
    }

    const results = [];

    for (const rawItem of items) {
      const id = String(rawItem.id || '').trim();
      const platform = normalizePlatform(rawItem.platform);
      const recipientId = String(rawItem.recipientId || '').trim();
      const message = String(rawItem.message || '').trim();
      const username = String(rawItem.username || rawItem.name || '').trim();

      const baseResult = {
        id,
        platform,
        recipientId,
        username,
        message,
      };

      if (!platform) {
        results.push({ ...baseResult, status: 'skipped', reason: 'invalid_platform' });
        continue;
      }

      if (!recipientId) {
        results.push({ ...baseResult, status: 'skipped', reason: 'missing_recipient_id' });
        continue;
      }

      if (!message) {
        results.push({ ...baseResult, status: 'skipped', reason: 'missing_message' });
        continue;
      }

      try {
        const { attempt } = await sendToPlatformWithRetry({ platform, recipientId, message });
        const successResult = { ...baseResult, status: 'sent', reason: '', attempts: attempt };
        results.push(successResult);

        await logToSheet({
          type: `${platform.toUpperCase()}_OUTREACH`,
          username: username || recipientId,
          incomingMessage: '',
          response: message.slice(0, 900),
          action: 'sent',
          category: 'outreach',
          reason: campaignName,
          confidence: '',
          severity: '',
          triggers: `campaign:${campaignName};platform:${platform};attempts:${attempt}`,
          needsReview: '',
        }).catch(() => {});
      } catch (error) {
        const failureReason = error instanceof Error ? error.message : 'send_failed';
        const failResult = { ...baseResult, status: 'failed', reason: failureReason };
        results.push(failResult);

        await logToSheet({
          type: `${platform.toUpperCase()}_OUTREACH`,
          username: username || recipientId,
          incomingMessage: '',
          response: message.slice(0, 900),
          action: 'send_failed',
          category: 'outreach',
          reason: failureReason,
          confidence: '',
          severity: 'high',
          triggers: `campaign:${campaignName};platform:${platform}`,
          needsReview: 'YES',
        }).catch(() => {});
      }
    }

    const sentCount = results.filter((item) => item.status === 'sent').length;
    const failedCount = results.filter((item) => item.status === 'failed').length;
    const skippedCount = results.filter((item) => item.status === 'skipped').length;

    return NextResponse.json({
      ok: true,
      campaignName,
      total: results.length,
      sentCount,
      failedCount,
      skippedCount,
      results,
    });
  } catch (error) {
    console.error('[Outreach] Send route failed:', error);
    return NextResponse.json({ ok: false, error: 'Failed to send outreach messages.' }, { status: 500 });
  }
}
