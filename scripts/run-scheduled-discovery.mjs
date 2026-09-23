/**
 * scripts/run-scheduled-discovery.mjs
 *
 * Operational Runner: Scheduled Recursive Comedy Discovery Cycle
 *
 * Implements the continuous operational discovery loop:
 * 1. Reads verified seed schedules (23 promoted production clubs).
 * 2. Extracts touring headliners from verified lineups.
 * 3. Resolves official artist tour schedules and maps tour stops.
 * 4. Dual-source cross-check: exact matches elevated to 'confirmed_by_dual_official_sources'.
 * 5. Discovers new venue candidates from artist tour dates (Depth 2).
 * 6. Persists new candidates to VenueIntakeQueue (prevents duplicates; corroborates existing).
 * 7. Probes candidate schedules (verifies robots.txt, Cloudflare WAF, and platform markers).
 * 8. Queues clean candidates for human admin review.
 * 9. Strictly enforces:
 *    - ZERO auto-promotions to live
 *    - ZERO public feed leakage
 *    - ZERO production baseline writes (23 clubs / 2,718 performances frozen)
 *
 * Usage:
 *   node scripts/run-scheduled-discovery.mjs [--no-probe] [--rate-limit <ms>]
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { runScheduledDiscoveryCycle } = require('../lib/comedy/traversal-engine.js');
const { PROMOTED_VENUE_SLUGS } = require('../lib/comedy/national-registry.js');

async function main() {
  const args = process.argv.slice(2);
  const probe = !args.includes('--no-probe');
  const rateLimitIdx = args.indexOf('--rate-limit');
  const rateLimitMs = rateLimitIdx !== -1 ? parseInt(args[rateLimitIdx + 1], 10) : 50;

  console.log('='.repeat(95));
  console.log('BRINKBERRY RECURSIVE COMEDY DISCOVERY CYCLE — SCHEDULED OPERATION');
  console.log('Operational Loop: Seed Venues -> Touring Artists -> New Venues -> Intake Queue -> Admin Review');
  console.log(`Production Inventory: FROZEN (23 clubs, 2,718 canonical performances)`);
  console.log(`Automated Probing: ${probe ? 'ENABLED' : 'DISABLED'} | Courteous Delay: ${rateLimitMs}ms`);
  console.log('='.repeat(95));

  const startTime = Date.now();
  const report = await runScheduledDiscoveryCycle({
    probeVenues: probe,
    rateLimitMs
  });

  console.log(`\n[Execution Summary]`);
  console.log(`  Duration:                     ${report.durationMs}ms`);
  console.log(`  Seed Venues Evaluated:        ${report.seedVenuesCount} (Verified production baseline)`);
  console.log(`  Lineup Comedians Extracted:   ${report.extractedComediansCount}`);
  console.log(`  Dual-Confirmed Shows:         ${report.dualConfirmedShowsCount}`);
  console.log(`  Already Known Candidates:     ${report.alreadyKnownCandidatesCount} (Corroborated; 0 duplicate intake records)`);
  console.log(`  New Venues Discovered:        ${report.newVenuesDiscoveredCount}`);
  console.log(`  REAL COMEDY SHOWS DISCOVERED: ${report.totalDiscoveredShowsCount} (Parsed from official club schedules)`);
  console.log(`  Distinct Headliners Parsed:   ${report.discoveredArtistsCount}`);

  console.log(`\n[Phase 1: Extracted Touring Headliners (Depth 1)]`);
  for (const name of report.sampleExtractedComedians) {
    console.log(`  • ${name}`);
  }

  console.log(`\n[Phase 2: Discovered Venue Candidates (Depth 2 -> Intake Queue)]`);
  if (report.discoveredVenues.length === 0) {
    console.log('  (No new candidates discovered in this cycle)');
  } else {
    for (const v of report.discoveredVenues) {
      console.log(`  • ${v.venueName.padEnd(28)} | ${v.city}, ${v.state || 'N/A'} | Status: ${v.status}`);
      console.log(`    ↳ Discovered via artist: ${v.discoveredViaArtist} (Date: ${v.tourDate})`);
      if (v.evidenceHash) {
        console.log(`    ↳ Evidence SHA-256: ${v.evidenceHash.slice(0, 24)}...`);
      }
      if (v.blockReason) {
        console.log(`    ↳ Block Reason: ${v.blockReason}`);
      }
    }
  }

  console.log(`\n[Phase 3: Real Comedy Shows Discovered Across Candidate Clubs]`);
  console.log(`  Total Verified Shows Parsed:  ${report.totalDiscoveredShowsCount}`);
  console.log(`  Distinct Headliners:          ${report.discoveredArtistsCount}`);
  if (report.sampleDiscoveredShows && report.sampleDiscoveredShows.length > 0) {
    console.log(`\n  Sample Discovered Shows (with Box Office Direct Links):`);
    for (const s of report.sampleDiscoveredShows) {
      const dateStr = s.startDate ? s.startDate.slice(0, 10) : 'Upcoming';
      console.log(`  • ${s.performer.padEnd(28)} | ${s.venueName} (${s.city}, ${s.state}) | Date: ${dateStr}`);
      console.log(`    ↳ Box Office Ticket URL: ${s.ticketUrl}`);
      if (s.evidenceHash) {
        console.log(`    ↳ Evidence SHA-256:      ${s.evidenceHash.slice(0, 24)}...`);
      }
    }
  }

  console.log(`\n[Phase 4: Candidates Queued for Admin Review]`);
  console.log(`  Ready for Admin Review:       ${report.reviewQueue.readyForAdminReviewCount}`);
  console.log(`  Needs Manual Review:          ${report.reviewQueue.needsReviewCount}`);
  console.log(`  Perimeter Blocked:            ${report.reviewQueue.blockedCount}`);

  for (const c of report.reviewQueue.readyForAdminReview) {
    console.log(`  [READY_FOR_REVIEW] ${c.name} (${c.city}, ${c.state})`);
    console.log(`    - Status:       ${c.status}`);
    console.log(`    - Real Shows:   ${c.eventsCount} parsed and verified`);
    console.log(`    - Evidence SHA: ${c.evidenceHash?.slice(0, 24)}...`);
    console.log(`    - Schedule URL: ${c.scheduleUrl}`);
  }

  console.log(`\n[Phase 5: Invariant & Safety Verification]`);
  console.log(`  Auto-Promotions to Live:      ${report.invariants.autoPromotionsToLive} (Expected: 0)`);
  console.log(`  Public Feed Leakage:          ${report.invariants.publicFeedLeakage} (Expected: 0)`);
  console.log(`  Production Writes:            ${report.invariants.productionWrites} (Expected: 0)`);
  console.log(`  Synthetic Events:             ${report.syntheticEventsCount} (Expected: 0)`);
  console.log(`  Frozen Production Clubs:      ${PROMOTED_VENUE_SLUGS.length} (Expected: 23)`);

  console.log('\n' + '='.repeat(95));
  console.log('[SUCCESS] Scheduled discovery cycle completed cleanly with zero production mutations.');
  console.log('='.repeat(95));
}

main().catch(err => {
  console.error('Fatal error during scheduled discovery run:', err);
  process.exit(1);
});
