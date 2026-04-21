import { NextResponse } from 'next/server';
import { getConfiguredYelpLocations } from '@/lib/yelp-locations';
import { scrapeLocationHiddenReviews } from '@/lib/yelp-scraper';
import { getYelpAppeal, upsertYelpAppeal } from '@/lib/yelp-appeals';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorizedCron(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev mode
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const locations = getConfiguredYelpLocations();
  const results = {
    scanned: 0,
    newHiddenReviews: 0,
    errors: [],
    perLocation: [],
  };

  for (const location of locations) {
    const scan = await scrapeLocationHiddenReviews(location);
    results.scanned++;

    if (!scan.ok) {
      results.errors.push({ location: location.id, error: scan.error });
      results.perLocation.push({ location: location.id, status: 'error', error: scan.error });
      continue;
    }

    const fiveStarHidden = scan.reviews.filter((r) => r.rating === 5);
    let newCount = 0;

    for (const review of fiveStarHidden) {
      const existing = await getYelpAppeal(review.reviewId);
      if (existing) continue;

      await upsertYelpAppeal({
        reviewId: review.reviewId,
        locationId: location.id,
        locationName: location.name,
        reviewerName: review.reviewerName,
        reviewerProfileUrl: review.reviewerProfileUrl,
        starRating: review.rating,
        reviewText: review.text,
        reviewDate: review.date,
        reviewUrl: review.reviewUrl || location.url,
        detectedAt: new Date().toISOString(),
        status: 'new',
        priority: 'normal',
      });

      newCount++;
      results.newHiddenReviews++;
    }

    results.perLocation.push({
      location: location.id,
      status: 'ok',
      totalHidden: scan.reviews.length,
      newHidden5Star: newCount,
      warnings: scan.warnings,
    });
  }

  console.log(`[Yelp-Scan] Completed. ${results.scanned} locations, ${results.newHiddenReviews} new hidden 5-star reviews.`);

  return NextResponse.json({ ok: true, ...results });
}
