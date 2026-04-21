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
  // The Reviews tab button on the Google Maps left-panel tab bar. Google Maps
  // only renders the first ~4 featured reviews on the Overview tab; the full
  // list (50-100+) is gated behind the Reviews tab. Multiple fallback
  // selectors handle language/markup drift.
  reviewsTabButton: 'button[role="tab"][aria-label^="Reviews"]',
  reviewsTabButtonFallback: 'button[role="tab"][data-tab-index="1"]',
  reviewsTabButtonFallback2: 'button[jsaction*="pane.rating.category"]',
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

  async function __smClickReviewsTab() {
    // Try each selector in order. If we find a button that's not already selected, click it.
    var selectors = [
      __SM_SELECTORS__.reviewsTabButton,
      __SM_SELECTORS__.reviewsTabButtonFallback,
      __SM_SELECTORS__.reviewsTabButtonFallback2,
    ];
    var tabButton = null;
    for (var i = 0; i < selectors.length; i++) {
      var candidates = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < candidates.length; j++) {
        var btn = candidates[j];
        var label = (btn.getAttribute('aria-label') || '').toLowerCase();
        // Must actually be the Reviews tab (not Overview or About).
        // Accept "review" anywhere in the label to tolerate i18n variations.
        if (label.indexOf('review') !== -1) {
          tabButton = btn;
          break;
        }
      }
      if (tabButton) break;
    }

    if (!tabButton) {
      try {
        console.log('[Google-Snapshot] Reviews tab button not found — continuing with whatever is currently rendered. This may only capture featured reviews on the Overview tab.');
      } catch (e) {}
      return false;
    }

    // If the tab is already selected, don't click it — clicking a selected tab in
    // Google Maps sometimes collapses the panel.
    var alreadySelected = tabButton.getAttribute('aria-selected') === 'true';
    if (alreadySelected) {
      try {
        console.log('[Google-Snapshot] Reviews tab already active — skipping click.');
      } catch (e) {}
      return true;
    }

    try {
      tabButton.click();
      console.log('[Google-Snapshot] Clicked Reviews tab. Waiting for panel to render...');
    } catch (e) {
      try {
        console.log('[Google-Snapshot] Reviews tab click failed: ' + (e && e.message || 'unknown'));
      } catch (e2) {}
      return false;
    }

    // Wait for the review panel to render. Google Maps typically loads the reviews
    // list ~1-2 seconds after tab switch. We poll for 4 seconds max.
    var maxWaitMs = 4000;
    var pollIntervalMs = 200;
    var elapsed = 0;
    while (elapsed < maxWaitMs) {
      await new Promise(function (resolve) { setTimeout(resolve, pollIntervalMs); });
      elapsed += pollIntervalMs;
      var cardCount = document.querySelectorAll(__SM_SELECTORS__.reviewCard).length;
      if (cardCount >= 5) {
        // Reviews panel has more than the 4 featured ones — tab switch succeeded.
        try {
          console.log('[Google-Snapshot] Reviews tab render confirmed after ' + elapsed + 'ms, ' + cardCount + ' cards visible.');
        } catch (e) {}
        return true;
      }
    }

    try {
      console.log('[Google-Snapshot] Reviews tab clicked but card count did not grow within ' + maxWaitMs + 'ms. Proceeding anyway.');
    } catch (e) {}
    return true;
  }

  async function __smScrollReviewsPanel(maxScrolls) {
    var candidates = document.querySelectorAll('div[role="main"], div[aria-label]');
    var scrollable = null;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.scrollHeight > el.clientHeight + 40) {
        if (el.querySelector(__SM_SELECTORS__.reviewCard)) {
          scrollable = el;
          break;
        }
      }
    }
    if (!scrollable) {
      var cards = document.querySelectorAll(__SM_SELECTORS__.reviewCard);
      if (cards.length > 0) {
        var parent = cards[0].parentElement;
        while (parent && parent !== document.body) {
          if (parent.scrollHeight > parent.clientHeight + 40) {
            scrollable = parent;
            break;
          }
          parent = parent.parentElement;
        }
      }
    }
    if (!scrollable) return 0;

    var lastCount = 0;
    var stableRounds = 0;
    for (var n = 0; n < (maxScrolls || 12); n++) {
      scrollable.scrollTop = scrollable.scrollHeight;
      await new Promise(function (resolve) { setTimeout(resolve, 650); });
      var currentCount = document.querySelectorAll(__SM_SELECTORS__.reviewCard).length;
      if (currentCount === lastCount) {
        stableRounds += 1;
        if (stableRounds >= 2) break;
      } else {
        stableRounds = 0;
        lastCount = currentCount;
      }
    }
    return lastCount;
  }

  async function extractGoogleReviewsFromDom(options) {
    options = options || {};
    var locationId = options.locationId || '';
    var warnings = [];

    // Google Maps only renders the first ~4 featured reviews on the Overview tab;
    // the full list is gated behind the Reviews tab. Click it first. No-op if we
    // are already on the reviews panel or the tab doesn't exist.
    try {
      await __smClickReviewsTab();
    } catch (e) {
      warnings.push('reviews_tab_click_error:' + (e && e.message || 'unknown'));
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
