// test/batch1-seatengine-verification.test.mjs
// Permanent regression test suite for Batch 1 SeatEngine Automated Onboarding & 7 Gates

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { getComedyVenueBySlug, NATIONAL_COMEDY_VENUES } = require('../lib/comedy/national-registry.js');
const { ingestSeatEngineVenue } = require('../lib/ingestion/adapters/seatengine.js');
const { evaluateAutoPromotionCriteria } = require('../lib/ingestion/discovery-pipeline.js');
const { processBatchTourGraph } = require('../lib/comedy/tour-graph.js');

describe('Batch 1 SeatEngine 7-Gate Verification Suite', () => {
  const BATCH1_SLUGS = [
    'cap-city-comedy-club-austin',
    'helium-comedy-club-philadelphia',
    'hilarities-4th-street-theatre-cleveland',
    'helium-comedy-club-portland',
    'helium-comedy-club-st-louis'
  ];

  test('1. Registry Ground Truth: Batch 1 candidates are verified SeatEngine entries', () => {
    assert.equal(BATCH1_SLUGS.length, 5);
    for (const slug of BATCH1_SLUGS) {
      const v = getComedyVenueBySlug(slug);
      assert.ok(v, `Missing venue in registry: ${slug}`);
      assert.equal(v.ticketingEngine, 'seatengine');
      assert.ok(v.timezone, 'Must have IANA timezone');
      assert.ok(Number.isFinite(v.lat) && Number.isFinite(v.lon), 'Must have coordinates');
      assert.ok(v.calendarFeedUrl, 'Must have calendar feed URL');
    }
  });

  test('2. 7-Gate Validation Engine on Mock SeatEngine Data', async () => {
    const mockHtml = `
      <script type="application/ld+json">
      [
        {
          "@context": "https://schema.org",
          "@type": "ComedyEvent",
          "name": "Sam Tallent Headliner",
          "startDate": "2026-11-20T20:00:00-06:00",
          "url": "https://seatengine.com/shows/111222",
          "offers": { "@type": "Offer", "price": "25.00", "url": "https://seatengine.com/shows/111222" }
        },
        {
          "@context": "https://schema.org",
          "@type": "ComedyEvent",
          "name": "Maria Bamford Live",
          "startDate": "2026-11-20T22:15:00-06:00",
          "url": "https://seatengine.com/shows/111223",
          "offers": { "@type": "Offer", "price": "25.00", "url": "https://seatengine.com/shows/111223" }
        }
      ]
      </script>
    `;

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => mockHtml
    });

    const venue = getComedyVenueBySlug('cap-city-comedy-club-austin');

    // Pass 1
    const rep1 = await ingestSeatEngineVenue(venue, { fetchFn: mockFetch, persist: false });
    assert.equal(rep1.events.length, 2);

    // Gate 1: Successful Fetch
    assert.ok(rep1.rawHash && rep1.rawHash.length === 64);

    // Gate 2 & 6: Exact dates, civil time, zero synthetic dates
    for (const ev of rep1.events) {
      const evalPromo = evaluateAutoPromotionCriteria(ev);
      assert.equal(evalPromo.isPromotable, true, `Event must be auto-promotable: ${evalPromo.reasons.join(',')}`);
      assert.equal(ev.civilDate, '2026-11-20');
      assert.ok(ev.civilTime === '20:00' || ev.civilTime === '22:15');
      assert.equal(ev.timezone, 'America/Chicago');
    }

    // Gate 4: Working ticket URL without wrappers
    assert.ok(rep1.events[0].ticket_url.startsWith('https://seatengine.com/shows/'));

    // Gate 7: Pass 2 Idempotency
    const rep2 = await ingestSeatEngineVenue(venue, { fetchFn: mockFetch, persist: false });
    assert.equal(rep1.events.length, rep2.events.length);

    const ids1 = new Set(rep1.events.map(e => e.id));
    let newIds = 0;
    for (const e2 of rep2.events) {
      if (!ids1.has(e2.id)) newIds++;
    }
    assert.equal(newIds, 0, 'Zero new IDs on second run');

    // Two-Way Tour Graph
    const graph = processBatchTourGraph(rep1.events, { existingVenues: NATIONAL_COMEDY_VENUES });
    assert.equal(graph.comediansExtracted, 2);
  });

  test('3. Platform Divergence Handling: Blocked WAF or 404 Diverts Cleanly', async () => {
    // If a candidate returns 403 or 404, the adapter throws and discovery-pipeline marks failed/retrying
    const mock403Fetch = async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden (Cloudflare WAF)'
    });

    const venue = getComedyVenueBySlug('helium-comedy-club-st-louis');
    await assert.rejects(
      async () => {
        await ingestSeatEngineVenue(venue, { fetchFn: mock403Fetch, persist: false });
      },
      /Failed to fetch/
    );
  });
});
