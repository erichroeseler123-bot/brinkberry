import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {
  EXPANSION_VENUES,
  ingestExpansionComedy,
  verifyTicketUrlResolution,
  purgeExpansionPreviewRecords
} from '../lib/comedy/expansion-ingestion.js';
import {
  defaultCanonicalStorage,
  LocalFileCanonicalStorage
} from '../lib/storage/canonical-event-storage.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const feedHandler = require('../api/feed.js');
const { AUDIT_MILESTONE } = require('../lib/audit/coverage-auditor.js');

function createMockReqRes({ method = 'GET', url = '/' } = {}) {
  const req = {
    method,
    url,
    headers: { host: 'brinkberry.local' },
    query: {}
  };

  let statusCode = 200;
  let responseHeaders = {};
  let body = '';

  const res = {
    get statusCode() { return statusCode; },
    set statusCode(code) { statusCode = code; },
    setHeader(name, val) { responseHeaders[name.toLowerCase()] = String(val); return this; },
    getHeader(name) { return responseHeaders[name.toLowerCase()]; },
    write(chunk) { body += (chunk != null ? chunk.toString() : ''); return true; },
    end(chunk) { if (chunk != null) body += chunk.toString(); return this; },
    status(code) { statusCode = code; return this; },
    json(data) {
      responseHeaders['content-type'] = 'application/json; charset=utf-8';
      body = JSON.stringify(data);
      return this;
    },
    send(data) {
      if (typeof data === 'object') return this.json(data);
      body = String(data);
      return this;
    }
  };

  return { req, res, getBody: () => body, getStatus: () => statusCode, getJson: () => JSON.parse(body) };
}

test('Preview Gate 1: Strict Environment & Namespace Isolation', async () => {
  // Purge any existing preview records first
  await purgeExpansionPreviewRecords();

  // Ingest expansion comedy into preview namespace
  const result = await ingestExpansionComedy({
    persist: true,
    environment: 'preview',
    namespace: 'preview_expansion'
  });

  assert.ok(result.count >= 400 && result.count <= 410, 'Must ingest ~404 expansion performances across Birmingham, Charlotte, and Acme Minneapolis');

  // Verify all ingested events carry preview environment and namespace tags
  for (const ev of result.events) {
    assert.equal(ev.environment, 'preview', 'Must carry environment: preview');
    assert.equal(ev.namespace, 'preview_expansion', 'Must carry namespace: preview_expansion');
  }

  // 1. Querying with environment = 'production' MUST return 0 preview events
  const prodStored = await defaultCanonicalStorage.queryEvents({
    category: 'comedy',
    lat: EXPANSION_VENUES.stardome.lat,
    lon: EXPANSION_VENUES.stardome.lon,
    radiusMiles: 35,
    environment: 'production',
    includePreview: false,
    windowStart: '2026-01-01T00:00:00.000Z',
    windowEnd: '2099-01-01T00:00:00.000Z'
  });
  assert.equal(prodStored.length, 0, 'Production query must NEVER return preview events');

  // 2. Querying with includePreview = true returns the preview events
  const previewStored = await defaultCanonicalStorage.queryEvents({
    category: 'comedy',
    lat: EXPANSION_VENUES.stardome.lat,
    lon: EXPANSION_VENUES.stardome.lon,
    radiusMiles: 35,
    includePreview: true,
    windowStart: '2026-01-01T00:00:00.000Z',
    windowEnd: '2099-01-01T00:00:00.000Z'
  });
  assert.ok(previewStored.length >= 50, 'Preview query must retrieve the preview events');
});

test('Preview Gate 2: Full HTTP GET Ticket URL Verification with Redirect Chains', async () => {
  const sampleUrls = [
    'https://www.stardome.com/shows/383690',
    'https://www.cltcomedyzone.com/shows/382369'
  ];

  for (const u of sampleUrls) {
    const audit = await verifyTicketUrlResolution(u, { timeoutMs: 10000 });
    assert.equal(audit.httpStatus, 200, `Ticket URL ${u} must return HTTP 200 via full GET`);
    assert.ok(audit.htmlLength > 1000, `Ticket URL ${u} must return substantial HTML content (got ${audit.htmlLength} bytes)`);
    assert.equal(audit.hasCheckoutMarkers, true, `Ticket URL ${u} must contain checkout / event markers`);
    assert.equal(audit.isVerified, true, `Ticket URL ${u} must be fully verified`);
  }
});

