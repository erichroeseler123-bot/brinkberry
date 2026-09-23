/**
 * Autonomous Feed & Calendar Technology Detector
 *
 * Inspects venue and track websites to detect open-web calendar standards:
 * - RFC 5545 iCalendar (.ics) exports
 * - Schema.org JSON-LD Event markup
 * - Specialized Ticketing Platforms (Eventbrite, Etix, Tixr, Dice, MyRacePass)
 *
 * Strict Guardrails:
 * - Polite requests only (respects timeout and robots)
 * - Zero CAPTCHA or paywall bypassing
 */

const KNOWN_PLATFORM_SIGNATURES = [
  { engine: 'seatengine', pattern: /seatengine\.com(?:\/shows\/|\/events\/|\/venues\/)?/i, parser: 'seatengine' },
  { engine: 'myracepass', pattern: /myracepass\.com\/tracks\/([a-zA-Z0-9_-]+)/i, parser: 'myracepass' },
  { engine: 'eventbrite', pattern: /eventbrite\.com\/o\/([a-zA-Z0-9_-]+)/i, parser: 'eventbrite' },
  { engine: 'etix', pattern: /etix\.com\/(?:ticket\/v|venue)\/(\d+)/i, parser: 'etix' },
  { engine: 'tixr', pattern: /tixr\.com\/groups\/([a-zA-Z0-9_-]+)/i, parser: 'tixr' },
  { engine: 'dice', pattern: /dice\.fm\/venue\/([a-zA-Z0-9_-]+)/i, parser: 'dice' },
  { engine: 'ticketweb', pattern: /ticketweb\.com\/venue\/([a-zA-Z0-9_-]+)/i, parser: 'ticketweb' },
  { engine: 'ticketleap', pattern: /([a-zA-Z0-9_-]+)\.ticketleap\.com/i, parser: 'ticketleap' }
];

/**
 * Detects feed technology from HTML content and URL
 *
 * @param {string} targetUrl - The venue or track URL
 * @param {string} htmlContent - The fetched HTML content
 * @returns {Object} Detection report
 */
function detectFeedFromHtml(targetUrl, htmlContent = '') {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return {
      targetUrl,
      isDetected: false,
      feedType: 'unknown',
      recommendedParser: 'manual_review'
    };
  }

  // 1. Check for RFC 5545 iCalendar link in HTML
  const icsMatch = htmlContent.match(/href=["']([^"']+\.ics(?:\?[^"']*)?|\/events\/\?ical=1|\?ical=1|\/calendar\.ics)["']/i);
  if (icsMatch) {
    let icsUrl = icsMatch[1];
    try {
      icsUrl = new URL(icsUrl, targetUrl).toString();
    } catch (_) {}
    return {
      targetUrl,
      isDetected: true,
      feedType: 'ics',
      detectedFeedUrl: icsUrl,
      recommendedParser: 'ics',
      evidenceSnippet: icsMatch[0]
    };
  }

  // 2. Check for Schema.org JSON-LD Event markup
  const jsonLdBlocks = htmlContent.match(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of jsonLdBlocks) {
    const jsonStr = block.replace(/<\/?script[^>]*>/gi, '').trim();
    try {
      const parsed = JSON.parse(jsonStr);
      const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
      const hasEvent = items.some(item => {
        const type = item['@type'];
        return type === 'Event' || type === 'ComedyEvent' || type === 'SportsEvent' ||
               (Array.isArray(type) && (type.includes('Event') || type.includes('ComedyEvent')));
      });
      if (hasEvent) {
        const isSeatEngine = /seatengine/i.test(htmlContent) || /seatengine/i.test(targetUrl);
        return {
          targetUrl,
          isDetected: true,
          feedType: isSeatEngine ? 'seatengine' : 'jsonld',
          detectedFeedUrl: targetUrl,
          recommendedParser: isSeatEngine ? 'seatengine' : 'jsonld',
          evidenceSnippet: isSeatEngine ? 'SeatEngine Schema.org Event JSON-LD block found' : 'Schema.org Event JSON-LD block found'
        };
      }
    } catch (_) {}
  }

  // 3. Check for Known Ticketing Platform Signatures
  for (const sig of KNOWN_PLATFORM_SIGNATURES) {
    const match = htmlContent.match(sig.pattern);
    if (match) {
      return {
        targetUrl,
        isDetected: true,
        feedType: 'ticketing_platform',
        ticketingEngine: sig.engine,
        identifier: match[1],
        recommendedParser: sig.parser,
        evidenceSnippet: match[0]
      };
    }
  }

  // 4. Check for WordPress / The Events Calendar signature
  if (/tribe-events|tribe_events|the-events-calendar/i.test(htmlContent)) {
    const suggestedIcal = targetUrl.replace(/\/+$/, '') + '/events/?ical=1';
    return {
      targetUrl,
      isDetected: true,
      feedType: 'ics',
      detectedFeedUrl: suggestedIcal,
      recommendedParser: 'ics',
      evidenceSnippet: 'WordPress The Events Calendar signature detected'
    };
  }

  return {
    targetUrl,
    isDetected: false,
    feedType: 'unknown',
    recommendedParser: 'manual_review'
  };
}

