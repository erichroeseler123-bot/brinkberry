// scripts/probe-seatengine-network.mjs
const targets = [
  { slug: 'louisville-comedy-club', name: 'Louisville Comedy Club', city: 'Louisville', state: 'KY', tz: 'America/Kentucky/Louisville', lat: 38.2527, lon: -85.7585, url: 'https://www.louisvillecomedy.com' },
  { slug: 'spokane-comedy-club', name: 'Spokane Comedy Club', city: 'Spokane', state: 'WA', tz: 'America/Los_Angeles', lat: 47.6588, lon: -117.4260, url: 'https://www.spokanecomedyclub.com' },
  { slug: 'tacoma-comedy-club', name: 'Tacoma Comedy Club', city: 'Tacoma', state: 'WA', tz: 'America/Los_Angeles', lat: 47.2529, lon: -122.4443, url: 'https://www.tacomacomedyclub.com' },
  { slug: 'bricktown-comedy-club-okc', name: 'Bricktown Comedy Club', city: 'Oklahoma City', state: 'OK', tz: 'America/Chicago', lat: 35.4676, lon: -97.5164, url: 'https://www.bricktowncomedy.com' },
  { slug: 'goodnights-comedy-club-raleigh', name: 'Goodnights Comedy Club', city: 'Raleigh', state: 'NC', tz: 'America/New_York', lat: 35.7796, lon: -78.6382, url: 'https://www.goodnightscomedy.com' },
  { slug: 'skyline-comedy-club-appleton', name: 'Skyline Comedy Club', city: 'Appleton', state: 'WI', tz: 'America/Chicago', lat: 44.2619, lon: -88.4154, url: 'https://www.skylinecomedy.com' },
  { slug: 'comedy-off-broadway-lexington', name: 'Comedy Off Broadway', city: 'Lexington', state: 'KY', tz: 'America/New_York', lat: 38.0406, lon: -84.5037, url: 'https://www.comedyoffbroadway.com' },
  { slug: 'richmond-funny-bone', name: 'Richmond Funny Bone', city: 'Richmond', state: 'VA', tz: 'America/New_York', lat: 37.6534, lon: -77.6139, url: 'https://richmond.funnybone.com' },
  { slug: 'omaha-funny-bone', name: 'Omaha Funny Bone', city: 'Omaha', state: 'NE', tz: 'America/Chicago', lat: 41.2565, lon: -95.9345, url: 'https://omaha.funnybone.com' },
  { slug: 'des-moines-funny-bone', name: 'Des Moines Funny Bone', city: 'West Des Moines', state: 'IA', tz: 'America/Chicago', lat: 41.5772, lon: -93.7113, url: 'https://desmoines.funnybone.com' },
  { slug: 'dayton-funny-bone', name: 'Dayton Funny Bone', city: 'Dayton', state: 'OH', tz: 'America/New_York', lat: 39.7589, lon: -84.1916, url: 'https://dayton.funnybone.com' },
  { slug: 'liberty-funny-bone', name: 'Liberty Funny Bone', city: 'Liberty Township', state: 'OH', tz: 'America/New_York', lat: 39.3789, lon: -84.3683, url: 'https://liberty.funnybone.com' },
  { slug: 'virginia-beach-funny-bone', name: 'Virginia Beach Funny Bone', city: 'Virginia Beach', state: 'VA', tz: 'America/New_York', lat: 36.8529, lon: -75.9780, url: 'https://vb.funnybone.com' },
  { slug: 'laugh-boston', name: 'Laugh Boston', city: 'Boston', state: 'MA', tz: 'America/New_York', lat: 42.3482, lon: -71.0447, url: 'https://laughboston.com' }
];

async function probe() {
  console.log('Probing target clubs for SeatEngine JSON-LD support...\n');
  const viable = [];

  for (const t of targets) {
    const urls = [`${t.url}/events`, t.url];
    let passed = null;

    for (const u of urls) {
      try {
        const res = await fetch(u, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        if (!res.ok) continue;
        const text = await res.text();
        const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
        let match;
        let events = 0;
        let sample = null;
        while ((match = jsonLdRegex.exec(text)) !== null) {
          try {
            const data = JSON.parse(match[1]);
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              if ((item['@type'] || '').includes('Event') || item['@type'] === 'ComedyEvent') {
                events++;
                if (!sample) sample = item;
              }
            }
          } catch (_) {}
        }

        if (events > 0) {
          passed = { url: u, count: events, sample: sample?.name, start: sample?.startDate };
          break;
        }
      } catch (err) {}
    }

    if (passed) {
      console.log(`[PASS] ${t.name} (${t.city}, ${t.state}) -> ${passed.url} (${passed.count} shows, sample: "${passed.sample}" on ${passed.start})`);
      viable.push({ ...t, calendarFeedUrl: passed.url, showCount: passed.count });
    } else {
      console.log(`[FAIL] ${t.name} (${t.city}, ${t.state})`);
    }
  }

  console.log(`\nTotal passing SeatEngine clubs: ${viable.length}`);
  console.log('\nViable clubs JSON:');
  console.log(JSON.stringify(viable, null, 2));
}

probe().catch(console.error);
