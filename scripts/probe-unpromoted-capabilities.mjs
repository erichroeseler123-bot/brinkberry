// scripts/probe-unpromoted-capabilities.mjs
import { NATIONAL_COMEDY_VENUES } from '../lib/comedy/national-registry.js';
import { BASELINE_25_LIVE_SLUGS } from '../lib/crawling/venue-classification.js';
import { extractJsonLdEvents } from '../lib/ingestion/adapters/jsonld.js';

async function main() {
  const unpromoted = NATIONAL_COMEDY_VENUES.filter(v => !BASELINE_25_LIVE_SLUGS.has(v.slug));
  console.log(`Auditing all ${unpromoted.length} unpromoted candidate venues for structured data...`);

  const results = [];
  for (const v of unpromoted) {
    const url = v.calendarFeedUrl || v.website;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Brinkberry-Expansion-Runner/1.0 (+https://brinkberry.com/bot)' },
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) {
        results.push({ name: v.name, slug: v.slug, engine: v.ticketingEngine, status: `HTTP ${res.status}`, events: 0 });
        continue;
      }
      const html = await res.text();
      let events = [];
      try {
        events = extractJsonLdEvents(html, { defaultTimezone: v.timezone, venueSlug: v.slug, venueName: v.name });
      } catch (_) {}

      // Check if ticket URLs are present
      const directUrls = events.filter(e => e.ticketUrl && !['', '/events', '/calendar'].includes(new URL(e.ticketUrl).pathname.replace(/\/+$/, '')));

      results.push({
        name: v.name,
        slug: v.slug,
        engine: v.ticketingEngine,
        status: `HTTP 200`,
        jsonLdEvents: events.length,
        directTicketEvents: directUrls.length
      });
    } catch (err) {
      results.push({ name: v.name, slug: v.slug, engine: v.ticketingEngine, status: err.name === 'TimeoutError' ? 'Timeout' : 'Network Error', events: 0 });
    }
  }

  console.log('\n--- Venues with JSON-LD / Direct Links ---');
  const viable = results.filter(r => r.jsonLdEvents > 0 || r.engine === 'seatengine');
  console.table(viable);

  console.log('\n--- Breakdown by Status ---');
  const summary = {};
  results.forEach(r => {
    summary[r.status] = (summary[r.status] || 0) + 1;
  });
  console.log(summary);
}

main().catch(console.error);
