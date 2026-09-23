// scripts/check-remaining-se.mjs
import { NATIONAL_COMEDY_VENUES, PROMOTED_SEATENGINE_SLUGS } from '../lib/comedy/national-registry.js';

const allSE = NATIONAL_COMEDY_VENUES.filter(v => v.ticketingEngine === 'seatengine');
console.log('Total SE in registry:', allSE.length);
console.log('Promoted SE:', PROMOTED_SEATENGINE_SLUGS.length);
const remaining = allSE.filter(v => !PROMOTED_SEATENGINE_SLUGS.includes(v.slug));
console.log(`Remaining unpromoted SE (${remaining.length}):`);
for (const v of remaining) {
  console.log(` - ${v.slug} (${v.name}): ${v.calendarFeedUrl || v.website}`);
}
