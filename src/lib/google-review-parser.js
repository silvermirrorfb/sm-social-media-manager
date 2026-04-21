// Google Maps review parser — runs in the BROWSER (bookmarklet context), not on Vercel.
//
// Google removes reviews it flags rather than hiding them into a parseable section, so the
// only reliable signal is "this reviewId existed in our last snapshot but is not in the
// current one". We grab that current snapshot from inside the operator's browser by walking
// the Google Maps DOM — raw fetch() against maps.google.com returns almost no review text
// because everything is JS-rendered.
//
// All class names Google Maps uses on review cards change frequently. Keep every selector
// isolated in `SELECTORS` below so one patch fixes everything.
//
// The parser is exported two ways:
//   1. `extractGoogleReviewsFromDom` — a normal function usable anywhere that has access to
//      `document`, mostly useful for tests.
//   2. `GOOGLE_REVIEW_PARSER_SOURCE` — a string containing the full parser source. The
//      dashboard client splices this into the bookmarklet payload so the exact same logic
//      runs in Google Maps tabs without needing a bundler to reach across origins.
//
// ID note: we can't use Node's crypto in the browser bookmarklet, so we use a simple
// deterministic 32-char DJB2/FNV hash. Google review IDs are browser-computed and are only
// matched against our own snapshots — we never compare them to anything external.

const SELECTORS = {
  reviewCard: '[data-review-id]',
  reviewerName: '.d4r55',
  reviewerNameFallback: 'button[aria-label^="Photo of"]',
  starRating: '[aria-label*="star"]',
  reviewText: '.wiI7pd',
  reviewTextFallback: 'span[jsname]',
  reviewDate: '.rsqaWe',
  expandMoreButton: 'button[aria-label="See more"]',
};

