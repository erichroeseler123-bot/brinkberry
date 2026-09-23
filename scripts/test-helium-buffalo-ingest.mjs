// scripts/test-helium-buffalo-ingest.mjs
import { extractJsonLdEvents } from '../lib/ingestion/adapters/jsonld.js';
import { ingestSeatEngineVenue } from '../lib/ingestion/adapters/seatengine.js';
import { evaluateAutoPromotionCriteria } from '../lib/ingestion/discovery-pipeline.js';

const venue = {
  slug: 'helium-comedy-club-buffalo',
  name: 'Helium Comedy Club Buffalo',
  address: '30 Mississippi St, Buffalo, NY 14203',
  city: 'Buffalo',
  state: 'NY',
  lat: 42.8770,
  lon: -78.8715,
  timezone: 'America/New_York',
  website: 'https://buffalo.heliumcomedy.com',
  ticketingEngine: 'seatengine',
  calendarFeedUrl: 'https://buffalo.heliumcomedy.com/events'
};

const rep = await ingestSeatEngineVenue(venue, {
  persist: false,
  environment: 'preview',
  namespace: 'preview_expansion'
});

const events = rep.events || [];
const now = Date.now();
const current = events.filter(e => {
  const promo = evaluateAutoPromotionCriteria(e);
  if (!promo.isPromotable) return false;
  const s = new Date(e.start || e.start_time).getTime();
  return s >= now - 2 * 3600 * 1000 && s <= now + 365 * 86400 * 1000;
});
const historical = events.filter(e => {
  const promo = evaluateAutoPromotionCriteria(e);
  if (!promo.isPromotable) return false;
  const s = new Date(e.start || e.start_time).getTime();
  return s < now - 2 * 3600 * 1000;
});

console.log(`Helium Buffalo Total Events: ${events.length}`);
console.log(`Current Promotable:          ${current.length}`);
console.log(`Historical Retained:         ${historical.length}`);
if (current.length > 0) {
  console.log(`Sample current show: "${current[0].title}" on ${current[0].start}`);
  console.log(`Sample checkout URL: ${current[0].ticket_url || current[0].ticketUrl}`);
}
