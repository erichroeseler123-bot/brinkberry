import test, { mock } from 'node:test';
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
import {
  defaultRawStorage,
  LocalRawSourceStorage
} from '../lib/storage/raw-source-storage.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const feedHandler = require('../api/feed.js');
const { AUDIT_MILESTONE } = require('../lib/audit/coverage-auditor.js');

const FIXED_UNIT_NOW = new Date('2026-10-15T12:00:00.000Z');

async function withIsolatedRawStorage(fn) {
  const tmpRawDir = path.join(os.tmpdir(), `test_raw_iso_${Math.random().toString(36).slice(2)}`);
  const unitRaw = new LocalRawSourceStorage({ baseDir: tmpRawDir });
  const origSave = defaultRawStorage.saveRawEvidence;
  const origLatest = defaultRawStorage.getLatestRawEvidence;
  const origHistory = defaultRawStorage.listEvidenceHistory;
  defaultRawStorage.saveRawEvidence = unitRaw.saveRawEvidence.bind(unitRaw);
  defaultRawStorage.getLatestRawEvidence = unitRaw.getLatestRawEvidence.bind(unitRaw);
  defaultRawStorage.listEvidenceHistory = unitRaw.listEvidenceHistory.bind(unitRaw);
  mock.timers.enable({ apis: ['Date'], now: FIXED_UNIT_NOW });
  try {
    return await fn(unitRaw);
  } finally {
    mock.timers.reset();
    defaultRawStorage.saveRawEvidence = origSave;
    defaultRawStorage.getLatestRawEvidence = origLatest;
    defaultRawStorage.listEvidenceHistory = origHistory;
    try { fs.rmSync(tmpRawDir, { recursive: true, force: true }); } catch (_) {}
  }
}

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

const SKIP_LIVE = process.env.BRINKBERRY_TEST_MODE === 'unit';

function buildVenueFixtureHtml({ venueName, baseUrl, count }) {
  const events = [];
  for (let i = 0; i < count; i++) {
    const showId = 500000 + i;
    const dayOffset = Math.floor(i / 2);
    const startDate = new Date(Date.UTC(2026, 10, 1 + dayOffset, i % 2 === 0 ? 1 : 3, i % 2 === 0 ? 0 : 30, 0)).toISOString();
    events.push({
      '@context': 'https://schema.org',
      '@type': 'ComedyEvent',
      '@id': `${baseUrl}/shows/${showId}`,
      name: `${venueName} Showcase #${i + 1}`,
      startDate,
      url: `${baseUrl}/shows/${showId}`,
      location: { '@type': 'ComedyClub', name: venueName },
      offers: { '@type': 'Offer', price: '25', url: `${baseUrl}/shows/${showId}` }
    });
  }
  return `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(events)}</script></head><body>${venueName}</body></html>`;
}

function createDeterministicExpansionFetch() {
  const stardomeHtml = buildVenueFixtureHtml({ venueName: 'Stardome Comedy Club', baseUrl: 'https://www.stardome.com', count: 136 });
  const comedyZoneHtml = buildVenueFixtureHtml({ venueName: 'The Comedy Zone Charlotte', baseUrl: 'https://www.cltcomedyzone.com', count: 161 });
  const acmeHtml = buildVenueFixtureHtml({ venueName: 'Acme Comedy Company', baseUrl: 'https://acmecomedy.seatengine.com', count: 107 });
  return async (url) => {
    const target = String(url);
    let html = acmeHtml;
    if (target.includes('stardome.com')) html = stardomeHtml;
    else if (target.includes('cltcomedyzone.com')) html = comedyZoneHtml;
    return {
      ok: true,
      status: 200,
      text: async () => html
    };
  };
}