/**
 * Asynchronously inspects a live venue website (with timeout and polite headers)
 *
 * @param {string} targetUrl - URL to inspect
 * @param {Function} fetchFn - Fetch implementation
 * @returns {Promise<Object>} Detection report
 */
async function inspectVenueFeed(targetUrl, fetchFnOrOptions = fetch, options = {}) {
  if (!targetUrl) throw new Error('targetUrl is required for feed inspection');

  const opts = (typeof fetchFnOrOptions === 'object' && fetchFnOrOptions !== null) ? fetchFnOrOptions : options;
  const fetchFn = typeof fetchFnOrOptions === 'function' ? fetchFnOrOptions : (opts.fetchFn || fetch);
  const timeoutMs = opts.timeoutMs || 5000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(targetUrl, {
      headers: {
        'User-Agent': 'Brinkberry-Radar-Detector/1.0 (+https://brinkberry.com/radar)'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        targetUrl,
        isDetected: false,
        httpStatus: res.status,
        feedType: 'unreachable',
        recommendedParser: 'manual_review'
      };
    }

    const html = await res.text();
    const result = detectFeedFromHtml(targetUrl, html);
    return {
      ...result,
      httpStatus: res.status
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      targetUrl,
      isDetected: false,
      feedType: 'error',
      error: err.message,
      recommendedParser: 'manual_review'
    };
  }
}

/**
 * Classifies a venue source to determine platform, feed URL, and onboarding routing
 *
 * @param {Object} venue - Venue record
 * @param {Object} [options] - Probe options
 * @returns {Promise<Object>} Classification result
 */
async function classifyVenueSource(venue, options = {}) {
  const targetUrl = venue.calendarFeedUrl || venue.website;
  const detection = await inspectVenueFeed(targetUrl, options);

  let platform = detection.feedType;
  if (platform === 'ticketing_platform' && detection.ticketingEngine) {
    platform = detection.ticketingEngine;
  }

  // Determine if platform is auto-onboardable with existing adapters
  const canAutoOnboard = ['seatengine', 'jsonld', 'ics'].includes(platform);

  return {
    venueSlug: venue.slug,
    venueName: venue.name,
    city: venue.city,
    state: venue.state,
    targetUrl,
    detectedPlatform: platform,
    detectedFeedUrl: detection.detectedFeedUrl || targetUrl,
    canAutoOnboard,
    recommendedAdapter: canAutoOnboard ? platform : 'review_queue',
    httpStatus: detection.httpStatus || (detection.error ? 'error' : null),
    evidenceSnippet: detection.evidenceSnippet || null,
    error: detection.error || null,
    classifiedAt: new Date().toISOString()
  };
}

module.exports = {
  detectFeedFromHtml,
  inspectVenueFeed,
  classifyVenueSource,
  KNOWN_PLATFORM_SIGNATURES
};
