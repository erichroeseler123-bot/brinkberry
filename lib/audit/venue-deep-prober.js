/**
 * Deep Venue Schedule Prober
 *
 * Probes official comedy club pages to evaluate schedule crawlability,
 * robots.txt rules, schedule discovery, candidate endpoints (ICS/JSON-LD/API),
 * platform markers, exact event counts, sample events, and honest classifications.
 *
 * Classification taxonomy:
 * - usable_feed: Clean ICS/JSON-LD with dated events. (Does NOT mean events are in canonical inventory).
 * - platform_marker_only: Platform marker detected (e.g. TicketWeb, SeatEngine) without parsed events yet.
 * - html_only: Static dated HTML schedule without structured feed.
 * - client_rendered_unresolved: Client-rendered SPA without resolved public data endpoint.
 * - blocked_waf: Cloudflare / WAF bot challenge.
 * - blocked_robots: robots.txt disallows crawling.
 * - not_found: HTTP 404.
 * - network_error: Connection timeout / DNS failure.
 *
 * STRICTLY READ-ONLY: Zero canonical writes, zero publications.
 */

const { detectFeedFromHtml } = require('../ingestion/feed-detector');
const { parseIcsSource } = require('../ingestion/adapters/ics');
const { extractJsonLdEvents } = require('../ingestion/adapters/jsonld');
const { parseHtmlScheduleSource } = require('../ingestion/adapters/html-schedule');

/**
 * Parses simple robots.txt for User-agent: * rules
 */
function parseRobotsTxt(robotsTxtContent, targetPath = '/') {
  if (!robotsTxtContent || typeof robotsTxtContent !== 'string') {
    return { decision: 'allowed', disallowedPatterns: [] };
  }

  const lines = robotsTxtContent.split('\n').map(l => l.trim());
  let inRelevantAgent = false;
  const disallowedPatterns = [];

  for (const line of lines) {
    if (line.startsWith('#') || !line) continue;
    const [directive, ...rest] = line.split(':');
    const key = directive.trim().toLowerCase();
    const val = rest.join(':').trim();

    if (key === 'user-agent') {
      inRelevantAgent = (val === '*' || val.toLowerCase().includes('brinkberry'));
    } else if (inRelevantAgent && key === 'disallow') {
      if (val) {
        disallowedPatterns.push(val);
      }
    }
  }

  const isDisallowed = disallowedPatterns.some(pattern => {
    if (pattern === '/') return true;
    if (targetPath.startsWith(pattern)) return true;
    return false;
  });

  return {
    decision: isDisallowed ? 'disallowed' : 'allowed',
    disallowedPatterns
  };
}

/**
 * Detects platform markers from HTML content
 */
function extractPlatformMarkers(html) {
  if (!html || typeof html !== 'string') return [];
  const markers = new Set();

  if (/ticketweb\.com|info\.ticketweb\.com/i.test(html)) {
    markers.add('TicketWeb');
  }
  if (/seatengine\.com|se-widget/i.test(html)) {
    markers.add('SeatEngine');
  }
  if (/livenation\.com|ticketmaster\.com/i.test(html)) {
    markers.add('Live Nation / Ticketmaster');
  }
  if (/eventbrite\.com/i.test(html)) {
    markers.add('Eventbrite');
  }
  if (/etix\.com/i.test(html)) {
    markers.add('Etix');
  }
  if (/tixr\.com/i.test(html)) {
    markers.add('Tixr');
  }
  if (/dice\.fm/i.test(html)) {
    markers.add('Dice');
  }
  if (/ticketleap\.com/i.test(html)) {
    markers.add('TicketLeap');
  }
  if (/the-events-calendar|tribe-events/i.test(html)) {
    markers.add('WordPress The Events Calendar');
  }
  if (/squarespace\.com|static1\.squarespace/i.test(html)) {
    markers.add('Squarespace');
  }
  if (/wix\.com|wixstatic/i.test(html)) {
    markers.add('Wix');
  }

  return Array.from(markers);
}

