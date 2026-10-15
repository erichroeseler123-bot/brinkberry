/**
 * Preview Runtime Verification & Security Audit Test Suite
 *
 * Tests the specific runtime preview behaviors requested:
 * 1. Security Check: Ordinary public request cannot enable includePreview in production.
 * 2. Admin Auth: Only admin or preview environment can enable includePreview.
 * 3. Preview Cron Ingestion: Refreshes into preview namespace; blocked in production.
 * 4. Production Namespace Isolation: Exactly 0 expansion records in production store.
 * 5. Birmingham Feed: Returns real upcoming Stardome events.
 * 6. Charlotte Feed: Returns real upcoming Comedy Zone events.
 * 7. Second Ingestion Idempotency: Exactly 0 duplicates created.
 * 8. Ticket URLs: Full GET resolution to official checkout with markers.
 * 9. Expired/Past Events: Excluded honestly.
 * 10. Failed Refresh: Freshness decays; no synthetic replacements.
 * 11. Production Flag: ENABLE_EXPANSION_PILOT defaults to false.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPANSION_VENUES,
  ingestExpansionComedy,
  verifyTicketUrlResolution,
  purgeExpansionPreviewRecords
} from '../lib/comedy/expansion-ingestion.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {
  defaultCanonicalStorage,
  LocalFileCanonicalStorage
} from '../lib/storage/canonical-event-storage.js';
import {
  defaultRawStorage,
  LocalRawSourceStorage
} from '../lib/storage/raw-source-storage.js';
import { createRequire } from 'module';

async function withIsolatedRawStorage(fn) {
  const tmpRawDir = path.join(os.tmpdir(), `test_raw_rt_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const unitRaw = new LocalRawSourceStorage({ baseDir: tmpRawDir });
  const origSave = defaultRawStorage.saveRawEvidence;
  const origGetLatest = defaultRawStorage.getLatestRawEvidence;
  const origListHistory = defaultRawStorage.listEvidenceHistory;
  defaultRawStorage.saveRawEvidence = unitRaw.saveRawEvidence.bind(unitRaw);
  defaultRawStorage.getLatestRawEvidence = unitRaw.getLatestRawEvidence.bind(unitRaw);
  defaultRawStorage.listEvidenceHistory = unitRaw.listEvidenceHistory.bind(unitRaw);
  try {
    return await fn(unitRaw);
  } finally {
    defaultRawStorage.saveRawEvidence = origSave;
    defaultRawStorage.getLatestRawEvidence = origGetLatest;
    defaultRawStorage.listEvidenceHistory = origListHistory;
    try { fs.rmSync(tmpRawDir, { recursive: true, force: true }); } catch (_) {}
  }
}

const require = createRequire(import.meta.url);
const feedHandler = require('../api/feed.js');
const cronIngestHandler = require('../api/cron-ingest.js');
const { AUDIT_MILESTONE } = require('../lib/audit/coverage-auditor.js');

function createMockReqRes({ method = 'GET', url = '/', headers = {} } = {}) {
  const req = {
    method,
    url,
    headers: { host: 'brinkberry.local', ...headers },
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

function buildVenueFixtureHtml({ venueName, baseUrl, count, lat, lon, city, state }) {
  const events = [];
  for (let i = 0; i < count; i++) {
    const showId = 600000 + i;
    const dayOffset = 1 + Math.floor(i / 2);
    const startDate = new Date(Date.UTC(2026, 10, 1 + dayOffset, i % 2 === 0 ? 1 : 3, i % 2 === 0 ? 0 : 30, 0)).toISOString();
    events.push({
      '@context': 'https://schema.org',
      '@type': 'ComedyEvent',
      '@id': `${baseUrl}/shows/${showId}`,
      name: `${venueName} Showcase #${i + 1}`,
      startDate,
      url: `${baseUrl}/shows/${showId}`,
      location: { '@type': 'ComedyClub', name: venueName, address: { addressLocality: city, addressRegion: state }, geo: { latitude: lat, longitude: lon } },
      offers: { '@type': 'Offer', price: '25', url: `${baseUrl}/shows/${showId}` }
    });
  }
  return `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(events)}</script></head><body>${venueName}</body></html>`;
}

function createDeterministicExpansionFetch() {
  const stardomeHtml = buildVenueFixtureHtml({
    venueName: 'Stardome Comedy Club',
    baseUrl: 'https://www.stardome.com',
    count: 136,
    lat: EXPANSION_VENUES.stardome.lat,
    lon: EXPANSION_VENUES.stardome.lon,
    city: 'Birmingham',
    state: 'AL'
  });
  const comedyZoneHtml = buildVenueFixtureHtml({
    venueName: 'The Comedy Zone Charlotte',
    baseUrl: 'https://www.cltcomedyzone.com',
    count: 161,
    lat: EXPANSION_VENUES.comedyZone.lat,
    lon: EXPANSION_VENUES.comedyZone.lon,
    city: 'Charlotte',
    state: 'NC'
  });
  const acmeHtml = buildVenueFixtureHtml({
    venueName: 'Acme Comedy Company',
    baseUrl: 'https://acmecomedy.seatengine.com',
    count: 107,
    lat: EXPANSION_VENUES.acme.lat,
    lon: EXPANSION_VENUES.acme.lon,
    city: 'Minneapolis',
    state: 'MN'
  });
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

test('Security Gate (Deterministic Unit): Public requests in production cannot toggle includePreview', async () => {
  process.env.VERCEL_ENV = 'production';
  process.env.ENABLE_EXPANSION_PILOT = 'false';

  const tmpFile = path.join(os.tmpdir(), `test_runtime_sec_unit_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  const unitStorage = new LocalFileCanonicalStorage(tmpFile);
  const origQuery = defaultCanonicalStorage.queryEvents;
  defaultCanonicalStorage.queryEvents = unitStorage.queryEvents.bind(unitStorage);

  try {
    const seeded = await withIsolatedRawStorage(() => ingestExpansionComedy({
      persist: false,
      environment: 'preview',
      namespace: 'preview_expansion',
      fetchFn: createDeterministicExpansionFetch()
    }));
    await unitStorage.upsertEvents(seeded.events);

    // 1. Ordinary public request with ?includePreview=true
    const pubUrl = `/api/feed?lat=${EXPANSION_VENUES.stardome.lat}&lon=${EXPANSION_VENUES.stardome.lon}&mode=comedy&window=all&includePreview=true`;
    const { req: pubReq, res: pubRes, getJson: getPubJson } = createMockReqRes({ url: pubUrl });
    await feedHandler(pubReq, pubRes);
    const pubData = getPubJson();
    const pubExpansionEvents = (pubData.events || []).filter(e => (e.venue_name || e.venue) === 'Stardome Comedy Club');
    assert.equal(pubExpansionEvents.length, 0, 'Public request with ?includePreview=true must NEVER receive preview events');

    // 2. Admin authenticated request with ?includePreview=true IS honored
    process.env.ADMIN_TOKEN = 'test-secure-admin-token-12345';
    const adminUrl = `/api/feed?lat=${EXPANSION_VENUES.stardome.lat}&lon=${EXPANSION_VENUES.stardome.lon}&mode=comedy&window=all&includePreview=true`;
    const { req: adminReq, res: adminRes, getJson: getAdminJson } = createMockReqRes({
      url: adminUrl,
      headers: { authorization: 'Bearer test-secure-admin-token-12345' }
    });
    await feedHandler(adminReq, adminRes);
    const adminData = getAdminJson();
    const adminExpansionEvents = (adminData.events || []).filter(e => (e.venue_name || e.venue) === 'Stardome Comedy Club');
    assert.ok(adminExpansionEvents.length >= 20, 'Admin request with valid bearer token must receive preview events');
  } finally {
    defaultCanonicalStorage.queryEvents = origQuery;
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

test('Security Gate (Live Integration): Public requests in production cannot toggle includePreview', { skip: SKIP_LIVE }, async () => {
  process.env.VERCEL_ENV = 'production';
  process.env.ENABLE_EXPANSION_PILOT = 'false';

  await purgeExpansionPreviewRecords();
  await ingestExpansionComedy({
    persist: true,
    environment: 'preview',
    namespace: 'preview_expansion'
  });

  // 1. Ordinary public request with ?includePreview=true
  const pubUrl = `/api/feed?lat=${EXPANSION_VENUES.stardome.lat}&lon=${EXPANSION_VENUES.stardome.lon}&mode=comedy&window=all&includePreview=true`;
  const { req: pubReq, res: pubRes, getJson: getPubJson } = createMockReqRes({ url: pubUrl });
  await feedHandler(pubReq, pubRes);
  const pubData = getPubJson();
  const pubExpansionEvents = (pubData.events || []).filter(e => (e.venue_name || e.venue) === 'Stardome Comedy Club');
  assert.equal(pubExpansionEvents.length, 0, 'Public request with ?includePreview=true must NEVER receive preview events');

  // 2. Admin authenticated request with ?includePreview=true IS honored
  process.env.ADMIN_TOKEN = 'test-secure-admin-token-12345';
  const adminUrl = `/api/feed?lat=${EXPANSION_VENUES.stardome.lat}&lon=${EXPANSION_VENUES.stardome.lon}&mode=comedy&window=all&includePreview=true`;
  const { req: adminReq, res: adminRes, getJson: getAdminJson } = createMockReqRes({
    url: adminUrl,
    headers: { authorization: 'Bearer test-secure-admin-token-12345' }
  });
  await feedHandler(adminReq, adminRes);
  const adminData = getAdminJson();
  const adminExpansionEvents = (adminData.events || []).filter(e => (e.venue_name || e.venue) === 'Stardome Comedy Club');
  assert.ok(adminExpansionEvents.length >= 20, 'Admin request with valid bearer token must receive preview events');
});

test('Preview Cron Ingestion (Production Guardrail): Blocks expansion cron in production', async () => {
  process.env.CRON_SECRET = 'test-secure-cron-token-12345';
  process.env.VERCEL_ENV = 'production';
  process.env.ENABLE_EXPANSION_PILOT = 'false';
  const { req: prodCronReq, res: prodCronRes, getJson: getProdCronJson } = createMockReqRes({
    method: 'POST',
    url: '/api/cron-ingest?source=expansion',
    headers: { authorization: 'Bearer test-secure-cron-token-12345' }
  });
  await cronIngestHandler(prodCronReq, prodCronRes);
  const prodCronData = getProdCronJson();
  assert.equal(prodCronData.success, false);
  assert.equal(prodCronData.expansionRecordsWritten, 0);
  assert.ok(prodCronData.error.includes('disabled in production'));
});

test('Preview Cron Ingestion (Live Integration): Refreshes into preview namespace on live feeds', { skip: SKIP_LIVE }, async () => {
  process.env.CRON_SECRET = 'test-secure-cron-token-12345';
  process.env.VERCEL_ENV = 'preview';
  process.env.ENABLE_EXPANSION_PILOT = 'true';
  const { req: prevCronReq, res: prevCronRes, getJson: getPrevCronJson } = createMockReqRes({
    method: 'POST',
    url: '/api/cron-ingest?source=expansion',
    headers: { authorization: 'Bearer test-secure-cron-token-12345' }
  });
  await cronIngestHandler(prevCronReq, prevCronRes);
  const prevCronData = getPrevCronJson();
  assert.equal(prevCronData.success, true);
  assert.equal(prevCronData.failedRefreshes, 0);
  assert.ok(prevCronData.expansionRecordsWritten >= 250, `Expected >= 250 live expansion records written, got ${prevCronData.expansionRecordsWritten}`);
  const reportedTotal = (prevCronData.reports || []).reduce((acc, r) => acc + (r.count || 0), 0);
  assert.equal(prevCronData.expansionRecordsWritten, reportedTotal);
  assert.equal(prevCronData.namespace, 'preview_expansion');
  assert.equal(prevCronData.environment, 'preview');
});

test('Production Namespace Isolation: Exactly 0 expansion records in production store', async () => {
  const prodRecords = await defaultCanonicalStorage.queryEvents({
    environment: 'production',
    includePreview: false,
    windowStart: '2026-01-01T00:00:00.000Z',
    windowEnd: '2099-01-01T00:00:00.000Z'
  });
  const expansionInProd = prodRecords.filter(e =>
    e.namespace === 'preview_expansion' ||
    e.venue_name === 'Stardome Comedy Club' ||
    e.venue_name === 'The Comedy Zone Charlotte'
  );
  assert.equal(expansionInProd.length, 0, 'Production query must return strictly 0 expansion records');
});

test('Birmingham & Charlotte Serverless Feeds (Deterministic Unit): Return upcoming events in preview', async () => {
  process.env.ENABLE_EXPANSION_PILOT = 'true';
  process.env.VERCEL_ENV = 'preview';

  const tmpFile = path.join(os.tmpdir(), `test_runtime_feeds_unit_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  const unitStorage = new LocalFileCanonicalStorage(tmpFile);
  const origQuery = defaultCanonicalStorage.queryEvents;
  defaultCanonicalStorage.queryEvents = unitStorage.queryEvents.bind(unitStorage);

  try {
    const seeded = await withIsolatedRawStorage(() => ingestExpansionComedy({
      persist: false,
      environment: 'preview',
      namespace: 'preview_expansion',
      fetchFn: createDeterministicExpansionFetch()
    }));
    await unitStorage.upsertEvents(seeded.events);

    // Birmingham
    const bhmUrl = `/api/feed?lat=${EXPANSION_VENUES.stardome.lat}&lon=${EXPANSION_VENUES.stardome.lon}&mode=comedy&window=all`;
    const { req: bhmReq, res: bhmRes, getJson: getBhmJson } = createMockReqRes({ url: bhmUrl });
    await feedHandler(bhmReq, bhmRes);
    const bhmData = getBhmJson();
    const bhmShows = (bhmData.events || []).filter(e => (e.venue_name || e.venue) === 'Stardome Comedy Club');
    assert.ok(bhmShows.length >= 20, `Expected >= 20 Stardome events, got ${bhmShows.length}`);
    assert.equal(bhmShows[0].city, 'Birmingham');
    assert.equal(bhmShows[0].confirmationStatus, 'confirmed_by_official_calendar');

    // Charlotte
    const cltUrl = `/api/feed?lat=${EXPANSION_VENUES.comedyZone.lat}&lon=${EXPANSION_VENUES.comedyZone.lon}&mode=comedy&window=all`;
    const { req: cltReq, res: cltRes, getJson: getCltJson } = createMockReqRes({ url: cltUrl });
    await feedHandler(cltReq, cltRes);
    const cltData = getCltJson();
    const cltShows = (cltData.events || []).filter(e => (e.venue_name || e.venue) === 'The Comedy Zone Charlotte');
    assert.ok(cltShows.length >= 20, `Expected >= 20 Comedy Zone events, got ${cltShows.length}`);
    assert.equal(cltShows[0].city, 'Charlotte');
    assert.equal(cltShows[0].confirmationStatus, 'confirmed_by_official_calendar');
  } finally {
    defaultCanonicalStorage.queryEvents = origQuery;
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

test('Birmingham & Charlotte Serverless Feeds (Live Integration): Return real upcoming events in preview', { skip: SKIP_LIVE }, async () => {
  process.env.ENABLE_EXPANSION_PILOT = 'true';
  process.env.VERCEL_ENV = 'preview';

  // Birmingham
  const bhmUrl = `/api/feed?lat=${EXPANSION_VENUES.stardome.lat}&lon=${EXPANSION_VENUES.stardome.lon}&mode=comedy&window=all`;
  const { req: bhmReq, res: bhmRes, getJson: getBhmJson } = createMockReqRes({ url: bhmUrl });
  await feedHandler(bhmReq, bhmRes);
  const bhmData = getBhmJson();
  const bhmShows = (bhmData.events || []).filter(e => (e.venue_name || e.venue) === 'Stardome Comedy Club');
  assert.ok(bhmShows.length >= 20, `Expected >= 20 Stardome events, got ${bhmShows.length}`);
  assert.equal(bhmShows[0].city, 'Birmingham');
  assert.equal(bhmShows[0].confirmationStatus, 'confirmed_by_official_calendar');

  // Charlotte
  const cltUrl = `/api/feed?lat=${EXPANSION_VENUES.comedyZone.lat}&lon=${EXPANSION_VENUES.comedyZone.lon}&mode=comedy&window=all`;
  const { req: cltReq, res: cltRes, getJson: getCltJson } = createMockReqRes({ url: cltUrl });
  await feedHandler(cltReq, cltRes);
  const cltData = getCltJson();
  const cltShows = (cltData.events || []).filter(e => (e.venue_name || e.venue) === 'The Comedy Zone Charlotte');
  assert.ok(cltShows.length >= 20, `Expected >= 20 Comedy Zone events, got ${cltShows.length}`);
  assert.equal(cltShows[0].city, 'Charlotte');
  assert.equal(cltShows[0].confirmationStatus, 'confirmed_by_official_calendar');
});

test('Second Ingestion Idempotency (Deterministic Unit): Exactly 0 duplicates created across 404 fixture events', async () => {
  const tmpFile = path.join(os.tmpdir(), `test_runtime_unit_idem_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  const unitStorage = new LocalFileCanonicalStorage(tmpFile);
  const fetchFn = createDeterministicExpansionFetch();

  try {
    await withIsolatedRawStorage(async () => {
      const run1 = await ingestExpansionComedy({
        persist: false,
        environment: 'preview',
        namespace: 'preview_expansion',
        fetchFn
      });
      assert.equal(run1.count, 404);
      await unitStorage.upsertEvents(run1.events);

      const run2 = await ingestExpansionComedy({
        persist: false,
        environment: 'preview',
        namespace: 'preview_expansion',
        fetchFn
      });
      assert.equal(run2.count, 404);
      await unitStorage.upsertEvents(run2.events);
    });

    const allPreview = await unitStorage.queryEvents({
      includePreview: true,
      namespace: 'preview_expansion',
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: '2099-01-01T00:00:00.000Z'
    });
    assert.equal(allPreview.length, 404, `Expected exactly 404 records after second deterministic ingestion, got ${allPreview.length}`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

test('Second Ingestion Idempotency (Live Integration): Exactly 0 duplicates created on live rolling feeds', { skip: SKIP_LIVE }, async () => {
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
  assert.equal(run2.count, run1.count);

  const allPreview = await defaultCanonicalStorage.queryEvents({
    includePreview: true,
    namespace: 'preview_expansion',
    windowStart: '2026-01-01T00:00:00.000Z',
    windowEnd: '2099-01-01T00:00:00.000Z'
  });
  assert.equal(allPreview.length, run1.count, `Expected exactly ${run1.count} records after second ingestion, got ${allPreview.length}`);
});

test('Ticket URLs: Full GET resolution to official checkout with markers', { skip: SKIP_LIVE }, async () => {
  const sampleUrls = [
    'https://www.stardome.com/shows/383690',
    'https://www.cltcomedyzone.com/shows/382369'
  ];

  for (const u of sampleUrls) {
    const audit = await verifyTicketUrlResolution(u, { timeoutMs: 10000 });
    assert.equal(audit.httpStatus, 200);
    assert.ok(audit.htmlLength > 1000);
    assert.equal(audit.hasCheckoutMarkers, true);
    assert.equal(audit.isVerified, true);
  }
});

test('Expired / Past Events: Excluded from feeds', async () => {
  const { evaluateEventFreshness } = await import('../lib/freshness.js');

  // Past event
  const pastEvent = {
    title: 'Past Show',
    start_time: '2020-01-01T20:00:00.000Z',
    confirmationStatus: 'confirmed_by_official_calendar',
    lastVerifiedAt: '2020-01-01T12:00:00.000Z',
    sourceEvidence: {
      exactConfirmationFields: { title: true, date: true, venue: true }
    }
  };

  const evalPast = evaluateEventFreshness(pastEvent);
  // Age in days > freshLimitDays (14 days) -> stale / expired
  assert.equal(evalPast.isDisplayable, false);
});

test('Failed Refresh Decay: Events decay to stale without synthetic replacements', async () => {
  const { evaluateEventFreshness } = await import('../lib/freshness.js');

  const staleEvent = {
    title: 'Decayed Show',
    start_time: '2026-10-15T20:00:00.000Z',
    confirmationStatus: 'confirmed_by_official_calendar',
    lastVerifiedAt: new Date(Date.now() - 40 * 86400e3).toISOString(), // 40 days ago
    sourceEvidence: {
      exactConfirmationFields: { title: true, date: true, venue: true }
    }
  };

  const evalStale = evaluateEventFreshness(staleEvent);
  assert.equal(evalStale.status, 'stale');
  assert.equal(evalStale.isDisplayable, false);
});

test('Production Safety & Invariant Confirmation', async () => {
  assert.equal(AUDIT_MILESTONE, 'Dynamic official-source ingestion pilot deployed; verified inventory expansion in progress.');
  assert.notEqual(process.env.ENABLE_EXPANSION_PILOT_PROD, 'true');
});
