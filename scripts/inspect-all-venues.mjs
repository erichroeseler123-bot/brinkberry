// scripts/inspect-all-venues.mjs
import { NATIONAL_COMEDY_VENUES, PROMOTED_VENUE_SLUGS } from '../lib/comedy/national-registry.js';

console.log(`Total venues in NATIONAL_COMEDY_VENUES: ${NATIONAL_COMEDY_VENUES.length}`);
console.log(`Promoted venues count: ${PROMOTED_VENUE_SLUGS.length}`);

const unpromoted = NATIONAL_COMEDY_VENUES.filter(v => !PROMOTED_VENUE_SLUGS.includes(v.slug));
console.log(`Unpromoted venues count: ${unpromoted.length}\n`);

console.log('Unpromoted venues:');
for (const v of unpromoted) {
  console.log(`- [${v.ticketingEngine}] ${v.slug} | ${v.name} | ${v.city}, ${v.state} | ${v.calendarFeedUrl || v.website}`);
}
