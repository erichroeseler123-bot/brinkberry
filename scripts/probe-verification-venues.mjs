/**
 * Small Verification Set Prober
 *
 * Probes the 6 verification comedy clubs:
 * 1. Comedy Works (Denver)
 * 2. Acme Comedy Company (Minneapolis)
 * 3. Cobb's Comedy Club (San Francisco)
 * 4. Denver Improv / TicketWeb (Denver)
 * 5. Punchline Atlanta (Atlanta)
 * 6. Comedy Cellar / Store (Known WAF / sparse club)
 *
 * Emits detailed report for every venue covering:
 * - Robots decision
 * - Pages fetched
 * - Discovered schedule URLs
 * - Candidate ICS/JSON-LD/API endpoints
 * - Exact parsed event count
 * - Sample event title, local start time, venue, and source URL
 * - Platform markers separately
 * - Final classification
 * - Any blocker or parser error
 *
 * Strictly read-only: Zero canonical writes, zero publications.
 */

import { probeVenueSchedule } from '../lib/audit/venue-deep-prober.js';
import { getComedyVenueBySlug } from '../lib/comedy/national-registry.js';

const VERIFICATION_SLUGS = [
  'comedy-works-downtown',
  'acme-comedy-company',
  'cobbs-comedy-club',
  'denver-improv',
  'the-punchline-comedy-club-atlanta',
  'the-comedy-store-hollywood'
];

async function runVerification() {
  console.log('=== Brinkberry Comedy Venue Deep Prober: Small Verification Set ===\n');

  const venues = VERIFICATION_SLUGS.map(slug => {
    const v = getComedyVenueBySlug(slug);
    if (!v) throw new Error(`Venue not found in registry: ${slug}`);
    return v;
  });

  const reports = [];

  for (const venue of venues) {
    process.stdout.write(`Probing ${venue.name} (${venue.website})... `);
    try {
      const report = await probeVenueSchedule(venue, { timeoutMs: 6000 });
      reports.push(report);
      console.log(`DONE -> [${report.finalClassification}] (Events: ${report.exactEventCount})`);
    } catch (err) {
      console.log(`FAILED -> ${err.message}`);
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
        notes: 'Probe crashed with exception'
      });
    }
  }

  console.log('\n================================================================');
  console.log('               DETAILED VENUE PROBE TEST REPORT                 ');
  console.log('================================================================\n');

  for (const r of reports) {
    console.log(`### Venue: ${r.name} (${r.slug})`);
    console.log(`* **Website**: ${r.website}`);
    console.log(`* **Robots Decision**: ${r.robotsDecision}${r.robotsDisallowedPatterns.length ? ` (Disallow: ${r.robotsDisallowedPatterns.join(', ')})` : ''}`);
    console.log(`* **Pages Fetched**: ${r.pagesFetched.length ? r.pagesFetched.join(', ') : 'None'}`);
    console.log(`* **Discovered Schedule URLs**: ${r.discoveredScheduleUrls.length ? r.discoveredScheduleUrls.join(', ') : 'None found in static HTML'}`);
    console.log(`* **Candidate Endpoints**:`);
    console.log(`  - ICS: ${r.candidateEndpoints.ics.length ? r.candidateEndpoints.ics.join(', ') : 'None'}`);
    console.log(`  - JSON-LD: ${r.candidateEndpoints.jsonld.length ? r.candidateEndpoints.jsonld.join(', ') : 'None'}`);
    console.log(`  - API / Widgets: ${r.candidateEndpoints.apiOrWidgets.length ? r.candidateEndpoints.apiOrWidgets.join(', ') : 'None'}`);
    console.log(`* **Exact Parsed Event Count**: ${r.exactEventCount}`);
    if (r.sampleEvent) {
      console.log(`* **Sample Event**:`);
      console.log(`  - Title: ${r.sampleEvent.title}`);
      console.log(`  - Local Start Time: ${r.sampleEvent.localStartTime}`);
      console.log(`  - Venue: ${r.sampleEvent.venue}`);
      console.log(`  - Source URL: ${r.sampleEvent.sourceUrl}`);
    } else {
      console.log(`* **Sample Event**: None (0 exact events parsed)`);
    }
    console.log(`* **Platform Markers**: ${r.platformMarkers.length ? r.platformMarkers.join(', ') : 'None detected'}`);
    console.log(`* **Final Classification**: \`${r.finalClassification}\``);
    console.log(`* **Blocker / Parser Error**: ${r.blockerOrParserError || 'None'}`);
    console.log(`* **Notes**: ${r.notes || 'None'}`);
    console.log('----------------------------------------------------------------\n');
  }

  console.log('--- Summary Table ---');
  console.table(reports.map(r => ({
    Venue: r.name,
    Robots: r.robotsDecision,
    Classification: r.finalClassification,
    Events: r.exactEventCount,
    Platforms: r.platformMarkers.join(', ') || 'None',
    Blocker: r.blockerOrParserError ? (r.blockerOrParserError.slice(0, 45) + '...') : 'None'
  })));

  console.log('\nAudit complete. Strictly read-only. 0 canonical storage writes.');
  return reports;
}

runVerification();
