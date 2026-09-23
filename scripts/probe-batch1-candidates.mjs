// scripts/probe-batch1-candidates.mjs
const urls = [
  { slug: 'cap-city-comedy-club-austin', name: 'Cap City Austin', url: 'https://www.capcitycomedy.com/events' },
  { slug: 'helium-comedy-club-philadelphia', name: 'Helium Philadelphia', url: 'https://philadelphia.heliumcomedy.com/events' },
  { slug: 'hilarities-4th-street-theatre-cleveland', name: 'Hilarities Cleveland', url: 'https://hilarities.com/events' },
  { slug: 'helium-comedy-club-portland', name: 'Helium Portland', url: 'https://portland.heliumcomedy.com/events' },
  { slug: 'helium-comedy-club-st-louis', name: 'Helium St. Louis', url: 'https://st-louis.heliumcomedy.com/events' },
  { slug: 'helium-comedy-club-indianapolis', name: 'Helium Indianapolis', url: 'https://indianapolis.heliumcomedy.com/events' },
  { slug: 'funny-bone-columbus', name: 'Funny Bone Columbus', url: 'https://columbus.funnybone.com/events' },
  { slug: 'tempe-improv', name: 'Tempe Improv', url: 'https://tempeimprov.com/events' }
];

async function check() {
  for (const item of urls) {
    try {
      const res = await fetch(item.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      const html = await res.text();
      const hasLd = html.includes('application/ld+json');
      const hasSeatEngine = html.toLowerCase().includes('seatengine');
      const eventsCount = (html.match(/"@type"\s*:\s*"(?:ComedyEvent|Event)"/gi) || []).length;
      console.log(`${item.name} (${item.slug}) -> HTTP ${res.status}, bytes: ${html.length}, hasLd: ${hasLd}, hasSeatEngine: ${hasSeatEngine}, schemaEvents: ${eventsCount}`);
    } catch (e) {
      console.log(`${item.name} -> Error: ${e.message}`);
    }
  }
}
check();
