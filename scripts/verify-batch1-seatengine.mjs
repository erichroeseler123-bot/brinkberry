// scripts/verify-batch1-seatengine.mjs
// Automated 7-Gate Verification for Batch 1 SeatEngine Venues

import crypto from 'node:crypto';
import { getComedyVenueBySlug } from '../lib/comedy/national-registry.js';
import { ingestSeatEngineVenue } from '../lib/ingestion/adapters/seatengine.js';
import { evaluateAutoPromotionCriteria } from '../lib/ingestion/discovery-pipeline.js';
import { processBatchTourGraph } from '../lib/comedy/tour-graph.js';
import { defaultCanonicalStorage } from '../lib/storage/canonical-event-storage.js';

const CANDIDATE_SLUGS = [
  'cap-city-comedy-club-austin',
  'helium-comedy-club-philadelphia',
  'hilarities-4th-street-theatre-cleveland',
  'helium-comedy-club-portland',
  'helium-comedy-club-st-louis'
];

async function verifyCheckoutUrl(url) {
  if (!url || !url.startsWith('http')) return { ok: false, status: 0, reason: 'invalid_url' };
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const text = await res.text();
    const hasMarkers = /ticket|seat|cart|admission|event|shows?/i.test(text);
    return {
      ok: res.status === 200 && hasMarkers,
      status: res.status,
      bytes: text.length,
      hasMarkers,
      isWrapped: url.includes('/click') || url.includes('affiliate') || url.includes('tracker')
    };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

async function main() {
  console.log('======================================================================');
  console.log('BATCH 1 SEATENGINE 7-GATE AUTOMATED VERIFICATION');
  console.log('======================================================================\n');

  const venuesToTest = CANDIDATE_SLUGS.map(s => getComedyVenueBySlug(s)).filter(Boolean);
  if (venuesToTest.length !== 5) {
    console.error(`Expected 5 venues, found ${venuesToTest.length}`);
    process.exit(1);
  }

  const results = [];

  for (const venue of venuesToTest) {
    console.log(`\n----------------------------------------------------------------------`);
    console.log(`VERIFYING VENUE: ${venue.name} (${venue.city}, ${venue.state})`);
    console.log(`Feed URL: ${venue.calendarFeedUrl || venue.website}`);
    console.log(`Timezone: ${venue.timezone} | Coordinates: [${venue.lat}, ${venue.lon}]`);
    console.log(`----------------------------------------------------------------------`);

    const venueResult = {
      slug: venue.slug,
      name: venue.name,
      city: venue.city,
      state: venue.state,
      timezone: venue.timezone,
      pass1Events: 0,
      pass2Events: 0,
      promotableCount: 0,
      sampleEvent: null,
      sampleCheckoutTest: null,
      evidenceHash: null,
      idempotency: null,
      gateChecks: {
        gate1_successful_fetch: false,
        gate2_exact_dated_events: false,
        gate3_valid_coords_timezone: false,
        gate4_working_ticket_urls: false,
        gate5_evidence_hash: false,
        gate6_zero_synthetic_dates: false,
        gate7_idempotency_pass2: false
      },
      allGatesPassed: false
    };

    try {
      // PASS 1: Initial Ingestion
      console.log('-> Executing Pass 1 ingestion...');
      const rep1 = await ingestSeatEngineVenue(venue, { persist: false });
      venueResult.pass1Events = rep1.events.length;
      venueResult.evidenceHash = rep1.rawHash;

      // Gate 1: Successful Fetch
      if (rep1.rawHash && rep1.rawHash.length === 64) {
        venueResult.gateChecks.gate1_successful_fetch = true;
      }

      // Filter and evaluate promotion criteria for every event
      const promotableEvents = [];
      const reviewEvents = [];

      for (const ev of rep1.events) {
        const promo = evaluateAutoPromotionCriteria(ev);
        if (promo.isPromotable) {
          promotableEvents.push(ev);
        } else {
          reviewEvents.push({ ev, reasons: promo.reasons });
        }
      }

      venueResult.promotableCount = promotableEvents.length;

      // Gate 2: Parsed exact dated events
      if (promotableEvents.length > 0) {
        venueResult.gateChecks.gate2_exact_dated_events = true;
        venueResult.sampleEvent = {
          title: promotableEvents[0].title,
          civilDate: promotableEvents[0].civilDate,
          civilTime: promotableEvents[0].civilTime,
          ticket_url: promotableEvents[0].ticket_url
        };
      }

      // Gate 3: Valid coordinates and timezone
      if (Number.isFinite(venue.lat) && Number.isFinite(venue.lon) && venue.timezone) {
        venueResult.gateChecks.gate3_valid_coords_timezone = true;
      }

      // Gate 5: Evidence hash valid
      if (rep1.events[0]?.sourceEvidence?.contentHash?.length === 64) {
        venueResult.gateChecks.gate5_evidence_hash = true;
      }

      // Gate 6: Zero synthetic dates
      const hasSynthetic = promotableEvents.some(e => /every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(e.title));
      if (!hasSynthetic) {
        venueResult.gateChecks.gate6_zero_synthetic_dates = true;
      }

      // Gate 4: Working ticket URLs (test sample)
      if (promotableEvents[0]?.ticket_url) {
        console.log(`-> Testing sample ticket checkout URL: ${promotableEvents[0].ticket_url}`);
        const checkResult = await verifyCheckoutUrl(promotableEvents[0].ticket_url);
        venueResult.sampleCheckoutTest = checkResult;
        if (checkResult.ok && !checkResult.isWrapped) {
          venueResult.gateChecks.gate4_working_ticket_urls = true;
          console.log(`   HTTP ${checkResult.status} OK | Bytes: ${checkResult.bytes} | Unwrapped: true`);
        } else {
          console.log(`   FAILED checkout check:`, checkResult);
        }
      }

      // PASS 2: Idempotency Second-Run Comparison
      console.log('-> Executing Pass 2 second-run comparison...');
      const rep2 = await ingestSeatEngineVenue(venue, { persist: false });
      venueResult.pass2Events = rep2.events.length;

      const idsBefore = new Set(rep1.events.map(e => e.id));
      const fingerprintsBefore = new Set(rep1.events.map(e => e.fingerprint));

      let newIds = 0;
      let duplicateFingerprints = 0;

      for (const e2 of rep2.events) {
        if (!idsBefore.has(e2.id)) newIds++;
      }

      // Check duplicate fingerprints within pass 2
      const pass2Fps = new Set();
      for (const e2 of rep2.events) {
        if (pass2Fps.has(e2.fingerprint)) duplicateFingerprints++;
        pass2Fps.add(e2.fingerprint);
      }

      venueResult.idempotency = {
        rowsBefore: rep1.events.length,
        rowsAfter: rep2.events.length,
        newIds,
        duplicateFingerprints
      };

      if (rep1.events.length === rep2.events.length && newIds === 0 && duplicateFingerprints === 0) {
        venueResult.gateChecks.gate7_idempotency_pass2 = true;
        console.log(`   Idempotency Verified: rows before ${rep1.events.length}, rows after ${rep2.events.length}, new IDs: ${newIds}, duplicate fingerprints: ${duplicateFingerprints}`);
      } else {
        console.log(`   Idempotency FAILED:`, venueResult.idempotency);
      }

      // Check Two-Way Tour Graph extraction
      const graph = processBatchTourGraph(promotableEvents, { existingVenues: venuesToTest });
      console.log(`-> Two-Way Tour Graph: Extracted ${graph.comediansExtracted} touring comedians from lineup.`);

      // Overall Gate Verdict
      venueResult.allGatesPassed = Object.values(venueResult.gateChecks).every(Boolean);
      console.log(`-> OVERALL VERDICT: ${venueResult.allGatesPassed ? 'PASSED (7/7 GATES)' : 'FAILED'}`);

    } catch (err) {
      console.error(`Error verifying ${venue.name}:`, err.message);
      venueResult.error = err.message;
    }

    results.push(venueResult);
  }

  console.log('\n======================================================================');
  console.log('BATCH 1 VERIFICATION SUMMARY MATRIX');
  console.log('======================================================================\n');

  console.log('| Venue Name | Market | Events | Checkout URL | Hash | Idempotent | 7 Gates Status |');
  console.log('|---|---|:---:|---|:---:|:---:|:---:|');
  for (const r of results) {
    const statusStr = r.allGatesPassed ? '**PASSED (7/7)**' : '**FAILED**';
    const idemStr = r.gateChecks.gate7_idempotency_pass2 ? '0 new IDs' : 'FAIL';
    const checkStr = r.gateChecks.gate4_working_ticket_urls ? 'HTTP 200' : 'FAIL';
    const hashStr = r.gateChecks.gate5_evidence_hash ? 'SHA-256' : 'FAIL';
    console.log(`| ${r.name} | ${r.city}, ${r.state} | ${r.promotableCount} | ${checkStr} | ${hashStr} | ${idemStr} | ${statusStr} |`);
  }

  const passedCount = results.filter(r => r.allGatesPassed).length;
  console.log(`\nTotal Candidates Verified: ${passedCount} / ${results.length}`);

  if (passedCount === results.length) {
    console.log('>>> BATCH 1 PASSED ALL GATES. READY FOR PROMOTION. <<<');
  } else {
    console.log('>>> SOME VENUES FAILED GATES. ONLY PROMOTE PASSED VENUES. <<<');
  }
}

main().catch(err => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
