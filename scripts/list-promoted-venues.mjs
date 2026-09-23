import {
  PROMOTED_SEATENGINE_VENUES,
  PROMOTED_VENUE_SLUGS,
  getPromotedComedyVenues
} from '../lib/comedy/national-registry.js';

const all = getPromotedComedyVenues();
console.log('======================================================================');
console.log(`AUTHORITATIVE PROMOTED VENUE REGISTRY: ${all.length} VENUES`);
console.log(`SeatEngine Promoted Clubs:   ${PROMOTED_SEATENGINE_VENUES.length}`);
console.log(`Pioneer Non-SeatEngine Clubs: ${all.length - PROMOTED_SEATENGINE_VENUES.length}`);
console.log('======================================================================\n');

console.log('| # | Venue Name | Slug | Metro, State | Engine | Category |');
console.log('|---|---|---|---|---|---|');

all.forEach((v, i) => {
  const cat = PROMOTED_SEATENGINE_VENUES.some(s => s.slug === v.slug) ? 'SeatEngine Promoted' : 'Pioneer Expansion';
  console.log(`| ${i + 1} | ${v.name} | \`${v.slug}\` | ${v.metro}, ${v.state} | ${v.ticketingEngine} | ${cat} |`);
});
