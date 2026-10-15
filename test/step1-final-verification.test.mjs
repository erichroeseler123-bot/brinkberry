// test/step1-final-verification.test.mjs
// Step 1 Final Verification Test Suite for Atlanta Canonical Comedy Pioneer Market
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import {
  ingestAtlantaComedy,
  getAtlantaCanonicalShows,
  ATLANTA_VENUES
} from '../lib/comedy/atlanta-ingestion.js';

const require = createRequire(import.meta.url);
const router = require('../api/router.js');
const { AUDIT_MILESTONE } = require('../lib/audit/coverage-auditor.js');

describe('Step 1 Final Verification: Atlanta Canonical Comedy Pioneer Market', () => {

  test('1. Future events only are counted (zero past events)', async () => {
    const shows = await getAtlantaCanonicalShows({ includePast: false });
    assert.ok(shows.length >= 10, `Expected at least 10 shows, got ${shows.length}`);

    const now = Date.now();
    // Allow up to 2 hours grace for a show starting earlier tonight
    const minThreshold = now - 2 * 3600e3;

    for (const show of shows) {
      const startTime = new Date(show.start || show.start_time).getTime();
      assert.ok(Number.isFinite(startTime), `Start time must be valid number for ${show.title}`);
      assert.ok(
        startTime >= minThreshold,
        `Show "${show.title}" at ${show.start} is in the past (expected >= ${new Date(minThreshold).toISOString()})`
      );
    }
  });

  test('2. Every event has an exact local start time in venue timezone', async () => {
    const shows = await getAtlantaCanonicalShows({ includePast: false });

    for (const show of shows) {
      assert.ok(show.timezone === 'America/New_York', `Timezone must be America/New_York for ${show.title}`);
      const civilTime = show.civilTime || show.localTime;
      assert.match(
        civilTime,
        /^\d{2}:\d{2}$/,
        `Show "${show.title}" must have exact civil start time HH:MM, got: ${civilTime}`
      );
      const civilDate = show.civilDate || show.localDate;
      assert.match(
        civilDate,
        /^\d{4}-\d{2}-\d{2}$/,
        `Show "${show.title}" must have exact civil date YYYY-MM-DD, got: ${civilDate}`
      );
    }
  });

  test('3. Source URL and content hash (SHA-256) are retained for every event', async () => {
    const shows = await getAtlantaCanonicalShows({ includePast: false });

    for (const show of shows) {
      const evidence = show.sourceEvidence || show.source_evidence;
      assert.ok(evidence, `Event "${show.title}" must retain source evidence`);
      assert.ok(
        evidence.feedUrl || evidence.sourceUrl,
        `Event "${show.title}" must retain source feed URL`
      );
      const hash = evidence.contentHash || evidence.rawHash;
      assert.ok(hash, `Event "${show.title}" must retain content hash`);
      assert.match(
        hash,
        /^[0-9a-f]{64}$/i,
        `Event "${show.title}" hash must be a valid 64-char SHA-256 hex string, got: ${hash}`
      );
      assert.equal(
        show.confirmationStatus || show.confirmation_status,
        'confirmed_by_official_calendar',
        `Event "${show.title}" must be confirmed_by_official_calendar`
      );
    }
  });

  test('4. Direct ticket links work and point directly to official venue box offices', async () => {
    const shows = await getAtlantaCanonicalShows({ includePast: false });

    for (const show of shows) {
      const ticketUrl = show.ticketUrl || show.ticket_url;
      assert.ok(ticketUrl, `Show "${show.title}" must have ticket URL`);
      assert.ok(
        ticketUrl.startsWith('https://') || ticketUrl.startsWith('http://'),
        `Show "${show.title}" ticket URL must be valid HTTP(S): ${ticketUrl}`
      );
      // Verify points to venue official domains without affiliate redirect tampering
      const isOfficialDomain = ticketUrl.includes('punchline.com') ||
                               ticketUrl.includes('laughingskulllounge.com') ||
                               ticketUrl.includes('freshtix.com');
      assert.ok(
        isOfficialDomain,
        `Show "${show.title}" ticket link must point to official venue domain, got: ${ticketUrl}`
      );
      assert.ok(
        !ticketUrl.includes('/api/click'),
        `Official ticket link must not contain /api/click wrapper`
      );
    }
  });

  test('5a. Deterministic Unit: Duplicate performances remain separate (Tee Sanders 2026-09-25 9:30 PM & 11:30 PM fixture)', async () => {
    const path = require('node:path');
    const os = require('node:os');
    const fs = require('node:fs');
    const { defaultRawStorage, LocalRawSourceStorage } = require('../lib/storage/raw-source-storage.js');
    const { ingestPunchline, deduplicateAtlantaEvents } = require('../lib/comedy/atlanta-ingestion.js');
    const punchlineIcsFixture = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//The Punchline Comedy Club//NONSGML v1.0//EN',
      'BEGIN:VEVENT',
      'UID:punchline-tee-sanders-20260925-1930',
      'DTSTART:20260925T233000Z',
      'DTEND:20260926T010000Z',
      'SUMMARY:Tee Sanders',
      'LOCATION:The Punchline Comedy Club',
      'URL:https://www.punchline.com/shows/tee-sanders-1930',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:punchline-tee-sanders-20260925-2145',
      'DTSTART:20260926T014500Z',
      'DTEND:20260926T031500Z',
      'SUMMARY:Tee Sanders',
      'LOCATION:The Punchline Comedy Club',
      'URL:https://www.punchline.com/shows/tee-sanders-2145',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const tmpRawDir = path.join(os.tmpdir(), `test_raw_step1_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const unitRaw = new LocalRawSourceStorage({ baseDir: tmpRawDir });
    const origSave = defaultRawStorage.saveRawEvidence;
    defaultRawStorage.saveRawEvidence = unitRaw.saveRawEvidence.bind(unitRaw);
    let rep;
    try {
      rep = await ingestPunchline({
        fetchFn: async () => ({
          ok: true,
          status: 200,
          text: async () => punchlineIcsFixture
        })
      });
    } finally {
      defaultRawStorage.saveRawEvidence = origSave;
      try { fs.rmSync(tmpRawDir, { recursive: true, force: true }); } catch (_) {}
    }
    const canonical = deduplicateAtlantaEvents(rep.events);

    // Test Friday Tee Sanders at Punchline (has 2 separate showtimes: 9:30 PM and 11:30 PM)
    const teeSandersFriday = canonical.filter(s =>
      s.venue_name && s.venue_name.includes('Punchline') &&
      s.title === 'Tee Sanders' &&
      s.civilDate === '2026-09-25'
    );
    assert.equal(
      teeSandersFriday.length,
      2,
      `Friday Tee Sanders should have exactly 2 distinct showtimes, got ${teeSandersFriday.length}`
    );
    assert.notEqual(
      teeSandersFriday[0].civilTime,
      teeSandersFriday[1].civilTime,
      'Showtimes must be distinct'
    );
    assert.notEqual(
      teeSandersFriday[0].slug,
      teeSandersFriday[1].slug,
      'Slugs must be distinct'
    );
  });

  test('5b. Live Integration: Multi-showtime performances on the same date remain separate on live rolling calendar', { skip: process.env.BRINKBERRY_TEST_MODE === 'unit' }, async () => {
    const shows = await getAtlantaCanonicalShows({ includePast: false });
    const byVenueTitleDate = new Map();
    for (const s of shows) {
      const key = `${s.venue_slug}__${s.title}__${s.civilDate}`;
      if (!byVenueTitleDate.has(key)) byVenueTitleDate.set(key, []);
      byVenueTitleDate.get(key).push(s);
    }
    const multiShowGroups = Array.from(byVenueTitleDate.values()).filter(group => group.length >= 2);
    assert.ok(multiShowGroups.length >= 1, 'Live Atlanta calendar must preserve at least one multi-showtime same-day performance group');
    for (const group of multiShowGroups) {
      const uniqueTimes = new Set(group.map(s => s.civilTime));
      const uniqueSlugs = new Set(group.map(s => s.slug));
      assert.equal(uniqueTimes.size, group.length, `Expected distinct civilTime values for ${group[0].title} on ${group[0].civilDate}`);
      assert.equal(uniqueSlugs.size, group.length, `Expected distinct slugs for ${group[0].title} on ${group[0].civilDate}`);
    }
  });

  test('6. No recurring text became a concrete date (timestamp strictly from source feed)', async () => {
    const shows = await getAtlantaCanonicalShows();
    assert.ok(shows.length > 0);

    for (const ev of shows) {
      // Must have concrete ISO start from source
      assert.ok(ev.start, `Event "${ev.title}" must have exact start ISO from feed`);
      const parsedDate = new Date(ev.start);
      assert.ok(!isNaN(parsedDate.getTime()), `Event start must be valid ISO date`);
      // Year must match valid current/upcoming feed year (>= 2026)
      assert.ok(parsedDate.getFullYear() >= 2026 && parsedDate.getFullYear() <= new Date().getFullYear() + 2);
    }
  });

  test('7. /atlanta/comedy displays canonical events and venue identities', async () => {
    let statusCode = null;
    let html = '';
    const req = { url: '/atlanta/comedy', headers: { host: 'localhost:3000' } };
    const res = {
      setHeader() {},
      status(code) { statusCode = code; return this; },
      send(body) { html = body; }
    };

    await router(req, res);
    assert.equal(statusCode, 200);
    assert.ok(html.includes('Atlanta Live Stand-Up Comedy'));
    assert.ok(html.includes('The Punchline Comedy Club'));
    assert.ok(html.includes('Laughing Skull Lounge'));
    assert.ok(html.includes('confirmed_by_official_calendar') || html.includes('Official Calendar'));
    assert.ok(html.includes('/shows/'));
  });

  test('8. Individual show pages work with trust banner, direct tickets, and provenance audit', async () => {
    const shows = await getAtlantaCanonicalShows();
    const punchlineShow = shows.find(s => s.venue_name.includes('Punchline'));
    const skullShow = shows.find(s => s.venue_name.includes('Laughing Skull'));

    assert.ok(punchlineShow, 'Must have at least one Punchline show');
    assert.ok(skullShow, 'Must have at least one Laughing Skull show');

    for (const show of [punchlineShow, skullShow]) {
      let statusCode = null;
      let html = '';
      const req = { url: `/shows/${show.slug}`, headers: { host: 'localhost:3000' } };
      const res = {
        setHeader() {},
        status(code) { statusCode = code; return this; },
        send(body) { html = body; }
      };

      await router(req, res);
      assert.equal(statusCode, 200);
      assert.ok(html.includes('Brinkberry found this public schedule'));
      assert.ok(html.includes('Official Source Provenance Audit'));
      assert.ok(html.includes(show.venue_name));
      const ticket = show.ticketUrl || show.ticket_url;
      assert.ok(html.includes(ticket));
      const hash = show.sourceEvidence.contentHash || show.sourceEvidence.rawHash;
      assert.ok(html.includes(hash));
    }
  });

  test('9. No production database writes or deployments occur', async () => {
    // Check that canonical storage provider in development is local_file
    const { defaultCanonicalStorage } = require('../lib/storage/canonical-event-storage.js');
    const diags = defaultCanonicalStorage.getStorageDiagnostics();
    assert.equal(diags.canonicalEventProvider, 'local_file');
    assert.equal(diags.adapterClassification, 'test_and_development_only');
    assert.equal(diags.isProductionDurable, false);

    // Verify milestone string invariant is unchanged
    const EXPECTED_MILESTONE = 'Dynamic official-source ingestion pilot deployed; verified inventory expansion in progress.';
    assert.equal(AUDIT_MILESTONE, EXPECTED_MILESTONE);
  });

});