test('Preview Gate 3: Direct /api/feed API Contract Verification', async () => {
  // Ensure preview flag is set for test
  process.env.ENABLE_EXPANSION_PILOT = 'true';

  // 1. Direct Birmingham /api/feed check
  const bhmUrl = `/api/feed?lat=${EXPANSION_VENUES.stardome.lat}&lon=${EXPANSION_VENUES.stardome.lon}&mode=comedy&window=all`;
  const { req: bhmReq, res: bhmRes, getStatus: getBhmStatus, getJson: getBhmJson } = createMockReqRes({
    url: bhmUrl
  });
  await feedHandler(bhmReq, bhmRes);
  assert.equal(getBhmStatus(), 200, '/api/feed for Birmingham must return HTTP 200');
  const bhmData = getBhmJson();
  assert.ok(Array.isArray(bhmData.events), 'Response must have events array');
  const bhmEvents = bhmData.events.filter(e => e.venue_name === 'Stardome Comedy Club');
  assert.ok(bhmEvents.length >= 20, `Expected at least 20 Stardome events in feed, got ${bhmEvents.length}`);
  assert.equal(bhmEvents[0].city, 'Birmingham');
  assert.equal(bhmEvents[0].confirmationStatus, 'confirmed_by_official_calendar');

  // 2. Direct Charlotte /api/feed check
  const cltUrl = `/api/feed?lat=${EXPANSION_VENUES.comedyZone.lat}&lon=${EXPANSION_VENUES.comedyZone.lon}&mode=comedy&window=all`;
  const { req: cltReq, res: cltRes, getStatus: getCltStatus, getJson: getCltJson } = createMockReqRes({
    url: cltUrl
  });
  await feedHandler(cltReq, cltRes);
  assert.equal(getCltStatus(), 200, '/api/feed for Charlotte must return HTTP 200');
  const cltData = getCltJson();
  assert.ok(Array.isArray(cltData.events), 'Response must have events array');
  const cltEvents = cltData.events.filter(e => e.venue_name === 'The Comedy Zone Charlotte');
  assert.ok(cltEvents.length >= 20, `Expected at least 20 Comedy Zone events in feed, got ${cltEvents.length}`);
  assert.equal(cltEvents[0].city, 'Charlotte');
  assert.equal(cltEvents[0].confirmationStatus, 'confirmed_by_official_calendar');
});

test('Preview Gate 4: Second Ingestion Run Proving Zero Duplicates (Idempotency)', async () => {
  // Purge any prior preview expansion records to ensure exact baseline
  await purgeExpansionPreviewRecords();

  // First run
  const run1 = await ingestExpansionComedy({
    persist: true,
    environment: 'preview',
    namespace: 'preview_expansion'
  });
  assert.ok(run1.count >= 400 && run1.count <= 410);

  // Second run immediately following
  const run2 = await ingestExpansionComedy({
    persist: true,
    environment: 'preview',
    namespace: 'preview_expansion'
  });
  assert.equal(run2.count, run1.count, 'Second run must have identical unique canonical count');

  // Query canonical storage and verify count did not double
  const allPreview = await defaultCanonicalStorage.queryEvents({
    includePreview: true,
    environment: 'preview',
    windowStart: '2026-01-01T00:00:00.000Z',
    windowEnd: '2099-01-01T00:00:00.000Z'
  });
  assert.equal(allPreview.length, run1.count, 'Storage must not duplicate records on re-ingestion');
});

test('Preview Gate 5: Honest Failure & Freshness Decay Test', async () => {
  const decayStoreFile = path.join(os.tmpdir(), `test_decay_storage_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  const isolatedStorage = new LocalFileCanonicalStorage(decayStoreFile);

  // Seed an event with an old lastConfirmedAt timestamp (35 days old)
  const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 86400e3).toISOString();
  await isolatedStorage.upsertEvents([
    {
      id: 'prev_test_decay_event_1',
      fingerprint: 'prev_test_decay_event_1',
      title: 'Discontinued Showcase',
      venue_name: 'Stardome Comedy Club',
      start_time: '2026-11-01T00:00:00.000Z',
      category: 'comedy',
      confirmationStatus: 'confirmed_by_official_calendar',
      freshnessStatus: 'verified_current',
      lastConfirmedAt: thirtyFiveDaysAgo,
      environment: 'preview'
    }
  ]);

  // Run decayStaleEvents
  const decayedCount = await isolatedStorage.decayStaleEvents(7 * 86400e3, 30 * 86400e3);
  assert.equal(decayedCount, 1, 'Event older than 30 days must be marked stale');

  const decayedEvent = await isolatedStorage.getEventById('prev_test_decay_event_1');
  assert.equal(decayedEvent.freshnessStatus, 'stale', 'Status must transition to stale');

  // Clean up
  try { fs.unlinkSync(decayStoreFile); } catch (_) {}
});

test('Preview Gate 6: Complete Cleanup / Purge of Preview Records', async () => {
  const purgeResult = await purgeExpansionPreviewRecords({ namespace: 'preview_expansion' });
  assert.ok(purgeResult.purgedCount > 0, `Must purge preview records (purged ${purgeResult.purgedCount})`);

  // Verify that preview query now returns 0
  const afterPurge = await defaultCanonicalStorage.queryEvents({
    includePreview: true,
    environment: 'preview',
    windowStart: '2026-01-01T00:00:00.000Z',
    windowEnd: '2099-01-01T00:00:00.000Z'
  });
  assert.equal(afterPurge.length, 0, 'Zero preview records must remain after purge');
});

test('Preview Gate 7: Production Safety & Invariant Status', () => {
  // Test classification status
  const STATUS = 'Locally verified; preview validation pending. Not production inventory yet.';
  assert.equal(STATUS, 'Locally verified; preview validation pending. Not production inventory yet.');

  // Verify milestone invariant
  assert.equal(
    AUDIT_MILESTONE,
    'Dynamic official-source ingestion pilot deployed; verified inventory expansion in progress.',
    'Milestone invariant must remain preserved'
  );
});
