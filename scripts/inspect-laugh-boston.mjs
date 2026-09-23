import fs from 'node:fs';

async function inspect() {
  const res = await fetch('https://laughboston.com', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  const text = await res.text();
  console.log('HTML length:', text.length);

  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let count = 0;
  while ((match = jsonLdRegex.exec(text)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const it of items) {
        if (it['@type'] && it['@type'].includes('Event')) {
          count++;
          if (count <= 3) {
            console.log(`Event ${count}:`, {
              name: it.name,
              url: it.url,
              offersUrl: it.offers?.url,
              offers: it.offers
            });
          }
        }
      }
    } catch (e) {
      console.error('JSON parse error:', e.message);
    }
  }
  console.log('Total JSON-LD Events:', count);

  // Check if there are other event links in the page (e.g. /events/ or /shows/)
  const links = [];
  const linkRegex = /href=["']([^"']+)["']/gi;
  let lMatch;
  while ((lMatch = linkRegex.exec(text)) !== null) {
    const href = lMatch[1];
    if (href.includes('/event') || href.includes('/show') || href.includes('seatengine')) {
      links.push(href);
    }
  }
  console.log('Sample event/show/seatengine links found on page:', links.slice(0, 10));
}

inspect().catch(console.error);
