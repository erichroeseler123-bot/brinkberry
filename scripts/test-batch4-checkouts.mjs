// scripts/test-batch4-checkouts.mjs
import { ingestSeatEngineVenue } from '../lib/ingestion/adapters/seatengine.js';
import { verifyCheckoutUrls } from '../lib/ingestion/automated-batch-pipeline.js';

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
  const allEvents = [];
  for (const v of venues) {
    const rep = await ingestSeatEngineVenue(v, { persist: false });
    allEvents.push(...rep.events);
  }

  console.log(`Ingested ${allEvents.length} events across 5 venues. Verifying checkout URLs...`);
  const check = await verifyCheckoutUrls(allEvents, { checkAll: true, concurrency: 15 });
  console.log(`Tested URLs: ${check.testedCount}`);
  console.log(`Passed URLs: ${check.passedCount}`);
  console.log(`Failed URLs: ${check.failedCount}`);
  console.log(`All Passed: ${check.allPassed}`);
}

run().catch(console.error);
