import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  ingestSeatEngineVenue,
  getCivilDateTime,
  cleanHtmlText,
  slugify
} = require('../lib/ingestion/adapters/seatengine.js');
const {
  classifyVenueSource,
  detectFeedFromHtml
} = require('../lib/ingestion/feed-detector.js');
const {
  runDiscoveryBatch,
  evaluateAutoPromotionCriteria,
  getJobQueueTelemetry,
  DENVER_QUARANTINE_SLUGS
} = require('../lib/ingestion/discovery-pipeline.js');
const {
  NATIONAL_COMEDY_VENUES,
  getNationalComedyVenues,
  getComedyVenueBySlug
} = require('../lib/comedy/national-registry.js');
const {
  discoverNewVenuesFromTourDates
} = require('../lib/comedy/tour-graph.js');

test('Autonomous Repeatable Discovery & Platform Ingestion Suite', async (t) => {

  await t.test('1. Reusable SeatEngine Adapter & Configuration Ingestion', async () => {
    const mockVenue = {
      slug: 'test-seatengine-club',
      name: 'Test SeatEngine Club',
      address: '100 Test St, Minneapolis, MN 55401',
      city: 'Minneapolis',
      state: 'MN',
      timezone: 'America/Chicago',
      lat: 44.9877,
      lon: -93.2721,
      website: 'https://testclub.com',
      feedUrl: 'https://testclub.seatengine.com/events/',
      priceDisplay: '$22'
    };

    const mockHtml = `
      <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "ComedyEvent",
            "name": "Headliner Showcase",
            "startDate": "2026-10-15T20:00:00-05:00",
            "endDate": "2026-10-15T21:45:00-05:00",
            "url": "https://testclub.seatengine.com/shows/999111",
            "location": {
              "@type": "Place",
              "name": "Test SeatEngine Club",
              "address": "100 Test St, Minneapolis, MN 55401"
            },
            "offers": {
              "@type": "Offer",
              "price": "22.00",
              "priceCurrency": "USD",
              "url": "https://testclub.seatengine.com/shows/999111"
            }
          }
          </script>
        </head>
        <body>Test Club Events</body>
      </html>
    `;

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => mockHtml
    });

    const rep = await ingestSeatEngineVenue(mockVenue, { fetchFn: mockFetch, persist: false });
    assert.equal(rep.venue.name, 'Test SeatEngine Club');
    assert.equal(rep.count, 1);
    assert.equal(rep.events.length, 1);

    const ev = rep.events[0];
    assert.equal(ev.title, 'Headliner Showcase');
    assert.equal(ev.civilDate, '2026-10-15');
    assert.equal(ev.civilTime, '20:00');
    assert.equal(ev.timezone, 'America/Chicago');
    assert.equal(ev.confirmationStatus, 'confirmed_by_official_calendar');
    assert.equal(ev.ticket_url, 'https://testclub.seatengine.com/shows/999111');
    assert.ok(ev.sourceEvidence.contentHash.length === 64);
  });

  await t.test('2. Strict Auto-Promotion Criteria Gates', () => {
    const validEvent = {
      id: 'test_ev_1',
      title: 'Valid Standup Show',
      civilDate: '2026-10-20',
      civilTime: '20:00',
      venue_slug: 'acme-comedy-company-minneapolis',
      venue_name: 'Acme Comedy Company',
      venue_latitude: 44.9877,
      venue_longitude: -93.2721,
      ticket_url: 'https://acmecomedy.seatengine.com/shows/12345',
      isCancelled: false,
      confirmationStatus: 'confirmed_by_official_calendar',
      sourceEvidence: {
        contentHash: 'a'.repeat(64),
        exactConfirmationFields: { date: true, title: true, venue: true }
      }
    };

    const validEval = evaluateAutoPromotionCriteria(validEvent);
    assert.equal(validEval.isPromotable, true);
    assert.equal(validEval.reasons.length, 0);

    // Test rejection on missing civil time
    const invalidTime = { ...validEvent, civilTime: null };
    assert.equal(evaluateAutoPromotionCriteria(invalidTime).isPromotable, false);

    // Test rejection on missing coordinates
    const invalidCoords = { ...validEvent, venue_latitude: null };
    assert.equal(evaluateAutoPromotionCriteria(invalidCoords).isPromotable, false);

    // Test rejection on cancelled status
    const cancelled = { ...validEvent, isCancelled: true };
    assert.equal(evaluateAutoPromotionCriteria(cancelled).isPromotable, false);

    // Test rejection on synthetic recurring date text without exact date evidence
    const synthetic = {
      ...validEvent,
      title: 'Open Mic Every Tuesday',
      sourceEvidence: { contentHash: 'a'.repeat(64), exactConfirmationFields: {} }
    };
    assert.equal(evaluateAutoPromotionCriteria(synthetic).isPromotable, false);
  });

  await t.test('3. National Registry Scale (80-100 Venues) & Platform Breakdown', () => {
    const venues = getNationalComedyVenues();
    assert.ok(venues.length >= 80, `Expected at least 80 national venues, found ${venues.length}`);

    const platforms = {};
    for (const v of venues) {
      assert.ok(v.slug && v.name && v.city && v.state, 'Venue missing basic info');
      assert.ok(Number.isFinite(v.lat) && Number.isFinite(v.lon), 'Venue missing coordinates');
      assert.ok(v.timezone, 'Venue missing timezone');
      assert.ok(v.website, 'Venue missing website');
      platforms[v.ticketingEngine] = (platforms[v.ticketingEngine] || 0) + 1;
    }

    assert.ok(platforms.seatengine >= 20, 'Expected at least 20 SeatEngine venues in registry');
    assert.ok(platforms.eventbrite >= 10, 'Expected at least 10 Eventbrite venues in registry');
    assert.ok(platforms.ticketweb >= 10, 'Expected at least 10 TicketWeb venues in registry');
  });

  await t.test('4. Bounded Discovery Queue & Denver Quarantine Protection', async () => {
    assert.ok(DENVER_QUARANTINE_SLUGS.has('comedy-works-downtown'));
    assert.ok(DENVER_QUARANTINE_SLUGS.has('comedy-works-south'));

    const testVenues = [
      getComedyVenueBySlug('comedy-works-downtown'),
      getComedyVenueBySlug('comedy-works-south'),
      {
        slug: 'mock-seatengine-club',
        name: 'Mock SeatEngine Club',
        address: '500 Club St, Minneapolis, MN 55401',
        city: 'Minneapolis',
        state: 'MN',
        timezone: 'America/Chicago',
        lat: 44.9877,
        lon: -93.2721,
        website: 'https://mockclub.com',
        calendarFeedUrl: 'https://mockclub.seatengine.com/events/'
      }
    ].filter(Boolean);

    const mockHtml = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "ComedyEvent",
        "name": "Live Standup",
        "startDate": "2026-11-01T19:30:00-06:00",
        "url": "https://mockclub.seatengine.com/shows/777888",
        "offers": { "@type": "Offer", "price": "20.00", "url": "https://mockclub.seatengine.com/shows/777888" }
      }
      </script>
    `;

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => mockHtml
    });

    const report = await runDiscoveryBatch(testVenues, {
      batchSize: 5,
      fetchFn: mockFetch,
      persist: false
    });

    // Verify Comedy Works was skipped by Denver quarantine
    assert.equal(report.venues.some(v => v.slug === 'comedy-works-downtown'), false);
    assert.equal(report.venues.some(v => v.slug === 'comedy-works-south'), false);

    // Verify mock SeatEngine club was processed and auto-published
    const mockReport = report.venues.find(v => v.slug === 'mock-seatengine-club');
    assert.ok(mockReport);
    assert.equal(mockReport.status, 'succeeded');
    assert.equal(mockReport.published, 1);
  });

  await t.test('5. Two-Way Discovery Graph: New Venue Candidate Discovery', () => {
    const sampleTourDates = [
      {
        performer: 'Sam Tallent',
        venueName: 'The Secret Comedy Cellar',
        city: 'Des Moines',
        state: 'IA',
        localDate: '2026-11-12',
        sourceUrl: 'https://samtallent.com/tour'
      },
      {
        performer: 'Sam Tallent',
        venueName: 'Zanies Comedy Club Chicago', // Already in registry
        city: 'Chicago',
        state: 'IL',
        localDate: '2026-11-14',
        sourceUrl: 'https://samtallent.com/tour'
      }
    ];

    const candidates = discoverNewVenuesFromTourDates(sampleTourDates, NATIONAL_COMEDY_VENUES);
    assert.equal(candidates.length, 1, 'Only previously unknown venues should be discovered');
    assert.equal(candidates[0].venueName, 'The Secret Comedy Cellar');
    assert.equal(candidates[0].city, 'Des Moines');
    assert.equal(candidates[0].discoveredViaArtist, 'Sam Tallent');
    assert.equal(candidates[0].status, 'discovered_venue_candidate');
  });

});
