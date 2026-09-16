async function verifyLiveProduction() {
  const tests = [
    { url: 'https://brinkberry.com/', desc: 'Homepage' },
    { url: 'https://brinkberry.com/sitemap.xml', desc: 'Sitemap XML' },
    { url: 'https://brinkberry.com/robots.txt', desc: 'Robots TXT' },
    { url: 'https://brinkberry.com/denver/this-weekend', desc: 'Denver This Weekend' },
    { url: 'https://brinkberry.com/denver/music', desc: 'Denver Live Music' },
    { url: 'https://brinkberry.com/denver/free', desc: 'Denver Free Events' },
    { url: 'https://brinkberry.com/denver/outdoor', desc: 'Denver Outdoor' },
    { url: 'https://brinkberry.com/boulder/this-weekend', desc: 'Boulder This Weekend' },
    { url: 'https://brinkberry.com/boulder/music', desc: 'Boulder Live Music' },
    { url: 'https://brinkberry.com/boulder/free', desc: 'Boulder Free Events' },
    { url: 'https://brinkberry.com/boulder/outdoor', desc: 'Boulder Outdoor' },
    { url: 'https://brinkberry.com/golden/this-weekend', desc: 'Golden This Weekend' },
    { url: 'https://brinkberry.com/golden/music', desc: 'Golden Live Music' },
    { url: 'https://brinkberry.com/golden/free', desc: 'Golden Free Events' },
    { url: 'https://brinkberry.com/golden/outdoor', desc: 'Golden Outdoor' },
    { url: 'https://brinkberry.com/aurora/this-weekend', desc: 'Aurora This Weekend' },
    { url: 'https://brinkberry.com/aurora/music', desc: 'Aurora Live Music' },
    { url: 'https://brinkberry.com/aurora/free', desc: 'Aurora Free Events' },
    { url: 'https://brinkberry.com/aurora/outdoor', desc: 'Aurora Outdoor' }
  ];

  console.log('=== Live Production Audit on https://brinkberry.com ===');
  for (const t of tests) {
    const r = await fetch(t.url);
    const body = await r.text();
    const hasCanonical = body.includes('rel="canonical"') || body.includes('urlset') || body.includes('Find what’s happening');
    console.log(`${r.status} ${t.desc.padEnd(25)} size=${body.length}b  hasCanonical=${hasCanonical}`);
  }

  // Test live ticket redirect
  const clickTarget = 'https://www.redrocksonline.com/events/the-national-the-war-on-drugs-2026';
  const rClick = await fetch('https://brinkberry.com/api/click?url=' + encodeURIComponent(clickTarget), { redirect: 'manual' });
  console.log(`${rClick.status} Live Ticket Redirect -> ${rClick.headers.get('location')}`);
}
verifyLiveProduction();
