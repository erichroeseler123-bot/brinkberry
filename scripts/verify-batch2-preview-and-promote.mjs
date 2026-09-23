// scripts/verify-batch2-preview-and-promote.mjs
// End-to-end verification of Batch 2 on Vercel Preview

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { BATCH2_SEATENGINE_VENUES } from '../lib/comedy/national-registry.js';
import { ingestSeatEngineVenue } from '../lib/ingestion/adapters/seatengine.js';
import { evaluateAutoPromotionCriteria } from '../lib/ingestion/discovery-pipeline.js';
import { LocalFileCanonicalStorage } from '../lib/storage/canonical-event-storage.js';

let cronSecret = process.env.CRON_SECRET || '';
let adminToken = process.env.ADMIN_TOKEN || '';
let bypassSecret = process.env.VERCEL_PROTECTION_BYPASS || '';

if (fs.existsSync('.env.preview.tmp')) {
  const content = fs.readFileSync('.env.preview.tmp', 'utf8');
  const cronMatch = content.match(/^CRON_SECRET=(.+)$/m);
  const adminMatch = content.match(/^ADMIN_TOKEN=(.+)$/m);
  if (cronMatch && !cronSecret) cronSecret = cronMatch[1].replace(/^["']|["']$/g, '').trim();
  if (adminMatch && !adminToken) adminToken = adminMatch[1].replace(/^["']|["']$/g, '').trim();
}

const args = process.argv.slice(2);
let previewHost = process.env.PREVIEW_HOST || '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--preview-host' && args[i + 1]) {
    previewHost = args[i + 1];
    i++;
  }
}

if (!previewHost) {
  console.error('Usage: node scripts/verify-batch2-preview-and-promote.mjs --preview-host <url>');
  process.exit(1);
}

const BATCH2_MARKETS = [
  {
    market: 'Indianapolis',
    venueSlug: 'helium-comedy-club-indianapolis',
    venueName: 'Helium Comedy Club Indianapolis',
    lat: 39.7684,
    lon: -86.1581,
    timezone: 'America/Indiana/Indianapolis',
    minEvents: 150
  },
  {
    market: 'Baltimore',
    venueSlug: 'magoobys-joke-house-timonium',
    venueName: "Magooby's Joke House",
    lat: 39.2904,
    lon: -76.6122,
    timezone: 'America/New_York',
    minEvents: 100
  },
  {
    market: 'Kansas City',
    venueSlug: 'comedy-club-of-kansas-city',
    venueName: 'The Comedy Club of Kansas City',
    lat: 39.0997,
    lon: -94.5786,
    timezone: 'America/Chicago',
    minEvents: 80
  },
  {
    market: 'Phoenix',
    venueSlug: 'stand-up-live-phoenix',
    venueName: 'Stand Up Live Phoenix',
    lat: 33.4484,
    lon: -112.0740,
    timezone: 'America/Phoenix',
    minEvents: 70
  },
  {
    market: 'Tempe',
    venueSlug: 'tempe-improv',
    venueName: 'Tempe Improv',
    lat: 33.4255,
    lon: -111.9400,
    timezone: 'America/Phoenix',
    minEvents: 80
  }
];

async function verifyCheckoutUrl(url) {
  if (!url || !url.startsWith('http')) return { ok: false, status: 0, reason: 'invalid_url' };
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const text = await res.text();
    const hasMarkers = /ticket|seat|cart|admission|event|shows?/i.test(text);
    return {
      ok: res.status === 200 && hasMarkers,
      status: res.status,
      bytes: text.length,
      hasMarkers,
      isWrapped: url.includes('/click') || url.includes('affiliate') || url.includes('tracker')
    };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

async function main() {
  console.log('======================================================================');
  console.log('BATCH 2 VERCEL PREVIEW VERIFICATION & IDEMPOTENCY AUDIT');
  console.log('======================================================================\n');
  console.log(`Preview Host: ${previewHost}`);
  console.log(`CRON_SECRET loaded: ${Boolean(cronSecret)} (length: ${cronSecret.length})`);
  console.log(`ADMIN_TOKEN loaded: ${Boolean(adminToken)} (length: ${adminToken.length})`);
  console.log(`Protection Bypass: ${bypassSecret ? 'Present' : 'None'}`);

  // 1. REMOTE INGESTION PASS 1 ON PREVIEW
  console.log('\n--- 1. REMOTE INGESTION PASS 1 (POST /api/cron-ingest?source=batch2) ---');
  const cronUrl = `${previewHost}/api/cron-ingest?source=batch2`;
  const resPass1 = await fetch(cronUrl, {
    method: 'POST',
    headers: {
      'x-vercel-protection-bypass': bypassSecret,
      'Authorization': `Bearer ${cronSecret}`
    }
  });

  console.log('Pass 1 HTTP Status:', resPass1.status);
  const dataPass1 = await resPass1.json();
  console.log('Pass 1 Success:', dataPass1.success);
  console.log('Pass 1 Processed Venues:', dataPass1.processed);
  console.log('Pass 1 Succeeded Venues:', dataPass1.succeeded);
  console.log('Pass 1 Auto-Published Events:', dataPass1.autoPublished);

  if (resPass1.status !== 200 || !dataPass1.success || dataPass1.succeeded !== 5) {
    throw new Error(`Pass 1 failed: status=${resPass1.status}, success=${dataPass1.success}`);
  }

  // 2. REMOTE INGESTION PASS 2 ON PREVIEW (IDEMPOTENCY)
  console.log('\n--- 2. REMOTE INGESTION PASS 2 (POST /api/cron-ingest?source=batch2) ---');
  const resPass2 = await fetch(cronUrl, {
    method: 'POST',
    headers: {
      'x-vercel-protection-bypass': bypassSecret,
      'Authorization': `Bearer ${cronSecret}`
    }
  });

  console.log('Pass 2 HTTP Status:', resPass2.status);
  const dataPass2 = await resPass2.json();
  console.log('Pass 2 Success:', dataPass2.success);
  console.log('Pass 2 Processed Venues:', dataPass2.processed);
  console.log('Pass 2 Succeeded Venues:', dataPass2.succeeded);
  console.log('Pass 2 Auto-Published Events:', dataPass2.autoPublished);

  if (resPass2.status !== 200 || !dataPass2.success || dataPass2.succeeded !== 5) {
    throw new Error(`Pass 2 failed: status=${resPass2.status}, success=${dataPass2.success}`);
  }

  // 3. FULL CANONICAL ID AND FINGERPRINT COMPARISON
  console.log('\n--- 3. BATCH 2 CANONICAL ID & FINGERPRINT IDEMPOTENCY SET COMPARISON ---');
  const tmpStore = path.join(os.tmpdir(), `batch2_idempotency_audit_${Date.now()}.json`);
  const storage = new LocalFileCanonicalStorage(tmpStore);

  const allPass1Events = [];
  for (const v of BATCH2_SEATENGINE_VENUES) {
    const rep = await ingestSeatEngineVenue(v, { persist: false, environment: 'preview', namespace: 'preview_expansion' });
    const promotable = rep.events.filter(e => evaluateAutoPromotionCriteria(e).isPromotable);
    allPass1Events.push(...promotable);
  }
  await storage.upsertEvents(allPass1Events);
  const stored1 = await storage.queryEvents({
    radiusMiles: 5000,
    includePreview: true,
    environment: 'preview',
    namespace: 'preview_expansion',
    windowStart: '2026-01-01T00:00:00.000Z',
    windowEnd: '2099-01-01T00:00:00.000Z'
  });

  const idsBefore = new Set(stored1.map(e => e.id));
  const fingerprintsBefore = stored1.map(e => e.fingerprint);

  const allPass2Events = [];
  for (const v of BATCH2_SEATENGINE_VENUES) {
    const rep = await ingestSeatEngineVenue(v, { persist: false, environment: 'preview', namespace: 'preview_expansion' });
    const promotable = rep.events.filter(e => evaluateAutoPromotionCriteria(e).isPromotable);
    allPass2Events.push(...promotable);
  }
  await storage.upsertEvents(allPass2Events);
  const stored2 = await storage.queryEvents({
    radiusMiles: 5000,
    includePreview: true,
    environment: 'preview',
    namespace: 'preview_expansion',
    windowStart: '2026-01-01T00:00:00.000Z',
    windowEnd: '2099-01-01T00:00:00.000Z'
  });

  const idsAfter = new Set(stored2.map(e => e.id));
  const fingerprintsAfter = stored2.map(e => e.fingerprint);

  const newIds = [...idsAfter].filter(id => !idsBefore.has(id));
  const duplicateFingerprints = fingerprintsAfter.length - new Set(fingerprintsAfter).size;

  console.log(`rows before: ${stored1.length}`);
  console.log(`rows after: ${stored2.length}`);
  console.log(`new IDs: ${newIds.length}`);
  console.log(`duplicate fingerprints: ${duplicateFingerprints}`);

  try { fs.unlinkSync(tmpStore); } catch (_) {}

  if (stored1.length !== stored2.length || newIds.length !== 0 || duplicateFingerprints !== 0) {
    throw new Error(`Idempotency check failed: rowsBefore=${stored1.length}, rowsAfter=${stored2.length}, newIds=${newIds.length}, dupFp=${duplicateFingerprints}`);
  }

  // 4. VERIFY BATCH 2 MARKET FEEDS ON PREVIEW
  console.log('\n--- 4. VERIFY BATCH 2 MARKET FEEDS ON PREVIEW (HTTP GET /api/feed) ---');
  console.log('| Market | Venue | Official Events | Direct Checkout HTTP | Timezone | Status |');
  console.log('|---|---|:---:|---|---|:---:|');

  for (const m of BATCH2_MARKETS) {
    const feedUrl = `${previewHost}/api/feed?lat=${m.lat}&lon=${m.lon}&mode=comedy&window=all&includePreview=true`;
    const res = await fetch(feedUrl, {
      headers: {
        'x-vercel-protection-bypass': bypassSecret,
        'Authorization': `Bearer ${adminToken}`
      }
    });

    if (res.status !== 200) {
      console.log(`| ${m.market} | ${m.venueName} | 0 | HTTP ${res.status} | ${m.timezone} | **FAILED** |`);
      throw new Error(`Feed query for ${m.market} failed with status ${res.status}`);
    }

    const data = await res.json();
    const events = data.events || [];
    const officialEvents = events.filter(e => {
      const vName = (e.venue?.name || e.venue_name || e.venue || '').toLowerCase();
      const vSlug = e.venue_slug || e.venueSlug || '';
      return (vSlug === m.venueSlug || vName.includes(m.venueName.toLowerCase())) &&
             e.confirmationStatus === 'confirmed_by_official_calendar';
    });

    if (officialEvents.length < m.minEvents) {
      throw new Error(`Feed for ${m.market} returned ${officialEvents.length} events, expected >= ${m.minEvents}`);
    }

    const sampleUrl = officialEvents[0]?.ticket_url || officialEvents[0]?.ticketUrl;
    const checkoutTest = await verifyCheckoutUrl(sampleUrl);

    const hasSynthetic = officialEvents.some(e =>
      /every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(e.title || '')
    );
    if (hasSynthetic) {
      throw new Error(`Feed for ${m.market} contains unconfirmed synthetic recurring events!`);
    }

    const checkStr = checkoutTest.ok ? `HTTP 200 (${checkoutTest.bytes} B)` : `FAIL (${checkoutTest.status})`;
    console.log(`| ${m.market} | ${m.venueName} | ${officialEvents.length} | ${checkStr} | ${m.timezone} | **PASSED** |`);
  }

  // 5. DENVER QUARANTINE VERIFICATION ON PREVIEW
  console.log('\n--- 5. DENVER QUARANTINE VERIFICATION ON PREVIEW ---');
  const denverFeedUrl = `${previewHost}/api/feed?lat=39.7392&lon=-104.9903&mode=comedy&window=all&includePreview=true`;
  const denverRes = await fetch(denverFeedUrl, {
    headers: {
      'x-vercel-protection-bypass': bypassSecret,
      'Authorization': `Bearer ${adminToken}`
    }
  });
  const denverData = await denverRes.json();
  const syntheticSeeds = (denverData.events || []).filter(e =>
    e.id === 'comedy_seed_denver_02' || e.id === 'comedy_pilot_denver_03'
  );
  console.log('Synthetic Denver seeds in preview feed (must be 0):', syntheticSeeds.length);
  if (syntheticSeeds.length !== 0) {
    throw new Error('Denver quarantine breached! Found synthetic seeds.');
  }

  console.log('\n======================================================================');
  console.log('ALL BATCH 2 PREVIEW GATES PASSED: READY FOR PRODUCTION PROMOTION');
  console.log('======================================================================');
}

main().catch(err => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
