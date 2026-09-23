async function checkEndpoint(label, url) {
  try {
    const res = await fetch(url);
    const data = await res.json();
    const count = data.events?.length || 0;
    const sample = data.events?.slice(0, 3).map(e => ({
      title: e.title,
      venue: e.venue || e.venue_name,
      source: e.source,
      category: e.category,
      tags: e.category_tags
    }));
    const providers = data.providers;
    console.log(`\n=== [${label}] ===`);
    console.log(`URL: ${url}`);
    console.log(`Status: ${res.status} | Events Found: ${count}`);
    if (providers) {
      console.log(`SeatGeek: ${providers.seatgeek?.status} (count: ${providers.seatgeek?.count}) | Ticketmaster: ${providers.ticketmaster?.status} (count: ${providers.ticketmaster?.count}) | Community: ${providers.community?.count || 0}`);
    }
    if (count > 0) {
      console.log(`Sample Events:`, JSON.stringify(sample, null, 2));
    } else {
      console.log('WARNING: 0 events returned');
    }
    return count > 0;
  } catch (err) {
    console.error(`Error checking ${label}:`, err.message);
    return false;
  }
}

async function main() {
  const base = 'https://brinkberry.com';
  console.log('Testing Nationwide Comedy & Motorsports Discovery Live on brinkberry.com...');

  const results = [];

  // 1. New York City - Comedy
  results.push(await checkEndpoint('NYC Comedy (25mi)', `${base}/api/feed?lat=40.7128&lng=-74.0060&category=comedy&radius=25`));

  // 2. Los Angeles - Comedy
  results.push(await checkEndpoint('LA Comedy (25mi)', `${base}/api/feed?lat=34.0522&lng=-118.2437&category=comedy&radius=25`));

  // 3. Chicago - Comedy
  results.push(await checkEndpoint('Chicago Comedy (25mi)', `${base}/api/feed?lat=41.8781&lng=-87.6298&category=comedy&radius=25`));

  // 4. Austin - Comedy
  results.push(await checkEndpoint('Austin Comedy (25mi)', `${base}/api/feed?lat=30.2672&lng=-97.7431&category=comedy&radius=25`));

  // 5. Denver - Comedy (Pilot Market)
  results.push(await checkEndpoint('Denver Comedy (Pilot)', `${base}/api/feed?lat=39.7392&lng=-104.9903&category=comedy&radius=25`));

  // 6. Charlotte / Piedmont NC - Motorsports
  results.push(await checkEndpoint('Charlotte Motorsports (75mi)', `${base}/api/feed?lat=35.2271&lng=-80.8431&category=racing&radius=75`));

  // 7. Dallas-Fort Worth TX - Motorsports
  results.push(await checkEndpoint('Dallas Motorsports (75mi)', `${base}/api/feed?lat=32.7767&lng=-96.7970&category=racing&radius=75`));

  // 8. Indianapolis IN - Motorsports
  results.push(await checkEndpoint('Indianapolis Motorsports (75mi)', `${base}/api/feed?lat=39.7684&lng=-86.1581&category=racing&radius=75`));

  // 9. Multi-Day Planning Window - Charlotte Racing This Weekend
  results.push(await checkEndpoint('Charlotte Racing (This Weekend)', `${base}/api/feed?lat=35.2271&lng=-80.8431&category=racing&radius=75&window=this_weekend`));

  // 10. Check Ticketing Lockdown on Live Production
  const chk = await fetch(`${base}/api/comedy-checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventId: 'live_test' })
  });
  console.log(`\n=== [Checkout Lockdown Verification] ===`);
  console.log(`Status: ${chk.status} (expected 403)`);
  const chkJson = await chk.json();
  console.log(`Response:`, chkJson);

  const allPassed = results.every(Boolean) && chk.status === 403;
  console.log(`\n========================================`);
  console.log(`Overall Nationwide Discovery Result: ${allPassed ? 'ALL PASSED (100%)' : 'SOME CHECKS RETURNED ZERO'}`);
  console.log(`========================================`);
}

main().catch(console.error);
