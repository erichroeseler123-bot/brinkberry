/**
 * Read-Only Facility Source Audit Runner
 *
 * Probes all registered comedy venue and race track identities.
 * Generates an audit table and metrics report showing which anchors
 * actually have usable, source-backed live schedules.
 *
 * STRICTLY READ-ONLY: Does not write to canonical storage or publish events.
 */

import { runFacilitySourceAudit } from '../lib/audit/facility-source-auditor.js';

console.log('=== Brinkberry Read-Only Facility Source Audit ===');
console.log('Probing registered venue and track identity anchors...\n');

const audit = await runFacilitySourceAudit();
const { summary, results } = audit;

console.log('--- Summary Metrics ---');
console.log(`Total Facilities Probed:       ${summary.totalProbed}`);
console.log(`Identity & Domain Confirmed:   ${summary.domainConfirmedCount} / ${summary.totalProbed}`);
console.log(`Usable Live Schedules Found:   ${summary.usableScheduleCount}`);
console.log(`  - Comedy Venues:             ${summary.usableComedyCount} / ${summary.comedyCount}`);
console.log(`  - Racing Tracks:             ${summary.usableRacingCount} / ${summary.racingCount}`);

console.log('\n--- Breakdown by Source Type ---');
console.table(summary.bySourceType);

console.log('\n--- Breakdown by Parser Result ---');
console.table(summary.byParserResult);

console.log('\n--- Usable Facilities Producing Exact Events ---');
if (summary.usableFacilities.length > 0) {
  console.table(summary.usableFacilities);
} else {
  console.log('(None directly open via static probe; platform adapters or touring feeds required)');
}

console.log('\nAudit complete. Zero events published. Facility status documented.');
