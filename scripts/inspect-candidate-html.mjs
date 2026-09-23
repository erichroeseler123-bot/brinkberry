// scripts/inspect-candidate-html.mjs
import fs from 'node:fs';

async function probe() {
  const zRes = await fetch('https://chicago.zanies.com/events/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Brinkberry/1.0' }
  });
  const zHtml = await zRes.text();
  console.log('--- Zanies HTML Sample ---');
  // Check for script tags or hrefs
  const zHrefs = [...zHtml.matchAll(/href=["']([^"']+)["']/g)].map(m => m[1]);
  console.log('Sample Zanies Hrefs (non-css/js):', zHrefs.filter(h => !h.includes('.css') && !h.includes('.js') && !h.includes('wp-content')).slice(0, 20));

  const dRes = await fetch('https://denver.improv.com/calendar', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Brinkberry/1.0' }
  });
  const dHtml = await dRes.text();
  console.log('\n--- Denver Improv HTML Sample ---');
  const dHrefs = [...dHtml.matchAll(/href=["']([^"']+)["']/g)].map(m => m[1]);
  console.log('Sample Denver Improv Hrefs:', dHrefs.filter(h => !h.includes('.css') && !h.includes('.js') && !h.includes('wp-content')).slice(0, 20));
  
  // Look for JSON or ld+json in Denver Improv
  const dJsonLd = [...dHtml.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  console.log('Denver Improv JSON-LD blocks found:', dJsonLd.length);
  if (dJsonLd.length > 0) {
    console.log('Sample JSON-LD:', dJsonLd[0].slice(0, 300));
  }
}

probe().catch(console.error);
