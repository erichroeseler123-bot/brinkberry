// test/scheduled-discovery-cycle.test.mjs
// Test Suite for Scheduled Operation of Recursive Discovery Loop

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  runScheduledDiscoveryCycle,
  getDefaultTouringArtistSchedules,
  RecursiveDiscoveryEngine
} = require('../lib/comedy/traversal-engine.js');
const { VenueIntakeQueue, QUEUE_STATES } = require('../lib/ingestion/venue-intake-queue.js');
const { getPromotedComedyVenues, PROMOTED_VENUE_SLUGS } = require('../lib/comedy/national-registry.js');
const { CONFIRMATION_STATUSES } = require('../lib/network/schema.js');
const cronIngestHandler = require('../api/cron-ingest.js');
const feedHandler = require('../api/feed.js');

function createMockReqRes({ method = 'GET', url = '/', headers = {} } = {}) {
  const req = {
    method,
    url,
    headers: { host: 'brinkberry.local', ...headers },
    query: {}
  };

  let statusCode = 200;
  let responseHeaders = {};
  let body = '';

  const res = {
    get statusCode() { return statusCode; },
    set statusCode(code) { statusCode = code; },
    setHeader(name, val) { responseHeaders[name.toLowerCase()] = String(val); return this; },
    getHeader(name) { return responseHeaders[name.toLowerCase()]; },
    write(chunk) { body += (chunk != null ? chunk.toString() : ''); return true; },
    end(chunk) { if (chunk != null) body += chunk.toString(); return this; },
    status(code) { statusCode = code; return this; },
    json(data) {
      responseHeaders['content-type'] = 'application/json; charset=utf-8';
      body = JSON.stringify(data);
      return this;
    },
    send(data) {
      if (typeof data === 'object') return this.json(data);
      body = String(data);
      return this;
    }
  };

  return { req, res, getBody: () => body, getStatus: () => statusCode, getJson: () => JSON.parse(body) };
}