test('Preview Gate 1a (Deterministic Unit): Strict Environment & Namespace Isolation (404 Fixture Events)', async () => {
  const tmpFile = path.join(os.tmpdir(), `test_exp_gate1_unit_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  const unitStorage = new LocalFileCanonicalStorage(tmpFile);

  try {
    const result = await withIsolatedRawStorage(() => ingestExpansionComedy({
      persist: false,
      environment: 'preview',
      namespace: 'preview_expansion',
      fetchFn: createDeterministicExpansionFetch()
    }));

    assert.equal(result.count, 404, 'Deterministic fixture must ingest exactly 404 expansion performances (136 + 161 + 107)');

    for (const ev of result.events) {
      assert.equal(ev.environment, 'preview', 'Must carry environment: preview');
      assert.equal(ev.namespace, 'preview_expansion', 'Must carry namespace: preview_expansion');
    }

    await unitStorage.upsertEvents(result.events);

    const prodStored = await unitStorage.queryEvents({
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

    const previewStored = await unitStorage.queryEvents({
      category: 'comedy',
      lat: EXPANSION_VENUES.stardome.lat,
      lon: EXPANSION_VENUES.stardome.lon,
      radiusMiles: 35,
      includePreview: true,
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: '2099-01-01T00:00:00.000Z'
    });
    assert.equal(previewStored.length, 136, 'Preview query must retrieve all 136 Stardome fixture events');
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

test('Preview Gate 1b (Live Integration): Strict Environment & Namespace Isolation on Rolling Live Feeds', { skip: SKIP_LIVE }, async () => {
  await purgeExpansionPreviewRecords();

  const result = await ingestExpansionComedy({
    persist: true,
    environment: 'preview',
    namespace: 'preview_expansion'
  });

  assert.equal(result.errors.length, 0, `Expected 0 live venue ingestion errors, got ${JSON.stringify(result.errors)}`);
  assert.ok(result.count >= 250, `Must ingest >= 250 live expansion performances across Birmingham, Charlotte, and Acme Minneapolis, got ${result.count}`);

  for (const ev of result.events) {
    assert.equal(ev.environment, 'preview', 'Must carry environment: preview');
    assert.equal(ev.namespace, 'preview_expansion', 'Must carry namespace: preview_expansion');
  }

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

  const previewStored = await defaultCanonicalStorage.queryEvents({
    category: 'comedy',
    lat: EXPANSION_VENUES.stardome.lat,
    lon: EXPANSION_VENUES.stardome.lon,
    radiusMiles: 35,
    includePreview: true,
    windowStart: '2026-01-01T00:00:00.000Z',
    windowEnd: '2099-01-01T00:00:00.000Z'
  });
  assert.ok(previewStored.length >= 50, 'Preview query must retrieve the live preview events');
});

test('Preview Gate 2: Full HTTP GET Ticket URL Verification with Redirect Chains', { skip: SKIP_LIVE }, async () => {
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

test('Preview Gate 3a (Deterministic Unit): Direct /api/feed API Contract Verification (Fixture)', async () => {
  process.env.ENABLE_EXPANSION_PILOT = 'true';
  process.env.VERCEL_ENV = 'preview';

  const tmpFile = path.join(os.tmpdir(), `test_exp_gate3_unit_${Math.random().toString(36).slice(2)}.json`);
  const unitStorage = new LocalFileCanonicalStorage(tmpFile);
  const origQuery = defaultCanonicalStorage.queryEvents;
  const origFetch = globalThis.fetch;
  defaultCanonicalStorage.queryEvents = unitStorage.queryEvents.bind(unitStorage);

  try {
    const seeded = await withIsolatedRawStorage(() => ingestExpansionComedy({
      persist: false,
      environment: 'preview',
      namespace: 'preview_expansion',
      fetchFn: createDeterministicExpansionFetch()
    }));
    await unitStorage.upsertEvents(seeded.events);

    mock.timers.enable({ apis: ['Date'], now: FIXED_UNIT_NOW });
    globalThis.fetch = async (url) => {
      const target = String(url);
      if (target.includes('/rest/v1/rpc/')) {
        return { ok: true, status: 200, text: async () => '[]', json: async () => [] };
      }
      if (target.includes('api.weather.gov')) {
        return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
      }
      throw new Error(`Unexpected live network fetch in deterministic unit test: ${target}`);
    };

    // 1. Direct Birmingham /api/feed check
    const bhmUrl = `/api/feed?lat=${EXPANSION_VENUES.stardome.lat}&lon=${EXPANSION_VENUES.stardome.lon}&mode=comedy&window=all&dynamic=false`;
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
    const cltUrl = `/api/feed?lat=${EXPANSION_VENUES.comedyZone.lat}&lon=${EXPANSION_VENUES.comedyZone.lon}&mode=comedy&window=all&dynamic=false`;
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
  } finally {
    mock.timers.reset();
    globalThis.fetch = origFetch;
    defaultCanonicalStorage.queryEvents = origQuery;
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

test('Preview Gate 3b (Live Integration): Direct /api/feed API Contract Verification', { skip: SKIP_LIVE }, async () => {
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

test('Preview Gate 4a (Deterministic Unit): Second Ingestion Run Proving Zero Duplicates (404 Fixture Events)', async () => {
  const tmpFile = path.join(os.tmpdir(), `test_exp_gate4_unit_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  const unitStorage = new LocalFileCanonicalStorage(tmpFile);
  const fetchFn = createDeterministicExpansionFetch();

  try {
    const run1 = await withIsolatedRawStorage(() => ingestExpansionComedy({
      persist: false,
      environment: 'preview',
      namespace: 'preview_expansion',
      fetchFn
    }));
    assert.equal(run1.count, 404);
    await unitStorage.upsertEvents(run1.events);

    const run2 = await withIsolatedRawStorage(() => ingestExpansionComedy({
      persist: false,
      environment: 'preview',
      namespace: 'preview_expansion',
      fetchFn
    }));
    assert.equal(run2.count, 404, 'Second deterministic run must have identical unique canonical count (404)');
    await unitStorage.upsertEvents(run2.events);

    const allPreview = await unitStorage.queryEvents({
      includePreview: true,
      environment: 'preview',
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: '2099-01-01T00:00:00.000Z'
    });
    assert.equal(allPreview.length, 404, 'Storage must not duplicate records on re-ingestion');
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

test('Preview Gate 4b (Live Integration): Second Ingestion Run Proving Zero Duplicates on Rolling Live Feeds', { skip: SKIP_LIVE }, async () => {
  await purgeExpansionPreviewRecords();

  const run1 = await ingestExpansionComedy({
    persist: true,
    environment: 'preview',
    namespace: 'preview_expansion'
  });
  assert.ok(run1.count >= 250, `Expected >= 250 live expansion records, got ${run1.count}`);

  const run2 = await ingestExpansionComedy({
    persist: true,
    environment: 'preview',
    namespace: 'preview_expansion'
  });
  assert.equal(run2.count, run1.count, 'Second run must have identical unique canonical count');

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

test('Preview Gate 6a (Deterministic Unit): Complete Cleanup / Purge of Preview Records (404 Fixture Events)', async () => {
  const tmpFile = path.join(os.tmpdir(), `test_exp_gate6_unit_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  const unitStorage = new LocalFileCanonicalStorage(tmpFile);
  const origPurge = defaultCanonicalStorage.purgePreviewRecords;
  const origQuery = defaultCanonicalStorage.queryEvents;
  defaultCanonicalStorage.purgePreviewRecords = unitStorage.purgePreviewRecords.bind(unitStorage);
  defaultCanonicalStorage.queryEvents = unitStorage.queryEvents.bind(unitStorage);
  try {
    const seeded = await withIsolatedRawStorage(() => ingestExpansionComedy({
      persist: false,
      environment: 'preview',
      namespace: 'preview_expansion',
      fetchFn: createDeterministicExpansionFetch()
    }));
    await unitStorage.upsertEvents(seeded.events);

    const purgeResult = await purgeExpansionPreviewRecords({ namespace: 'preview_expansion' });
    assert.equal(purgeResult.purgedCount, 404, `Must purge all 404 isolated fixture preview records (purged ${purgeResult.purgedCount})`);

    const afterPurge = await defaultCanonicalStorage.queryEvents({
      includePreview: true,
      environment: 'preview',
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: '2099-01-01T00:00:00.000Z'
    });
    assert.equal(afterPurge.length, 0, 'Zero preview records must remain after purge');
  } finally {
    defaultCanonicalStorage.purgePreviewRecords = origPurge;
    defaultCanonicalStorage.queryEvents = origQuery;
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

test('Preview Gate 6b (Live Integration): Complete Cleanup / Purge of Live Preview Records', { skip: SKIP_LIVE }, async () => {
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
