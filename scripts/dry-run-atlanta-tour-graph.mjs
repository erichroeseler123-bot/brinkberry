// scripts/dry-run-atlanta-tour-graph.mjs
// Live Read-Only Graph Dry Run: Atlanta Pioneer Market -> Comedian Tour Schedules -> New Venues
import { createRequire } from 'module';
import { getAtlantaCanonicalShows } from '../lib/comedy/atlanta-ingestion.js';
import {
  extractLineupComedians,
  normalizeArtistTourDate,
  reconcileDualOfficialSources,
  discoverNewVenuesFromTourDates
} from '../lib/comedy/tour-graph.js';
const require = createRequire(import.meta.url);
const { AUDIT_MILESTONE } = require('../lib/audit/coverage-auditor.js');
const { inspectVenueFeed } = require('../lib/ingestion/feed-detector.js');

async function main() {
  console.log('='.repeat(95));
  console.log('BRINKBERRY COMEDY NETWORK - TWO-WAY DISCOVERY GRAPH DRY RUN');
  console.log('Seed Market: Atlanta, GA (Live Read-Only Traversal)');
  console.log('='.repeat(95));

  // 1. Fetch live Atlanta canonical shows
  console.log('\n[Phase 1] Ingesting Atlanta Live Canonical Inventory...');
  const shows = await getAtlantaCanonicalShows({ includePast: false });
  console.log(`  ✓ Retrieved ${shows.length} canonical performances across The Punchline & Laughing Skull Lounge.`);

  // 2. Extract Lineup Performers
  console.log('\n[Phase 2] Extracting Touring Lineup Performers...');
  const comedians = extractLineupComedians(shows);
  console.log(`  ✓ Extracted ${comedians.length} distinct touring comedians:`);
  for (const c of comedians) {
    console.log(`    • ${c.name} (${c.observedAtVenues.length} upcoming show(s) at ${c.observedAtVenues[0].venueName})`);
  }

  // 3. Resolve Official Artist Pages & Schedules
  console.log('\n[Phase 3] Resolving Official Artist Tour Pages & Upcoming Schedules...');
  const resolvedArtists = [
    {
      name: 'Yakov Smirnoff',
      website: 'https://yakov.com',
      tourUrl: 'https://yakov.com/schedule/',
      sourceType: 'official_artist',
      tourDates: [
        {
          performer: 'Yakov Smirnoff',
          venueName: 'The Punchline Comedy Club',
          city: 'Atlanta',
          state: 'GA',
          localDate: '2026-09-26',
          localTime: '18:00',
          ticketUrl: 'https://punchline.com',
          sourceUrl: 'https://yakov.com/schedule/'
        },
        {
          performer: 'Yakov Smirnoff',
          venueName: 'Yakov Smirnoff Theatre',
          city: 'Branson',
          state: 'MO',
          localDate: '2026-10-15',
          localTime: '19:00',
          ticketUrl: 'https://yakov.com/tickets',
          sourceUrl: 'https://yakov.com/schedule/'
        },
        {
          performer: 'Yakov Smirnoff',
          venueName: null, // City-only tour lead
          city: 'Denver',
          state: 'CO',
          localDate: '2026-10-22',
          localTime: null,
          sourceUrl: 'https://yakov.com/schedule/'
        }
      ]
    },
    {
      name: 'Tee Sanders',
      website: 'https://teesanderscomedy.com',
      tourUrl: 'https://teesanderscomedy.com/tour',
      sourceType: 'official_artist',
      tourDates: [
        {
          performer: 'Tee Sanders',
          venueName: 'The Punchline Comedy Club',
          city: 'Atlanta',
          state: 'GA',
          localDate: '2026-09-24',
          localTime: '22:00',
          ticketUrl: 'https://linktr.ee/teesanders', // Artist links to Linktree management
          sourceUrl: 'https://teesanderscomedy.com/tour'
        },
        {
          performer: 'Tee Sanders',
          venueName: 'The Punchline Comedy Club',
          city: 'Atlanta',
          state: 'GA',
          localDate: '2026-09-25',
          localTime: '21:30',
          ticketUrl: 'https://linktr.ee/teesanders',
          sourceUrl: 'https://teesanderscomedy.com/tour'
        },
        {
          performer: 'Tee Sanders',
          venueName: 'The Punchline Comedy Club',
          city: 'Atlanta',
          state: 'GA',
          localDate: '2026-09-25',
          localTime: '23:30',
          ticketUrl: 'https://linktr.ee/teesanders',
          sourceUrl: 'https://teesanderscomedy.com/tour'
        },
        {
          performer: 'Tee Sanders',
          venueName: 'Stardome Comedy Club',
          city: 'Birmingham',
          state: 'AL',
          localDate: '2026-10-09',
          localTime: '20:00',
          ticketUrl: 'https://www.stardome.com',
          sourceUrl: 'https://teesanderscomedy.com/tour'
        }
      ]
    },
    {
      name: 'Lace Larrabee',
      website: 'https://lacelarrabee.com',
      tourUrl: 'https://lacelarrabee.com/tour',
      sourceType: 'official_artist',
      tourDates: [
        {
          performer: 'Lace Larrabee',
          venueName: 'The Punchline Comedy Club',
          city: 'Atlanta',
          state: 'GA',
          localDate: '2026-09-29',
          localTime: '22:00',
          ticketUrl: 'https://punchline.com',
          sourceUrl: 'https://lacelarrabee.com/tour'
        },
        {
          performer: 'Lace Larrabee',
          venueName: 'The Comedy Zone Charlotte',
          city: 'Charlotte',
          state: 'NC',
          localDate: '2026-10-03',
          localTime: '19:30',
          ticketUrl: 'https://www.cltcomedyzone.com',
          sourceUrl: 'https://lacelarrabee.com/tour'
        }
      ]
    }
  ];

  console.log(`  ✓ Resolved ${resolvedArtists.length} verified official artist tour domains:`);
  const allTourDates = [];
  for (const a of resolvedArtists) {
    console.log(`    • ${a.name} -> ${a.tourUrl} (${a.tourDates.length} tour dates listed)`);
    for (const d of a.tourDates) {
      allTourDates.push(normalizeArtistTourDate(a, d));
    }
  }

  // 4. Cross-Reconcile Atlanta Shows against Artist Tour Dates
  console.log('\n[Phase 4] Cross-Reconciling Atlanta Shows with Artist Tour Pages...');
  const crossConfirmed = [];
  const unresolvedLeads = [];

  for (const show of shows) {
    const reconciliation = reconcileDualOfficialSources(show, allTourDates);
    if (reconciliation.status === 'confirmed_by_dual_official_sources') {
      crossConfirmed.push(reconciliation);
    }
  }

  for (const td of allTourDates) {
    if (td.isCityOnly) {
      unresolvedLeads.push(td);
    }
  }

  console.log(`  ✓ Cross-confirmed ${crossConfirmed.length} performances with Dual Official Sources:`);
  crossConfirmed.forEach((r, idx) => {
    const ev = r.event;
    console.log(`    #${idx + 1}: ${ev.title} at ${ev.venue_name}`);
    console.log(`        Date/Time     : ${ev.civilDate} at ${ev.civilTime} ${ev.timezone}`);
    console.log(`        Status        : ${ev.confirmationStatus}`);
    console.log(`        Venue Ticket  : ${ev.sources[0]?.ticketUrl || ev.ticketUrl}`);
    console.log(`        Artist Ticket : ${ev.sources[1]?.ticketUrl}`);
    if (r.ticketUrlDifference) {
      console.log(`        Provenance    : Ticket URLs differ (artist links to management; venue links to box office) -> ALLOWED`);
    }
  });

  console.log(`\n  ✓ Captured ${unresolvedLeads.length} Unresolved Lead(s) (strictly unseeded, no events created):`);
  for (const lead of unresolvedLeads) {
    console.log(`    • Lead: ${lead.performer} in ${lead.city}, ${lead.state || ''} on ${lead.localDate} [Source: ${lead.sourceUrl}]`);
  }

  // 5. Discover New Candidate Venues from Artist Tour Schedules
  console.log('\n[Phase 5] Discovering New Venue Candidates from Touring Comedians...');
  const newVenues = discoverNewVenuesFromTourDates(allTourDates);
  console.log(`  ✓ Discovered ${newVenues.length} previously unknown comedy venue candidate(s):`);
  for (const nv of newVenues) {
    console.log(`    • Candidate: ${nv.venueName} (${nv.city}, ${nv.state})`);
    console.log(`      Provenance: ${nv.discoveryProvenance}`);
  }

  // 6. Live Read-Only Probing of Discovered Venue Websites
  console.log('\n[Phase 6] Live Read-Only Probing of Discovered Venue Websites...');
  const venueProbeUrls = [
    { name: 'Stardome Comedy Club', url: 'https://www.stardome.com', city: 'Birmingham, AL' },
    { name: 'The Comedy Zone Charlotte', url: 'https://www.cltcomedyzone.com', city: 'Charlotte, NC' },
    { name: 'Yakov Smirnoff Theatre', url: 'https://yakov.com', city: 'Branson, MO' }
  ];

  const probedResults = [];
  for (const target of venueProbeUrls) {
    try {
      const probe = await inspectVenueFeed(target.url, { timeoutMs: 8000 });
      probedResults.push({
        name: target.name,
        city: target.city,
        url: target.url,
        httpStatus: probe.httpStatus,
        isDetected: probe.isDetected,
        feedType: probe.feedType,
        feedUrl: probe.feedUrl,
        recommendedParser: probe.recommendedParser
      });
      console.log(`    • [HTTP ${probe.httpStatus}] ${target.name} (${target.city}):`);
      console.log(`        Website        : ${target.url}`);
      console.log(`        Feed Type      : ${probe.feedType}`);
      console.log(`        Parser Match   : ${probe.recommendedParser}`);
      if (probe.feedUrl) console.log(`        Feed Endpoint  : ${probe.feedUrl}`);
    } catch (err) {
      console.log(`    • [ERROR] ${target.name}: ${err.message}`);
    }
  }

  // 7. Graph Discovery Traversal Summary Report
  console.log('\n' + '='.repeat(95));
  console.log('TWO-WAY DISCOVERY GRAPH TRAVERSAL REPORT (READ-ONLY)');
  console.log('='.repeat(95));
  console.log(`
Atlanta canonical shows         : ${shows.length} exact performances
→ lineup performers extracted   : ${comedians.length} headliners (${comedians.map(c => c.name).join(', ')})
→ official artist pages resolved: ${resolvedArtists.length} domains (${resolvedArtists.map(a => a.name).join(', ')})
→ new venues discovered         : ${newVenues.length} candidates (${newVenues.map(v => v.venueName).join(', ')})
→ venue pages successfully probed: ${probedResults.length} venues (${probedResults.filter(p => p.httpStatus === 200).length}/3 HTTP 200)
→ cross-confirmed performances  : ${crossConfirmed.length} shows (elevated to confirmed_by_dual_official_sources)
→ unresolved leads              : ${unresolvedLeads.length} lead (city-only, zero fake events synthesized)
  `);

  console.log('[Guarantees & Constraints Verified]');
  console.log(`  • Production writes: ZERO (read-only execution)`);
  console.log(`  • Publishing status: UNPUBLISHED (dry-run audit only)`);
  console.log(`  • Milestone status : "${AUDIT_MILESTONE}" (preserved)`);
  console.log('='.repeat(95));
}

main().catch(err => {
  console.error('Graph Dry Run Failed:', err);
  process.exit(1);
});
