import { ingestAcme, deduplicateExpansionEvents, verifyTicketUrlResolution } from '../lib/comedy/expansion-ingestion.js';
import { LocalFileCanonicalStorage } from '../lib/storage/canonical-event-storage.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

async function runVerification() {
  console.log('===============================================================');
  console.log('ACME IDEMPOTENCY & CHECKOUT VERIFICATION');
  console.log('===============================================================\n');

  // --- PART 1: ID-BASED IDEMPOTENCY PROOF ---
  console.log('--- PART 1: TWO CONSECUTIVE INGESTIONS & CANONICAL ID COMPARISON ---');
  const tmpStoragePath = path.join(os.tmpdir(), `acme_id_idempotency_${Date.now()}.json`);
  const storage = new LocalFileCanonicalStorage(tmpStoragePath);

  // Ingestion 1
  const run1 = await ingestAcme({ persist: false, environment: 'preview', namespace: 'preview_expansion' });
  await storage.upsertEvents(run1.events);
  const stored1 = await storage.queryEvents({
    lat: 44.9877,
    lon: -93.2721,
    radiusMiles: 25,
    includePreview: true,
    environment: 'preview',
    namespace: 'preview_expansion',
    windowStart: '2026-01-01T00:00:00.000Z',
    windowEnd: '2099-01-01T00:00:00.000Z'
  });

  const idsBefore = new Set(stored1.map(e => e.id));
  const fingerprintsBefore = stored1.map(e => e.fingerprint);

  // Ingestion 2
  const run2 = await ingestAcme({ persist: false, environment: 'preview', namespace: 'preview_expansion' });
  await storage.upsertEvents(run2.events);
  const stored2 = await storage.queryEvents({
    lat: 44.9877,
    lon: -93.2721,
    radiusMiles: 25,
    includePreview: true,
    environment: 'preview',
    namespace: 'preview_expansion',
    windowStart: '2026-01-01T00:00:00.000Z',
    windowEnd: '2099-01-01T00:00:00.000Z'
  });

  const idsAfter = new Set(stored2.map(e => e.id));
  const fingerprintsAfter = stored2.map(e => e.fingerprint);

  // Compute set differences
  const newIds = [...idsAfter].filter(id => !idsBefore.has(id));
  const duplicateFingerprints = fingerprintsAfter.length - new Set(fingerprintsAfter).size;

  console.log(`rows before: ${stored1.length}`);
  console.log(`rows after: ${stored2.length}`);
  console.log(`new IDs: ${newIds.length}`);
  console.log(`duplicate fingerprints: ${duplicateFingerprints}`);

  try { fs.unlinkSync(tmpStoragePath); } catch (_) {}

  // --- PART 2: CHECKOUT VERIFICATION (DEEP SAMPLE + FULL BATCH PROBE) ---
  console.log('\n--- PART 2: CHECKOUT VERIFICATION ---');

  // Deep verification on sample URL
  const sampleUrl = run1.events[0].ticket_url;
  console.log(`Sample Ticket URL: ${sampleUrl}`);
  const sampleRes = await verifyTicketUrlResolution(sampleUrl);
  console.log(`Sample Resolution HTTP Status: ${sampleRes.httpStatus}`);
  console.log(`Sample HTML length: ${sampleRes.htmlLength} bytes`);
  console.log(`Sample Has Checkout Markers: ${sampleRes.hasCheckoutMarkers}`);
  console.log(`Sample Is Verified: ${sampleRes.isVerified}`);

  // Test full batch of all 107 URLs
  console.log(`\nValidating all ${run1.events.length} checkout URLs...`);
  const urls = [...new Set(run1.events.map(e => e.ticket_url))];
  console.log(`Total unique ticket URLs: ${urls.length}`);

  let successCount = 0;
  let failCount = 0;
  const concurrency = 10;
  const results = [];

  for (let i = 0; i < urls.length; i += concurrency) {
    const chunk = urls.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(async (url) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'User-Agent': 'Brinkberry-Checkout-Auditor/1.0' },
          signal: controller.signal
        });
        clearTimeout(timeout);
        return { url, status: res.status, ok: res.ok };
      } catch (err) {
        return { url, status: 'error', error: err.message, ok: false };
      }
    }));
    for (const r of chunkResults) {
      if (r.ok) successCount++;
      else failCount++;
      results.push(r);
    }
    process.stdout.write(`\rTested ${Math.min(i + concurrency, urls.length)} / ${urls.length} URLs... (success: ${successCount}, failed: ${failCount})`);
  }
  console.log('\nBatch URL validation complete.');
  console.log(`Total URLs Tested: ${urls.length}`);
  console.log(`HTTP 200 OK: ${successCount}`);
  console.log(`Failed / Inaccessible: ${failCount}`);

  return {
    rowsBefore: stored1.length,
    rowsAfter: stored2.length,
    newIdsCount: newIds.length,
    duplicateFingerprints,
    sampleVerified: sampleRes.isVerified,
    urlsTested: urls.length,
    urlsSuccess: successCount,
    urlsFailed: failCount
  };
}

runVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
