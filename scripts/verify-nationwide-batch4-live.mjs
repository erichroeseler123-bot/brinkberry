// scripts/verify-nationwide-batch4-live.mjs
// Nationwide Production Verification Audit across ALL live venues (Batch 1 - 4 + Pioneer)

import { PROMOTED_SEATENGINE_VENUES } from '../lib/comedy/national-registry.js';

const PROD_HOST = process.env.PROD_HOST || 'https://brinkberry.com';

async function main() {
  console.log('======================================================================');
  console.log(`NATIONWIDE PRODUCTION VERIFICATION AUDIT (${PROD_HOST})`);
  console.log(`Auditing all 19 SeatEngine Promoted Clubs across US Metros`);
  console.log('======================================================================\n');

  console.log('| Venue Name | Slug | Metro | Official Events | Timezone | Status |');
  console.log('|---|---|---|:---:|---|:---:|');

  let totalOfficial = 0;

  for (const v of PROMOTED_SEATENGINE_VENUES) {
    const feedUrl = `${PROD_HOST}/api/feed?lat=${v.lat}&lon=${v.lon}&mode=comedy&window=all`;
    const res = await fetch(feedUrl);
    if (!res.ok) {
      console.log(`| ${v.name} | \`${v.slug}\` | ${v.metro} | 0 | ${v.timezone} | **HTTP ${res.status}** |`);
      continue;
    }
    const data = await res.json();
    const events = data.events || [];
    const officialEvents = events.filter(e => {
      const vName = (e.venue?.name || e.venue_name || e.venue || '').toLowerCase();
      const vSlug = e.venue_slug || e.venueSlug || '';
      return (vSlug === v.slug || vName.includes(v.name.toLowerCase())) &&
             e.confirmationStatus === 'confirmed_by_official_calendar';
    });

    totalOfficial += officialEvents.length;
    const statusStr = officialEvents.length > 0 ? '**LIVE**' : '**EMPTY**';
    console.log(`| ${v.name} | \`${v.slug}\` | ${v.metro} | ${officialEvents.length} | ${v.timezone} | ${statusStr} |`);
  }

  console.log('\n----------------------------------------------------------------------');
  console.log(`TOTAL NATIONWIDE VERIFIED LIVE PERFORMANCES (19 SEATENGINE CLUBS): ${totalOfficial}`);
  console.log('----------------------------------------------------------------------\n');
}

main().catch(console.error);
