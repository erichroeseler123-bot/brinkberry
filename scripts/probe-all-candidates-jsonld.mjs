// scripts/probe-all-candidates-jsonld.mjs
import { NATIONAL_COMEDY_VENUES, PROMOTED_VENUE_SLUGS } from '../lib/comedy/national-registry.js';

async function scan() {
  const unpromoted = NATIONAL_COMEDY_VENUES.filter(v => !PROMOTED_VENUE_SLUGS.includes(v.slug));
  console.log(`Scanning ${unpromoted.length} unpromoted venues for JSON-LD / SeatEngine events...`);

  const viable = [];

  for (const v of unpromoted) {
    const urlsToTry = [v.calendarFeedUrl, v.website, `${v.website}/calendar`, `${v.website}/events`, `${v.website}/shows`].filter(Boolean);
    const tried = new Set();
    let found = null;

    for (const u of urlsToTry) {
      if (tried.has(u)) continue;
      tried.add(u);
      try {
        const res = await fetch(u, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        if (!res.ok) continue;
        const text = await res.text();
        const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
        let match;
        let eventCount = 0;
        let sample = null;
        while ((match = jsonLdRegex.exec(text)) !== null) {
          try {
            const data = JSON.parse(match[1]);
            const items = data['@graph'] || (Array.isArray(data) ? data : [data]);
            for (const item of items) {
              if ((item['@type'] || '').includes('Event') || item['@type'] === 'ComedyEvent') {
                eventCount++;
                if (!sample) sample = item;
              }
            }
          } catch (_) {}
        }

        if (eventCount > 0) {
          found = { url: u, eventCount, sampleName: sample?.name, sampleStart: sample?.startDate };
          break;
        }
      } catch (_) {}
    }

    if (found) {
      console.log(`[VIABLE] ${v.slug} (${v.name}) -> ${found.url} (${found.eventCount} events, sample: "${found.sampleName}" on ${found.sampleStart})`);
      viable.push({ venue: v, found });
    } else {
      // console.log(`[NOT VIABLE] ${v.slug}`);
    }
  }

  console.log(`\nTotal Viable JSON-LD Venues Found: ${viable.length}`);
}

scan().catch(console.error);
