// scripts/probe-venue-source.mjs
const url = process.argv[2] || 'https://chicago.zanies.com/events/';

async function probe() {
  console.log(`Probing ${url}...`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Content-Length:', text.length);

  // Check JSON-LD
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let jsonLdBlocks = 0;
  while ((match = jsonLdRegex.exec(text)) !== null) {
    jsonLdBlocks++;
    try {
      const data = JSON.parse(match[1]);
      const graph = data['@graph'] || (Array.isArray(data) ? data : [data]);
      console.log(`JSON-LD Block ${jsonLdBlocks} items:`, graph.map(item => item['@type']));
      const events = graph.filter(item => (item['@type'] || '').includes('Event'));
      console.log(`  Events found in block ${jsonLdBlocks}:`, events.length);
      if (events.length > 0) {
        console.log('  Sample event name:', events[0].name, 'start:', events[0].startDate);
      }
    } catch (e) {
      console.log(`JSON-LD Block ${jsonLdBlocks} parse error:`, e.message);
    }
  }
  console.log(`\nTotal JSON-LD blocks found: ${jsonLdBlocks}`);

  // Check for ticketing markers
  console.log('Contains seatengine:', text.includes('seatengine'));
  console.log('Contains etix:', text.includes('etix'));
  console.log('Contains eventbrite:', text.includes('eventbrite'));
  console.log('Contains ticketweb:', text.includes('ticketweb'));
  console.log('Contains tixr:', text.includes('tixr'));

  const linkRegex = /href=["']([^"']*(?:show|event|ticket)[^"']*)["']/gi;
  const links = [];
  let lm;
  while ((lm = linkRegex.exec(text)) !== null) {
    links.push(lm[1]);
  }
  console.log('\nTicket/Show/Event links found:', links.length);
  console.log('Sample links:', [...new Set(links)].slice(0, 10));
}

probe().catch(console.error);
