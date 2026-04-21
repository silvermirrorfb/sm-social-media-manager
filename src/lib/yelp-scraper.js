import { createHash } from 'crypto';

const USER_AGENT = 'Mozilla/5.0 (compatible; SilverMirrorReviewMonitor/1.0; +https://silvermirror.com)';
const FETCH_TIMEOUT_MS = 20_000;
const MAX_REVIEW_TEXT_CHARS = 2000;
const MAX_REVIEWS_PER_PAGE = 40;

// Selectors / anchors — isolate Yelp-markup-specific knowledge here so one patch fixes everything
// if Yelp changes their HTML. Each "selector" is actually a regex or substring anchor used to
// locate the hidden-review section or link to it.
const SELECTORS = {
  notRecommendedAnchorText: 'not currently recommended',
  notRecommendedLinkRegex: /href="(\/not_recommended_reviews\/[^"#?]+)[^"]*"/i,
  testIdSectionRegex: /data-testid="not-recommended-reviews-section"/i,
  // Structured JSON-LD block Yelp frequently embeds; a cheap way to find review bodies.
  jsonLdReviewRegex: /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  // Legacy review block fallback used on the not-recommended-reviews standalone page.
  legacyReviewBlockRegex: /<div[^>]+class="[^"]*review[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi,
  ratingStarsRegex: /aria-label="(\d(?:\.\d)?)\s*star(?:s)? rating"/i,
  reviewerLinkRegex: /<a[^>]+href="(\/user_details\?userid=[^"]+)"[^>]*>([^<]+)<\/a>/i,
  reviewCommentRegex: /<p[^>]+class="[^"]*comment[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
  reviewDateRegex: /<span[^>]+class="[^"]*rating-qualifier[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
};

