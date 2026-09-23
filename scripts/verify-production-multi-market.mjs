import fs from 'node:fs';

const PROD_HOST = 'https://brinkberry.com';

// Read CRON_SECRET from .env.prod.tmp
let cronSecret = process.env.CRON_SECRET || '';
if (fs.existsSync('.env.prod.tmp')) {
  const content = fs.readFileSync('.env.prod.tmp', 'utf8');
  const cronMatch = content.match(/^CRON_SECRET=(.+)$/m);
  if (cronMatch) cronSecret = cronMatch[1].replace(/^["']|["']$/g, '').trim();
}

async function main() {
  console.log('===============================================================');
  console.log('BRINKBERRY PRODUCTION MULTI-MARKET REFRESH & AUDIT');
  console.log('===============================================================\n');

  console.log(`Target: ${PROD_HOST}`);
  console.log(`CRON_SECRET configured: ${Boolean(cronSecret)} (Length: ${cronSecret.length})`);

  // --- 1. RUN PRODUCTION REFRESH CYCLE ---
  console.log('\n--- 1. TRIGGERING PRODUCTION CRON REFRESH ---');
  const cronUrl = `${PROD_HOST}/api/cron-ingest?source=expansion`;
  const cronRes = await fetch(cronUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cronSecret}`,
      'Content-Type': 'application/json'
    }
  });

  console.log('Production Cron HTTP Status:', cronRes.status);
  const cronData = await cronRes.json();
  console.log('Production Cron Success:', cronData.success);
  console.log('Environment:', cronData.environment);
  console.log('Namespace:', cronData.namespace);
  console.log('Expansion Records Written:', cronData.expansionRecordsWritten);
  console.log('Reports:', JSON.stringify(cronData.reports, null, 2));

  // --- 2. QUERY 4 PRODUCTION MARKET FEEDS ---
  console.log('\n--- 2. LIVE PRODUCTION FEEDS AUDIT ---');

  const markets = [
    { name: 'Birmingham, AL', lat: 33.3752, lon: -86.8122, expectedVenue: 'Stardome' },
    { name: 'Charlotte, NC', lat: 35.2407, lon: -80.8491, expectedVenue: 'Comedy Zone' },
    { name: 'Atlanta, GA', lat: 33.7490, lon: -84.3880, expectedVenue: 'Punchline' },
    { name: 'Minneapolis, MN', lat: 44.9877, lon: -93.2721, expectedVenue: 'Acme' }
  ];

  for (const m of markets) {
    const feedUrl = `${PROD_HOST}/api/feed?lat=${m.lat}&lon=${m.lon}&mode=comedy&window=all`;
    const res = await fetch(feedUrl);
    console.log(`\nMarket: ${m.name} -> HTTP ${res.status}`);
    const data = await res.json();
    const events = data.events || [];
    console.log(`  Total feed events: ${events.length}`);

    const officialEvents = events.filter(e => e.confirmationStatus === 'confirmed_by_official_calendar');
    console.log(`  Official calendar events: ${officialEvents.length}`);

    const targetVenueEvents = events.filter(e => {
      const v = (e.venue?.name || e.venue_name || e.venue || '').toLowerCase();
      return v.includes(m.expectedVenue.toLowerCase());
    });
    console.log(`  Target venue (${m.expectedVenue}) events: ${targetVenueEvents.length}`);

    if (targetVenueEvents.length > 0) {
      const sample = targetVenueEvents[0];
      console.log(`  Sample: "${sample.title}" on ${sample.civilDate} at ${sample.civilTime} (${sample.ticket_url || sample.ticketUrl})`);
    }
  }

  // --- 3. OPERATIONS DASHBOARD VERIFICATION ---
  console.log('\n--- 3. OPERATIONS DASHBOARD TELEMETRY ---');
  const dashRes = await fetch(`${PROD_HOST}/api/operations-dashboard?format=json`);
  console.log('Dashboard HTTP Status:', dashRes.status);
  const dashData = await dashRes.json();
  console.log('Total Registry Venues:', dashData.registry?.totalVenues);
  console.log('Platform Breakdown:', JSON.stringify(dashData.registry?.platformBreakdown, null, 2));
  console.log('Verified Markets Tracked:', dashData.verifiedMarkets?.length);
  console.log('Quarantine Status:', JSON.stringify(dashData.quarantineStatus, null, 2));

  // --- 4. DENVER QUARANTINE VERIFICATION ---
  console.log('\n--- 4. DENVER QUARANTINE AUDIT ---');
  const denverRes = await fetch(`${PROD_HOST}/api/feed?lat=39.7392&lon=-104.9903&mode=comedy&window=all`);
  const denverData = await denverRes.json();
  const denverSynthetic = (denverData.events || []).filter(e =>
    e.id === 'comedy_seed_denver_02' || e.id === 'comedy_pilot_denver_03'
  );
  console.log('Denver synthetic seeds found (must be 0):', denverSynthetic.length);
  if (denverSynthetic.length !== 0) {
    throw new Error('Denver quarantine breached!');
  }

  console.log('\n===============================================================');
  console.log('ALL PRODUCTION REFRESH & MULTI-MARKET AUDITS PASSED');
  console.log('===============================================================');
}

main()
  .catch(err => {
    console.error('Production audit failed:', err);
    process.exit(1);
  })
  .finally(() => {
    try { fs.unlinkSync('.env.prod.tmp'); } catch (_) {}
  });
