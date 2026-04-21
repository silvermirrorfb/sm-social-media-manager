import { NextResponse } from 'next/server';
import {
  getDashboardCookieName,
  hasValidDashboardSession,
  verifyDashboardBridgeToken,
} from '@/lib/dashboard-auth';
import { getGoogleLocationById } from '@/lib/google-locations';
import {
  getGoogleAppeal,
  getLatestSnapshot,
  upsertGoogleAppeal,
  writeSnapshot,
} from '@/lib/google-appeals';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALLOWED_ORIGINS = new Set([
  'https://www.google.com',
  'https://google.com',
  'https://maps.google.com',
]);

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const headers = { Vary: 'Origin' };

  if (ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-SM-Scan-Token';
  }

  return headers;
}

export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

async function isAuthorized(request) {
  const sessionValue = request.cookies.get(getDashboardCookieName())?.value;
  if (await hasValidDashboardSession(sessionValue)) return true;

  const url = new URL(request.url);
  const token =
    url.searchParams.get('token') ||
    request.headers.get('x-sm-scan-token') ||
    '';
  if (!token) return false;

  const verified = await verifyDashboardBridgeToken(token, 'google_snapshot');
  return Boolean(verified?.ok);
}

function normalizeIncomingReview(review) {
  if (!review || typeof review !== 'object') return null;
  const reviewId = String(review.reviewId || '').trim();
  if (!reviewId) return null;

  const ratingRaw = review.rating;
  const rating = ratingRaw === null || ratingRaw === undefined || ratingRaw === ''
    ? null
    : Number(ratingRaw);

  return {
    reviewId,
    reviewerName: String(review.reviewerName || '').trim(),
    rating: Number.isFinite(rating) ? rating : null,
    text: String(review.text || '').trim(),
    date: String(review.date || '').trim(),
  };
}

export async function POST(request) {
  const headers = corsHeaders(request);

  if (!(await isAuthorized(request))) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json' },
      { status: 400, headers }
    );
  }

  const { locationId, reviews } = body || {};
  if (!locationId || !Array.isArray(reviews)) {
    return NextResponse.json(
      { ok: false, error: 'locationId_and_reviews_required' },
      { status: 400, headers }
    );
  }

  const location = getGoogleLocationById(locationId);
  if (!location) {
    return NextResponse.json(
      { ok: false, error: 'unknown_location' },
      { status: 400, headers }
    );
  }

  const normalizedReviews = reviews
    .map(normalizeIncomingReview)
    .filter(Boolean);

  const lastSnapshot = await getLatestSnapshot(locationId).catch(() => []);
  const hadPreviousSnapshot = lastSnapshot.length > 0;

  const currentIds = new Set(normalizedReviews.map((r) => r.reviewId));

  let removedDetected = 0;
  const newlyQueued = [];

  if (hadPreviousSnapshot) {
    const removed = lastSnapshot.filter((r) => r.reviewId && !currentIds.has(r.reviewId));
    removedDetected = removed.length;

    for (const review of removed) {
      if (review.rating !== 5) continue;

      const existing = await getGoogleAppeal(review.reviewId).catch(() => null);
      if (existing) continue;

      await upsertGoogleAppeal({
        reviewId: review.reviewId,
        locationId: location.id,
        locationName: location.name,
        reviewerName: review.reviewerName,
        starRating: review.rating,
        reviewText: review.text,
        reviewDate: review.date,
        disappearedAt: new Date().toISOString(),
        status: 'new',
        priority: 'normal',
      });
      newlyQueued.push(review.reviewId);
    }
  }

  await writeSnapshot(locationId, normalizedReviews);

  return NextResponse.json(
    {
      ok: true,
      locationId,
      locationName: location.name,
      reviewsSeen: normalizedReviews.length,
      hadPreviousSnapshot,
      removedDetected,
      newFiveStarQueued: newlyQueued.length,
    },
    { headers }
  );
}
