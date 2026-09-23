// test/comedy-tour-graph.test.mjs
// Test Suite for Two-Way Discovery Graph & Cross-Source Confirmation Engine
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import {
  normalizePerformerName,
  isSamePerformer,
  normalizeVenueName,
  isSameVenue,
  detectTicketingCorrelation,
  extractLineupComedians,
  normalizeArtistTourDate,
  reconcileDualOfficialSources,
  discoverNewVenuesFromTourDates
} from '../lib/comedy/tour-graph.js';
import { CONFIRMATION_STATUSES } from '../lib/network/schema.js';

const require = createRequire(import.meta.url);
const router = require('../api/router.js');

describe('Two-Way Discovery Graph & Cross-Source Confirmation Engine Suite', () => {

  describe('1. Name & Venue Normalization and Disambiguation', () => {
    test('normalizes performer names and disambiguates compound titles', () => {
      assert.equal(normalizePerformerName('Sam Tallent Live'), 'sam tallent');
      assert.equal(normalizePerformerName('Presents: John Mulaney in Concert'), 'john mulaney');
      assert.ok(isSamePerformer('Sam Tallent', 'Sam Tallent Live'));
      assert.ok(isSamePerformer('Tee Sanders', 'Tee Sanders with Special Guests'));
      assert.ok(!isSamePerformer('Sam Tallent', 'Sam Morril'));
    });

    test('normalizes venue names accurately across listing variations', () => {
      assert.ok(isSameVenue('The Punchline Comedy Club', 'Punchline Atlanta'));
      assert.ok(isSameVenue('Comedy Works Downtown', 'Comedy Works'));
      assert.ok(isSameVenue('Laughing Skull Lounge', 'The Laughing Skull'));
      assert.ok(!isSameVenue('Comedy Works', 'Comedy Cellar'));
    });
  });

  describe('2. Lineup Comedian Extraction from Venue Schedules', () => {
    test('extracts distinct touring comedians and ignores non-performer events', () => {
      const mockVenueEvents = [
        { title: 'Tee Sanders', performer: 'Tee Sanders', civilDate: '2026-09-24', city: 'Atlanta', venue_name: 'The Punchline' },
        { title: 'Tee Sanders', performer: 'Tee Sanders', civilDate: '2026-09-25', city: 'Atlanta', venue_name: 'The Punchline' },
        { title: 'Open Mic Night – Monday', performer: 'Open Mic Night', civilDate: '2026-09-21', city: 'Atlanta', venue_name: 'Laughing Skull' },
        { title: 'Stand-Up Comedy Class', performer: 'Stand-Up Comedy Class', civilDate: '2026-09-26', city: 'Atlanta', venue_name: 'Laughing Skull' },
        { title: 'Greg Fitzsimmons', performer: 'Greg Fitzsimmons', civilDate: '2026-10-01', city: 'Atlanta', venue_name: 'The Punchline' }
      ];

      const comedians = extractLineupComedians(mockVenueEvents);
      assert.equal(comedians.length, 2, 'Should extract exactly 2 comedians (Tee Sanders and Greg Fitzsimmons)');
      assert.equal(comedians[0].name, 'Tee Sanders');
      assert.equal(comedians[0].observedAtVenues.length, 2);
      assert.equal(comedians[1].name, 'Greg Fitzsimmons');
    });
  });

  describe('3. Ticketing Provider Correlation Detection', () => {
    test('detects shared ticketing provider and shared event IDs', () => {
      const url1 = 'https://www.eventbrite.com/e/sam-tallent-live-tickets-98765432101';
      const url2 = 'https://samtallent.com/tickets?event=https://eventbrite.com/e/special-night-98765432101';
      const result = detectTicketingCorrelation(url1, url2);

      assert.equal(result.correlated, true);
      assert.equal(result.provider, 'eventbrite');
      assert.equal(result.sharedId, '98765432101');
    });

    test('recognizes unshared or independent box office links as non-correlated', () => {
      const url1 = 'https://punchline.com/event/tee-sanders';
      const url2 = 'https://teesanderscomedy.com/tour';
      const result = detectTicketingCorrelation(url1, url2);

      assert.equal(result.correlated, false);
      assert.equal(result.provider, null);
    });
  });

  describe('4. Dual-Source Cross-Reconciliation & Confirmation Hierarchy', () => {
    const venueEvent = {
      id: 'event_sam_tallent_cw_20261017_1900',
      title: 'Sam Tallent',
      performer: 'Sam Tallent',
      venue_name: 'Comedy Works Downtown',
      venue_slug: 'comedy-works-downtown',
      city: 'Denver',
      state: 'CO',
      civilDate: '2026-10-17',
      civilTime: '19:00',
      start_time: '2026-10-17T19:00:00',
      ticket_url: 'https://comedyworks.com/shows/sam-tallent-oct-17',
      confirmationStatus: CONFIRMATION_STATUSES.CONFIRMED_BY_OFFICIAL_CALENDAR,
      sourceEvidence: {
        sourceUrl: 'https://comedyworks.com/calendar',
        feedType: 'official_venue_calendar',
        contentHash: '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
        fetchedAt: '2026-09-21T08:00:00Z'
      }
    };

    test('exact agreement on performer, venue, date, time, and city elevates to confirmed_by_dual_official_sources', () => {
      const artistTourDates = [
        normalizeArtistTourDate(
          { name: 'Sam Tallent', website: 'https://samtallent.com' },
          {
            venueName: 'Comedy Works Downtown',
            city: 'Denver',
            state: 'CO',
            localDate: '2026-10-17',
            localTime: '19:00',
            ticketUrl: 'https://comedyworks.com/shows/sam-tallent-oct-17',
            sourceUrl: 'https://samtallent.com/tour'
          }
        )
      ];

      const reconciliation = reconcileDualOfficialSources(venueEvent, artistTourDates);
      assert.equal(reconciliation.status, CONFIRMATION_STATUSES.CONFIRMED_BY_DUAL_OFFICIAL_SOURCES);
      assert.equal(reconciliation.isDualConfirmed, true);
      assert.equal(reconciliation.event.sources.length, 2);
      assert.equal(reconciliation.event.sources[0].feedType, 'official_venue_calendar');
      assert.equal(reconciliation.event.sources[1].feedType, 'official_artist_tour_page');
      assert.ok(reconciliation.event.sources[0].contentHash);
      assert.ok(reconciliation.event.sources[1].contentHash);
    });

    test('differing ticket URLs do not prevent dual confirmation; recorded as provenance difference', () => {
      const differingTicketTourDates = [
        normalizeArtistTourDate(
          { name: 'Sam Tallent', website: 'https://samtallent.com' },
          {
            venueName: 'Comedy Works Downtown',
            city: 'Denver',
            state: 'CO',
            localDate: '2026-10-17',
            localTime: '19:00',
            ticketUrl: 'https://linktr.ee/samtallent', // Distinct management/linktree link
            sourceUrl: 'https://samtallent.com/tour'
          }
        )
      ];

      const reconciliation = reconcileDualOfficialSources(venueEvent, differingTicketTourDates);
      assert.equal(reconciliation.status, CONFIRMATION_STATUSES.CONFIRMED_BY_DUAL_OFFICIAL_SOURCES);
      assert.equal(reconciliation.isDualConfirmed, true);
      assert.equal(reconciliation.ticketUrlDifference, true);
      assert.ok(reconciliation.event.provenanceDifference);
      assert.equal(reconciliation.event.provenanceDifference.artistTicketUrl, 'https://linktr.ee/samtallent');
    });

    test('aggregator tour schedules receive aggregator_corroborated status rather than official artist status', () => {
      const aggregatorTourDates = [
        normalizeArtistTourDate(
          { name: 'Sam Tallent', website: 'https://bandsintown.com/a/sam-tallent' },
          {
            venueName: 'Comedy Works Downtown',
            city: 'Denver',
            state: 'CO',
            localDate: '2026-10-17',
            localTime: '19:00',
            ticketUrl: 'https://bandsintown.com/e/12345',
            sourceUrl: 'https://bandsintown.com/a/sam-tallent',
            sourceType: 'aggregator',
            isAggregator: true
          }
        )
      ];

      const reconciliation = reconcileDualOfficialSources(venueEvent, aggregatorTourDates);
      assert.equal(reconciliation.status, CONFIRMATION_STATUSES.AGGREGATOR_CORROBORATED);
      assert.equal(reconciliation.isDualConfirmed, false);
      assert.equal(reconciliation.isAggregatorCorroborated, true);
    });

    test('partial match (artist confirms city and date but venue unlisted) records lead without publishing unconfirmed event', () => {
      const cityOnlyTourDates = [
        normalizeArtistTourDate(
          { name: 'Sam Tallent', website: 'https://samtallent.com' },
          {
            venueName: null, // city only
            city: 'Denver',
            state: 'CO',
            localDate: '2026-10-17',
            sourceUrl: 'https://samtallent.com/tour'
          }
        )
      ];

      const reconciliation = reconcileDualOfficialSources(venueEvent, cityOnlyTourDates);
      assert.equal(reconciliation.status, CONFIRMATION_STATUSES.CONFIRMED_BY_CROSS_SOURCE);
      assert.equal(reconciliation.leadType, 'corroborated_artist_lead');
      assert.equal(reconciliation.event.sources.length, 2);
    });

    test('disagreement in date or performer preserves existing single-source status', () => {
      const nonMatchingTourDates = [
        normalizeArtistTourDate(
          { name: 'Sam Tallent', website: 'https://samtallent.com' },
          {
            venueName: 'Comedy Works Downtown',
            city: 'Denver',
            localDate: '2026-10-24', // Different date
            sourceUrl: 'https://samtallent.com/tour'
          }
        )
      ];

      const reconciliation = reconcileDualOfficialSources(venueEvent, nonMatchingTourDates);
      assert.equal(reconciliation.status, CONFIRMATION_STATUSES.CONFIRMED_BY_OFFICIAL_CALENDAR);
      assert.equal(reconciliation.isDualConfirmed, undefined);
    });
  });

  describe('5. Two-Way Venue Candidate Discovery from Artist Tour Dates', () => {
    test('identifies unknown venues from tour dates and enqueues them as discovered_venue_candidates', () => {
      const knownVenues = [
        { name: 'The Comedy Store', city: 'West Hollywood' },
        { name: 'Comedy Works Downtown', city: 'Denver' }
      ];

      const tourDates = [
        normalizeArtistTourDate(
          { name: 'Sam Tallent', website: 'https://samtallent.com' },
          {
            venueName: 'Comedy Works Downtown', // Known venue
            city: 'Denver',
            localDate: '2026-10-17',
            sourceUrl: 'https://samtallent.com/tour'
          }
        ),
        normalizeArtistTourDate(
          { name: 'Sam Tallent', website: 'https://samtallent.com' },
          {
            venueName: 'The Hook and Ladder Theater', // Unknown venue in Minneapolis
            city: 'Minneapolis',
            state: 'MN',
            localDate: '2026-11-12',
            sourceUrl: 'https://samtallent.com/tour'
          }
        ),
        normalizeArtistTourDate(
          { name: 'Sam Tallent', website: 'https://samtallent.com' },
          {
            venueName: null, // City only, should not create a venue candidate
            city: 'Chicago',
            localDate: '2026-11-20',
            sourceUrl: 'https://samtallent.com/tour'
          }
        )
      ];

      const discoveredCandidates = discoverNewVenuesFromTourDates(tourDates, knownVenues);
      assert.equal(discoveredCandidates.length, 1, 'Should discover exactly 1 unknown venue');
      const candidate = discoveredCandidates[0];
      assert.equal(candidate.venueName, 'The Hook and Ladder Theater');
      assert.equal(candidate.city, 'Minneapolis');
      assert.equal(candidate.state, 'MN');
      assert.equal(candidate.discoveredViaArtist, 'Sam Tallent');
      assert.equal(candidate.status, 'discovered_venue_candidate');
      assert.ok(candidate.candidateId.startsWith('cand_'));
      assert.ok(candidate.discoveryProvenance.includes('Sam Tallent'));
    });
  });

  describe('6. Canonical Show Page Rendering of Dual Official Confirmation', () => {
    test('renders dual official sources badge and multi-source audit details', async () => {
      const dualEvent = {
        id: 'atl_dual_test_001',
        title: 'Sam Tallent Live',
        performer: 'Sam Tallent',
        venue_name: 'The Punchline Comedy Club',
        venue_address: '3652 Roswell Rd NE, Atlanta, GA 30342',
        city: 'Atlanta',
        state: 'GA',
        timezone: 'America/New_York',
        start_time: '2026-10-17T20:00:00-04:00',
        ticket_url: 'https://punchline.com/tickets/sam-tallent',
        price_display: '$30',
        confirmationStatus: CONFIRMATION_STATUSES.CONFIRMED_BY_DUAL_OFFICIAL_SOURCES,
        correlatedTicketingProvider: 'eventbrite',
        correlatedTicketingId: '1234567890',
        sources: [
          {
            feedType: 'official_venue_calendar',
            sourceUrl: 'https://www.punchline.com/events/?ical=1',
            contentHash: 'aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa1111bbbb2222'
          },
          {
            feedType: 'official_artist_tour_page',
            sourceUrl: 'https://samtallent.com/tour',
            contentHash: 'ffff6666eeee5555dddd4444cccc3333bbbb2222aaaa1111ffff6666eeee5555'
          }
        ]
      };

      // Mock getEvent
      const { defaultCanonicalStorage } = require('../lib/storage/canonical-event-storage.js');
      await defaultCanonicalStorage.upsertEvents([dualEvent]);

      let statusCode = null;
      let html = '';
      const req = { url: `/shows/${dualEvent.id}`, headers: { host: 'localhost:3000' } };
      const res = {
        setHeader() {},
        status(code) { statusCode = code; return this; },
        send(body) { html = body; }
      };

      await router(req, res);
      assert.equal(statusCode, 200);
      assert.ok(html.includes('Confirmed by official venue and artist sources'));
      assert.ok(html.includes('official_venue_calendar'));
      assert.ok(html.includes('official_artist_tour_page'));
      assert.ok(html.includes('eventbrite'));
      assert.ok(html.includes('1234567890'));
      assert.ok(html.includes('aaaa1111bbbb2222'));
      assert.ok(html.includes('ffff6666eeee5555'));
    });
  });

});
