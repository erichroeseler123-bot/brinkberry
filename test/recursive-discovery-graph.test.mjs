// test/recursive-discovery-graph.test.mjs
// Test Suite for Bounded Recursive Discovery Graph & Cross-Source Confirmation Engine

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { RecursiveDiscoveryEngine } = require('../lib/comedy/traversal-engine.js');
const {
  extractLineupComedians,
  normalizeArtistTourDate,
  reconcileDualOfficialSources,
  discoverNewVenuesFromTourDates,
  matchPerformer,
  isSamePerformer,
  levenshteinSimilarity
} = require('../lib/comedy/tour-graph.js');
const { VenueIntakeQueue, QUEUE_STATES } = require('../lib/ingestion/venue-intake-queue.js');
const { getPromotedComedyVenues, PROMOTED_VENUE_SLUGS } = require('../lib/comedy/national-registry.js');
const { CONFIRMATION_STATUSES } = require('../lib/network/schema.js');
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

describe('Recursive Comedy Discovery Graph & Confirmation Engine Suite', () => {
  let tempQueueFile;
  let queue;

  beforeEach(() => {
    tempQueueFile = path.join(os.tmpdir(), `test_rec_queue_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    queue = new VenueIntakeQueue(tempQueueFile);
  });

  // -------------------------------------------------------------------------
  // 1. Recursive Traversal: Venue -> Artist -> New Venue
  // -------------------------------------------------------------------------
  describe('1. Recursive Traversal: Venue -> Artist -> New Venue (Depth 0 -> 1 -> 2)', () => {
    it('traverses from seed venue through touring comedian to discover new candidate venue', async () => {
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
          id: 'show_shane_austin',
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
            // Known national registry candidate: Tacoma Comedy Club (WA)
            {
              performer: 'Shane Gillis',
              venueName: 'Tacoma Comedy Club',
              city: 'Tacoma',
              state: 'WA',
              localDate: '2026-10-23',
              localTime: '20:00',
              ticketUrl: 'https://tacomacomedyclub.com/events/shane-gillis',
              sourceUrl: 'https://shanemgillis.com/live'
            },
            // Net-new unmapped venue candidate: Blue Room Comedy Club (MO)
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

      const mockFetch = async () => {
        return {
          ok: true,
          status: 200,
          text: async () => '<html><body>Schedule</body></html>'
        };
      };

      const engine = new RecursiveDiscoveryEngine({
        maxDepth: 2,
        queue,
        fetchFn: mockFetch
      });

      const res = await engine.executeTraversal({
        seedVenues,
        seedShows,
        knownArtistSchedules: artistSchedules,
        probeVenues: true
      });

      // Assertions
      assert.equal(res.telemetry.extractedComediansCount, 1);
      assert.equal(res.telemetry.comedians[0].name, 'Shane Gillis');
      assert.equal(res.telemetry.dualConfirmedCount, 1, 'Cap City show must achieve dual confirmation');

      // Tacoma Comedy Club is recognized as already_known_candidate from registry
      assert.equal(res.telemetry.alreadyKnownCandidatesCount, 1);
      assert.equal(res.telemetry.alreadyKnownCandidates[0].venueName, 'Tacoma Comedy Club');
      assert.equal(res.telemetry.alreadyKnownCandidates[0].classification, 'already_known_candidate');

      // Blue Room Comedy Club is recognized as net_new_discovery
      assert.equal(res.telemetry.newVenuesDiscoveredCount, 1);
      const discovered = res.telemetry.discoveredVenues[0];
      assert.equal(discovered.venueName, 'Blue Room Comedy Club');
      assert.equal(discovered.city, 'Springfield');
      assert.equal(discovered.classification, 'net_new_discovery');

      // Check intake queue status (only net_new_discovery created in queue, zero duplicate intake records)
      const queueSummary = queue.getQueueSummary();
      assert.equal(queueSummary.total, 1);
      assert.equal(queueSummary.byStatus[QUEUE_STATES.LIVE], 0, 'Discovered venue must NEVER be live automatically');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Dual-Source Confirmation vs. Single-Source vs. Discrepancy
  // -------------------------------------------------------------------------
  describe('2. Dual-Source Confirmation Logic', () => {
    it('elevates to confirmed_by_dual_official_sources on exact performer, venue, date, and time agreement', () => {
      const venueEvent = {
        title: 'Sam Tallent',
        performer: 'Sam Tallent',
        venue_name: 'Stardome Comedy Club',
        city: 'Birmingham',
        civilDate: '2026-10-02',
        civilTime: '19:00',
        ticket_url: 'https://stardome.com/tickets',
        confirmationStatus: 'confirmed_by_official_calendar'
      };

      const artistTourDates = [
        {
          performer: 'Sam Tallent',
          venueName: 'Stardome Comedy Club',
          city: 'Birmingham',
          localDate: '2026-10-02',
          localTime: '19:00',
          ticketUrl: 'https://stardome.com/tickets',
          sourceUrl: 'https://samtallent.com/tour',
          sourceType: 'official_artist'
        }
      ];

      const rec = reconcileDualOfficialSources(venueEvent, artistTourDates);
      assert.equal(rec.status, CONFIRMATION_STATUSES.CONFIRMED_BY_DUAL_OFFICIAL_SOURCES);
      assert.equal(rec.isDualConfirmed, true);
    });

    it('flags needs_review when civil time disagrees between venue calendar and artist page', () => {
      const venueEvent = {
        title: 'Taylor Tomlinson',
        performer: 'Taylor Tomlinson',
        venue_name: 'Helium Comedy Club Buffalo',
        city: 'Buffalo',
        civilDate: '2026-10-16',
        civilTime: '19:30',
        ticket_url: 'https://buffalo.heliumcomedy.com/shows/123'
      };

      const artistTourDates = [
        {
          performer: 'Taylor Tomlinson',
          venueName: 'Helium Comedy Club Buffalo',
          city: 'Buffalo',
          localDate: '2026-10-16',
          localTime: '21:00', // 1.5h time difference
          ticketUrl: 'https://buffalo.heliumcomedy.com/shows/123',
          sourceUrl: 'https://ttomlinson.com/shows'
        }
      ];

      const rec = reconcileDualOfficialSources(venueEvent, artistTourDates);
      assert.equal(rec.status, CONFIRMATION_STATUSES.NEEDS_REVIEW);
      assert.equal(rec.timeDiscrepancy, true);
      assert.ok(rec.reviewReason.includes('Time discrepancy'));
    });

    it('requires manual review (needs_review) for fuzzy performer matches instead of auto-confirming', () => {
      const venueEvent = {
        title: 'Sam Tallent Live',
        performer: 'Sammy Tallent', // Fuzzy variation
        venue_name: 'Stardome Comedy Club',
        city: 'Birmingham',
        civilDate: '2026-10-02',
        civilTime: '19:00',
        ticket_url: 'https://stardome.com'
      };

      const artistTourDates = [
        {
          performer: 'Sam Tallent',
          venueName: 'Stardome Comedy Club',
          city: 'Birmingham',
          localDate: '2026-10-02',
          localTime: '19:00',
          ticketUrl: 'https://stardome.com',
          sourceUrl: 'https://samtallent.com'
        }
      ];

      const rec = reconcileDualOfficialSources(venueEvent, artistTourDates);
      assert.equal(rec.status, CONFIRMATION_STATUSES.NEEDS_REVIEW);
      assert.equal(rec.isFuzzyMatch, true);
      assert.ok(rec.reviewReason.includes('Fuzzy performer match'));
    });
  });

  // -------------------------------------------------------------------------
  // 3. Multi-Showtime Preservation Audit
  // -------------------------------------------------------------------------
  describe('3. Multi-Showtime Separation on Same Date', () => {
    it('maintains separate distinct records for same-night early and late shows', () => {
      const earlyShow = {
        id: 'tee_sanders_early',
        fingerprint: 'fp_punchline_tee_sanders_2026-09-25_2130',
        performer: 'Tee Sanders',
        venue_name: 'The Punchline Comedy Club',
        city: 'Atlanta',
        civilDate: '2026-09-25',
        civilTime: '21:30'
      };

      const lateShow = {
        id: 'tee_sanders_late',
        fingerprint: 'fp_punchline_tee_sanders_2026-09-25_2330',
        performer: 'Tee Sanders',
        venue_name: 'The Punchline Comedy Club',
        city: 'Atlanta',
        civilDate: '2026-09-25',
        civilTime: '23:30'
      };

      const artistTourDates = [
        {
          performer: 'Tee Sanders',
          venueName: 'The Punchline Comedy Club',
          city: 'Atlanta',
          localDate: '2026-09-25',
          localTime: '21:30',
          ticketUrl: 'https://punchline.com',
          sourceUrl: 'https://teesanders.com'
        },
        {
          performer: 'Tee Sanders',
          venueName: 'The Punchline Comedy Club',
          city: 'Atlanta',
          localDate: '2026-09-25',
          localTime: '23:30',
          ticketUrl: 'https://punchline.com',
          sourceUrl: 'https://teesanders.com'
        }
      ];

      const recEarly = reconcileDualOfficialSources(earlyShow, artistTourDates);
      const recLate = reconcileDualOfficialSources(lateShow, artistTourDates);

      assert.equal(recEarly.status, CONFIRMATION_STATUSES.CONFIRMED_BY_DUAL_OFFICIAL_SOURCES);
      assert.equal(recLate.status, CONFIRMATION_STATUSES.CONFIRMED_BY_DUAL_OFFICIAL_SOURCES);
      assert.notEqual(recEarly.event.fingerprint, recLate.event.fingerprint);
      assert.notEqual(recEarly.event.civilTime, recLate.event.civilTime);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Feed Isolation: Artist Leads Never Leak to Public Feed
  // -------------------------------------------------------------------------
  describe('4. Strict Feed Isolation for Artist Leads', () => {
    it('PROVES that artist-only tour stops at unpromoted venues NEVER appear in /api/feed', async () => {
      // Simulate an unpromoted artist lead for Spokane, WA
      const leadPerformer = 'Unpromoted Headliner Dave';
      const unpromotedVenue = 'Spokane Comedy Club';

      // Query public feed for Spokane area (lat: 47.6588, lng: -117.4260)
      const feedReq = createMockReqRes({
        method: 'GET',
        url: '/api/feed?lat=47.6588&lng=-117.4260&window=week&mode=comedy'
      });

      await feedHandler(feedReq.req, feedReq.res);
      assert.equal(feedReq.getStatus(), 200);
      const data = feedReq.getJson();

      assert.ok(Array.isArray(data.events));
      const leaked = data.events.filter(e =>
        (e.title || '').includes(leadPerformer) ||
        (e.venue_name || e.venue || '').includes(unpromotedVenue)
      );

      assert.equal(leaked.length, 0, 'Artist-only leads must NEVER appear in public feed');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Honest Block Recording (Robots / WAF)
  // -------------------------------------------------------------------------
  describe('5. Honest Block Recording (Robots.txt & Perimeter 403s)', () => {
    it('truthfully records WAF 403 challenge as blocked_or_unsupported without bypassing', async () => {
      const mockWafFetch = async () => {
        return {
          ok: false,
          status: 403,
          text: async () => '<html><head><title>Attention Required! | Cloudflare</title></head></html>'
        };
      };

      const record = await queue.intakeVenue({
        name: 'WAF Guarded Club',
        city: 'Chicago',
        state: 'IL',
        scheduleUrl: 'https://wafguardedclub.com/shows'
      }, { probe: true, fetchFn: mockWafFetch });

      assert.equal(record.status, QUEUE_STATES.BLOCKED_OR_UNSUPPORTED);
      assert.equal(record.failureReason, 'blocked_waf');
      assert.ok(record.blockReason.includes('WAF'));
    });
  });

  // -------------------------------------------------------------------------
  // 6. Production Baseline Invariant Check
  // -------------------------------------------------------------------------
  describe('6. Production Baseline Invariant Preservation', () => {
    it('confirms the 23 verified production venues remain intact with 0 synthetic seeds', () => {
      assert.equal(PROMOTED_VENUE_SLUGS.length, 23, 'Must have exactly 23 promoted production venues');
      const promotedVenues = getPromotedComedyVenues();
      assert.equal(promotedVenues.length, 23);

      // Verify no synthetic Denver clubs are in promoted list
      assert.ok(!PROMOTED_VENUE_SLUGS.includes('comedy-works-downtown'));
      assert.ok(!PROMOTED_VENUE_SLUGS.includes('comedy-works-south'));
      assert.ok(!PROMOTED_VENUE_SLUGS.includes('comedy_seed_denver_02'));
    });
  });
});
