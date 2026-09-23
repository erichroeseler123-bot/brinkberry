import { ingestSeatEngineVenue } from '../lib/ingestion/adapters/seatengine.js';

async function test() {
  const v = {
    slug: 'laugh-boston',
    name: 'Laugh Boston',
    address: '425 Summer St, Boston, MA 02210',
    city: 'Boston',
    state: 'MA',
    lat: 42.3484,
    lon: -71.0441,
    timezone: 'America/New_York',
    website: 'https://laughboston.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://laughboston.com',
    roomType: 'landmark_club',
    metro: 'Boston'
  };
  const rep = await ingestSeatEngineVenue(v, { persist: false });
  console.log(`Laugh Boston Parsed Shows: ${rep.events.length}`);
  for (const e of rep.events.slice(0, 5)) {
    console.log(` - "${e.title}" | ${e.ticket_url} [${e.ticketUrlType}]`);
  }
}

test().catch(console.error);
