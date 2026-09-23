// scripts/verify-batch3-preview-feeds.mjs
import fs from 'node:fs';

let adminToken = process.env.ADMIN_TOKEN || '';
let bypassSecret = process.env.VERCEL_PROTECTION_BYPASS || '';

if (fs.existsSync('.env.preview.tmp')) {
  const content = fs.readFileSync('.env.preview.tmp', 'utf8');
  const adminMatch = content.match(/^ADMIN_TOKEN=(.+)$/m);
  const bypassMatch = content.match(/^VERCEL_PROTECTION_BYPASS=(.+)$/m);
  if (adminMatch && !adminToken) adminToken = adminMatch[1].replace(/^["']|["']$/g, '').trim();
  if (bypassMatch && !bypassSecret) bypassSecret = bypassMatch[1].replace(/^["']|["']$/g, '').trim();
}

const host = process.argv[2] || 'https://brinkberry-ahd068yfw-erichroeseler123-bots-projects.vercel.app';

async function testFeeds() {
  console.log(`Auditing Comedy Feeds on ${host}...`);
  console.log(`Admin Token Loaded: ${Boolean(adminToken)}`);

  const points = [
    { name: 'NYC Midtown', venueName: 'New York Comedy Club Midtown', lat: 40.7389, lon: -73.9806, slug: 'new-york-comedy-club-midtown' },
    { name: 'NYC East Village', venueName: 'New York Comedy Club East Village', lat: 40.7258, lon: -73.9898, slug: 'new-york-comedy-club-east-village' },
    { name: 'Rutherford NJ (Bananas)', venueName: 'Bananas Comedy Club', lat: 40.8248, lon: -74.1018, slug: 'bananas-comedy-club-nj' }
  ];

  for (const pt of points) {
    const url = `${host}/api/feed?lat=${pt.lat}&lon=${pt.lon}&radius=25&mode=comedy&window=all&includePreview=true`;
    const res = await fetch(url, {
      headers: {
        'x-vercel-protection-bypass': bypassSecret,
        'Authorization': `Bearer ${adminToken}`
      }
    });
    const data = await res.json();
    const events = data.events || [];
    console.log(`\n[${pt.name}] status=${res.status}, totalEvents=${events.length}, timeZone=${data.timeZone}`);
    const matchingVenueEvents = events.filter(e => {
      const vSlug = e.venue?.slug || e.venue_slug || e.venueSlug;
      const vName = (e.venue?.name || e.venue_name || e.venue || '').toLowerCase();
      return vSlug === pt.slug || vName.includes(pt.venueName.toLowerCase());
    });
    console.log(` - Matching ${pt.slug}: ${matchingVenueEvents.length} shows`);
    if (matchingVenueEvents.length > 0) {
      console.log(` - Sample show: "${matchingVenueEvents[0].title}" on ${matchingVenueEvents[0].start}`);
      console.log(` - Ticket URL: ${matchingVenueEvents[0].ticket_url || matchingVenueEvents[0].ticketUrl}`);
      console.log(` - Timezone: ${matchingVenueEvents[0].venue?.timezone || matchingVenueEvents[0].timezone || matchingVenueEvents[0].venue_timezone}`);
      console.log(` - Confirmation: ${matchingVenueEvents[0].confirmationStatus}`);
    } else {
      console.log(' - Venues present in feed:', [...new Set(events.map(e => e.venue?.name || e.venue_name || e.venue))].slice(0, 10));
    }
  }

  console.log('\n--- Denver Quarantine Check ---');
  const dUrl = `${host}/api/feed?lat=39.7392&lon=-104.9903&mode=comedy&window=all`;
  const dRes = await fetch(dUrl);
  const dData = await dRes.json();
  const syntheticSeeds = (dData.events || []).filter(e => e.id === 'comedy_seed_denver_02' || e.id === 'comedy_pilot_denver_03');
  console.log(`Denver Synthetic Seeds Found (must be 0): ${syntheticSeeds.length}`);
}

testFeeds().catch(err => {
  console.error(err);
  process.exit(1);
});
