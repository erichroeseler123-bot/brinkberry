import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sitemapHandler = require('../api/sitemap.js');
const routerHandler = require('../api/router.js');

async function auditSitemapUrls() {
  let xml = '';
  await sitemapHandler(
    { url: '/sitemap.xml' },
    { setHeader() {}, status() { return this; }, send(d) { xml = d; } }
  );
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  console.log(`Auditing ${urls.length} URLs from sitemap.xml...`);

  let success = 0;
  let failed = 0;
  for (const fullUrl of urls) {
    const pathname = new URL(fullUrl).pathname;
    let html = '';
    const req = { url: pathname, method: 'GET' };
    const res = {
      statusCode: 200,
      setHeader() {},
      status(c) { this.statusCode = c; return this; },
      send(b) { html = b; return this; },
      json(j) { html = JSON.stringify(j); return this; },
      end(d) { if (d) html = d; return this; }
    };
    await routerHandler(req, res);
    const hasCanonical = html.includes('rel="canonical"') || html.includes('urlset') || html.includes('Find what’s happening');
    if (res.statusCode === 200 && hasCanonical) {
      success++;
    } else {
      failed++;
      console.log(`Failed: ${pathname} status=${res.statusCode} hasCanonical=${hasCanonical}`);
    }
  }
  console.log(`Audit Results: ${success}/${urls.length} passed, ${failed} failed.`);
}
auditSitemapUrls();
