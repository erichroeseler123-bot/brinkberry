/**
 * Seed Venue Intake Queue with Candidate Venues
 *
 * Populates the Venue Intake Queue with all unpromoted candidate venues from the
 * National Comedy Registry across the US.
 *
 * Preserves the production freeze:
 * - Does NOT promote any venue to production
 * - Excludes the 25 active production venues (23 baseline + 2 Comedy Works)
 * - Excludes quarantined clubs
 * - Reconciles pre-existing queue records, newly seeded candidates, and duplicate skips
 *
 * Usage:
 *   node scripts/seed-intake-queue.mjs
 *   node scripts/seed-intake-queue.mjs --probe
 */

import assert from 'node:assert/strict';
import {
  NATIONAL_COMEDY_VENUES,
  PROMOTED_VENUE_SLUGS,
  getUnpromotedCandidateVenues
} from '../lib/comedy/national-registry.js';
import { LIVE_PRODUCTION_VENUE_SLUGS } from '../lib/crawling/venue-classification.js';
import { defaultVenueIntakeQueue, QUEUE_STATES } from '../lib/ingestion/venue-intake-queue.js';

async function main() {
  const args = process.argv.slice(2);
  const shouldProbe = args.includes('--probe');

  console.log('='.repeat(70));
  console.log('BRINKBERRY VENUE INTAKE QUEUE SEEDER');
  console.log(`Inventory Freeze: ACTIVE (25 live production venues locked)`);
  console.log(`Probing enabled: ${shouldProbe ? 'YES' : 'NO (fast metadata registration)'}`);
  console.log('='.repeat(70));

  // Capture initial state before seeding
  const preExistingQueueRecords = defaultVenueIntakeQueue.records.size;

  // Get all unpromoted candidate venues from national registry (excluding all 25 live production venues)
  const candidates = getUnpromotedCandidateVenues({ platform: 'all', excludeQuarantined: true })
    .filter(cand => !LIVE_PRODUCTION_VENUE_SLUGS.has(cand.slug));
  const registryCandidatesDiscovered = candidates.length;

  console.log(`\nFound ${registryCandidatesDiscovered} unpromoted candidate venues from national registry.`);
  console.log(`Promoted live venues excluded: ${LIVE_PRODUCTION_VENUE_SLUGS.size}`);
  console.log(`Pre-existing queue records: ${preExistingQueueRecords}`);

  let candidatesNewlySeeded = 0;
  let duplicateSeedAttemptsSkipped = 0;

  for (const cand of candidates) {
    const scheduleUrl = cand.calendarFeedUrl || cand.website;
    if (!scheduleUrl) continue;

    const alreadyExists = defaultVenueIntakeQueue.records.has(cand.slug);
    if (alreadyExists) {
      duplicateSeedAttemptsSkipped++;
    } else {
      candidatesNewlySeeded++;
    }

    try {
      await defaultVenueIntakeQueue.intakeVenue({
        slug: cand.slug,
        name: cand.name,
        city: cand.city,
        state: cand.state,
        lat: cand.lat,
        lon: cand.lon,
        timezone: cand.timezone,
        scheduleUrl,
        website: cand.website,
        platform: cand.ticketingEngine || 'unknown',
        notes: `Metro: ${cand.metro || cand.city} | Room: ${cand.roomType || 'club'} | Platform: ${cand.ticketingEngine || 'unknown'}`
      }, { probe: shouldProbe });
    } catch (err) {
      console.warn(`[Warning] Could not seed venue ${cand.name}: ${err.message}`);
    }
  }

  const summary = defaultVenueIntakeQueue.getQueueSummary();
  const totalQueueRecords = defaultVenueIntakeQueue.records.size;
  const statusSum = Object.values(summary.byStatus).reduce((a, b) => a + b, 0);

  console.log('\n======================================================================');
  console.log('INTAKE QUEUE RECONCILIATION SUMMARY');
  console.log('======================================================================');
  console.log(`registry candidates discovered:        ${registryCandidatesDiscovered}`);
  console.log(`candidates newly seeded:              ${candidatesNewlySeeded}`);
  console.log(`pre-existing queue records:           ${preExistingQueueRecords}`);
  console.log(`duplicate seed attempts skipped:      ${duplicateSeedAttemptsSkipped}`);
  console.log(`total queue records after seeding:    ${totalQueueRecords}`);
  console.log('----------------------------------------------------------------------');
  console.log('records by status:');
  for (const [status, count] of Object.entries(summary.byStatus)) {
    console.log(`  - ${status.padEnd(24)}: ${count}`);
  }
  console.log(`status counts total:                  ${statusSum}`);
  console.log('======================================================================');

  // Breakdown by platform
  const byPlatform = {};
  for (const v of summary.venues) {
    const plat = v.detectedPlatform || 'unknown';
    byPlatform[plat] = (byPlatform[plat] || 0) + 1;
  }

  console.log('\n--- Queue Breakdown by Ticketing Platform ---');
  for (const [plat, count] of Object.entries(byPlatform).sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${plat.padEnd(24)}: ${count} venues`);
  }

  // Strict Mathematical & Architectural Assertions
  assert.equal(
    totalQueueRecords,
    preExistingQueueRecords + candidatesNewlySeeded,
    `Total queue records (${totalQueueRecords}) must equal pre-existing (${preExistingQueueRecords}) + newly seeded (${candidatesNewlySeeded})`
  );
  assert.equal(
    totalQueueRecords,
    statusSum,
    `Total queue records (${totalQueueRecords}) must strictly equal sum of records by status (${statusSum})`
  );
  assert.equal(
    summary.byStatus['live'] || 0,
    0,
    'Live promoted records in intake queue must be strictly 0'
  );

  console.log('\n[SUCCESS] Venue intake queue reconciled. All counts match with zero automatic promotions.');
}

main().catch(err => {
  console.error('Fatal seeding error:', err);
  process.exit(1);
});
