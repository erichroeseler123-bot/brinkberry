// scripts/diagnose-batch4-candidates.mjs
import { getUnpromotedCandidateVenues, NATIONAL_COMEDY_VENUES, PROMOTED_VENUE_SLUGS } from '../lib/comedy/national-registry.js';
import { ingestSeatEngineVenue } from '../lib/ingestion/adapters/seatengine.js';
import { evaluateAutoPromotionCriteria } from '../lib/ingestion/discovery-pipeline.js';

async function diagnose() {
  const unpromotedSeatEngine = getUnpromotedCandidateVenues({ platform: 'seatengine' });
  console.log(`Unpromoted SeatEngine Venues in Registry: ${unpromotedSeatEngine.length}\n`);

  for (const v of unpromotedSeatEngine) {
    process.stdout.write(`Probing ${v.slug} (${v.name})... `);
    try {
      const rep = await ingestSeatEngineVenue(v, {
        persist: false,
        environment: 'preview',
        namespace: 'preview_expansion'
      });
      const events = rep.events || [];
      const promotable = events.filter(e => evaluateAutoPromotionCriteria(e).isPromotable);
      const now = Date.now();
      const current = promotable.filter(e => {
        const s = new Date(e.start || e.start_time).getTime();
        return s >= now - 2 * 3600 * 1000 && s <= now + 365 * 86400 * 1000;
      });
      console.log(`total: ${events.length}, promotable: ${promotable.length}, current: ${current.length}`);
      if (events.length > 0 && current.length === 0) {
        console.log(`   Sample event: "${events[0].title}" start=${events[0].start}`);
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
    }
  }

  console.log('\n--- Checking other platforms in National Registry ---');
  const allUnpromoted = NATIONAL_COMEDY_VENUES.filter(v => !PROMOTED_VENUE_SLUGS.includes(v.slug));
  const byEngine = {};
  for (const v of allUnpromoted) {
    byEngine[v.ticketingEngine] = (byEngine[v.ticketingEngine] || 0) + 1;
  }
  console.log('Unpromoted venues by engine:', byEngine);
}

diagnose().catch(console.error);
