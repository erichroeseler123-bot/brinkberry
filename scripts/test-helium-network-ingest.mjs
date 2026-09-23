// scripts/test-helium-network-ingest.mjs
import { ingestSeatEngineVenue } from '../lib/ingestion/adapters/seatengine.js';
import { evaluateAutoPromotionCriteria } from '../lib/ingestion/discovery-pipeline.js';

const venues = [
  {
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
  },
  {
    slug: 'goodnights-comedy-club-raleigh',
    name: 'Goodnights Comedy Club',
    address: '4003 Arrow Dr, Raleigh, NC 27612',
    city: 'Raleigh',
    state: 'NC',
    lat: 35.8363,
    lon: -78.6836,
    timezone: 'America/New_York',
    website: 'https://www.goodnightscomedy.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://www.goodnightscomedy.com/events'
  },
  {
    slug: 'stress-factory-new-brunswick',
    name: 'Stress Factory Comedy Club New Brunswick',
    address: '90 Church St, New Brunswick, NJ 08901',
    city: 'New Brunswick',
    state: 'NJ',
    lat: 40.4955,
    lon: -74.4442,
    timezone: 'America/New_York',
    website: 'https://newbrunswick.stressfactory.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://newbrunswick.stressfactory.com/events'
  },
  {
    slug: 'stress-factory-bridgeport',
    name: 'Stress Factory Comedy Club Bridgeport',
    address: '167 State St, Bridgeport, CT 06604',
    city: 'Bridgeport',
    state: 'CT',
    lat: 41.1770,
    lon: -73.1895,
    timezone: 'America/New_York',
    website: 'https://bridgeport.stressfactory.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://bridgeport.stressfactory.com/events'
  },
  {
    slug: 'laugh-boston',
    name: 'Laugh Boston',
    address: '425 Summer St, Boston, MA 02210',
    city: 'Boston',
    state: 'MA',
    lat: 42.3482,
    lon: -71.0447,
    timezone: 'America/New_York',
    website: 'https://laughboston.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://laughboston.com'
  }
];

async function run() {
  const now = Date.now();
  console.log('Testing 5 SeatEngine candidate clubs for Batch 4:\n');

  for (const v of venues) {
    try {
      const rep = await ingestSeatEngineVenue(v, {
        persist: false,
        environment: 'preview',
        namespace: 'preview_expansion'
      });
      const events = rep.events || [];
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
      console.log(`[PASS] ${v.name} (${v.city}, ${v.state}) -> total: ${events.length}, current: ${current.length}, historical: ${historical.length}`);
      if (current.length > 0) {
        console.log(`       Sample: "${current[0].title}" on ${current[0].start}`);
        console.log(`       Ticket URL: ${current[0].ticket_url || current[0].ticketUrl}`);
      }
    } catch (err) {
      console.log(`[FAIL] ${v.name}: ${err.message}`);
    }
  }
}

run().catch(console.error);