/**
 * Discovers schedule URLs from HTML anchor tags
 */
function discoverScheduleLinks(html, baseUrl) {
  if (!html || typeof html !== 'string') return [];
  const scheduleLinks = new Set();
  const linkRegex = /<a\s+[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  const keywords = ['calendar', 'events', 'shows', 'comedians', 'schedule', 'lineup', 'tickets'];

  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1].trim();
    const anchorText = match[2].toLowerCase();

    const isMatch = keywords.some(kw => rawHref.toLowerCase().includes(kw) || anchorText.includes(kw));
    if (isMatch && !rawHref.startsWith('mailto:') && !rawHref.startsWith('tel:')) {
      try {
        const resolved = new URL(rawHref, baseUrl).href;
        // Keep within same host or immediate subdomain
        const baseHost = new URL(baseUrl).hostname.replace(/^www\./, '');
        if (resolved.includes(baseHost)) {
          scheduleLinks.add(resolved);
        }
      } catch (_) {}
    }
  }

  return Array.from(scheduleLinks).slice(0, 5);
}

/**
 * Probes a venue schedule with deep evaluation
 */
async function probeVenueSchedule(venue, options = {}) {
  const fetchFn = options.fetchFn || fetch;
  const timeoutMs = options.timeoutMs || 6000;

  const report = {
    slug: venue.slug,
    name: venue.name,
    website: venue.website,
    robotsDecision: 'allowed',
    robotsDisallowedPatterns: [],
    pagesFetched: [],
    discoveredScheduleUrls: [],
    candidateEndpoints: {
      ics: [],
      jsonld: [],
      apiOrWidgets: []
    },
    exactEventCount: 0,
    sampleEvent: null,
    platformMarkers: [],
    finalClassification: 'client_rendered_unresolved',
    blockerOrParserError: null,
    notes: ''
  };

  let targetUrl = venue.website;
  let baseUrl;
  try {
    baseUrl = new URL(targetUrl).origin;
  } catch (err) {
    report.finalClassification = 'network_error';
    report.blockerOrParserError = `Invalid website URL: ${venue.website}`;
    return report;
  }

  // 1. Check robots.txt
  const robotsUrl = `${baseUrl}/robots.txt`;
  try {
    const rController = new AbortController();
    const rTimer = setTimeout(() => rController.abort(), 3000);
    const robotsRes = await fetchFn(robotsUrl, {
      headers: { 'User-Agent': 'Brinkberry-Prober/1.0 (+https://brinkberry.com/radar)' },
      signal: rController.signal
    });
    clearTimeout(rTimer);
    report.pagesFetched.push(robotsUrl);

    if (robotsRes.ok) {
      const robotsTxt = await robotsRes.text();
      const targetPath = new URL(venue.calendarFeedUrl || venue.website).pathname;
      const parsedRobots = parseRobotsTxt(robotsTxt, targetPath);
      report.robotsDecision = parsedRobots.decision;
      report.robotsDisallowedPatterns = parsedRobots.disallowedPatterns;

      if (parsedRobots.decision === 'disallowed') {
        report.finalClassification = 'blocked_robots';
        report.blockerOrParserError = `Crawl disallowed by robots.txt for path: ${targetPath}`;
        return report;
      }
    } else if (robotsRes.status === 404) {
      report.robotsDecision = 'allowed'; // No robots.txt means allowed
    }
  } catch (e) {
    // Non-fatal, assume allowed if robots.txt unreachable
    report.robotsDecision = 'allowed';
  }

  // 2. Fetch primary page
  let fetchUrl = venue.calendarFeedUrl || venue.website;
  let html = '';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res = await fetchFn(fetchUrl, {
      headers: {
        'User-Agent': 'Brinkberry-Prober/1.0 (Mozilla/5.0 compatible; +https://brinkberry.com/radar)'
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    report.pagesFetched.push(fetchUrl);

    if (res.status === 404 && venue.calendarFeedUrl && venue.calendarFeedUrl !== venue.website) {
      // Fallback to primary website to discover current schedule URL
      fetchUrl = venue.website;
      const fController = new AbortController();
      const fTimer = setTimeout(() => fController.abort(), timeoutMs);
      res = await fetchFn(fetchUrl, {
        headers: {
          'User-Agent': 'Brinkberry-Prober/1.0 (Mozilla/5.0 compatible; +https://brinkberry.com/radar)'
        },
        signal: fController.signal
      });
      clearTimeout(fTimer);
      report.pagesFetched.push(fetchUrl);
    }

    if (res.status === 403) {
      report.finalClassification = 'blocked_waf';
      report.blockerOrParserError = 'HTTP 403 / Cloudflare or perimeter WAF challenge';
      return report;
    }
    if (res.status === 404) {
      report.finalClassification = 'not_found';
      report.blockerOrParserError = `HTTP 404 Not Found at ${fetchUrl}`;
      return report;
    }
    if (!res.ok) {
      report.finalClassification = 'network_error';
      report.blockerOrParserError = `HTTP ${res.status}`;
      return report;
    }

    html = await res.text();
  } catch (err) {
    report.finalClassification = 'network_error';
    report.blockerOrParserError = err.message || 'Connection timeout or network failure';
    return report;
  }

  // Check for Cloudflare challenge markers in body
  if (html.includes('cf-browser-verification') || html.includes('challenge-platform') || html.includes('Just a moment...')) {
    report.finalClassification = 'blocked_waf';
    report.blockerOrParserError = 'Cloudflare bot challenge detected in page HTML';
    return report;
  }

  // 3. Extract platform markers
  report.platformMarkers = extractPlatformMarkers(html);

  // 4. Discover schedule URLs
  report.discoveredScheduleUrls = discoverScheduleLinks(html, fetchUrl);

  // 5. Discover candidate endpoints
  // ICS
  const icsLinks = [];
  const icsMatch = html.match(/href=["']([^"']+\.ics(\?[^"']*)?)["']/i) ||
                   html.match(/href=["']([^"']+\?ical=1[^"']*)["']/i) ||
                   html.match(/<link[^>]+type=["']text\/calendar["'][^>]+href=["']([^"']+)["']/i);
  if (icsMatch) {
    try {
      const resolvedIcs = new URL(icsMatch[1], fetchUrl).href;
      icsLinks.push(resolvedIcs);
    } catch (_) {}
  }
  report.candidateEndpoints.ics = icsLinks;

  // JSON-LD
  const jsonLdMatch = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(html);
  if (jsonLdMatch) {
    report.candidateEndpoints.jsonld.push(fetchUrl);
  }

  // Platform widgets / API scripts
  if (report.platformMarkers.length > 0) {
    report.candidateEndpoints.apiOrWidgets.push(...report.platformMarkers.map(m => `Platform:${m}`));
  }

  // 6. Attempt exact parsing
  let events = [];

  // Dedicated Venue Adapter: Comedy Works
  if (fetchUrl.includes('comedyworks.com') || (venue.name && venue.name.toLowerCase().includes('comedy works'))) {
    try {
      const { fetchComedyWorksCalendar } = require('../ingestion/adapters/comedy-works-adapter');
      const cwRes = await fetchComedyWorksCalendar({
        fetchFn,
        venueName: venue.name
      });
      if (cwRes.success && cwRes.exactEventCount > 0) {
        report.exactEventCount = cwRes.exactEventCount;
        report.finalClassification = 'usable_feed';
        report.sampleEvent = {
          title: cwRes.events[0].title,
          localStartTime: cwRes.events[0].start,
          venue: cwRes.events[0].venue_name,
          sourceUrl: cwRes.events[0].ticket_url
        };
        report.sampleEvents = cwRes.events;
        report.notes = `usable_feed: Comedy Works official calendar parsed (${cwRes.exactEventCount} events, ${cwRes.comedians.length} headliners)`;
        return report;
      }
    } catch (_) {}
  }

  // A. Check JSON-LD
  if (jsonLdMatch) {
    const jsonLdEvents = extractJsonLdEvents(html, {
      venueName: venue.name,
      canonicalUrl: venue.website
    });
    if (jsonLdEvents.length > 0) {
      events.push(...jsonLdEvents);
      report.exactEventCount = jsonLdEvents.length;
      report.finalClassification = 'usable_feed';
      report.sampleEvent = {
        title: jsonLdEvents[0].title,
        localStartTime: jsonLdEvents[0].start,
        venue: venue.name,
        sourceUrl: jsonLdEvents[0].canonical_url || fetchUrl
      };
      report.sampleEvents = jsonLdEvents;
      report.notes = 'usable_feed: Schema.org JSON-LD extracted with exact dates (source verified, not canonicalized)';
      return report;
    }
  }

  // B. Check ICS if endpoint discovered
  if (icsLinks.length > 0) {
    try {
      const icsRes = await fetchFn(icsLinks[0], {
        headers: { 'User-Agent': 'Brinkberry-Prober/1.0 (+https://brinkberry.com/radar)' }
      });
      report.pagesFetched.push(icsLinks[0]);
      if (icsRes.ok) {
        const icsText = await icsRes.text();
        const icsEvents = parseIcsSource(icsText, {
          venueName: venue.name,
          canonicalUrl: venue.website
        });
        const parsedCount = Array.isArray(icsEvents) ? icsEvents.length : (icsEvents?.events?.length || 0);
        if (parsedCount > 0) {
          report.exactEventCount = parsedCount;
          report.finalClassification = 'usable_feed';
          const ev = Array.isArray(icsEvents) ? icsEvents[0] : icsEvents.events[0];
          report.sampleEvent = {
            title: ev.title,
            localStartTime: ev.start,
            venue: venue.name,
            sourceUrl: ev.canonical_url || icsLinks[0]
          };
          report.sampleEvents = Array.isArray(icsEvents) ? icsEvents : (icsEvents?.events || []);
          report.notes = 'usable_feed: RFC 5545 iCalendar extracted with exact dates (source verified, not canonicalized)';
          return report;
        }
      }
    } catch (_) {}
  }

  // C. Check static dated HTML cards / tables
  const htmlEvents = parseHtmlScheduleSource(html, {
    venueName: venue.name,
    canonicalUrl: venue.website
  });
  if (htmlEvents.length > 0) {
    report.exactEventCount = htmlEvents.length;
    report.finalClassification = 'html_only';
    report.sampleEvent = {
      title: htmlEvents[0].title,
      localStartTime: htmlEvents[0].start,
      venue: venue.name,
      sourceUrl: htmlEvents[0].canonical_url || fetchUrl
    };
    report.sampleEvents = htmlEvents;
    report.notes = 'html_only: Static dated HTML schedule extracted';
    return report;
  }

  // 7. If 0 events parsed, determine between platform_marker_only and client_rendered_unresolved
  if (report.platformMarkers.length > 0) {
    report.finalClassification = 'platform_marker_only';
    report.blockerOrParserError = `Platform marker(s) [${report.platformMarkers.join(', ')}] detected without parsed events; dedicated adapter required`;
    report.notes = 'Platform marker identified but requires platform connector or ticket API';
    return report;
  }

  // Check for SPA shells (e.g. Punchline Atlanta or React/Vue apps)
  const isSpa = /<div id=["'](root|app|__next)["']\s*>\s*<\/div>/i.test(html) ||
                html.length < 2000 ||
                /react|vue|angular/i.test(html);

  report.finalClassification = 'client_rendered_unresolved';
  report.blockerOrParserError = isSpa
    ? 'Client-side rendered SPA with no static schedule events and no public data endpoint discovered'
    : 'No machine-readable schedule or calendar feed found on page';
  report.notes = 'client_rendered_unresolved: Client-side JS rendering hides schedule from static fetch';

  return report;
}

module.exports = {
  probeVenueSchedule,
  parseRobotsTxt,
  extractPlatformMarkers,
  discoverScheduleLinks
};
