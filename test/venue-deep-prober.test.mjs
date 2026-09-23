import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  probeVenueSchedule,
  parseRobotsTxt,
  extractPlatformMarkers,
  discoverScheduleLinks
} from '../lib/audit/venue-deep-prober.js';
import canonicalPkg from '../lib/storage/canonical-event-storage.js';
const { defaultCanonicalStorage } = canonicalPkg;

describe('Deep Venue Schedule Prober Suite', () => {

  describe('1. Robots.txt Parser', () => {
    test('allows crawling when robots.txt has no disallow for target path', () => {
      const robots = `User-agent: *
Disallow: /admin/
Disallow: /checkout/`;
      const result = parseRobotsTxt(robots, '/calendar');
      assert.equal(result.decision, 'allowed');
    });

    test('disallows crawling when robots.txt disallows root or target path', () => {
      const robots = `User-agent: *
Disallow: /calendar`;
      const result = parseRobotsTxt(robots, '/calendar');
      assert.equal(result.decision, 'disallowed');
      assert.deepEqual(result.disallowedPatterns, ['/calendar']);
    });
  });

  describe('2. Platform Marker Extraction', () => {
    test('extracts TicketWeb, SeatEngine, and WordPress Event markers', () => {
      const html = `<div><a href="https://www.ticketweb.com/venue/denver-improv">Buy Tickets</a>
      <script src="https://the-events-calendar.com/script.js"></script></div>`;
      const markers = extractPlatformMarkers(html);
      assert.ok(markers.includes('TicketWeb'));
      assert.ok(markers.includes('WordPress The Events Calendar'));
    });
  });

  describe('3. Schedule URL Discovery', () => {
    test('discovers internal links matching schedule keywords', () => {
      const html = `<nav>
        <a href="/calendar">Full Calendar</a>
        <a href="/shows/upcoming">Upcoming Shows</a>
        <a href="https://external.com/irrelevant">External</a>
      </nav>`;
      const links = discoverScheduleLinks(html, 'https://testclub.com');
      assert.ok(links.includes('https://testclub.com/calendar'));
      assert.ok(links.includes('https://testclub.com/shows/upcoming'));
      assert.equal(links.includes('https://external.com/irrelevant'), false);
    });
  });

  describe('4. Venue Probe Classifications', () => {

    test('clean JSON-LD yields usable_feed with sample event', async () => {
      const mockHtml = `<html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "ComedyEvent",
        "name": "Headliner Live Showcase",
        "startDate": "2026-10-30T20:00:00-06:00",
        "endDate": "2026-10-30T22:00:00-06:00",
        "url": "https://testclub.com/events/101"
      }
      </script>
      </head><body><h1>Shows</h1></body></html>`;

      const mockFetch = async (url) => {
        if (url.endsWith('robots.txt')) {
          return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
        }
        return { ok: true, status: 200, text: async () => mockHtml };
      };

      const venue = {
        slug: 'jsonld-club',
        name: 'JSON-LD Comedy Club',
        website: 'https://testclub.com',
        calendarFeedUrl: 'https://testclub.com/shows'
      };

      const result = await probeVenueSchedule(venue, { fetchFn: mockFetch });
      assert.equal(result.finalClassification, 'usable_feed');
      assert.equal(result.exactEventCount, 1);
      assert.ok(result.sampleEvent);
      assert.equal(result.sampleEvent.title, 'Headliner Live Showcase');
      assert.equal(result.sampleEvent.venue, 'JSON-LD Comedy Club');
      assert.equal(result.robotsDecision, 'allowed');
      assert.ok(result.pagesFetched.length >= 2);
    });

    test('TicketWeb marker without parsed events yields platform_marker_only', async () => {
      const mockHtml = `<html><body>
        <h1>Denver Improv</h1>
        <div id="events-container">
          <a href="https://www.ticketweb.com/venue/denver-improv-denver-co/248553">Buy On TicketWeb</a>
        </div>
      </body></html>`;

      const mockFetch = async (url) => {
        if (url.endsWith('robots.txt')) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
        return { ok: true, status: 200, text: async () => mockHtml };
      };

      const venue = {
        slug: 'denver-improv',
        name: 'Denver Improv',
        website: 'https://denver.improv.com'
      };

      const result = await probeVenueSchedule(venue, { fetchFn: mockFetch });
      assert.equal(result.finalClassification, 'platform_marker_only');
      assert.equal(result.exactEventCount, 0);
      assert.ok(result.platformMarkers.includes('TicketWeb'));
      assert.ok(result.blockerOrParserError.includes('TicketWeb'));
    });

    test('static dated HTML yields html_only', async () => {
      const mockHtml = `<html><body>
        <div class="event-container schedulebox" data-start-date="2026-10-24" data-track="club" data-series="standup">
          <p class="event-title">Saturday All-Star Jam</p>
          <a href="https://testclub.com/tickets/24">Tickets</a>
        </div>
      </div></div></body></html>`;

      const mockFetch = async (url) => {
        if (url.endsWith('robots.txt')) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
        return { ok: true, status: 200, text: async () => mockHtml };
      };

      const venue = {
        slug: 'html-club',
        name: 'HTML Comedy Lounge',
        website: 'https://testclub.com'
      };

      const result = await probeVenueSchedule(venue, { fetchFn: mockFetch });
      assert.equal(result.finalClassification, 'html_only');
      assert.equal(result.exactEventCount, 1);
      assert.ok(result.sampleEvent);
      assert.equal(result.sampleEvent.title, 'Saturday All-Star Jam');
    });

    test('client-rendered SPA with no events yields client_rendered_unresolved', async () => {
      const mockHtml = `<!DOCTYPE html><html><head><title>Punchline Atlanta</title></head>
      <body><div id="root"></div><script src="/static/bundle.js"></script></body></html>`;

      const mockFetch = async (url) => {
        if (url.endsWith('robots.txt')) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
        return { ok: true, status: 200, text: async () => mockHtml };
      };

      const venue = {
        slug: 'punchline-atlanta',
        name: 'The Punchline Comedy Club',
        website: 'https://punchline.com'
      };

      const result = await probeVenueSchedule(venue, { fetchFn: mockFetch });
      assert.equal(result.finalClassification, 'client_rendered_unresolved');
      assert.equal(result.exactEventCount, 0);
      assert.ok(result.blockerOrParserError.includes('Client-side'));
    });

    test('Cloudflare WAF HTTP 403 yields blocked_waf', async () => {
      const mockFetch = async (url) => {
        if (url.endsWith('robots.txt')) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
        return { ok: false, status: 403, text: async () => 'Cloudflare 403 Forbidden' };
      };

      const venue = {
        slug: 'waf-club',
        name: 'WAF Protected Comedy Cellar',
        website: 'https://comedycellar.com'
      };

      const result = await probeVenueSchedule(venue, { fetchFn: mockFetch });
      assert.equal(result.finalClassification, 'blocked_waf');
      assert.ok(result.blockerOrParserError.includes('403'));
    });

    test('robots.txt disallowing path yields blocked_robots', async () => {
      const mockFetch = async (url) => {
        if (url.endsWith('robots.txt')) {
          return { ok: true, status: 200, text: async () => 'User-agent: *\nDisallow: /calendar' };
        }
        return { ok: true, status: 200, text: async () => '<html><body>OK</body></html>' };
      };

      const venue = {
        slug: 'blocked-club',
        name: 'Robots Disallowed Club',
        website: 'https://blockedclub.com',
        calendarFeedUrl: 'https://blockedclub.com/calendar'
      };

      const result = await probeVenueSchedule(venue, { fetchFn: mockFetch });
      assert.equal(result.finalClassification, 'blocked_robots');
      assert.equal(result.robotsDecision, 'disallowed');
    });

    test('strictly read-only with zero writes to canonical storage', async () => {
      const beforeCount = defaultCanonicalStorage.eventsMap.size;
      const mockHtml = `<html><head><script type="application/ld+json">{"@type":"Event","name":"Show","startDate":"2026-10-24"}</script></head></html>`;
      const mockFetch = async () => ({ ok: true, status: 200, text: async () => mockHtml });

      await probeVenueSchedule({ slug: 'read-only', name: 'Club', website: 'https://club.com' }, { fetchFn: mockFetch });
      const afterCount = defaultCanonicalStorage.eventsMap.size;
      assert.equal(afterCount, beforeCount, 'Zero canonical events must be written during probe');
    });
  });
});