// Source of truth for the in-browser parser. Do not import Node-only modules here — this
// string runs inside the Google Maps page context.
export const GOOGLE_REVIEW_PARSER_SOURCE = `
  var __SM_SELECTORS__ = ${JSON.stringify(SELECTORS)};

  function __smHashReviewId(reviewerName, rating, text, locationId) {
    var payload = String(reviewerName || '') + '|' +
      String(rating || '') + '|' +
      String(text || '').slice(0, 200) + '|' +
      String(locationId || '');
    var h1 = 5381;
    var h2 = 2166136261;
    for (var i = 0; i < payload.length; i++) {
      var c = payload.charCodeAt(i);
      h1 = ((h1 << 5) + h1 + c) >>> 0;
      h2 = (h2 ^ c) >>> 0;
      h2 = ((h2 + ((h2 << 1) + (h2 << 4) + (h2 << 7) + (h2 << 8) + (h2 << 24))) >>> 0);
    }
    var out = ('00000000' + h1.toString(16)).slice(-8) +
              ('00000000' + h2.toString(16)).slice(-8) +
              ('00000000' + (h1 ^ h2).toString(16)).slice(-8) +
              ('00000000' + ((h1 + h2) >>> 0).toString(16)).slice(-8);
    return out;
  }

  function __smStripText(node) {
    if (!node) return '';
    var text = (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim();
    return text;
  }

  function __smParseRating(card) {
    var starNodes = card.querySelectorAll(__SM_SELECTORS__.starRating);
    for (var i = 0; i < starNodes.length; i++) {
      var label = starNodes[i].getAttribute('aria-label') || '';
      var match = label.match(/(\\d+(?:\\.\\d+)?)\\s*star/i);
      if (match) {
        var value = Number(match[1]);
        if (isFinite(value)) return value;
      }
    }
    var dataRating = card.querySelector('[aria-label$="stars"]');
    if (dataRating) {
      var label2 = dataRating.getAttribute('aria-label') || '';
      var match2 = label2.match(/(\\d+(?:\\.\\d+)?)/);
      if (match2) {
        var value2 = Number(match2[1]);
        if (isFinite(value2)) return value2;
      }
    }
    return null;
  }

  function __smParseReviewer(card, warnings) {
    var primary = card.querySelector(__SM_SELECTORS__.reviewerName);
    var name = __smStripText(primary);
    if (name) return name;
    var fallback = card.querySelector(__SM_SELECTORS__.reviewerNameFallback);
    if (fallback) {
      warnings.push('reviewer_fallback_selector_used');
      var label = fallback.getAttribute('aria-label') || '';
      return label.replace(/^Photo of\\s*/i, '').trim();
    }
    warnings.push('reviewer_name_missing');
    return '';
  }

  function __smParseText(card, warnings) {
    var primary = card.querySelector(__SM_SELECTORS__.reviewText);
    var text = __smStripText(primary);
    if (text) return text;
    var fallbacks = card.querySelectorAll(__SM_SELECTORS__.reviewTextFallback);
    for (var i = 0; i < fallbacks.length; i++) {
      var candidate = __smStripText(fallbacks[i]);
      if (candidate && candidate.length > 8) {
        warnings.push('text_fallback_selector_used');
        return candidate;
      }
    }
    return '';
  }

  function __smParseDate(card) {
    var primary = card.querySelector(__SM_SELECTORS__.reviewDate);
    return __smStripText(primary);
  }

  async function __smExpandSeeMoreButtons(root) {
    try {
      var buttons = root.querySelectorAll(__SM_SELECTORS__.expandMoreButton);
      for (var i = 0; i < buttons.length; i++) {
        try { buttons[i].click(); } catch (e) {}
      }
      if (buttons.length > 0) {
        await new Promise(function (resolve) { setTimeout(resolve, 400); });
      }
    } catch (e) {}
  }

  function __smIsOnReviewsTab() {
    // Google Maps encodes the active tab in the data segment of the URL.
    // Reviews tab URLs contain the pattern '!9m1!1b1' (or its variants with
    // different prefix numbers). Overview tab URLs do not contain this pattern.
    var href = window.location.href || '';
    return /!\\d+m\\d+!\\d+b1/.test(href);
  }

  function __smBuildReviewsTabUrl() {
    // Take the current URL and append the reviews-tab data segment if not present.
    var href = window.location.href;
    if (__smIsOnReviewsTab()) return href;
    // Strip any existing data segment starting with '/data=...' to avoid conflicts.
    var cleaned = href.replace(/\\/data=[^?]*/, '');
    var questionIdx = cleaned.indexOf('?');
    var base = questionIdx === -1 ? cleaned : cleaned.substring(0, questionIdx);
    var query = questionIdx === -1 ? '' : cleaned.substring(questionIdx);
    // Remove trailing slash if present.
    base = base.replace(/\\/$/, '');
    // !9m1!1b1 is Google Maps' stable encoding for "show the Reviews tab on this
    // Place page". The zero placeholders in !1s and !3d!4d are accepted.
    return base + '/data=!4m8!3m7!1s0x0:0x0!8m2!3d0!4d0!9m1!1b1' + query;
  }

  function __smFindReviewsScrollable() {
    var candidates = document.querySelectorAll('div[role="main"], div[aria-label]');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.scrollHeight > el.clientHeight + 40 && el.querySelector(__SM_SELECTORS__.reviewCard)) {
        return el;
      }
    }
    var cards = document.querySelectorAll(__SM_SELECTORS__.reviewCard);
    if (cards.length > 0) {
      var parent = cards[0].parentElement;
      while (parent && parent !== document.body) {
        if (parent.scrollHeight > parent.clientHeight + 40) {
          return parent;
        }
        parent = parent.parentElement;
      }
    }
    return null;
  }

  async function __smScrollReviewsPanel(maxRounds) {
    var scrollable = __smFindReviewsScrollable();
    if (!scrollable) {
      try { console.log('[Google-Snapshot] No scrollable reviews panel found.'); } catch (e) {}
      return 0;
    }

    try { console.log('[Google-Snapshot] Starting wheel-event scroll, scrollable: found'); } catch (e) {}

    var rounds = maxRounds || 12;
    var lastUniqueCount = 0;
    var stabilizedRounds = 0;

    for (var i = 0; i < rounds; i++) {
      // Dispatch a series of trusted-looking wheel events. Google's infinite
      // scroll listener may or may not respond — this is best-effort.
      for (var w = 0; w < 5; w++) {
        try {
          var ev = new WheelEvent('wheel', {
            deltaY: 600,
            deltaMode: 0,
            bubbles: true,
            cancelable: true,
            view: window,
          });
          scrollable.dispatchEvent(ev);
        } catch (e) {}
        // Also try setting scrollTop directly as a fallback.
        try {
          scrollable.scrollTop = scrollable.scrollHeight;
        } catch (e) {}
      }

      await new Promise(function (resolve) { setTimeout(resolve, 600); });

      var cards = document.querySelectorAll(__SM_SELECTORS__.reviewCard);
      var unique = new Set();
      for (var j = 0; j < cards.length; j++) {
        var id = cards[j].getAttribute('data-review-id');
        if (id) unique.add(id);
      }
      var uniqueCount = unique.size;

      try { console.log('[Google-Snapshot] Scroll ' + i + ': ' + uniqueCount + ' unique reviews'); } catch (e) {}

      if (uniqueCount === lastUniqueCount) {
        stabilizedRounds++;
        if (stabilizedRounds >= 2) break;
      } else {
        stabilizedRounds = 0;
        lastUniqueCount = uniqueCount;
      }
    }

    return lastUniqueCount;
  }

  async function extractGoogleReviewsFromDom(options) {
    options = options || {};
    var locationId = options.locationId || '';
    var warnings = [];

    // Google Maps only renders the full review list on the Reviews tab. Clicking
    // the Reviews tab programmatically doesn't work — Google ignores synthetic
    // click events. Instead, if we're not on the Reviews tab, open a new window
    // at the Reviews-tab URL and ask the operator to re-click the bookmarklet.
    if (!__smIsOnReviewsTab()) {
      try {
        console.log('[Google-Snapshot] Not on Reviews tab. Opening new window...');
      } catch (e) {}
      var reviewsUrl = __smBuildReviewsTabUrl();
      try {
        window.open(reviewsUrl, '_blank');
      } catch (e) {}
      return {
        ok: false,
        error: 'not_on_reviews_tab',
        message: 'Opened Reviews tab in a new window. Click the bookmarklet on that tab to capture reviews.',
        reviews: [],
        warnings: ['not_on_reviews_tab'],
      };
    }

    try {
      await __smScrollReviewsPanel(options.maxScrolls || 12);
    } catch (e) {
      warnings.push('scroll_error:' + (e && e.message || 'unknown'));
    }

    try {
      await __smExpandSeeMoreButtons(document);
    } catch (e) {
      warnings.push('expand_error:' + (e && e.message || 'unknown'));
    }

    var cards = document.querySelectorAll(__SM_SELECTORS__.reviewCard);
    if (cards.length === 0) {
      warnings.push('no_review_cards_found');
      try {
        console.log('[Google-Snapshot] Selector ' + __SM_SELECTORS__.reviewCard + ' found 0 reviews.');
      } catch (e) {}
      return { reviews: [], warnings: warnings };
    }

    var reviews = [];
    var seen = Object.create(null);
    var reviewerFailures = 0;
    var textFailures = 0;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var reviewerName = __smParseReviewer(card, warnings);
      var rating = __smParseRating(card);
      var text = __smParseText(card, warnings);
      var date = __smParseDate(card);

      if (!reviewerName && !text) {
        continue;
      }
      if (!reviewerName) reviewerFailures++;
      if (!text) textFailures++;

      var reviewId = __smHashReviewId(reviewerName, rating, text, locationId);
      if (seen[reviewId]) continue;
      seen[reviewId] = true;

      reviews.push({
        reviewerName: reviewerName,
        rating: rating,
        text: text,
        date: date,
        reviewId: reviewId,
      });
    }

    if (reviewerFailures > 0) {
      try { console.log('[Google-Snapshot] reviewer-name fallback used on ' + reviewerFailures + ' cards'); } catch (e) {}
    }
    if (textFailures > 0) {
      try { console.log('[Google-Snapshot] review-text missing on ' + textFailures + ' cards'); } catch (e) {}
    }
    try { console.log('[Google-Snapshot] extracted ' + reviews.length + ' reviews from ' + cards.length + ' cards'); } catch (e) {}

    return { reviews: reviews, warnings: warnings };
  }
`;

// Node/test-time shim. The real parser runs in the browser via GOOGLE_REVIEW_PARSER_SOURCE.
export async function extractGoogleReviewsFromDom(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('extractGoogleReviewsFromDom must run in a browser context with a DOM');
  }
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    `${GOOGLE_REVIEW_PARSER_SOURCE}\nreturn extractGoogleReviewsFromDom;`
  );
  const fn = factory();
  return fn(options);
}

export const GOOGLE_REVIEW_PARSER_SELECTORS = SELECTORS;
