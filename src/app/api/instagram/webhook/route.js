import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { handleDirectMessage } from '@/lib/dm-handler';
import { handleComment } from '@/lib/comment-handler';

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const APP_SECRET = process.env.META_APP_SECRET;

function isValidMetaSignature(rawBody, signatureHeader) {
  if (!APP_SECRET) return true;
  if (!signatureHeader) return false;

  const [algo, providedSignature] = signatureHeader.split('=');
  if (algo !== 'sha256' || !providedSignature) return false;

  const expectedSignature = crypto
    .createHmac('sha256', APP_SECRET)
    .update(rawBody, 'utf8')
    .digest('hex');

  const provided = Buffer.from(providedSignature, 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');
  if (provided.length !== expected.length) return false;

  return crypto.timingSafeEqual(provided, expected);
}

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
    const rawBody = await request.text();
    const signatureHeader = request.headers.get('x-hub-signature-256');
    if (!isValidMetaSignature(rawBody, signatureHeader)) {
      console.warn('[Webhook] Signature validation failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    const body = JSON.parse(rawBody || '{}');

    // Meta requires a 200 response within 20 seconds or it retries
    // We process asynchronously and respond immediately
    const eventType = body.object;

    if (eventType === 'instagram') {
      const tasks = [];

      // Process each entry (could be batched)
      for (const entry of body.entry || []) {
        // ── Direct Messages ──
        if (entry.messaging) {
          for (const event of entry.messaging) {
            tasks.push(
              handleDirectMessage(event).catch((err) =>
                console.error('[Webhook] DM handler error:', err)
              )
            );
          }
        }

        // ── Comments ──
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'comments') {
              tasks.push(
                handleComment(change.value).catch((err) =>
                  console.error('[Webhook] Comment handler error:', err)
                )
              );
            }
          }
        }
      }

      Promise.allSettled(tasks).then((results) => {
        const failedCount = results.filter((result) => result.status === 'rejected').length;
        if (failedCount > 0) {
          console.warn(`[Webhook] ${failedCount} background tasks failed`);
        }
      });
    }

    // Always return 200 quickly to acknowledge receipt
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error('[Webhook] Parse error:', err);
    // Still return 200 to prevent Meta retries on bad payloads
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
