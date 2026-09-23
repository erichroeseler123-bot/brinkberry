import { extractJsonLdEvents } from '../lib/ingestion/adapters/jsonld.js';
import { parseIcsSource } from '../lib/ingestion/adapters/ics.js';
import { parseHtmlScheduleSource } from '../lib/ingestion/adapters/html-schedule.js';

const CANDIDATES = [
  // Austin
  { market: 'Austin', venue: 'The Creek and the Cave', url: 'https://creekandcave.com/events' },
  { market: 'Austin', venue: 'The Creek and the Cave Alt', url: 'https://creekandcave.com' },
  { market: 'Austin', venue: 'East Austin Comedy Club', url: 'https://eastaustincomedy.com/schedule' },
  { market: 'Austin', venue: 'Cap City Comedy Club', url: 'https://www.capcitycomedy.com/calendar' },
  { market: 'Austin', venue: 'Sunset Strip Comedy Club', url: 'https://www.sunsetstripatsx.com' },

  // Denver
  { market: 'Denver', venue: 'The Bug Theatre', url: 'https://bugtheatre.org/events' },
  { market: 'Denver', venue: 'Denver Comedy Lounge', url: 'https://denvercomedylounge.com/events' },
  { market: 'Denver', venue: 'RISE Comedy', url: 'https://risecomedy.com/calendar' },

  // New York City
  { market: 'NYC', venue: 'New York Comedy Club Midtown', url: 'https://newyorkcomedyclub.com/events' },
  { market: 'NYC', venue: 'New York Comedy Club East Village', url: 'https://newyorkcomedyclub.com/events' },
  { market: 'NYC', venue: 'The Stand NYC', url: 'https://thestandnyc.com/shows' },
  { market: 'NYC', venue: 'Gotham Comedy Club', url: 'https://gothamcomedyclub.com/calendar' },

  // Atlanta
  { market: 'Atlanta', venue: 'The Punchline Comedy Club', url: 'https://www.punchline.com/events/?ical=1' },
  { market: 'Atlanta', venue: 'Laughing Skull Lounge', url: 'https://laughingskulllounge.com' }
];

async function testAll() {
  console.log('Probing markets for 2+ venues with >= 10 exact live events...\n');

  const results = {};

  for (const c of CANDIDATES) {
    try {
      const res = await fetch(c.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(6000)
      });
      const text = await res.text();

      let events = [];
      if (text.includes('BEGIN:VCALENDAR')) {
        events = parseIcsSource(text, { venueName: c.venue, canonicalUrl: c.url });
      } else {
        const jsonLd = extractJsonLdEvents(text, { venueName: c.venue, canonicalUrl: c.url });
        if (jsonLd.length > 0) {
          events = jsonLd;
        } else {
          events = parseHtmlScheduleSource(text, { venueName: c.venue, canonicalUrl: c.url });
        }
      }

      const count = Array.isArray(events) ? events.length : (events?.events?.length || 0);
      console.log(`[${c.market}] ${c.venue}: status=${res.status}, parsedEvents=${count}`);

      if (!results[c.market]) results[c.market] = [];
      results[c.market].push({ venue: c.venue, url: c.url, count, sample: count > 0 ? (Array.isArray(events) ? events[0] : events.events[0]) : null });
    } catch (e) {
      console.log(`[${c.market}] ${c.venue}: ERR ${e.message}`);
    }
  }

  console.log('\n--- Market Totals ---');
  for (const [m, list] of Object.entries(results)) {
    const venuesWithEvents = list.filter(item => item.count > 0);
    const totalEvents = list.reduce((sum, item) => sum + item.count, 0);
    console.log(`${m}: ${venuesWithEvents.length} venues with events, ${totalEvents} total events`);
  }
}

testAll();
