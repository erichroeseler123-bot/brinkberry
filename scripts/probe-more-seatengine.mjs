// scripts/probe-more-seatengine.mjs
const testUrls = [
  { name: 'Helium Buffalo', url: 'https://buffalo.heliumcomedy.com/events' },
  { name: 'Goodnights Raleigh', url: 'https://www.goodnightscomedy.com/events' },
  { name: 'Soul Joels', url: 'https://souljoels.com/events' },
  { name: 'Stress Factory New Brunswick', url: 'https://newbrunswick.stressfactory.com/events' },
  { name: 'Stress Factory Bridgeport', url: 'https://bridgeport.stressfactory.com/events' },
  { name: 'Comedy on State Madison', url: 'https://madisoncomedy.com/events' },
  { name: 'Side Splitters Tampa', url: 'https://sidesplitterscomedy.com/events' },
  { name: 'McCurdys Sarasota', url: 'https://mccurdyscomedy.com/events' },
  { name: 'Off The Hook Naples', url: 'https://offthehookcomedy.com/events' },
  { name: 'Funny Bone Omaha', url: 'https://omaha.funnybone.com/events' },
  { name: 'Funny Bone Des Moines', url: 'https://desmoines.funnybone.com/events' },
  { name: 'Laugh Boston', url: 'https://laughboston.com' }
];

async function check() {
  for (const t of testUrls) {
    try {
      const res = await fetch(t.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      const text = await res.text();
      const hasSE = text.includes('seatengine');
      const ldMatch = text.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
      let ldEvents = 0;
      for (const m of ldMatch) {
        const jsonText = m.replace(/<\/?script[^>]*>/gi, '');
        try {
          const d = JSON.parse(jsonText);
          const arr = Array.isArray(d) ? d : (d['@graph'] || [d]);
          ldEvents += arr.filter(x => (x['@type'] || '').includes('Event')).length;
        } catch (_) {}
      }
      console.log(`[HTTP ${res.status}] ${t.name}: bytes=${text.length}, seatengine=${hasSE}, jsonldEvents=${ldEvents}`);
    } catch (e) {
      console.log(`[FAIL] ${t.name}: ${e.message}`);
    }
  }
}

check().catch(console.error);
