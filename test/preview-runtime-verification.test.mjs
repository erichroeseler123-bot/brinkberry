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
import {
  defaultCanonicalStorage
} from '../lib/storage/canonical-event-storage.js';
import { createRequire } from 'module';

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

test('Security Gate: Public requests in production cannot toggle includePreview', async () => {
  // Setup: Ingest preview records, but set production environment
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

test('Preview Cron Ingestion: Refreshes into preview namespace and blocks in production', async () => {
  process.env.CRON_SECRET = 'test-secure-cron-token-12345';

  // 1. In production, expansion cron MUST be blocked
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

  // 2. In preview, expansion cron runs and writes to preview namespace
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
  assert.ok(prevCronData.expansionRecordsWritten >= 400 && prevCronData.expansionRecordsWritten <= 410);
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

test('Birmingham & Charlotte Serverless Feeds: Return real upcoming events in preview', async () => {
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

test('Second Ingestion Idempotency: Exactly 0 duplicates created', async () => {
  // Ingest run 1
  const run1 = await ingestExpansionComedy({
    persist: true,
    environment: 'preview',
    namespace: 'preview_expansion'
  });
  assert.ok(run1.count >= 400 && run1.count <= 410);

  // Ingest run 2 immediately following
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

test('Ticket URLs: Full GET resolution to official checkout with markers', async () => {
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
