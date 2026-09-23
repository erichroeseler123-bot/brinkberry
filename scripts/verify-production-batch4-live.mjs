// scripts/verify-production-batch4-live.mjs
// Audit live production market feeds on brinkberry.com across Batch 4 venues

const PROD_HOST = process.env.PROD_HOST || 'https://brinkberry.com';

const BATCH4_MARKETS = [
  { market: 'Buffalo', venueSlug: 'helium-comedy-club-buffalo', venueName: 'Helium Comedy Club Buffalo', lat: 42.8770, lon: -78.8715, timezone: 'America/New_York' },
  { market: 'Raleigh', venueSlug: 'goodnights-comedy-club-raleigh', venueName: 'Goodnights Comedy Club', lat: 35.8363, lon: -78.6836, timezone: 'America/New_York' },
  { market: 'Bridgeport', venueSlug: 'stress-factory-bridgeport', venueName: 'Stress Factory Comedy Club Bridgeport', lat: 41.1770, lon: -73.1895, timezone: 'America/New_York' },
  { market: 'New Brunswick', venueSlug: 'stress-factory-new-brunswick', venueName: 'Stress Factory Comedy Club New Brunswick', lat: 40.4955, lon: -74.4442, timezone: 'America/New_York' },
  { market: 'Boston', venueSlug: 'laugh-boston', venueName: 'Laugh Boston', lat: 42.3484, lon: -71.0441, timezone: 'America/New_York' }
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
  console.log(`LIVE PRODUCTION VERIFICATION (${PROD_HOST}) - BATCH 4 MARKETS`);
  console.log('======================================================================\n');

  console.log('| Market | Venue | Official Events | Direct Checkout HTTP | Timezone | Status |');
  console.log('|---|---|:---:|---|---|:---:|');

  let totalOfficial = 0;
  const marketAuditResults = [];

  for (const m of BATCH4_MARKETS) {
    const feedUrl = `${PROD_HOST}/api/feed?lat=${m.lat}&lon=${m.lon}&mode=comedy&window=all`;
    const res = await fetch(feedUrl);
    if (!res.ok) {
      console.log(`| ${m.market} | ${m.venueName} | 0 | HTTP ${res.status} | ${m.timezone} | **FAILED** |`);
      marketAuditResults.push({ ...m, pass: false, count: 0 });
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

    marketAuditResults.push({
      ...m,
      pass: officialEvents.length > 0 && checkoutTest.ok,
      count: officialEvents.length
    });
  }

  console.log(`\nTotal Live Official Inventory across Batch 4 Markets: ${totalOfficial}`);

  // Denver Quarantine
  console.log('\n--- DENVER PRODUCTION QUARANTINE AUDIT ---');
  const denverRes = await fetch(`${PROD_HOST}/api/feed?lat=39.7392&lon=-104.9903&mode=comedy&window=all`);
  const denverData = await denverRes.json();
  const syntheticSeeds = (denverData.events || []).filter(e =>
    e.id === 'comedy_seed_denver_02' || e.id === 'comedy_pilot_denver_03'
  );
  console.log('Synthetic Denver seeds in production feed (must be 0):', syntheticSeeds.length);

  if (marketAuditResults.some(m => !m.pass) || syntheticSeeds.length !== 0) {
    throw new Error('Batch 4 production audit failed!');
  }

  console.log('\n======================================================================');
  console.log('BATCH 4 PRODUCTION PROMOTION & VERIFICATION COMPLETE (ALL PASS)');
  console.log('======================================================================\n');
}

main().catch(err => {
  console.error('\nVerification failed:', err.message);
  process.exit(1);
});
