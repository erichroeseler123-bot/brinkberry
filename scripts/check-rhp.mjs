// scripts/check-rhp.mjs
async function checkRhp() {
  const zRes = await fetch('https://chicago.zanies.com/events/', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const zHtml = await zRes.text();
  console.log('contains October:', zHtml.includes('October'), 'contains 2026:', zHtml.includes('2026'), 'contains etix:', zHtml.includes('etix'));
  const m = zHtml.match(/class=["'][^"']*event[^"']*["']/gi);
  console.log('event classes:', m ? m.slice(0, 10) : 'none');
  const links = [...zHtml.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  console.log('Total links on page:', links.length);
  const showLinks = links.filter(l => l[1].includes('event') || l[1].includes('show') || l[1].includes('ticket'));
  console.log('Show-like links:', showLinks.slice(0, 10).map(l => ({ href: l[1], text: l[2].replace(/<[^>]+>/g, '').trim() })));
  // Check for admin-ajax or api
  const ajaxMatches = zHtml.match(/https?:\/\/[^"'\s]*(?:admin-ajax\.php|wp-json\/rhp)[^"'\s]*/gi);
  console.log('AJAX matches:', ajaxMatches);

  // Check inline script contents
  const inlineScripts = [...zHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  const rhpInline = inlineScripts.filter(s => s.includes('rhp') || s.includes('events') || s.includes('etix'));
  console.log('RHP inline script snippets:', rhpInline.length);
  for (const s of rhpInline.slice(0, 3)) {
    console.log('--- snippet ---\n', s.slice(0, 300));
  }
}

checkRhp().catch(console.error);
