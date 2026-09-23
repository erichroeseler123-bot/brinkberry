// scripts/audit-live-production-baseline.mjs
// Audit the 25 Baseline Live Venues against the external production environment (https://brinkberry.com)

import { BASELINE_25_LIVE_SLUGS } from '../lib/crawling/venue-classification.js';
import { NATIONAL_COMEDY_VENUES } from '../lib/comedy/national-registry.js';

const PROD_HOST = process.env.PROD_HOST || 'https://brinkberry.com';

async function main() {
  console.log('======================================================================');
  console.log(`EXTERNAL LIVE PRODUCTION BASELINE AUDIT (${PROD_HOST})`);
  console.log(`Checking All Baseline Live Production Venues (${BASELINE_25_LIVE_SLUGS.size} slugs)`);
  console.log('======================================================================\n');

  let totalOfficial = 0;
  const results = [];

  // Group by slug
  const checkedSlugs = new Set();

  for (const slug of BASELINE_25_LIVE_SLUGS) {
    if (checkedSlugs.has(slug)) continue;
    checkedSlugs.add(slug);

    const venue = NATIONAL_COMEDY_VENUES.find(v => v.slug === slug);
    if (!venue) {
      continue;
    }

    try {
      const feedUrl = `${PROD_HOST}/api/feed?lat=${venue.lat}&lon=${venue.lon}&mode=comedy&window=all`;
      const res = await fetch(feedUrl, { headers: { 'User-Agent': 'Brinkberry-Baseline-Auditor/1.0' } });
      if (!res.ok) {
        results.push({ name: venue.name, slug: venue.slug, city: venue.city, events: 0, status: `HTTP ${res.status}` });
        continue;
      }
      const data = await res.json();
      const events = (data.events || []).filter(e => {
        const vName = (e.venue?.name || e.venue_name || e.venue || '').toLowerCase();
        const vSlug = e.venue_slug || e.venueSlug || '';
        return (vSlug === venue.slug || vName.includes(venue.name.toLowerCase()));
      });
      totalOfficial += events.length;
      results.push({
        name: venue.name,
        slug: venue.slug,
        city: venue.city,
        state: venue.state,
        events: events.length,
        status: events.length > 0 ? 'LIVE' : 'EMPTY'
      });
    } catch (err) {
      results.push({ name: venue.name, slug: venue.slug, city: venue.city, events: 0, status: `ERROR: ${err.message}` });
    }
  }

  console.log('| # | Venue Name | City, State | Slug | Live Events | Status |');
  console.log('|---|---|---|---|:---:|:---:|');
  results.forEach((r, idx) => {
    console.log(`| ${idx + 1} | ${r.name} | ${r.city}, ${r.state} | \`${r.slug}\` | ${r.events} | ${r.status} |`);
  });

  console.log('\n======================================================================');
  console.log(`TOTAL BASELINE VENUES AUDITED:     ${results.length}`);
  console.log(`TOTAL VERIFIED EXTERNAL EVENTS:    ${totalOfficial}`);
  console.log('======================================================================\n');
}

main().catch(console.error);
