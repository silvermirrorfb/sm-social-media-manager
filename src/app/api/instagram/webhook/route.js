import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { handleDirectMessage } from '@/lib/dm-handler';
import { handleComment } from '@/lib/comment-handler';
import { getEnv } from '@/lib/env';

const VERIFY_TOKEN = getEnv('META_VERIFY_TOKEN');
const APP_SECRET = getEnv('INSTAGRAM_APP_SECRET', 'META_APP_SECRET');

function parseSignatureHeader(signatureHeader, expectedAlgo) {
  if (!signatureHeader) return null;

  const [algo, providedSignature] = signatureHeader.split('=');
  if (algo !== expectedAlgo || !providedSignature || !/^[a-f0-9]+$/i.test(providedSignature)) {
    return null;
  }

  return Buffer.from(providedSignature, 'hex');
}

function isValidMetaSignature(rawBodyBuffer, headers) {
  if (!APP_SECRET) {
    return { valid: true, reason: 'app secret not configured' };
  }

  const signatureCandidates = [
    {
      headerName: 'x-hub-signature-256',
      algo: 'sha256',
      provided: parseSignatureHeader(headers.get('x-hub-signature-256'), 'sha256'),
    },
    {
      headerName: 'x-hub-signature',
      algo: 'sha1',
      provided: parseSignatureHeader(headers.get('x-hub-signature'), 'sha1'),
    },
  ];

  for (const candidate of signatureCandidates) {
    if (!candidate.provided) continue;

    const expected = crypto
      .createHmac(candidate.algo, APP_SECRET)
      .update(rawBodyBuffer)
      .digest();

    if (
      candidate.provided.length === expected.length &&
      crypto.timingSafeEqual(candidate.provided, expected)
    ) {
      return {
        valid: true,
        matchedHeader: candidate.headerName,
        algo: candidate.algo,
      };
    }
  }

  return {
    valid: false,
    reason: 'no valid signature header matched',
    hasSha256Header: Boolean(headers.get('x-hub-signature-256')),
    hasSha1Header: Boolean(headers.get('x-hub-signature')),
  };
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
    const rawBodyBuffer = Buffer.from(await request.arrayBuffer());
    const rawBody = rawBodyBuffer.toString('utf8');
    const signatureResult = isValidMetaSignature(rawBodyBuffer, request.headers);

    if (!signatureResult.valid) {
      console.warn('[Webhook] Signature validation failed', {
        reason: signatureResult.reason,
        hasSha256Header: signatureResult.hasSha256Header,
        hasSha1Header: signatureResult.hasSha1Header,
        payloadBytes: rawBodyBuffer.length,
      });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    const body = JSON.parse(rawBody || '{}');

    // Meta requires a 200 response within 20 seconds or it retries.
    // On Vercel, background work after returning is not reliable, so we
    // finish reply/moderation tasks before acknowledging the webhook.
    const eventType = body.object;

    if (eventType === 'instagram') {
      const tasks = [];
      let dmEvents = 0;
      let commentEvents = 0;

      // Process each entry (could be batched)
      for (const entry of body.entry || []) {
        // ── Direct Messages ──
        if (entry.messaging) {
          for (const event of entry.messaging) {
            dmEvents++;
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
              commentEvents++;
              tasks.push(
                handleComment(change.value).catch((err) =>
                  console.error('[Webhook] Comment handler error:', err)
                )
              );
            }
          }
        }
      }

      console.log('[Webhook] Accepted instagram payload', {
        matchedHeader: signatureResult.matchedHeader,
        algo: signatureResult.algo,
        entries: Array.isArray(body.entry) ? body.entry.length : 0,
        dmEvents,
        commentEvents,
      });

      if (tasks.length > 0) {
        const startedAt = Date.now();
        const results = await Promise.allSettled(tasks);
        const failedCount = results.filter((result) => result.status === 'rejected').length;

        console.log('[Webhook] Completed instagram payload', {
          taskCount: tasks.length,
          failedCount,
          durationMs: Date.now() - startedAt,
        });

        if (failedCount > 0) {
          console.warn(`[Webhook] ${failedCount} webhook tasks failed`);
        }
      } else {
        console.log('[Webhook] No actionable instagram tasks found');
      }
    }

    // Return 200 after handling the payload so Meta does not retry.
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error('[Webhook] Parse error:', err);
    // Still return 200 to prevent Meta retries on bad payloads
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