function stripTags(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateReviewText(text) {
  const cleaned = stripTags(text);
  if (cleaned.length <= MAX_REVIEW_TEXT_CHARS) return cleaned;
  return cleaned.slice(0, MAX_REVIEW_TEXT_CHARS);
}

function computeReviewId({ reviewerName, rating, text, locationId }) {
  const hash = createHash('sha256');
  hash.update(String(reviewerName || ''));
  hash.update('|');
  hash.update(String(rating || ''));
  hash.update('|');
  hash.update(String(text || '').slice(0, 200));
  hash.update('|');
  hash.update(String(locationId || ''));
  return hash.digest('hex');
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonLdReviews(html) {
  const reviews = [];
  const matches = html.matchAll(SELECTORS.jsonLdReviewRegex);

  for (const match of matches) {
    const raw = match[1];
    if (!raw) continue;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    for (const node of nodes) {
      if (!node) continue;
      const nestedReviews = Array.isArray(node.review)
        ? node.review
        : node['@type'] === 'Review'
          ? [node]
          : [];

      for (const review of nestedReviews) {
        if (!review || typeof review !== 'object') continue;
        const author = review.author?.name || review.author || '';
        const ratingRaw = review.reviewRating?.ratingValue ?? review.ratingValue;
        const rating = Number(ratingRaw);
        const text = review.reviewBody || review.description || '';
        const date = review.datePublished || review.dateCreated || '';
        const url = review.url || '';

        if (!author && !text) continue;

        reviews.push({
          reviewerName: stripTags(author),
          reviewerProfileUrl: '',
          rating: Number.isFinite(rating) ? rating : null,
          text: truncateReviewText(text),
          date: stripTags(date),
          reviewUrl: url,
        });
      }
    }
  }

  return reviews;
}

function parseLegacyReviewBlocks(html, { originUrl } = {}) {
  const reviews = [];
  const blocks = html.matchAll(SELECTORS.legacyReviewBlockRegex);

  for (const block of blocks) {
    if (reviews.length >= MAX_REVIEWS_PER_PAGE) break;

    const content = block[1] || '';
    const ratingMatch = content.match(SELECTORS.ratingStarsRegex);
    const reviewerMatch = content.match(SELECTORS.reviewerLinkRegex);
    const textMatch = content.match(SELECTORS.reviewCommentRegex);
    const dateMatch = content.match(SELECTORS.reviewDateRegex);

    const rating = ratingMatch ? Number(ratingMatch[1]) : null;
    const reviewerName = reviewerMatch ? stripTags(reviewerMatch[2]) : '';
    const reviewerProfilePath = reviewerMatch ? reviewerMatch[1] : '';
    const text = textMatch ? truncateReviewText(textMatch[1]) : '';
    const date = dateMatch ? stripTags(dateMatch[1]) : '';

    if (!reviewerName && !text) continue;

    const reviewerProfileUrl = reviewerProfilePath
      ? (reviewerProfilePath.startsWith('http')
          ? reviewerProfilePath
          : `https://www.yelp.com${reviewerProfilePath}`)
      : '';

    reviews.push({
      reviewerName,
      reviewerProfileUrl,
      rating,
      text,
      date,
      reviewUrl: originUrl || '',
    });
  }

  return reviews;
}

function extractNotRecommendedUrl(html, baseUrl) {
  const match = html.match(SELECTORS.notRecommendedLinkRegex);
  if (!match) return '';

  const path = match[1];
  if (!path) return '';

  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return '';
  }
}

function dedupeReviews(reviews) {
  const seen = new Set();
  const output = [];
  for (const review of reviews) {
    const key = `${review.reviewerName || ''}|${review.rating || ''}|${(review.text || '').slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(review);
  }
  return output;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseHiddenReviewsFromHtml({ location, primaryHtml, secondaryHtml = null } = {}) {
  const warnings = [];

  if (!isNonEmptyString(primaryHtml)) {
    return {
      ok: false,
      location: location || null,
      reviews: [],
      warnings,
      error: 'empty_html',
    };
  }

  const sources = [];

  if (isNonEmptyString(secondaryHtml)) {
    // Secondary is the dedicated /not_recommended_reviews/ page when available — always the
    // richest source. We don't know its exact URL at parse time, so reviewUrl falls back to
    // the location's biz URL via the caller.
    sources.push({ html: secondaryHtml, sourceUrl: location?.url || '' });
  }

  const primaryHasHiddenMarker =
    SELECTORS.testIdSectionRegex.test(primaryHtml) ||
    primaryHtml.toLowerCase().includes(SELECTORS.notRecommendedAnchorText);

  if (primaryHasHiddenMarker) {
    sources.push({ html: primaryHtml, sourceUrl: location?.url || '' });
  } else if (!isNonEmptyString(secondaryHtml)) {
    warnings.push('section_not_found_or_empty');
    return {
      ok: true,
      location: location || null,
      reviews: [],
      warnings,
      error: null,
    };
  }

  const collected = [];
  for (const { html, sourceUrl } of sources) {
    const jsonLd = parseJsonLdReviews(html);
    const legacy = parseLegacyReviewBlocks(html, { originUrl: sourceUrl });
    collected.push(...jsonLd, ...legacy);
  }

  const merged = dedupeReviews(collected).slice(0, MAX_REVIEWS_PER_PAGE);

  if (merged.length === 0) {
    warnings.push('section_not_found_or_empty');
  }

  const reviews = merged.map((review) => ({
    reviewerName: review.reviewerName || '',
    reviewerProfileUrl: review.reviewerProfileUrl || '',
    rating: Number.isFinite(review.rating) ? review.rating : null,
    text: review.text || '',
    date: review.date || '',
    reviewUrl: review.reviewUrl || location?.url || '',
    reviewId: computeReviewId({
      reviewerName: review.reviewerName,
      rating: review.rating,
      text: review.text,
      locationId: location?.id,
    }),
  }));

  return {
    ok: true,
    location: location || null,
    reviews,
    warnings,
    error: null,
  };
}

export async function scrapeLocationHiddenReviews(location) {
  const warnings = [];

  if (!location || !location.url) {
    return {
      ok: false,
      location: location || null,
      reviews: [],
      error: 'missing_location_url',
      warnings,
    };
  }

  let primaryHtml = '';
  try {
    const primaryRes = await fetchWithTimeout(location.url);
    if (!primaryRes.ok) {
      return {
        ok: false,
        location,
        reviews: [],
        error: `http_${primaryRes.status}`,
        warnings,
      };
    }
    primaryHtml = await primaryRes.text();
  } catch (err) {
    return {
      ok: false,
      location,
      reviews: [],
      error: err?.name === 'AbortError' ? 'timeout' : `fetch_error:${err?.message || 'unknown'}`,
      warnings,
    };
  }

  let secondaryHtml = null;
  const hiddenUrl = extractNotRecommendedUrl(primaryHtml, location.url);

  if (hiddenUrl) {
    try {
      const hiddenRes = await fetchWithTimeout(hiddenUrl);
      if (hiddenRes.ok) {
        secondaryHtml = await hiddenRes.text();
      } else {
        warnings.push(`hidden_fetch_http_${hiddenRes.status}`);
      }
    } catch (err) {
      warnings.push(`hidden_fetch_error:${err?.name === 'AbortError' ? 'timeout' : (err?.message || 'unknown')}`);
    }
  } else if (
    !SELECTORS.testIdSectionRegex.test(primaryHtml) &&
    primaryHtml.toLowerCase().includes(SELECTORS.notRecommendedAnchorText)
  ) {
    warnings.push('not_recommended_link_not_found');
  }

  const parsed = parseHiddenReviewsFromHtml({ location, primaryHtml, secondaryHtml });

  return {
    ...parsed,
    warnings: [...warnings, ...(parsed.warnings || [])],
  };
}
