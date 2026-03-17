import { NextResponse } from 'next/server';
import { generateOutreachFollowUpMessage } from '@/lib/claude';
import { logToSheet } from '@/lib/sheets';
import { getDashboardCookieName, hasValidDashboardSession } from '@/lib/dashboard-auth';

const MAX_CONTACTS = 80;

function normalizePlatform(raw, fallback = 'instagram') {
  const value = String(raw || fallback).trim().toLowerCase();
  if (['instagram', 'facebook', 'tiktok'].includes(value)) return value;
  return fallback;
}

function normalizeItem(item = {}) {
  return {
    id: String(item.id || ''),
    platform: normalizePlatform(item.platform || 'instagram'),
    username: String(item.username || '').trim().replace(/^@/, ''),
    name: String(item.name || '').trim(),
    firstName: String(item.firstName || '').trim(),
    recipientId: String(item.recipientId || '').trim(),
    email: String(item.email || '').trim(),
    notes: String(item.notes || '').trim(),
    priorMessage: String(item.message || '').trim(),
    sendReason: String(item.sendReason || '').trim(),
    status: String(item.status || '').trim(),
    canSendNow: Boolean(item.canSendNow),
  };
}

export async function POST(request) {
  try {
    const sessionValue = request.cookies.get(getDashboardCookieName())?.value;
    if (!(await hasValidDashboardSession(sessionValue))) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const campaignName = String(body.campaignName || '').trim();
    const followUpGoal = String(body.followUpGoal || '').trim();
    const followUpNumber = Number(body.followUpNumber || 1) || 1;
    const itemsRaw = Array.isArray(body.items) ? body.items : [];

    if (itemsRaw.length === 0) {
      return NextResponse.json({ ok: false, error: 'No items selected.' }, { status: 400 });
    }

    if (itemsRaw.length > MAX_CONTACTS) {
      return NextResponse.json({
        ok: false,
        error: `Please keep each follow-up generation batch at ${MAX_CONTACTS} contacts or fewer.`,
      }, { status: 400 });
    }

    const items = itemsRaw.map(normalizeItem);
    const results = [];

    for (const item of items) {
      const message = await generateOutreachFollowUpMessage({
        priorMessage: item.priorMessage,
        followUpGoal,
        contact: item,
        campaignName,
        followUpNumber,
      });

      const output = {
        ...item,
        message: message.slice(0, 900),
        status: 'generated_followup',
        sendReason: '',
      };
      results.push(output);

      await logToSheet({
        type: `${item.platform.toUpperCase()}_OUTREACH`,
        username: item.username || item.name || item.recipientId || 'unknown',
        incomingMessage: item.priorMessage.slice(0, 500),
        response: message.slice(0, 900),
        action: `generated_followup_${followUpNumber}`,
        category: 'outreach',
        reason: campaignName || 'manual_campaign',
        confidence: '',
        severity: '',
        triggers: `followup:${followUpNumber};platform:${item.platform}`,
        needsReview: '',
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      results,
      followUpNumber,
    });
  } catch (error) {
    console.error('[Outreach] Follow-up route failed:', error);
    return NextResponse.json({ ok: false, error: 'Failed to generate follow-up drafts.' }, { status: 500 });
  }
}
