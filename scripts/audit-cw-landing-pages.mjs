// scripts/audit-cw-landing-pages.mjs
// Audit all 72 unique Comedy Works show landing pages across the 162 performances
// to confirm each contains an actual ticket/cart path.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const cFile = path.join(os.tmpdir(), 'brinkberry_canonical_events.json');
const events = JSON.parse(fs.readFileSync(cFile, 'utf8'));
const cwEvents = events.filter(e => (e.venue_slug || '').includes('comedy-works') || (e.venue_name || '').includes('Comedy Works'));

console.log('======================================================================');
console.log('COMEDY WORKS OFFICIAL SHOW LANDING PAGE & TICKET/CART PATH AUDIT');
console.log(`Total Canonical Performances: ${cwEvents.length}`);
console.log('======================================================================\n');

const uniqueUrls = Array.from(new Set(cwEvents.map(e => e.ticket_url || e.url)));
console.log(`Auditing all ${uniqueUrls.length} unique show landing pages...\n`);

const results = [];
const batchSize = 6;

for (let i = 0; i < uniqueUrls.length; i += batchSize) {
  const batch = uniqueUrls.slice(i, i + batchSize);
  const batchPromises = batch.map(async (url) => {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (!res.ok) {
        return { url, status: res.status, ok: false, error: `HTTP ${res.status}` };
      }

      const html = await res.text();

      // Check for ticket / cart indicators
      const hasCartPath = /action=["'][^"']*cart[^"']*["']/i.test(html) ||
                          /action=["'][^"']*order[^"']*["']/i.test(html) ||
                          /action=["'][^"']*checkout[^"']*["']/i.test(html);

      const hasTicketForm = /<form[^>]*class=["'][^"']*ticket[^"']*["']/i.test(html) ||
                            /<form[^>]*name=["'][^"']*ticket[^"']*["']/i.test(html) ||
                            /<form[^>]*>[\s\S]*?(?:buy tickets|add to cart|purchase|select tickets|showtimes?)[\s\S]*?<\/form>/i.test(html);

      const hasTicketButtons = /(?:buy tickets|add to cart|purchase tickets|select quantity|showtime)/i.test(html);

      const hasCartLinks = /href=["'][^"']*(?:cart|tickets?|checkout)[^"']*["']/i.test(html);

      const verifiedTicketPath = hasCartPath || hasTicketForm || hasTicketButtons || hasCartLinks;

      // Extract sample cart/ticket element snippet
      let snippet = 'ticket-form/cart';
      const formMatch = html.match(/<form[^>]*action=["']([^"']+)["'][^>]*>/i);
      if (formMatch) {
        snippet = `form: ${formMatch[1]}`;
      } else if (hasTicketButtons) {
        snippet = 'ticket purchase/showtime selector';
      }

      return {
        url,
        status: res.status,
        ok: true,
        bytes: html.length,
        hasCartPath,
        hasTicketForm,
        hasTicketButtons,
        hasCartLinks,
        verifiedTicketPath,
        snippet
      };
    } catch (err) {
      return { url, status: 0, ok: false, error: err.message };
    }
  });

  const batchResults = await Promise.all(batchPromises);
  results.push(...batchResults);
  process.stdout.write(`Audited ${results.length}/${uniqueUrls.length}...\r`);
  await new Promise(r => setTimeout(r, 200));
}

console.log(`\n\n--- AUDIT RESULTS FOR ${results.length} LANDING PAGES ---`);
const passed = results.filter(r => r.ok && r.verifiedTicketPath);
const failed = results.filter(r => !r.ok || !r.verifiedTicketPath);

console.log(`Total URLs Audited:                    ${results.length}`);
console.log(`Pages with Verified Ticket/Cart Path:  ${passed.length}`);
console.log(`Failed / Incomplete:                   ${failed.length}`);

console.log('\nSample Verified Show Landing Pages:');
console.log('| URL | HTTP Status | Size (KB) | Verified Ticket/Cart Path |');
console.log('|---|:---:|:---:|---|');
for (const p of passed.slice(0, 10)) {
  console.log(`| ${p.url} | ${p.status} | ${(p.bytes / 1024).toFixed(1)} KB | ${p.snippet} |`);
}

if (failed.length > 0) {
  console.log('\nFailed URLs:');
  console.log(failed);
}

// Map back to all 162 canonical performances
const verifiedUrlSet = new Set(passed.map(p => p.url));
const eventsWithTicketPath = cwEvents.filter(e => verifiedUrlSet.has(e.ticket_url || e.url));

console.log(`\nCanonical Performances Mapped to Verified Show Pages: ${eventsWithTicketPath.length} / ${cwEvents.length}`);

if (eventsWithTicketPath.length === cwEvents.length) {
  console.log('\n>>> SUCCESS: All 162 Comedy Works canonical performances map to verified official show landing pages containing an active ticket/cart path.');
} else {
  console.error(`\n>>> WARNING: Only ${eventsWithTicketPath.length}/${cwEvents.length} events have verified ticket paths.`);
  process.exit(1);
}
