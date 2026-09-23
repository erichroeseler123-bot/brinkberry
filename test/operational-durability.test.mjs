import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { OFFICIAL_SOURCES, ingestSource, clearIngestionCache } = require('../lib/ingestion/engine.js');
const { SourceRefreshScheduler } = require('../lib/ingestion/scheduler.js');
const { CanonicalEventStorage } = require('../lib/storage/canonical-event-storage.js');
const { LocalRawSourceStorage } = require('../lib/storage/raw-source-storage.js');
const { parseIcsSource } = require('../lib/ingestion/adapters/ics.js');
const { parseHtmlScheduleSource } = require('../lib/ingestion/adapters/html-schedule.js');
const { parseHtmlCardsSource } = require('../lib/ingestion/adapters/html-cards.js');
const { evaluateEventFreshness } = require('../lib/freshness.js');
const { AUDIT_MILESTONE } = require('../lib/audit/coverage-auditor.js');
const cronIngestHandler = require('../api/cron-ingest.js');

describe('Dynamic Official-Source Operational Durability & Proof Suite', () => {
  let testDir;
  let testCanonicalStorage;
  let testRawStorage;

  beforeEach(() => {
    clearIngestionCache();
    testDir = path.join(os.tmpdir(), `bb_test_durability_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(testDir, { recursive: true });
    testCanonicalStorage = new CanonicalEventStorage(path.join(testDir, 'test_canonical.json'));
    testRawStorage = new LocalRawSourceStorage(path.join(testDir, 'test_raw'));
  });

  const mockRiseConfig = OFFICIAL_SOURCES.find(s => s.id === 'src_rise_comedy_denver');
  const mockVolusiaConfig = OFFICIAL_SOURCES.find(s => s.id === 'src_volusia_speedway');
  const mockStandConfig = OFFICIAL_SOURCES.find(s => s.id === 'src_the_stand_nyc');

  it('1. Source timeout handling: graceful abort, records error, preserves prior state', async () => {
    const timeoutFetch = async () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    };

    const res = await ingestSource(mockRiseConfig, {
      fetchFn: timeoutFetch,
      bypassCache: true,
      rawStorage: testRawStorage,
      canonicalStorage: testCanonicalStorage
    });

    assert.equal(res.httpStatus, 0);
    assert.match(res.parserErrors, /timeout/i);
    assert.equal(res.confirmedCount, 0);
    assert.deepEqual(res.events, []);

    // Raw evidence snapshot was saved with error details
    const latestRaw = await testRawStorage.getLatestRawEvidence(mockRiseConfig.id);
    assert.ok(latestRaw);
    assert.equal(latestRaw.httpStatus, 0);
    assert.match(latestRaw.parserErrors, /timeout/i);
  });

  it('2. HTTP 404 handling: records error, zero fake dates, triggers decay', async () => {
    const notFoundFetch = async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => '404 Calendar Not Found'
    });

    const res = await ingestSource(mockStandConfig, {
      fetchFn: notFoundFetch,
      bypassCache: true,
      rawStorage: testRawStorage,
      canonicalStorage: testCanonicalStorage
    });

    assert.equal(res.httpStatus, 404);
    assert.match(res.parserErrors, /HTTP error 404/);
    assert.equal(res.confirmedCount, 0);
    assert.deepEqual(res.events, []);

    // Scheduler marks cycle as failed and decays stale events
    const scheduler = new SourceRefreshScheduler({
      rawStorage: testRawStorage,
      canonicalStorage: testCanonicalStorage,
      sources: [mockStandConfig]
    });

    const cycle = await scheduler.refreshSource(mockStandConfig.id, { fetchFn: notFoundFetch, force: true });
    assert.equal(cycle.status, 'failed');
    assert.equal(cycle.httpStatus, 404);
  });

  it('3. HTTP 429 rate limit backoff: captures rate limit and prevents spurious events', async () => {
    const rateLimitedFetch = async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => 'Rate limit exceeded. Try again in 60s.'
    });

    const res = await ingestSource(mockVolusiaConfig, {
      fetchFn: rateLimitedFetch,
      bypassCache: true,
      rawStorage: testRawStorage,
      canonicalStorage: testCanonicalStorage
    });

    assert.equal(res.httpStatus, 429);
    assert.equal(res.confirmedCount, 0);
    assert.deepEqual(res.events, []);
  });

  it('4. Malformed ICS parsing: resilient to syntax corruption without crashing', () => {
    const corruptedIcs = `
      BEGIN:SOMETHING_ELSE
      RANDOM_GARBAGE:::corrupted-line
      DTSTART;TZID=Invalid:NOT_A_DATE
      SUMMARY:Half formed title without closing tag
      \x00\x01\x02 binary junk
      END:VCALENDAR
    `;

    const parsed = parseIcsSource(corruptedIcs, mockRiseConfig);
    assert.ok(Array.isArray(parsed));
    // Must not throw and must return 0 valid candidates from complete corruption
    assert.equal(parsed.length, 0);
  });

  it('5. Changed HTML layout: handles missing container classes gracefully', () => {
    const redesignedHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Under Construction</title></head>
        <body>
          <main class="brand-new-wrapper">
            <h1>We have updated our site!</h1>
            <p>Check back soon for our new schedule.</p>
          </main>
        </body>
      </html>
    `;

    const scheduleParsed = parseHtmlScheduleSource(redesignedHtml, mockVolusiaConfig);
    assert.deepEqual(scheduleParsed, []);

    const cardsParsed = parseHtmlCardsSource(redesignedHtml, mockStandConfig);
    assert.deepEqual(cardsParsed, []);
  });

  it('6. Empty schedule response: decays gracefully without fabricating dates', async () => {
    const emptyIcs = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Empty//EN\nEND:VCALENDAR`;
    const emptyFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => emptyIcs
    });

    const res = await ingestSource(mockRiseConfig, {
      fetchFn: emptyFetch,
      bypassCache: true,
      rawStorage: testRawStorage,
      canonicalStorage: testCanonicalStorage
    });

    assert.equal(res.httpStatus, 200);
    assert.equal(res.rawCount, 0);
    assert.equal(res.confirmedCount, 0);
    assert.deepEqual(res.events, []);
  });

  it('7. Cancelled event handling: flagged isCancelled and excluded from confirmed feed', () => {
    const cancelledIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-cancelled-1@risecomedy.com
SUMMARY:Storm Watch Comedy Show
STATUS:CANCELLED
DTSTART:20261015T200000Z
DTEND:20261015T213000Z
URL:https://risecomedy.com/shows/storm-watch
END:VEVENT
END:VCALENDAR`;

    const parsed = parseIcsSource(cancelledIcs, mockRiseConfig);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].isCancelled, true);

    const freshness = evaluateEventFreshness(parsed[0], { nowMs: Date.now() });
    assert.equal(freshness.status, 'cancelled');
  });

  it('8. Duplicate ingestion idempotency: identical content produces identical hash and IDs', async () => {
    const sampleIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-fixed-id-101@risecomedy.com
SUMMARY:Denver Standup Showcase
DTSTART:20261101T020000Z
URL:https://risecomedy.com/shows/showcase
END:VEVENT
END:VCALENDAR`;

    const fetchSample = async () => ({
      ok: true,
      status: 200,
      text: async () => sampleIcs
    });

    const run1 = await ingestSource(mockRiseConfig, { fetchFn: fetchSample, bypassCache: true, rawStorage: testRawStorage, canonicalStorage: testCanonicalStorage });
    const run2 = await ingestSource(mockRiseConfig, { fetchFn: fetchSample, bypassCache: true, rawStorage: testRawStorage, canonicalStorage: testCanonicalStorage });

    assert.equal(run1.rawSourceHash, run2.rawSourceHash);
    assert.equal(run1.events.length, 1);
    assert.equal(run2.events.length, 1);
    assert.equal(run1.events[0].id, run2.events[0].id);
    assert.equal(run1.events[0].fingerprint, run2.events[0].fingerprint);

    // Stored records in canonical storage should be exactly 1
    const stored = await testCanonicalStorage.getEventById(run1.events[0].id);
    assert.ok(stored);
    assert.equal(stored.title, 'Denver Standup Showcase');
  });

  it('9. Unchanged content hash: scheduler detects identical hash and skips re-parsing churn', async () => {
    const content = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:evt-hash-test@rise.com\nSUMMARY:Improv Night\nDTSTART:20261105T010000Z\nURL:https://risecomedy.com/shows/improv\nEND:VEVENT\nEND:VCALENDAR`;
    const fetchFn = async () => ({ ok: true, status: 200, text: async () => content });

    const scheduler = new SourceRefreshScheduler({
      rawStorage: testRawStorage,
      canonicalStorage: testCanonicalStorage,
      sources: [mockRiseConfig]
    });

    // Cycle 1: initial ingestion
    const cycle1 = await scheduler.refreshSource(mockRiseConfig.id, { fetchFn, force: true });
    assert.equal(cycle1.status, 'ok');
    assert.equal(cycle1.isUnchangedHash, false);

    // Cycle 2: refresh with identical content
    const cycle2 = await scheduler.refreshSource(mockRiseConfig.id, { fetchFn, force: true });
    assert.equal(cycle2.status, 'ok');
    assert.equal(cycle2.isUnchangedHash, true);
    assert.equal(cycle2.priorHash, cycle1.rawSourceHash);
  });

  it('10. Changed content hash: scheduler detects content update and syncs canonical records', async () => {
    const contentA = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:evt-a@rise.com\nSUMMARY:Show A\nDTSTART:20261105T010000Z\nURL:https://risecomedy.com/shows/a\nEND:VEVENT\nEND:VCALENDAR`;
    const contentB = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:evt-a@rise.com\nSUMMARY:Show A\nDTSTART:20261105T010000Z\nURL:https://risecomedy.com/shows/a\nEND:VEVENT\nBEGIN:VEVENT\nUID:evt-b@rise.com\nSUMMARY:Show B Added\nDTSTART:20261106T010000Z\nURL:https://risecomedy.com/shows/b\nEND:VEVENT\nEND:VCALENDAR`;

    let currentContent = contentA;
    const fetchFn = async () => ({ ok: true, status: 200, text: async () => currentContent });

    const scheduler = new SourceRefreshScheduler({
      rawStorage: testRawStorage,
      canonicalStorage: testCanonicalStorage,
      sources: [mockRiseConfig]
    });

    const c1 = await scheduler.refreshSource(mockRiseConfig.id, { fetchFn, force: true });
    assert.equal(c1.confirmedCount, 1);

    currentContent = contentB;
    const c2 = await scheduler.refreshSource(mockRiseConfig.id, { fetchFn, force: true });
    assert.equal(c2.isUnchangedHash, false);
    assert.notEqual(c2.rawSourceHash, c1.rawSourceHash);
    assert.equal(c2.confirmedCount, 2);
  });

  it('11. Stale source decay: records age from verified_current to aging to stale without fake dates', async () => {
    const now = Date.now();
    const tenDaysAgo = new Date(now - (10 * 86400 * 1000)).toISOString();
    const fortyDaysAgo = new Date(now - (40 * 86400 * 1000)).toISOString();

    const sampleEvents = [
      {
        id: 'evt_aging_test',
        fingerprint: 'fp_aging_test',
        title: 'Aging Show',
        start_time: '2026-11-20T01:00:00Z',
        venue_latitude: 39.7392,
        venue_longitude: -104.9903,
        lastConfirmedAt: tenDaysAgo,
        lastVerifiedAt: tenDaysAgo,
        freshnessStatus: 'verified_current'
      },
      {
        id: 'evt_stale_test',
        fingerprint: 'fp_stale_test',
        title: 'Stale Show',
        start_time: '2026-11-25T01:00:00Z',
        venue_latitude: 39.7392,
        venue_longitude: -104.9903,
        lastConfirmedAt: fortyDaysAgo,
        lastVerifiedAt: fortyDaysAgo,
        freshnessStatus: 'verified_current'
      }
    ];

    await testCanonicalStorage.upsertEvents(sampleEvents);

    // Apply decay
    const decayedCount = await testCanonicalStorage.decayStaleEvents(7 * 86400e3, 30 * 86400e3);
    assert.equal(decayedCount, 2);

    const agingEv = await testCanonicalStorage.getEventById('evt_aging_test');
    assert.equal(agingEv.freshnessStatus, 'aging');

    const staleEv = await testCanonicalStorage.getEventById('evt_stale_test');
    assert.equal(staleEv.freshnessStatus, 'stale');
  });

  it('12. Source recovery after failure: restored 200 renews verified_current status', async () => {
    const validContent = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:evt-recovery@rise.com\nSUMMARY:Recovery Night\nDTSTART:20261110T020000Z\nURL:https://risecomedy.com/shows/recovery\nEND:VEVENT\nEND:VCALENDAR`;

    let shouldFail = true;
    const flakyFetch = async () => {
      if (shouldFail) {
        return { ok: false, status: 503, statusText: 'Service Unavailable', text: async () => 'Down' };
      }
      return { ok: true, status: 200, text: async () => validContent };
    };

    const scheduler = new SourceRefreshScheduler({
      rawStorage: testRawStorage,
      canonicalStorage: testCanonicalStorage,
      sources: [mockRiseConfig]
    });

    // Step 1: Failed attempt
    const c1 = await scheduler.refreshSource(mockRiseConfig.id, { fetchFn: flakyFetch, force: true });
    assert.equal(c1.status, 'failed');

    // Step 2: Source recovers
    shouldFail = false;
    const c2 = await scheduler.refreshSource(mockRiseConfig.id, { fetchFn: flakyFetch, force: true });
    assert.equal(c2.status, 'ok');
    assert.equal(c2.confirmedCount, 1);

    const recoveredEvent = (await testCanonicalStorage.queryEvents({ category: 'comedy', windowEnd: '2026-12-31T23:59:59Z' }))[0];
    assert.ok(recoveredEvent);
    assert.equal(recoveredEvent.freshnessStatus, 'verified_current');
  });

  it('13. Scheduled Refresh Cron Endpoint (/api/cron-ingest) authentication and execution', async () => {
    function createMockReqRes(options = {}) {
      const headers = options.headers || {};
      const query = options.query || {};
      const url = new URL('https://brinkberry.local/api/cron-ingest');
      for (const [k, v] of Object.entries(query)) {
        url.searchParams.set(k, v);
      }
      const req = {
        method: options.method || 'GET',
        url: url.pathname + url.search,
        headers
      };
      let statusCode = 200;
      let responseBody = null;
      const res = {
        status(c) { statusCode = c; return this; },
        setHeader() { return this; },
        json(data) { responseBody = data; return this; }
      };
      return { req, res, getStatus: () => statusCode, getBody: () => responseBody };
    }

    // 13a. Reject unauthorized
    const { req: unauthReq, res: unauthRes, getStatus: unauthStatus } = createMockReqRes({
      headers: { authorization: 'Bearer invalid-token' }
    });
    await cronIngestHandler(unauthReq, unauthRes);
    assert.equal(unauthStatus(), 401);

    // 13b. Accept authorized with Bearer token
    const oldCronSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'brinkberry_cron_secret_2026';
    try {
      const { req: authReq, res: authRes, getStatus: authStatus, getBody: authBody } = createMockReqRes({
        headers: { authorization: 'Bearer brinkberry_cron_secret_2026' }
      });
      await cronIngestHandler(authReq, authRes);
      assert.equal(authStatus(), 200);
      const body = authBody();
      assert.equal(body.success, true);
      assert.equal(body.milestone, AUDIT_MILESTONE);
      assert.equal(body.totalSources, 3);
      assert.ok(Array.isArray(body.reports));
    } finally {
      if (oldCronSecret !== undefined) {
        process.env.CRON_SECRET = oldCronSecret;
      } else {
        delete process.env.CRON_SECRET;
      }
    }
  });
});
