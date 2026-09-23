// test/automated-batch-pipeline.test.mjs
// Unit & integration tests for the automated repeatable batch onboarding engine

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  selectBatchCandidates,
  probeAndParseVenues,
  auditIdempotency,
  verifyCheckoutUrls,
  reconcileHorizonAccounting,
  verifyDenverQuarantine
} from '../lib/ingestion/automated-batch-pipeline.js';

import {
  NATIONAL_COMEDY_VENUES,
  PROMOTED_VENUE_SLUGS,
  getPromotedComedyVenues,
  isVenuePromoted,
  getUnpromotedCandidateVenues
} from '../lib/comedy/national-registry.js';

import { LocalFileCanonicalStorage } from '../lib/storage/canonical-event-storage.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

describe('Automated Batch Onboarding Engine Suite', () => {

  // -------------------------------------------------------------------------
  // 1. Candidate Selection
  // -------------------------------------------------------------------------
  describe('1. Candidate Selection & Filtering', () => {
    it('excludes all promoted venues and Denver quarantined venues', async () => {
      const sel = await selectBatchCandidates({
        count: 5,
        platform: 'seatengine',
        probe: false // pure candidate filter test
      });

      assert.ok(sel.candidates.length > 0, 'Should find unpromoted candidates');
      for (const cand of sel.candidates) {
        assert.equal(isVenuePromoted(cand.slug), false, `Candidate ${cand.slug} must not be already promoted`);
        assert.notEqual(cand.slug, 'comedy-works-downtown', 'Must not select quarantined Denver club');
        assert.notEqual(cand.slug, 'comedy-works-south', 'Must not select quarantined Denver club');
      }
    });

    it('honors explicit candidateSlugs override', async () => {
      const explicit = ['new-york-comedy-club-midtown', 'bananas-comedy-club-nj'];
      const sel = await selectBatchCandidates({
        count: 5,
        candidateSlugs: explicit,
        probe: false
      });

      assert.equal(sel.candidates.length, 2);
      assert.deepEqual(sel.candidates.map(c => c.slug).sort(), explicit.sort());
    });

    it('registry helper getUnpromotedCandidateVenues returns only unpromoted non-quarantined clubs', () => {
      const unpromoted = getUnpromotedCandidateVenues({ platform: 'seatengine' });
      assert.ok(unpromoted.length > 0);
      for (const u of unpromoted) {
        assert.ok(!PROMOTED_VENUE_SLUGS.includes(u.slug));
        assert.notEqual(u.slug, 'comedy-works-downtown');
        assert.notEqual(u.slug, 'comedy-works-south');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 2. Auto-Promotion Criteria & Schedule Parsing
  // -------------------------------------------------------------------------
  describe('2. Probe & Parse Auto-Promotion Criteria Enforcement', () => {
    it('separates promotable events from review events based on 6 criteria', async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <script type="application/ld+json">
          [
            {
              "@type": "ComedyEvent",
              "name": "Headliner Live Showcase",
              "startDate": "2026-10-15T20:00:00-04:00",
              "url": "https://testclub.com/event/101"
            },
            {
              "@type": "ComedyEvent",
              "name": "Every Tuesday Open Mic Night",
              "startDate": "2026-10-20T20:00:00-04:00",
              "url": "https://testclub.com/event/102"
            }
          ]
          </script>
        </head>
        <body>SeatEngine Calendar</body>
        </html>
      `;

      const mockFetch = async () => ({
        ok: true,
        status: 200,
        text: async () => mockHtml
      });

      const testVenue = {
        slug: 'mock-test-club',
        name: 'Mock Test Club',
        address: '100 Main St, New York, NY 10001',
        city: 'New York',
        state: 'NY',
        timezone: 'America/New_York',
        lat: 40.7128,
        lon: -74.0060,
        website: 'https://testclub.com',
        calendarFeedUrl: 'https://testclub.com/events',
        ticketingEngine: 'seatengine'
      };

      const parseRes = await probeAndParseVenues([testVenue], {
        fetchFn: mockFetch,
        environment: 'preview',
        namespace: 'preview_expansion'
      });

      assert.equal(parseRes.passingVenues.length, 1);
      const events = parseRes.allPromotableEvents;
      assert.ok(events.length > 0);

      // Verify all promotable events have valid fields
      for (const ev of events) {
        assert.ok(ev.civilDate);
        assert.ok(ev.civilTime);
        assert.equal(ev.confirmationStatus, 'confirmed_by_official_calendar');
        assert.equal(ev.sourceEvidence.contentHash.length, 64);
        assert.equal(ev.isCancelled, false);
      }
    });

    it('excludes past events from eligible for publication and retains them as historical evidence', async () => {
      const pastHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <script type="application/ld+json">
          [
            {
              "@type": "ComedyEvent",
              "name": "Past Show Last Month",
              "startDate": "2026-08-01T20:00:00-04:00",
              "url": "https://testclub.com/event/past"
            },
            {
              "@type": "ComedyEvent",
              "name": "Upcoming Live Show Next Week",
              "startDate": "2026-09-30T20:00:00-04:00",
              "url": "https://testclub.com/event/upcoming"
            }
          ]
          </script>
        </head>
        <body>SeatEngine Calendar</body>
        </html>
      `;

      const mockFetch = async () => ({
        ok: true,
        status: 200,
        text: async () => pastHtml
      });

      const testVenue = {
        slug: 'mock-past-test-club',
        name: 'Mock Past Test Club',
        address: '100 Main St, New York, NY 10001',
        city: 'New York',
        state: 'NY',
        timezone: 'America/New_York',
        lat: 40.7128,
        lon: -74.0060,
        website: 'https://testclub.com',
        calendarFeedUrl: 'https://testclub.com/events',
        ticketingEngine: 'seatengine'
      };

      const parseRes = await probeAndParseVenues([testVenue], {
        fetchFn: mockFetch,
        nowMs: new Date('2026-09-21T12:00:00.000Z').getTime()
      });

      assert.equal(parseRes.totalCurrentEligibleCount, 1);
      assert.equal(parseRes.totalHistoricalRetainedCount, 1);
      assert.equal(parseRes.allCurrentEligibleEvents[0].title, 'Upcoming Live Show Next Week');
      assert.equal(parseRes.allHistoricalRetainedEvents[0].title, 'Past Show Last Month');
      assert.equal(parseRes.accountingReport, '1 current events eligible for publication; 1 historical events retained; 0 future-horizon exceptions.');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Storage Idempotency Audit
  // -------------------------------------------------------------------------
  describe('3. Idempotency Proof: Zero New IDs and Zero Duplicate Fingerprints', () => {
    it('proves rowsBefore === rowsAfter, newIds === 0, duplicateFingerprints === 0 across two upserts', async () => {
      const tmpFile = path.join(os.tmpdir(), `test_idempotency_${Date.now()}.json`);
      const storage = new LocalFileCanonicalStorage(tmpFile);

      const sampleEvents = [
        {
          id: 'test_ev_01',
          slug: 'test-club-comic-one-2026-10-10-1900',
          fingerprint: 'comedy_test_club_2026-10-10_19_comic_one',
          title: 'Comic One Live',
          civilDate: '2026-10-10',
          civilTime: '19:00',
          start: '2026-10-10T19:00:00.000Z',
          start_time: '2026-10-10T19:00:00.000Z',
          venue_slug: 'test-club',
          venue_latitude: 40.7128,
          venue_longitude: -74.0060,
          confirmationStatus: 'confirmed_by_official_calendar',
          environment: 'preview',
          namespace: 'preview_expansion'
        },
        {
          id: 'test_ev_02',
          slug: 'test-club-comic-two-2026-10-11-2100',
          fingerprint: 'comedy_test_club_2026-10-11_21_comic_two',
          title: 'Comic Two Live',
          civilDate: '2026-10-11',
          civilTime: '21:00',
          start: '2026-10-11T21:00:00.000Z',
          start_time: '2026-10-11T21:00:00.000Z',
          venue_slug: 'test-club',
          venue_latitude: 40.7128,
          venue_longitude: -74.0060,
          confirmationStatus: 'confirmed_by_official_calendar',
          environment: 'preview',
          namespace: 'preview_expansion'
        }
      ];

      const audit = await auditIdempotency(sampleEvents, { storage });

      assert.equal(audit.isIdempotent, true);
      assert.equal(audit.rowsBefore, 2);
      assert.equal(audit.rowsAfter, 2);
      assert.equal(audit.newIdsCount, 0);
      assert.equal(audit.duplicateFingerprints, 0);

      try { fs.unlinkSync(tmpFile); } catch (_) {}
    });
  });

  // -------------------------------------------------------------------------
  // 4. Direct Box Office Checkout Links
  // -------------------------------------------------------------------------
  describe('4. Direct Box Office Checkout Link Verification', () => {
    it('detects wrapped affiliate tracking redirects and fails', async () => {
      const wrappedEvents = [
        {
          id: 'wrapped_01',
          ticket_url: 'https://brinkberry.com/api/click?target=https%3A%2F%2Fvenue.com%2Ftickets',
          venue_slug: 'venue-1'
        },
        {
          id: 'affiliate_02',
          ticket_url: 'https://venue.com/tickets?utm_medium=affiliate&aff=partner123',
          venue_slug: 'venue-2'
        }
      ];

      const checkouts = await verifyCheckoutUrls(wrappedEvents, { checkAll: true });
      assert.equal(checkouts.allPassed, false);
      assert.ok(checkouts.results.some(r => r.reason === 'wrapped_affiliate_redirect_prohibited'));
    });

    it('passes direct venue URLs with authentic ticket checkout markers', async () => {
      const directEvents = [
        {
          id: 'direct_01',
          ticket_url: 'https://officialvenue.com/events/101',
          venue_slug: 'official-venue'
        }
      ];

      const mockFetch = async () => ({
        ok: true,
        status: 200,
        text: async () => '<html><body><h1>Show Details</h1><div class="ticket-cart">Select Admission Seats</div></body></html>'
      });

      const checkouts = await verifyCheckoutUrls(directEvents, { fetchFn: mockFetch, checkAll: true });
      assert.equal(checkouts.allPassed, true);
      assert.equal(checkouts.results[0].hasMarkers, true);
      assert.equal(checkouts.results[0].status, 200);
      assert.equal(checkouts.results[0].isWrapped, false);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Horizon Accounting Reconciliation
  // -------------------------------------------------------------------------
  describe('5. Horizon Accounting Reconciliation (>365d Separation)', () => {
    it('separates displayable events from retained-but-not-displayable events (>365 days out)', () => {
      const nowMs = new Date('2026-09-21T12:00:00.000Z').getTime();

      const testEvents = [
        // Displayable: next month
        {
          id: 'ev_current_1',
          title: 'Upcoming Comic',
          start: '2026-10-15T20:00:00.000Z',
          venue_slug: 'venue-1',
          venue_name: 'Venue 1'
        },
        // Displayable: 6 months out
        {
          id: 'ev_current_2',
          title: 'Spring Showcase',
          start: '2027-03-20T20:00:00.000Z',
          venue_slug: 'venue-1',
          venue_name: 'Venue 1'
        },
        // Retained-but-not-displayable: 387 days out (>365 days)
        {
          id: 'ev_future_hofstetter',
          title: 'Special Event: Steve Hofstetter',
          start: '2027-10-13T20:00:00.000Z',
          venue_slug: 'venue-1',
          venue_name: 'Venue 1'
        }
      ];

      const rec = reconcileHorizonAccounting(testEvents, { windowDays: 365, nowMs });

      assert.equal(rec.reconciled, true);
      assert.equal(rec.storedCount, 3);
      assert.equal(rec.displayableCount, 2);
      assert.equal(rec.retainedFutureCount, 1);
      assert.equal(rec.expiredPastCount, 0);
      assert.equal(rec.retainedFutureEvents[0].id, 'ev_future_hofstetter');
      assert.ok(rec.retainedFutureEvents[0].daysOut > 365);
      assert.equal(rec.accountingEquation, '3 (stored) = 2 (displayable) + 1 (retained-future) + 0 (expired-past)');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Denver Quarantine Guard
  // -------------------------------------------------------------------------
  describe('6. Denver Quarantine Guard', () => {
    it('detects synthetic Denver seeds and flags failure', async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          events: [
            { id: 'comedy_seed_denver_02', title: 'Fake Seed Show' }
          ]
        })
      });

      const quar = await verifyDenverQuarantine({
        previewHost: 'https://mock-preview.local',
        fetchFn: mockFetch
      });

      assert.equal(quar.isQuarantined, false);
      assert.equal(quar.syntheticSeedsFound, 1);
    });

    it('passes when zero synthetic seeds exist', async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          events: [
            { id: 'real_ev_1', title: 'Authentic Verified Comic' }
          ]
        })
      });

      const quar = await verifyDenverQuarantine({
        previewHost: 'https://mock-preview.local',
        fetchFn: mockFetch
      });

      assert.equal(quar.isQuarantined, true);
      assert.equal(quar.syntheticSeedsFound, 0);
    });
  });

});
