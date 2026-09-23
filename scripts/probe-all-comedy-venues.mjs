/**
 * Full Comedy Club List Prober
 *
 * Runs the deep venue prober across all registered national comedy venue identities.
 * Evaluates:
 * - Robots decision
 * - Pages fetched
 * - Discovered schedule URLs
 * - Candidate ICS/JSON-LD/API endpoints
 * - Exact parsed event count
 * - Sample event title, start time, venue, source URL
 * - Platform markers
 * - Final classification
 * - Blockers or parser errors
 *
 * STRICTLY READ-ONLY: Zero canonical writes, zero publications.
 */

import { probeVenueSchedule } from '../lib/audit/venue-deep-prober.js';
import { getNationalComedyVenues } from '../lib/comedy/national-registry.js';

async function runAllVenuesAudit() {
  console.log('=== Brinkberry Deep Venue Prober: Full Comedy Club Registry ===\n');

  const venues = getNationalComedyVenues();
  console.log(`Starting read-only deep probe across ${venues.length} registered comedy venue identities...\n`);

  const reports = [];

  for (let i = 0; i < venues.length; i++) {
    const venue = venues[i];
    process.stdout.write(`[${i + 1}/${venues.length}] Probing ${venue.name} (${venue.website})... `);
    try {
      const report = await probeVenueSchedule(venue, { timeoutMs: 5000 });
      reports.push(report);
      console.log(`DONE -> [${report.finalClassification}] (Events: ${report.exactEventCount})`);
    } catch (err) {
      console.log(`ERROR -> ${err.message}`);
      reports.push({
        slug: venue.slug,
        name: venue.name,
        website: venue.website,
        robotsDecision: 'error',
        pagesFetched: [],
        discoveredScheduleUrls: [],
        candidateEndpoints: { ics: [], jsonld: [], apiOrWidgets: [] },
        exactEventCount: 0,
        sampleEvent: null,
        platformMarkers: [],
        finalClassification: 'network_error',
        blockerOrParserError: err.message,
        notes: 'Probe encountered network error'
      });
    }
  }

  console.log('\n================================================================');
  console.log('            FULL COMEDY REGISTRY PROBE TEST REPORT              ');
  console.log('================================================================\n');

  const summary = {
    totalProbed: reports.length,
    byClassification: {},
    byPlatform: {},
    totalUsableEvents: 0,
    usableVenues: []
  };

  for (const r of reports) {
    summary.byClassification[r.finalClassification] = (summary.byClassification[r.finalClassification] || 0) + 1;
    for (const p of r.platformMarkers) {
      summary.byPlatform[p] = (summary.byPlatform[p] || 0) + 1;
    }
    if (r.exactEventCount > 0) {
      summary.totalUsableEvents += r.exactEventCount;
      summary.usableVenues.push({
        slug: r.slug,
        name: r.name,
        classification: r.finalClassification,
        events: r.exactEventCount,
        sample: r.sampleEvent ? `${r.sampleEvent.title} (${r.sampleEvent.localStartTime})` : 'N/A'
      });
    }
  }

  console.log('--- Summary Metrics ---');
  console.log(`Total Venues Probed:           ${summary.totalProbed}`);
  console.log(`Venues with Usable Feeds:      ${summary.usableVenues.length} (${((summary.usableVenues.length / summary.totalProbed) * 100).toFixed(1)}%)`);
  console.log(`Total Exact Events Extracted:  ${summary.totalUsableEvents}`);
  console.log('*(Note: usable_feed means the probe found a source that can produce exact events; they are NOT in canonical inventory)*\n');

  console.log('--- Classification Breakdown ---');
  console.table(summary.byClassification);

  console.log('\n--- Platform Markers Breakdown ---');
  console.table(summary.byPlatform);

  console.log('\n--- Usable Feeds Producing Exact Events ---');
  console.table(summary.usableVenues);

  console.log('\n--- Complete Venue-by-Venue Audit Results ---');
  console.table(reports.map(r => ({
    Venue: r.name,
    Robots: r.robotsDecision,
    Classification: r.finalClassification,
    Events: r.exactEventCount,
    Platforms: r.platformMarkers.join(', ') || 'None',
    Blocker: r.blockerOrParserError ? (r.blockerOrParserError.slice(0, 40) + '...') : 'None'
  })));

  console.log('\nAudit complete. Strictly read-only. 0 canonical storage writes.');
  return { summary, reports };
}

runAllVenuesAudit();
