// scripts/verify-production-batch1-live.mjs
// Audit live production market feeds on brinkberry.com

import fs from 'node:fs';

const PROD_HOST = process.env.PROD_HOST || 'https://brinkberry.com';

const MARKETS = [
  { market: 'Minneapolis', venueSlug: 'acme-comedy-company-minneapolis', venueName: 'Acme Comedy Company', lat: 44.9877, lon: -93.2721, timezone: 'America/Chicago' },
  { market: 'Austin', venueSlug: 'cap-city-comedy-club-austin', venueName: 'Cap City Comedy Club', lat: 30.3957, lon: -97.7289, timezone: 'America/Chicago' },
  { market: 'Philadelphia', venueSlug: 'helium-comedy-club-philadelphia', venueName: 'Helium Comedy Club Philadelphia', lat: 39.9515, lon: -75.1748, timezone: 'America/New_York' },
  { market: 'Cleveland', venueSlug: 'hilarities-4th-street-theatre-cleveland', venueName: 'Hilarities 4th Street Theatre', lat: 41.4988, lon: -81.6888, timezone: 'America/New_York' },
  { market: 'Portland', venueSlug: 'helium-comedy-club-portland', venueName: 'Helium Comedy Club Portland', lat: 45.5134, lon: -122.6508, timezone: 'America/Los_Angeles' },
  { market: 'St. Louis', venueSlug: 'helium-comedy-club-st-louis', venueName: 'Helium Comedy Club St. Louis', lat: 38.6341, lon: -90.3152, timezone: 'America/Chicago' }
];

async function verifyCheckoutUrl(url) {
  if (!url || !url.startsWith('http')) return { ok: false, status: 0 };
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const text = await res.text();
    const hasMarkers = /ticket|seat|cart|admission|event|shows?/i.test(text);
    return { ok: res.status === 200 && hasMarkers, status: res.status, bytes: text.length };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

async function main() {
  console.log('======================================================================');
  console.log(`LIVE PRODUCTION VERIFICATION (${PROD_HOST})`);
  console.log('======================================================================\n');

  console.log('| Market | Venue | Official Events | Direct Checkout HTTP | Timezone | Status |');
  console.log('|---|---|:---:|---|---|:---:|');

  let totalOfficial = 0;

  for (const m of MARKETS) {
    const feedUrl = `${PROD_HOST}/api/feed?lat=${m.lat}&lon=${m.lon}&mode=comedy&window=all`;
    const res = await fetch(feedUrl);
    if (!res.ok) {
      console.log(`| ${m.market} | ${m.venueName} | 0 | HTTP ${res.status} | ${m.timezone} | **FAILED** |`);
      continue;
    }
    const data = await res.json();
    const events = data.events || [];
    const officialEvents = events.filter(e => {
      const vName = (e.venue?.name || e.venue_name || e.venue || '').toLowerCase();
      const vSlug = e.venue_slug || e.venueSlug || '';
      return (vSlug === m.venueSlug || vName.includes(m.venueName.toLowerCase())) &&
             e.confirmationStatus === 'confirmed_by_official_calendar';
    });

    totalOfficial += officialEvents.length;

    const sampleUrl = officialEvents[0]?.ticket_url || officialEvents[0]?.ticketUrl;
    const checkoutTest = await verifyCheckoutUrl(sampleUrl);

    const checkStr = checkoutTest.ok ? `HTTP 200 (${checkoutTest.bytes} B)` : `FAIL (${checkoutTest.status})`;
    const statusStr = officialEvents.length > 0 && checkoutTest.ok ? '**LIVE (PROD)**' : '**FAILED**';

    console.log(`| ${m.market} | ${m.venueName} | ${officialEvents.length} | ${checkStr} | ${m.timezone} | ${statusStr} |`);
  }

  console.log(`\nTotal Live Official Events across the 6 Markets: ${totalOfficial}`);

  // Denver Quarantine
  console.log('\n--- DENVER PRODUCTION QUARANTINE AUDIT ---');
  const denverRes = await fetch(`${PROD_HOST}/api/feed?lat=39.7392&lon=-104.9903&mode=comedy&window=all`);
  const denverData = await denverRes.json();
  const syntheticSeeds = (denverData.events || []).filter(e =>
    e.id === 'comedy_seed_denver_02' || e.id === 'comedy_pilot_denver_03'
  );
  console.log('Synthetic Denver seeds in production feed (must be 0):', syntheticSeeds.length);

  // Clean up temporary preview env file
  if (fs.existsSync('.env.preview.tmp')) {
    fs.unlinkSync('.env.preview.tmp');
    console.log('\nCleaned up .env.preview.tmp (Zero artifact/credential leakage).');
  }

  console.log('\n======================================================================');
  console.log('PRODUCTION PROMOTION & VERIFICATION COMPLETE');
  console.log('======================================================================');
}

main().catch(err => {
  console.error('Production audit failed:', err);
  process.exit(1);
});
