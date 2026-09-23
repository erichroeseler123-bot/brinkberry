// scripts/check-scripts.mjs
async function check() {
  const zRes = await fetch('https://chicago.zanies.com/events/', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const zHtml = await zRes.text();
  const iframes = [...zHtml.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
  console.log('Zanies iframes:', iframes);
  const scripts = [...zHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
  console.log('Zanies script srcs:', scripts.filter(s => !s.includes('jquery') && !s.includes('wp-includes')));

  const dRes = await fetch('https://denver.improv.com/calendar', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const dHtml = await dRes.text();
  const dIframes = [...dHtml.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
  console.log('\nDenver Improv iframes:', dIframes);
  // Check for calendar container or show elements in Denver Improv
  const eventLinks = [...dHtml.matchAll(/href=["'](\/event\/[^"']+|https?:\/\/[^"']*ticketweb\.com\/event\/[^"']+)["']/gi)].map(m => m[1]);
  console.log('Denver Improv event links:', eventLinks);
  const comicLinks = [...dHtml.matchAll(/href=["'](\/comic\/[^"']+)["']/gi)].map(m => m[1]);
  console.log('Denver Improv comic links:', comicLinks.slice(0, 10));
}

check().catch(console.error);
