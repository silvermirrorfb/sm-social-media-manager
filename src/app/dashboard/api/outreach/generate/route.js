import { NextResponse } from 'next/server';
import { generateOutreachMessage } from '@/lib/claude';
import { logToSheet } from '@/lib/sheets';
import crypto from 'crypto';
import { getDashboardCookieName, hasValidDashboardSession } from '@/lib/dashboard-auth';

const MAX_CONTACTS = 80;

function normalizePlatform(raw, fallback = 'instagram') {
  const value = String(raw || fallback).trim().toLowerCase();
  if (['instagram', 'facebook', 'tiktok'].includes(value)) return value;
  return fallback;
}

function normalizeContact(contact = {}, fallbackPlatform = 'instagram') {
  return {
    id: contact.id || crypto.randomUUID(),
    platform: normalizePlatform(contact.platform, fallbackPlatform),
    name: String(contact.name || '').trim(),
    firstName: String(contact.firstName || '').trim(),
    username: String(contact.username || '').trim().replace(/^@/, ''),
    recipientId: String(contact.recipientId || '').trim(),
    notes: String(contact.notes || '').trim(),
    email: String(contact.email || '').trim(),
  };
}

export async function POST(request) {
  try {
    const sessionValue = request.cookies.get(getDashboardCookieName())?.value;
    if (!(await hasValidDashboardSession(sessionValue))) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const contactsRaw = Array.isArray(body.contacts) ? body.contacts : [];
    const basePitch = String(body.basePitch || '').trim();
    const campaignName = String(body.campaignName || '').trim();
    const fallbackPlatform = normalizePlatform(body.defaultPlatform || 'instagram');

    if (!basePitch) {
      return NextResponse.json({ ok: false, error: 'Base pitch is required.' }, { status: 400 });
    }

    if (contactsRaw.length === 0) {
      return NextResponse.json({ ok: false, error: 'At least one contact is required.' }, { status: 400 });
    }

    if (contactsRaw.length > MAX_CONTACTS) {
      return NextResponse.json({
        ok: false,
        error: `Please keep each generation batch at ${MAX_CONTACTS} contacts or fewer.`,
      }, { status: 400 });
    }

    const contacts = contactsRaw.map((contact) => normalizeContact(contact, fallbackPlatform));
    const results = [];

    for (const contact of contacts) {
      const message = await generateOutreachMessage({
        basePitch,
        contact,
        campaignName,
      });

      const result = {
        ...contact,
        message,
        status: message ? 'generated' : 'empty',
        canSendNow: Boolean(
          message &&
            contact.recipientId &&
            (contact.platform === 'instagram' || contact.platform === 'facebook'),
        ),
      };

      results.push(result);

      await logToSheet({
        type: `${contact.platform.toUpperCase()}_OUTREACH`,
        username: contact.username || contact.name || contact.recipientId || 'unknown',
        incomingMessage: basePitch.slice(0, 500),
        response: message.slice(0, 900),
        action: 'generated_draft',
        category: 'outreach',
        reason: campaignName || 'manual_campaign',
        confidence: '',
        severity: '',
        triggers: `campaign:${campaignName || 'manual'};platform:${contact.platform}`,
        needsReview: '',
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      campaignName,
      total: results.length,
      sendableCount: results.filter((item) => item.canSendNow).length,
      results,
    });
  } catch (error) {
    console.error('[Outreach] Generate route failed:', error);
    return NextResponse.json({ ok: false, error: 'Failed to generate outreach drafts.' }, { status: 500 });
  }
}
