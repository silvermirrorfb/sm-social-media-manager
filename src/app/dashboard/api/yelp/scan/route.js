import { NextResponse } from 'next/server';
import {
  getDashboardCookieName,
  hasValidDashboardSession,
  verifyDashboardBridgeToken,
} from '@/lib/dashboard-auth';
import { parseHiddenReviewsFromHtml } from '@/lib/yelp-scraper';
import { getYelpLocationById } from '@/lib/yelp-locations';
import { getYelpAppeal, upsertYelpAppeal } from '@/lib/yelp-appeals';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALLOWED_ORIGINS = new Set([
  'https://www.yelp.com',
  'https://yelp.com',
  'https://m.yelp.com',
  'https://biz.yelp.com',
]);

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const headers = { 'Vary': 'Origin' };

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

  const verified = await verifyDashboardBridgeToken(token, 'yelp_scan');
  return Boolean(verified?.ok);
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

  const { locationId, html, secondaryHtml } = body || {};
  if (!locationId || !html) {
    return NextResponse.json(
      { ok: false, error: 'locationId_and_html_required' },
      { status: 400, headers }
    );
  }

  const location = getYelpLocationById(locationId);
  if (!location) {
    return NextResponse.json(
      { ok: false, error: 'unknown_location' },
      { status: 400, headers }
    );
  }

  const parseResult = parseHiddenReviewsFromHtml({
    location,
    primaryHtml: html,
    secondaryHtml: secondaryHtml || null,
  });

  if (!parseResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        locationId,
        error: parseResult.error,
        warnings: parseResult.warnings,
      },
      { status: 400, headers }
    );
  }

  const fiveStarHidden = parseResult.reviews.filter((r) => r.rating === 5);
  let newCount = 0;

  for (const review of fiveStarHidden) {
    const existing = await getYelpAppeal(review.reviewId).catch(() => null);
    if (existing) continue;

    await upsertYelpAppeal({
      reviewId: review.reviewId,
      locationId: location.id,
      locationName: location.name,
      reviewerName: review.reviewerName,
      reviewerProfileUrl: review.reviewerProfileUrl || '',
      starRating: review.rating,
      reviewText: review.text,
      reviewDate: review.date || '',
      reviewUrl: review.reviewUrl || location.url,
      detectedAt: new Date().toISOString(),
      status: 'new',
      priority: 'normal',
    });

    newCount++;
  }

  return NextResponse.json(
    {
      ok: true,
      locationId,
      totalHidden: parseResult.reviews.length,
      newHidden5Star: newCount,
      warnings: parseResult.warnings,
    },
    { headers }
  );
}