describe('Scheduled Recursive Discovery Operation Suite', () => {
  let tempQueueFile;
  let queue;

  beforeEach(() => {
    tempQueueFile = path.join(os.tmpdir(), `test_sched_rec_queue_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    queue = new VenueIntakeQueue(tempQueueFile);
  });

  // -------------------------------------------------------------------------
  // 1. Scheduled Traversal Execution
  // -------------------------------------------------------------------------
  describe('1. Scheduled Discovery Cycle Execution', () => {
    it('executes scheduled discovery cycle: extracts artists, checks dual source, and enqueues clean candidates', async () => {
      const seedVenues = [
        {
          slug: 'cap-city-comedy-club',
          name: 'Cap City Comedy Club',
          city: 'Austin',
          state: 'TX'
        }
      ];

      const seedShows = [
        {
          id: 'show_cap_city_shane',
          title: 'Shane Gillis',
          performer: 'Shane Gillis',
          venue_name: 'Cap City Comedy Club',
          city: 'Austin',
          state: 'TX',
          civilDate: '2026-10-09',
          civilTime: '20:00',
          ticket_url: 'https://www.capcitycomedy.com/shows/shane-gillis',
          canonical_url: 'https://www.capcitycomedy.com/shows/shane-gillis',
          confirmationStatus: 'confirmed_by_official_calendar'
        }
      ];

      const artistSchedules = [
        {
          name: 'Shane Gillis',
          website: 'https://shanemgillis.com',
          tourUrl: 'https://shanemgillis.com/live',
          sourceType: 'official_artist',
          tourDates: [
            {
              performer: 'Shane Gillis',
              venueName: 'Cap City Comedy Club',
              city: 'Austin',
              state: 'TX',
              localDate: '2026-10-09',
              localTime: '20:00',
              ticketUrl: 'https://www.capcitycomedy.com/shows/shane-gillis',
              sourceUrl: 'https://shanemgillis.com/live'
            },
            // Net-new discovery: Blue Room Comedy Club
            {
              performer: 'Shane Gillis',
              venueName: 'Blue Room Comedy Club',
              city: 'Springfield',
              state: 'MO',
              localDate: '2026-11-06',
              localTime: '20:00',
              ticketUrl: 'https://blueroomcomedyclub.com/events/shane-gillis',
              sourceUrl: 'https://shanemgillis.com/live'
            }
          ]
        }
      ];

      const mockFetch = async (url) => {
        const u = String(url);
        if (u.includes('blueroomcomedyclub')) {
          return {
            ok: true,
            status: 200,
            text: async () => `<html><head><script type="application/ld+json">
              {"@context":"https://schema.org","@type":"ComedyEvent","name":"Shane Gillis Live","startDate":"2026-11-06T20:00:00"}
            </script></head><body><h1>Blue Room Comedy Club</h1></body></html>`
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () => '<html><body>Schedule</body></html>'
        };
      };

      const report = await runScheduledDiscoveryCycle({
        seedVenues,
        seedShows,
        knownArtistSchedules: artistSchedules,
        queue,
        fetchFn: mockFetch,
        rateLimitMs: 10
      });

      assert.equal(report.success, true);
      assert.equal(report.seedVenuesCount, 1);
      assert.equal(report.extractedComediansCount, 1);
      assert.equal(report.dualConfirmedShowsCount, 1);
      assert.equal(report.newVenuesDiscoveredCount, 1);

      // Verify clean candidate is queued for admin review
      assert.equal(report.reviewQueue.readyForAdminReviewCount, 1);
      const readyCandidate = report.reviewQueue.readyForAdminReview[0];
      assert.equal(readyCandidate.name, 'Blue Room Comedy Club');
      assert.equal(readyCandidate.status, QUEUE_STATES.PARSED_SUCCESSFULLY);
      assert.ok(readyCandidate.evidenceHash);
      assert.equal(readyCandidate.evidenceHash.length, 64);

      // Verify discovered comedy shows aggregation
      assert.equal(report.totalDiscoveredShowsCount, 1, 'Must report exact discovered comedy shows count');
      assert.equal(report.discoveredShows.length, 1);
      assert.equal(report.discoveredShows[0].venueName, 'Blue Room Comedy Club');
      assert.equal(report.discoveredArtistsCount, 1);
      assert.ok(report.discoveredArtists.includes('Shane Gillis Live'));

      // Strict Invariants
      assert.equal(report.invariants.autoPromotionsToLive, 0);
      assert.equal(report.invariants.publicFeedLeakage, 0);
      assert.equal(report.invariants.productionWrites, 0);
      assert.equal(report.invariants.zeroSyntheticEvents, true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Truthful Perimeter Block Recording in Scheduled Operation
  // -------------------------------------------------------------------------
  describe('2. Perimeter Block Recording', () => {
    it('truthfully records Cloudflare WAF 403 as blocked_or_unsupported without breaking scheduled loop', async () => {
      const seedVenues = [{ slug: 'seed_club', name: 'Seed Club', city: 'Denver' }];
      const seedShows = [{ id: 's1', performer: 'Headliner A', venue_name: 'Seed Club', city: 'Denver', civilDate: '2026-10-10', civilTime: '20:00' }];
      const artistSchedules = [
        {
          name: 'Headliner A',
          tourDates: [
            { performer: 'Headliner A', venueName: 'WAF Protected Lounge', city: 'Seattle', state: 'WA', localDate: '2026-11-12', localTime: '20:00', ticketUrl: 'https://wafclub.com' }
          ]
        }
      ];

      const mockWafFetch = async () => ({
        ok: false,
        status: 403,
        text: async () => '<html><head><title>Attention Required! | Cloudflare</title></head></html>'
      });

      const report = await runScheduledDiscoveryCycle({
        seedVenues,
        seedShows,
        knownArtistSchedules: artistSchedules,
        queue,
        fetchFn: mockWafFetch,
        rateLimitMs: 10
      });

      assert.equal(report.success, true);
      assert.equal(report.newVenuesDiscoveredCount, 1);
      assert.equal(report.reviewQueue.blockedCount, 1);
      assert.equal(report.reviewQueue.readyForAdminReviewCount, 0);

      const record = queue.records.get('waf-protected-lounge-seattle');
      assert.ok(record);
      assert.equal(record.status, QUEUE_STATES.BLOCKED_OR_UNSUPPORTED);
      assert.equal(record.failureReason, 'blocked_waf');
      assert.ok(record.blockReason.includes('WAF'));
    });
  });

  // -------------------------------------------------------------------------
  // 3. Strict Feed Isolation Guarantee
  // -------------------------------------------------------------------------
  describe('3. Strict Feed Isolation for Discovered Candidates', () => {
    it('PROVES that candidate venues discovered in scheduled operation NEVER appear in /api/feed', async () => {
      const discoveredCandidate = 'Springfield Unapproved Club';

      // Insert discovered candidate into queue in parsed_successfully state
      await queue.intakeVenue({
        name: discoveredCandidate,
        city: 'Springfield',
        state: 'MO',
        scheduleUrl: 'https://springfieldclub.com/schedule'
      }, { probe: false });

      // Confirm candidate exists in intake queue
      const summary = queue.getQueueSummary();
      const inQueue = summary.venues.some(v => v.name === discoveredCandidate);
      assert.equal(inQueue, true);

      // Query public feed for Springfield area
      const feedReq = createMockReqRes({
        method: 'GET',
        url: '/api/feed?lat=37.2089&lon=-93.2923&window=all&mode=comedy'
      });

      await feedHandler(feedReq.req, feedReq.res);
      assert.equal(feedReq.getStatus(), 200);
      const data = feedReq.getJson();

      const leaked = (data.events || []).filter(e =>
        (e.venue_name || e.venue || '').includes(discoveredCandidate)
      );
      assert.equal(leaked.length, 0, 'Unapproved candidates must NEVER appear in public feed');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Admin Review Flow & Official Event Publishing
  // -------------------------------------------------------------------------
  describe('4. Human Admin Review & Official Venue Publishing Boundary', () => {
    it('promotes candidate to live ONLY upon explicit admin review, creating official canonical events', async () => {
      // 1. Ingest clean candidate into queue
      const record = await queue.intakeVenue({
        name: 'Historic Comedy Loft',
        city: 'Portland',
        state: 'OR',
        lat: 45.5152,
        lon: -122.6784,
        scheduleUrl: 'https://comedyloft.com/events'
      }, { probe: false });

      // Mock parsed events
      record.status = QUEUE_STATES.PARSED_SUCCESSFULLY;
      record.evidenceHash = 'a'.repeat(64);
      record.parserResult = {
        eventsCount: 1,
        sampleEvents: [
          {
            title: 'Official Headliner Showcase',
            start_time: '2026-11-20T20:00:00Z',
            url: 'https://comedyloft.com/events/headliner-showcase',
            ticket_url: 'https://comedyloft.com/events/headliner-showcase'
          }
        ]
      };
      queue.save();

      // 2. Mock storage for review promotion
      const promotedEvents = [];
      const mockStorage = {
        upsertEvents: async (events) => {
          promotedEvents.push(...events);
        }
      };

      // 3. Admin review action
      const reviewed = await queue.reviewVenue(record.venueSlug, {
        decision: 'approve_live',
        actor: 'authorized_admin',
        notes: 'Official box-office schedule verified by admin'
      }, {
        canonicalStorage: mockStorage
      });

      assert.equal(reviewed.status, QUEUE_STATES.LIVE);
      assert.equal(promotedEvents.length, 1);
      assert.equal(promotedEvents[0].confirmationStatus, 'confirmed_by_official_calendar');
      assert.equal(promotedEvents[0].venue_name, 'Historic Comedy Loft');
      assert.equal(promotedEvents[0].sourceType, 'official_box_office');
      assert.equal(promotedEvents[0].sourceEvidence.approvedBy, 'authorized_admin');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Cron Endpoint Integration
  // -------------------------------------------------------------------------
  describe('5. Cron Ingestion Endpoint Integration', () => {
    it('executes scheduled discovery cycle via /api/cron-ingest?source=discovery_cycle with valid auth', async () => {
      process.env.ADMIN_TOKEN = 'test_secret_admin_token';

      const cronReq = createMockReqRes({
        method: 'GET',
        url: '/api/cron-ingest?source=discovery_cycle&probe=false',
        headers: {
          authorization: 'Bearer test_secret_admin_token'
        }
      });

      await cronIngestHandler(cronReq.req, cronReq.res);
      assert.equal(cronReq.getStatus(), 200);

      const json = cronReq.getJson();
      assert.equal(json.success, true);
      assert.equal(json.type, 'scheduled_discovery_cycle');
      assert.ok(json.timestamp);
      assert.ok(json.reviewQueue);
      assert.equal(json.invariants.autoPromotionsToLive, 0);
      assert.equal(json.invariants.publicFeedLeakage, 0);
      assert.equal(json.invariants.productionWrites, 0);
    });

    it('rejects unauthorized access to discovery_cycle with 401', async () => {
      const cronReq = createMockReqRes({
        method: 'GET',
        url: '/api/cron-ingest?source=discovery_cycle',
        headers: {
          authorization: 'Bearer invalid_token'
        }
      });

      await cronIngestHandler(cronReq.req, cronReq.res);
      assert.equal(cronReq.getStatus(), 401);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Production Baseline Invariant
  // -------------------------------------------------------------------------
  describe('6. Production Baseline Invariant Preservation', () => {
    it('verifies the 23-club production baseline remains strictly frozen', () => {
      const promoted = getPromotedComedyVenues();
      assert.equal(promoted.length, 23, 'Must have exactly 23 promoted production venues');
      assert.equal(PROMOTED_VENUE_SLUGS.length, 23);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Idempotency Across Consecutive Runs (Pass 1 vs Pass 2)
  // -------------------------------------------------------------------------
  describe('7. Discovery Cycle Idempotency Across Consecutive Runs', () => {
    it('proves zero duplicate candidate intake and identical state across two consecutive runs', async () => {
      const seedVenues = [{ slug: 'cap-city', name: 'Cap City Comedy Club', city: 'Austin' }];
      const seedShows = [{ id: 's1', performer: 'Shane Gillis', venue_name: 'Cap City Comedy Club', city: 'Austin', civilDate: '2026-10-09', civilTime: '20:00' }];
      const artistSchedules = [
        {
          name: 'Shane Gillis',
          tourDates: [
            { performer: 'Shane Gillis', venueName: 'Cap City Comedy Club', city: 'Austin', localDate: '2026-10-09', localTime: '20:00', ticketUrl: 'https://capcity.com' },
            { performer: 'Shane Gillis', venueName: 'Blue Room Comedy Club', city: 'Springfield', state: 'MO', localDate: '2026-11-06', localTime: '20:00', ticketUrl: 'https://blueroom.com' }
          ]
        }
      ];

      // Pass 1
      const rep1 = await runScheduledDiscoveryCycle({
        seedVenues,
        seedShows,
        knownArtistSchedules: artistSchedules,
        queue,
        probeVenues: false
      });

      const summary1 = queue.getQueueSummary();
      const count1 = summary1.total;

      // Pass 2
      const rep2 = await runScheduledDiscoveryCycle({
        seedVenues,
        seedShows,
        knownArtistSchedules: artistSchedules,
        queue,
        probeVenues: false
      });

      const summary2 = queue.getQueueSummary();
      const count2 = summary2.total;

      assert.equal(count1, count2, 'Candidate queue total must not grow on re-run (zero duplicates)');
      assert.equal(rep2.alreadyKnownCandidatesCount, 1, 'Discovered candidate on pass 2 is recognized as already known');
      assert.equal(rep2.newVenuesDiscoveredCount, 0, 'Zero new duplicate venues discovered on pass 2');
      assert.equal(rep2.invariants.autoPromotionsToLive, 0);
      assert.equal(rep2.invariants.publicFeedLeakage, 0);
      assert.equal(rep2.invariants.productionWrites, 0);
    });
  });
});
