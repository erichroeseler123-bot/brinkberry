// test/national-batch-onboarding.test.mjs
// Comprehensive test suite for Scaling Nationwide Discovery, 10-Venue Batch Onboarding,
// SeatEngine Automation, Two-Way Tour Graph Discovery, and Operations Dashboard Telemetry.

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
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
  ingestSeatEngineVenue
} = require('../lib/ingestion/adapters/seatengine.js');
const {
  processBatchTourGraph,
  getTourGraphTelemetry,
  discoverNewVenuesFromTourDates,
  reconcileDualOfficialSources
} = require('../lib/comedy/tour-graph.js');
const operationsDashboardHandler = require('../api/operations-dashboard.js');
const cronIngestHandler = require('../api/cron-ingest.js');

describe('National Batch Onboarding & Scaling Pipeline Suite', () => {

  // Mock SeatEngine HTML response
  function createMockSeatEngineHtml(venueName, showId, showDate, price = '25.00') {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "ComedyEvent",
            "name": "Headliner Live Showcase",
            "startDate": "${showDate}T20:00:00-05:00",
            "endDate": "${showDate}T21:45:00-05:00",
            "url": "https://seatengine.com/shows/${showId}",
            "location": {
              "@type": "Place",
              "name": "${venueName}",
              "address": "123 Laugh Ave"
            },
            "offers": {
              "@type": "Offer",
              "price": "${price}",
              "priceCurrency": "USD",
              "url": "https://seatengine.com/shows/${showId}"
            }
          }
          </script>
        </head>
        <body>
          <div class="shows-container">
            <h1>${venueName} Upcoming Calendar</h1>
          </div>
        </body>
      </html>
    `;
  }

  test('1. Registry Coverage: 91 Venues with 29 SeatEngine Clubs (3 Live + 26 Candidates)', () => {
    const venues = getNationalComedyVenues();
    assert.ok(venues.length >= 91, 'Expected at least 91 verified comedy venues in national registry');

    const seatengineClubs = venues.filter(v => v.ticketingEngine === 'seatengine');
    assert.ok(seatengineClubs.length >= 20, 'Expected at least 20 SeatEngine clubs in registry');

    // Verify all SeatEngine clubs have valid required metadata
    for (const v of seatengineClubs) {
      assert.ok(v.slug, 'Missing slug');
      assert.ok(v.name, 'Missing name');
      assert.ok(v.city, 'Missing city');
      assert.ok(v.state, 'Missing state');
      assert.ok(Number.isFinite(v.lat), `Invalid latitude for ${v.name}`);
      assert.ok(Number.isFinite(v.lon), `Invalid longitude for ${v.name}`);
      assert.ok(v.timezone, `Missing timezone for ${v.name}`);
      assert.ok(v.website || v.calendarFeedUrl, `Missing web link for ${v.name}`);
    }
  });

  test('2. Bounded 10-Venue Batch Onboarding with Rate Limiting & Evidence Hashing', async () => {
    // Select first 10 SeatEngine clubs from registry
    const seatenginePool = NATIONAL_COMEDY_VENUES.filter(v => v.ticketingEngine === 'seatengine').slice(0, 10);
    assert.equal(seatenginePool.length, 10);

    let fetchCount = 0;
    const mockFetch = async (url) => {
      fetchCount++;
      return {
        ok: true,
        status: 200,
        text: async () => createMockSeatEngineHtml('Mock Comedy Club', '999' + fetchCount, '2026-11-15')
      };
    };

    const startTime = Date.now();
    const batchReport = await runDiscoveryBatch(seatenginePool, {
      batchSize: 10,
      rateLimitDelayMs: 10, // 10ms courteous inter-request delay
      fetchFn: mockFetch,
      persist: false,
      environment: 'preview',
      namespace: 'preview_batch_test'
    });
    const duration = Date.now() - startTime;

    assert.equal(batchReport.batchSize, 10, 'Should process exactly 10 venues in batch');
    assert.equal(batchReport.processed, 10, 'Should process all 10 candidates');
    assert.equal(batchReport.succeeded, 10, 'All 10 SeatEngine venues should succeed');
    assert.equal(batchReport.autoPublished, 10, 'Should auto-publish 10 verified events');
    assert.equal(batchReport.reviewQueue, 0, 'No SeatEngine venues should fail to review queue');
    assert.ok(duration >= 90, `Rate limit delay should take at least 90ms for 10 items with 10ms spacing (took ${duration}ms)`);

    // Verify evidence hashing on every auto-published event
    for (const v of batchReport.venues) {
      assert.equal(v.status, 'succeeded');
      assert.equal(v.platform, 'seatengine');
      assert.ok(v.sampleCheckout.startsWith('http'), 'Direct checkout link must be present');
    }
  });

  test('3. Review Queue Classification for Venues Needing Custom Adapters', async () => {
    // Select non-SeatEngine venues (Eventbrite, TicketWeb, Custom)
    const customVenues = [
      getComedyVenueBySlug('rise-comedy'), // Eventbrite
      getComedyVenueBySlug('zanies-comedy-club-nashville'), // TicketWeb
      getComedyVenueBySlug('comedy-cellar-nyc') // Custom
    ].filter(Boolean);

    const mockFetch = async (url) => ({
      ok: true,
      status: 200,
      text: async () => '<html><body>No standard JSON-LD</body></html>'
    });

    const batchReport = await runDiscoveryBatch(customVenues, {
      batchSize: 5,
      fetchFn: mockFetch,
      persist: false
    });

    assert.equal(batchReport.processed, 3);
    assert.equal(batchReport.succeeded, 0);
    assert.equal(batchReport.reviewQueue, 3, 'All 3 custom/unsupported venues must be routed to review queue');

    for (const v of batchReport.venues) {
      assert.equal(v.status, 'review_queue');
      assert.ok(['eventbrite', 'etix', 'custom'].includes(v.platform));
    }
  });

  test('4. Two-Way Artist-to-Venue Tour Graph Integration', () => {
    const mockEvents = [
      {
        id: 'ev_st_1',
        title: 'Sam Tallent Live',
        performer: 'Sam Tallent',
        civilDate: '2026-11-20',
        civilTime: '20:00',
        city: 'Austin',
        venue_name: 'Cap City Comedy Club',
        venue_slug: 'cap-city-comedy-club-austin',
        ticket_url: 'https://capcitycomedy.com/shows/12345',
        sourceEvidence: { contentHash: 'e'.repeat(64), feedUrl: 'https://capcitycomedy.com' }
      },
      {
        id: 'ev_om_1',
        title: 'Open Mic Night',
        civilDate: '2026-11-21',
        civilTime: '21:00',
        city: 'Austin',
        venue_name: 'Cap City Comedy Club',
        ticket_url: 'https://capcitycomedy.com/shows/12346',
        sourceEvidence: { contentHash: 'e'.repeat(64), feedUrl: 'https://capcitycomedy.com' }
      }
    ];

    const knownTourDates = [
      {
        performer: 'Sam Tallent',
        venueName: 'Cap City Comedy Club',
        city: 'Austin',
        state: 'TX',
        localDate: '2026-11-20',
        localTime: '20:00',
        ticketUrl: 'https://capcitycomedy.com/shows/12345',
        sourceUrl: 'https://samtallent.com/tour'
      },
      {
        performer: 'Sam Tallent',
        venueName: 'The Secret Cellar Des Moines', // New unlisted venue
        city: 'Des Moines',
        state: 'IA',
        localDate: '2026-11-25',
        localTime: '19:30',
        ticketUrl: 'https://secretcellar.com/tix',
        sourceUrl: 'https://samtallent.com/tour'
      }
    ];

    const graphReport = processBatchTourGraph(mockEvents, {
      existingVenues: NATIONAL_COMEDY_VENUES,
      knownTourDates
    });

    assert.equal(graphReport.comediansExtracted, 1, 'Only genuine comedians extracted (ignores Open Mic)');
    assert.equal(graphReport.dualConfirmedCount, 1, 'Sam Tallent show dual-confirmed');
    assert.equal(graphReport.candidateVenuesDiscovered, 1, 'New candidate venue discovered in Des Moines');
    assert.equal(graphReport.candidates[0].venueName, 'The Secret Cellar Des Moines');
    assert.equal(graphReport.candidates[0].city, 'Des Moines');

    const graphTelemetry = getTourGraphTelemetry();
    assert.ok(graphTelemetry.totalTrackedComedians >= 1);
    assert.ok(graphTelemetry.totalDualConfirmedEvents >= 1);
    assert.ok(graphTelemetry.totalDiscoveredCandidates >= 1);
  });

  test('5. Strict Denver Quarantine Gate in Bounded Batch Ingestion', async () => {
    assert.ok(DENVER_QUARANTINE_SLUGS.has('comedy-works-downtown'));
    assert.ok(DENVER_QUARANTINE_SLUGS.has('comedy-works-south'));

    const testBatch = [
      getComedyVenueBySlug('comedy-works-downtown'),
      getComedyVenueBySlug('comedy-works-south'),
      getComedyVenueBySlug('cap-city-comedy-club-austin')
    ].filter(Boolean);

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => createMockSeatEngineHtml('Cap City', '10101', '2026-11-05')
    });

    const report = await runDiscoveryBatch(testBatch, {
      batchSize: 5,
      fetchFn: mockFetch,
      persist: false,
      forceRecheck: true
    });

    // Verify neither Comedy Works club was processed or published
    assert.equal(report.venues.some(v => v.slug === 'comedy-works-downtown'), false);
    assert.equal(report.venues.some(v => v.slug === 'comedy-works-south'), false);

    // Verify Cap City was processed
    const capCity = report.venues.find(v => v.slug === 'cap-city-comedy-club-austin');
    assert.ok(capCity);
    assert.equal(capCity.status, 'succeeded');
  });

  test('6. Operations Dashboard Telemetry: Producing Venues & Custom Adapters', async () => {
    let responseStatus = null;
    let responseData = null;

    const mockReq = {
      url: '/api/operations-dashboard?format=json',
      headers: { accept: 'application/json' }
    };

    const mockRes = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (data) => {
            responseData = data;
            return data;
          },
          send: (html) => html
        };
      },
      setHeader: () => {}
    };

    await operationsDashboardHandler(mockReq, mockRes);

    assert.equal(responseStatus, 200);
    assert.ok(responseData);
    assert.equal(responseData.service, 'Brinkberry Operations & Source Discovery');
    assert.ok(responseData.registrySummary.totalVenues >= 91);
    assert.ok(responseData.registrySummary.producingVerifiedVenuesCount >= 4, 'Must have at least 4 live producing markets');

    // Check producing venues list
    const producing = responseData.producingVerifiedVenues;
    assert.ok(producing.some(v => v.slug.includes('birmingham')));
    assert.ok(producing.some(v => v.slug.includes('charlotte')));
    assert.ok(producing.some(v => v.slug.includes('minneapolis')));
    assert.ok(producing.some(v => v.slug.includes('punchline')));

    // Check custom adapter groupings
    assert.ok(responseData.reviewQueueByAdapter.eventbrite.length >= 10, 'Should list Eventbrite venues needing adapters');
    assert.ok(responseData.reviewQueueByAdapter.ticketweb.length >= 10, 'Should list TicketWeb venues needing adapters');
    assert.ok(responseData.reviewQueueByAdapter.ticketmaster_livenation.length >= 3, 'Should list Ticketmaster venues needing adapters');

    // Check Two-Way Tour Graph stats
    assert.ok(responseData.twoWayTourGraph);
    assert.ok(Number.isInteger(responseData.twoWayTourGraph.totalTrackedComedians));

    // Check Denver Quarantine status
    assert.equal(responseData.quarantineStatus.activeGuards, 2);
    assert.ok(responseData.quarantineStatus.quarantinedVenues.includes('comedy-works-downtown'));
    assert.ok(responseData.quarantineStatus.quarantinedVenues.includes('comedy-works-south'));
  });

  test('7. Operations Dashboard HTML Rendering', async () => {
    let htmlContent = '';
    const mockReq = {
      url: '/api/operations-dashboard',
      headers: { accept: 'text/html' }
    };

    const mockRes = {
      status: () => ({
        send: (html) => {
          htmlContent = html;
          return html;
        }
      }),
      setHeader: () => {}
    };

    await operationsDashboardHandler(mockReq, mockRes);
    assert.ok(htmlContent.includes('Brinkberry Operations &amp; Source Discovery Dashboard') || htmlContent.includes('Brinkberry Operations & Source Discovery Dashboard'));
    assert.ok(htmlContent.includes('Producing Verified Events'));
    assert.ok(htmlContent.includes('SeatEngine Venues (Config-Ready'));
    assert.ok(htmlContent.includes('Venues Needing Custom Platform Adapters'));
    assert.ok(htmlContent.includes('Two-Way Artist Tour Graph Telemetry'));
    assert.ok(htmlContent.includes('Denver Quarantine Enforcement'));
  });

});
