async function audit() {
  const PROD = 'https://brinkberry.com';
  const markets = [
    { name: 'Birmingham, AL', lat: 33.3752, lon: -86.8122, venue: 'Stardome' },
    { name: 'Charlotte, NC', lat: 35.2407, lon: -80.8491, venue: 'Comedy Zone' },
    { name: 'Atlanta, GA', lat: 33.7490, lon: -84.3880, venue: 'Punchline' },
    { name: 'Minneapolis, MN', lat: 44.9877, lon: -93.2721, venue: 'Acme' }
  ];

  console.log('--- 4-MARKET PRODUCTION FEED AUDIT ---');
  for (const m of markets) {
    const res = await fetch(`${PROD}/api/feed?lat=${m.lat}&lon=${m.lon}&mode=comedy&window=all`);
    const data = await res.json();
    const events = data.events || [];
    const official = events.filter(e => e.confirmationStatus === 'confirmed_by_official_calendar');
    const venueEvents = events.filter(e => (e.venue?.name || e.venue_name || e.venue || '').toLowerCase().includes(m.venue.toLowerCase()));
    console.log(`${m.name}: HTTP ${res.status} | Total: ${events.length} | Official: ${official.length} | ${m.venue} events: ${venueEvents.length}`);
    if (venueEvents.length > 0) {
      const s = venueEvents[0];
      console.log(`  Sample: "${s.title}" on ${s.civilDate} at ${s.civilTime} (${s.ticket_url || s.ticketUrl})`);
    }
  }

  console.log('\n--- OPERATIONS DASHBOARD AUDIT ---');
  const dRes = await fetch(`${PROD}/api/operations-dashboard`, {
    headers: { 'accept': 'application/json' }
  });
  const dData = await dRes.json();
  console.log(`Dashboard: HTTP ${dRes.status} | Venues: ${dData.registrySummary?.totalVenues} | SeatEngine: ${dData.registrySummary?.platformBreakdown?.seatengine} | Verified Venues: ${dData.producingVerifiedVenuesCount}`);

  console.log('\n--- DENVER QUARANTINE AUDIT ---');
  const denRes = await fetch(`${PROD}/api/feed?lat=39.7392&lon=-104.9903&mode=comedy&window=all`);
  const denData = await denRes.json();
  const synth = (denData.events || []).filter(e => e.id === 'comedy_seed_denver_02' || e.id === 'comedy_pilot_denver_03');
  console.log(`Denver Synthetic Seeds: ${synth.length} (must be 0)`);
}

audit().catch(console.error);
