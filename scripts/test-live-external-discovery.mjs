import assert from 'node:assert/strict';

const BASE_URL = process.env.LIVE_URL || 'https://brinkberry.com';

async function testMarket(name, lat, lon) {
  console.log(`\n======================================================`);
  console.log(`TESTING MARKET: ${name} (${lat}, ${lon}) via ${BASE_URL}`);
  console.log(`======================================================`);

  const url = `${BASE_URL}/api/feed?lat=${lat}&lng=${lon}&radius=35&window=48h`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  const data = await res.json();
  const events = data.events || [];
  console.log(`Total Events Returned: ${events.length}`);

  const categoryCounts = {};
  const sourceQualityCounts = {};
  const hasTicketCounts = { ticketed: 0, nonTicketed: 0 };

  for (const e of events) {
    categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
    if (e.sourceQualityLabel) {
      sourceQualityCounts[e.sourceQualityLabel] = (sourceQualityCounts[e.sourceQualityLabel] || 0) + 1;
    }
    if (e.hasTicket) {
      hasTicketCounts.ticketed++;
    } else {
      hasTicketCounts.nonTicketed++;
    }
  }

  console.log('Category Distribution:');
  console.table(categoryCounts);

  console.log('Source Quality Labels:');
  console.table(sourceQualityCounts);

  console.log(`Ticketing Optionality: ${hasTicketCounts.ticketed} with tickets, ${hasTicketCounts.nonTicketed} without forced tickets`);

  console.log('\nSample Events:');
  events.slice(0, 10).forEach((e, idx) => {
    console.log(` ${idx + 1}. [${e.category.toUpperCase()}] ${e.title}`);
    console.log(`    Venue: ${e.venue} (${e.city || 'local'})`);
    console.log(`    Time: ${e.start} | Price: ${e.priceDisplay || 'Free'}`);
    console.log(`    Label: "${e.sourceQualityLabel || 'N/A'}" | hasTicket: ${e.hasTicket}`);
    console.log(`    Target URL: ${e.ticketUrl || e.detailsUrl || 'none'}\n`);
  });

  return { events, categoryCounts, sourceQualityCounts, hasTicketCounts };
}

async function run() {
  console.log(`Starting live external verification against: ${BASE_URL}`);

  // 1. Eau Claire Test
  const ec = await testMarket('Eau Claire, WI', 44.8113, -91.4985);

  // 2. Denver Test
  const den = await testMarket('Denver, CO', 39.7392, -104.9903);

  // Assertions
  console.log('\n======================================================');
  console.log('VERIFICATION AUDIT ASSERTIONS');
  console.log('======================================================');

  const ecCategories = Object.keys(ec.categoryCounts);
  console.log(`Eau Claire Categories: ${ecCategories.join(', ')}`);
  assert.ok(ecCategories.length > 1, 'Eau Claire must have multiple categories, not only comedy');

  const denCategories = Object.keys(den.categoryCounts);
  console.log(`Denver Categories: ${denCategories.join(', ')}`);
  assert.ok(denCategories.length > 1, 'Denver must have multiple categories, not only comedy');
  assert.ok(denCategories.includes('comedy'), 'Denver must include comedy');

  console.log('\n✓ ALL LIVE EXTERNAL TESTS PASSED: Multiple categories confirmed live in production!');
}

run().catch(err => {
  console.error('External verification failed:', err);
  process.exit(1);
});
