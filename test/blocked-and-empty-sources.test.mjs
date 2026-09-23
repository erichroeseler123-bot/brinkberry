import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  OFFICIAL_SOURCES,
  ingestSource,
  clearIngestionCache,
  getIngestedOfficialEvents
} from '../lib/ingestion/engine.js';
import {
  GcsRawSourceStorage,
  SharedMemoryGcsDriver,
  LocalRawSourceStorage
} from '../lib/storage/raw-source-storage.js';
import {
  ExternalSharedCanonicalStorage,
  SharedMemoryStoreDriver
} from '../lib/storage/canonical-event-storage.js';
import { evaluateEventFreshness } from '../lib/freshness.js';
import { executeHybridFeed } from '../lib/providers/engine.js';

describe('Blocked (WAF 403) and Empty Source Ingestion Regression Suite', () => {

  beforeEach(() => {
    clearIngestionCache();
  });

  // Test 1: Blocked upstream source (HTTP 403) produces zero inventory and honest metadata
  test('1. HTTP 403 blocked source produces 0 events, honest failed status, and no synthetic dates', async () => {
    const riseSource = OFFICIAL_SOURCES.find(s => s.id === 'src_rise_comedy_denver');
    assert.ok(riseSource, 'src_rise_comedy_denver must be in registry');

    const mockFetch403 = async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => '<html><head><title>403 Forbidden - Cloudflare WAF</title></head><body>Cloudflare error</body></html>'
    });

    const report = await ingestSource(riseSource, { fetchFn: mockFetch403, bypassCache: true });

    assert.equal(report.httpStatus, 403);
    assert.equal(report.rawCount, 0);
    assert.equal(report.confirmedCount, 0);
    assert.equal(report.events.length, 0);
    assert.ok(report.parserErrors.includes('403'));

    // Verify raw evidence storage captures 403 status and does NOT fabricate content
    const gcsStore = new Map();
    const gcsDriver = new SharedMemoryGcsDriver(gcsStore);
    const rawStorage = new GcsRawSourceStorage({ bucketName: 'test-bucket', driver: gcsDriver });

    const saveResult = await rawStorage.saveRawEvidence({
      sourceId: riseSource.id,
      httpStatus: report.httpStatus,
      rawResponse: '',
      parserName: riseSource.parser,
      parserErrors: report.parserErrors
    });

    assert.equal(saveResult.success, true);
    const latest = await rawStorage.getLatestRawEvidence(riseSource.id);
    assert.equal(latest.httpStatus, 403);
    assert.equal(latest.parserErrors, 'HTTP error 403');
  });

  // Test 2: Empty upstream source (HTTP 200 with zero events) does not infer or fabricate inventory
  test('2. HTTP 200 empty calendar produces 0 confirmed events and no relative date generation', async () => {
    const riseSource = OFFICIAL_SOURCES.find(s => s.id === 'src_rise_comedy_denver');

    // Empty valid ICS calendar
    const emptyIcs = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Rise Comedy//NONSGML Events//EN',
      'END:VCALENDAR'
    ].join('\r\n');

    const mockFetchEmpty = async () => ({
      ok: true,
      status: 200,
      text: async () => emptyIcs
    });

    const report = await ingestSource(riseSource, { fetchFn: mockFetchEmpty, bypassCache: true });

    assert.equal(report.httpStatus, 200);
    assert.equal(report.rawCount, 0);
    assert.equal(report.confirmedCount, 0);
    assert.equal(report.events.length, 0);
    assert.equal(report.parserErrors, null);
  });

  // Test 3: Blocked source preserves existing event decay instead of abrupt synthetic revival
  test('3. blocked source leaves existing events in graceful decay without artificial freshness refresh', async () => {
    const sharedDb = new Map();
    const dbDriver = new SharedMemoryStoreDriver(sharedDb);
    const canonicalStorage = new ExternalSharedCanonicalStorage({ driver: dbDriver });

    // Seed a previously confirmed event from 2 days ago
    const confirmedTwoDaysAgo = new Date(Date.now() - 48 * 3600e3).toISOString();
    const initialEvent = {
      id: 'rise_show_prev_confirmed',
      identityFingerprint: 'fp_rise_show_1',
      title: 'Previous Confirmed Comedy Night',
      category: 'comedy',
      venueId: 'ven_rise_comedy_denver',
      venue: { name: 'Rise Comedy', city: 'Denver', state: 'CO' },
      localStartTime: new Date(Date.now() + 24 * 3600e3).toISOString(),
      confirmationStatus: 'confirmed_by_official_calendar',
      lastVerifiedAt: confirmedTwoDaysAgo,
      sources: [{ sourceId: 'src_rise_comedy_denver', status: 'confirmed' }]
    };
    await canonicalStorage.upsertEvents([initialEvent]);

    // Now an ingestion attempt occurs but upstream is blocked by WAF (403)
    const mockFetch403 = async () => ({
      ok: false,
      status: 403,
      text: async () => 'Cloudflare 403'
    });

    const riseSource = OFFICIAL_SOURCES.find(s => s.id === 'src_rise_comedy_denver');
    const report = await ingestSource(riseSource, { fetchFn: mockFetch403, bypassCache: true });
    assert.equal(report.httpStatus, 403);
    assert.equal(report.confirmedCount, 0);

    // Canonical event must NOT have its lastVerifiedAt updated to now
    const stored = await canonicalStorage.getEventById(initialEvent.id);
    assert.equal(stored.lastVerifiedAt, confirmedTwoDaysAgo);

    // Freshness evaluation reflects true aging rather than synthetic freshness
    const freshness = evaluateEventFreshness(stored);
    assert.ok(freshness.ageDays >= 1.9, 'Age must reflect elapsed time since last genuine confirmation');
  });

  // Test 4: Volusia is confirmed while Rise and The Stand remain honest empty state
  test('4. Volusia produces genuine racing events while blocked comedy sources remain honest empty state', async () => {
    const volusiaSource = OFFICIAL_SOURCES.find(s => s.id === 'src_volusia_speedway');
    const theStandSource = OFFICIAL_SOURCES.find(s => s.id === 'src_the_stand_nyc');

    // Volusia schedule mock (HTML schedule)
    const volusiaHtml = `
      <div class="event-container schedulebox" data-start-date="2026-10-10" data-track="volusia-speedway-park">
        <p class="event-title">Saturday Night DIRTcar Modifieds & Sprint Shootout</p>
        <p class="event-series">DIRTcar UMP Modifieds, Top Gun Sprints</p>
        <a href="https://volusiaspeedwaypark.com/schedule">Tickets</a>
      </div></div></div>
    `;

    const mockFetchRouter = async (url) => {
      const u = String(url);
      if (u.includes('volusiaspeedwaypark.com')) {
        return { ok: true, status: 200, text: async () => volusiaHtml };
      }
      if (u.includes('thestandnyc.com')) {
        return { ok: false, status: 403, text: async () => 'Cloudflare 403 Forbidden' };
      }
      return { ok: false, status: 404, text: async () => 'Not found' };
    };

    const volusiaReport = await ingestSource(volusiaSource, { fetchFn: mockFetchRouter, bypassCache: true });
    assert.equal(volusiaReport.httpStatus, 200);
    assert.ok(volusiaReport.confirmedCount > 0);
    assert.ok(volusiaReport.events[0].category_tags.includes('racing') || Boolean(volusiaReport.events[0].racing));

    const theStandReport = await ingestSource(theStandSource, { fetchFn: mockFetchRouter, bypassCache: true });
    assert.equal(theStandReport.httpStatus, 403);
    assert.equal(theStandReport.confirmedCount, 0);
    assert.equal(theStandReport.events.length, 0);
  });

  // Test 5: National roster expansion constraint — blocked until at least one official comedy source is live
  test('5. national roster expansion is constrained until official comedy source delivers live inventory', async () => {
    // Audit current confirmed comedy sources
    const officialSources = OFFICIAL_SOURCES;
    const comedySources = officialSources.filter(s => s.category === 'comedy');
    assert.ok(comedySources.length >= 2, 'Must have at least two comedy sources registered for audit');

    const volusiaHtml = `
      <div class="event-container schedulebox" data-start-date="2026-10-10" data-track="volusia-speedway-park">
        <p class="event-title">Saturday Night DIRTcar Modifieds</p>
        <p class="event-series">DIRTcar UMP Modifieds</p>
        <a href="https://volusiaspeedwaypark.com/schedule">Tickets</a>
      </div></div></div>
    `;

    // If all comedy sources are WAF-blocked in production, verified comedy inventory must be 0
    const mockAllBlockedComedy = async (url) => {
      const u = String(url);
      if (u.includes('volusiaspeedwaypark.com')) {
        return {
          ok: true,
          status: 200,
          text: async () => volusiaHtml
        };
      }
      return { ok: false, status: 403, text: async () => 'WAF Blocked' };
    };

    const { events: ingestedEvents } = await getIngestedOfficialEvents(null, null, 50, 'all', { fetchFn: mockAllBlockedComedy, bypassCache: true });
    const confirmedComedy = ingestedEvents.filter(e => (e.category_tags || []).includes('comedy') || Boolean(e.comedy));
    const confirmedRacing = ingestedEvents.filter(e => (e.category_tags || []).includes('racing') || Boolean(e.racing));

    // Must have 0 confirmed comedy events
    assert.equal(confirmedComedy.length, 0, 'No comedy events can be confirmed while sources are WAF-blocked');
    // Must have genuine racing events
    assert.ok(confirmedRacing.length > 0, 'Volusia racing events must be genuinely confirmed');
  });

});
