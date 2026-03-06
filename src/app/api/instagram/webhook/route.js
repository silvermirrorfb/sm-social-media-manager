import { NextResponse } from 'next/server';
import { handleDirectMessage } from '@/lib/dm-handler';
import { handleComment } from '@/lib/comment-handler';
import { logToSheet } from '@/lib/sheets';

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const APP_SECRET = process.env.META_APP_SECRET;

// ─── GET: Meta Webhook Verification ─────────────────────────
// Meta sends a GET request to verify your webhook URL during setup.
// It includes a challenge token that you must echo back.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Webhook] Verification successful');
    return new Response(challenge, { status: 200 });
  }

  console.warn('[Webhook] Verification failed — token mismatch');
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// ─── POST: Incoming Events ──────────────────────────────────
// Meta sends POST requests for all subscribed events:
//   - messaging (DMs)
//   - comments
//   - mentions
export async function POST(request) {
  try {
    const body = await request.json();

    // Meta requires a 200 response within 20 seconds or it retries
    // We process asynchronously and respond immediately
    const eventType = body.object;

    if (eventType === 'instagram') {
      // Process each entry (could be batched)
      for (const entry of body.entry || []) {
        // ── Direct Messages ──
        if (entry.messaging) {
          for (const event of entry.messaging) {
            // Fire and forget — don't block the 200 response
            handleDirectMessage(event).catch((err) =>
              console.error('[Webhook] DM handler error:', err)
            );
          }
        }

        // ── Comments ──
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'comments') {
              handleComment(change.value).catch((err) =>
                console.error('[Webhook] Comment handler error:', err)
              );
            }
          }
        }
      }
    }

    // Always return 200 quickly to acknowledge receipt
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error('[Webhook] Parse error:', err);
    // Still return 200 to prevent Meta retries on bad payloads
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
