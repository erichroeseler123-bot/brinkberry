// scripts/recalculate-nationwide-total.mjs
// Audit live production market feeds on brinkberry.com across ALL live venues
// and strictly deduplicate by canonical event ID and fingerprint to eliminate any cross-batch overlap.

import { PROMOTED_SEATENGINE_VENUES, PROMOTED_VENUE_SLUGS, NATIONAL_COMEDY_VENUES } from '../lib/comedy/national-registry.js';

const PROD_HOST = process.env.PROD_HOST || 'https://brinkberry.com';

async function main() {
  console.log('======================================================================');
  console.log(`NATIONWIDE PRODUCTION INVENTORY RECALCULATION (${PROD_HOST})`);
  console.log('Strict deduplication across all production feeds (Zero overlap)');
  console.log('======================================================================\n');

  // All 19 Promoted SeatEngine clubs + 4 Pioneer clubs = 23 live venues
  const targetVenues = NATIONAL_COMEDY_VENUES.filter(v => PROMOTED_VENUE_SLUGS.includes(v.slug));
  console.log(`Total Promoted Venues Being Audited: ${targetVenues.length}\n`);

  const uniqueEventsById = new Map();
  const uniqueEventsByFingerprint = new Map();
  const eventsByVenueSlug = new Map();
  const rawSumByVenue = [];

  const results = await Promise.all(targetVenues.map(async (v) => {
    const feedUrl = `${PROD_HOST}/api/feed?lat=${v.lat}&lon=${v.lon}&mode=comedy&window=all`;
    const res = await fetch(feedUrl);
    if (!res.ok) {
      console.log(`- [${v.slug}] HTTP ${res.status} FAIL`);
      return { v, venueEvents: [] };
    }
    const data = await res.json();
    const events = data.events || [];

    // Filter to events strictly belonging to this venue
    const venueEvents = events.filter(e => {
      const vName = (e.venue?.name || e.venue_name || e.venue || '').toLowerCase();
      const vSlug = e.venue_slug || e.venueSlug || '';
      return (vSlug === v.slug || vName.includes(v.name.toLowerCase())) &&
             e.confirmationStatus === 'confirmed_by_official_calendar';
    });

    return { v, venueEvents };
  }));

  for (const { v, venueEvents } of results) {
    rawSumByVenue.push({
      slug: v.slug,
      name: v.name,
      metro: v.metro,
      count: venueEvents.length,
      timezone: v.timezone
    });

    for (const ev of venueEvents) {
      ev._venue_slug = v.slug;
      uniqueEventsById.set(ev.id, ev);
      if (ev.fingerprint) {
        uniqueEventsByFingerprint.set(ev.fingerprint, ev);
      }
      if (!eventsByVenueSlug.has(v.slug)) {
        eventsByVenueSlug.set(v.slug, []);
      }
      eventsByVenueSlug.get(v.slug).push(ev);
    }
  }

  console.log('| Venue Name | Metro | Timezone | Venue-Attributed Events |');
  console.log('|---|---|---|:---:|');
  let rawSum = 0;
  for (const r of rawSumByVenue) {
    console.log(`| ${r.name} | ${r.metro} | ${r.timezone} | ${r.count} |`);
    rawSum += r.count;
  }

  console.log('\n----------------------------------------------------------------------');
  console.log('NATIONWIDE PRODUCTION TOTALS:');
  console.log(`Raw Sum of Venue Feeds:                      ${rawSum}`);
  console.log(`Unique Canonical Events by ID:                ${uniqueEventsById.size}`);
  console.log(`Unique Canonical Events by Fingerprint:       ${uniqueEventsByFingerprint.size}`);
  console.log(`Cross-Venue / Cross-Batch Overlap Detected:   ${rawSum - uniqueEventsById.size}`);
  console.log('----------------------------------------------------------------------\n');

  // Also check SeatEngine-only total (19 clubs)
  const seatEngineSlugs = new Set(PROMOTED_SEATENGINE_VENUES.map(v => v.slug));
  const uniqueSeatEngineEvents = [...uniqueEventsById.values()].filter(e =>
    seatEngineSlugs.has(e._venue_slug)
  );

  console.log(`Strict Deduplicated Live SeatEngine Performances (19 clubs): ${uniqueSeatEngineEvents.length}`);
  console.log(`Strict Deduplicated Live Nationwide Performances (23 clubs):  ${uniqueEventsById.size}\n`);
}

main().catch(console.error);
