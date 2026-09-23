// scripts/test-seatengine-candidates.mjs
import { ingestSeatEngineVenue } from '../lib/ingestion/adapters/seatengine.js';
import { evaluateAutoPromotionCriteria } from '../lib/ingestion/discovery-pipeline.js';
import { getComedyVenueBySlug } from '../lib/comedy/national-registry.js';

const testClubs = [
  { slug: 'laugh-boston', feed: 'https://laughboston.com' },
  { slug: 'greenwich-village-comedy-club', feed: 'https://greenwichvillagecomedyclub.com/calendar' },
  { slug: 'dallas-comedy-club', feed: 'https://dallas-comedyclub.com/shows' },
  { slug: 'the-ice-house-pasadena', feed: 'https://icehousecomedy.com' },
  { slug: 'st-louis-funny-bone', feed: 'https://www.stlouisfunnybone.com/calendar' }
];

async function test() {
  for (const item of testClubs) {
    const venue = getComedyVenueBySlug(item.slug);
    if (!venue) {
      console.log(`Missing venue: ${item.slug}`);
      continue;
    }
    const testVenue = { ...venue, calendarFeedUrl: item.feed };
    console.log(`\n=== Ingesting ${testVenue.name} (${item.slug}) from ${item.feed} ===`);
    try {
      const rep = await ingestSeatEngineVenue(testVenue, {
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
      const historical = promotable.filter(e => {
        const s = new Date(e.start || e.start_time).getTime();
        return s < now - 2 * 3600 * 1000;
      });
      console.log(`Total parsed: ${events.length}`);
      console.log(`Promotable:   ${promotable.length}`);
      console.log(`Current:      ${current.length}`);
      console.log(`Historical:   ${historical.length}`);
      if (current.length > 0) {
        console.log(`Sample current: "${current[0].title}" on ${current[0].start}`);
        console.log(`Sample checkout: ${current[0].ticket_url || current[0].ticketUrl}`);
      }
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  }
}

test().catch(console.error);
