// scripts/inspect-dcl-eventbrite.mjs
async function inspectDCL() {
  const res = await fetch('https://denvercomedylounge.com/events', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();
  // Look for JSON or event items containing eventbrite links
  const ebItems = [...html.matchAll(/https?:\/\/(?:www\.)?eventbrite\.com\/e\/([a-zA-Z0-9-]+tickets-(\d+))/gi)];
  console.log('Unique Eventbrite ticket URLs found:', new Set(ebItems.map(m => m[0])).size);
  for (const m of ebItems.slice(0, 5)) {
    const url = m[0].replace(/\\+$/, '');
    const idx = m.index;
    const slice = html.slice(Math.max(0, idx - 300), Math.min(html.length, idx + 300));
    console.log('\nURL:', url);
    console.log('Context slice:', slice.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200));
  }
}

inspectDCL().catch(console.error);
