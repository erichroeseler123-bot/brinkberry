// scripts/probe-candidates-deep.mjs
const candidates = [
  { slug: 'rooster-t-feathers-sunnyvale', urls: ['https://roostertfeathers.com', 'https://roostertfeathers.com/calendar', 'https://roostertfeathers.com/events'] },
  { slug: 'st-louis-funny-bone', urls: ['https://stlouisfunnybone.com', 'https://www.stlouisfunnybone.com/calendar', 'https://www.stlouisfunnybone.com/events'] },
  { slug: 'the-ice-house-pasadena', urls: ['https://icehousecomedy.com', 'https://icehousecomedy.com/calendar', 'https://icehousecomedy.com/shows'] },
  { slug: 'laugh-boston', urls: ['https://laughboston.com', 'https://laughboston.com/calendar', 'https://laughboston.com/shows'] },
  { slug: 'greenwich-village-comedy-club', urls: ['https://greenwichvillagecomedyclub.com', 'https://greenwichvillagecomedyclub.com/calendar', 'https://greenwichvillagecomedyclub.com/shows'] },
  { slug: 'dallas-comedy-club', urls: ['https://dallas-comedyclub.com', 'https://dallas-comedyclub.com/calendar', 'https://dallas-comedyclub.com/shows'] },
  { slug: 'uptown-comedy-corner-atlanta', urls: ['https://uptowncomedy.net', 'https://uptowncomedy.net/calendar', 'https://uptowncomedy.net/shows'] },
  { slug: 'house-of-comedy-minnesota', urls: ['https://houseofcomedy.net/minnesota', 'https://houseofcomedy.net'] }
];

async function check() {
  for (const c of candidates) {
    console.log(`\n=== Testing ${c.slug} ===`);
    for (const u of c.urls) {
      try {
        const res = await fetch(u, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          redirect: 'follow'
        });
        const text = await res.text();
        const hasSeatEngine = text.includes('seatengine');
        const hasJsonLd = text.includes('application/ld+json');
        const hasEvents = (text.match(/ComedyEvent|Event/g) || []).length;
        console.log(`[HTTP ${res.status}] ${u} -> bytes: ${text.length}, seatengine: ${hasSeatEngine}, jsonld: ${hasJsonLd}, eventMarkers: ${hasEvents}`);
      } catch (err) {
        console.log(`[ERROR] ${u} -> ${err.message}`);
      }
    }
  }
}

check().catch(console.error);
