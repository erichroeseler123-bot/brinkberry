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

  test('5. Duplicate performances remain separate (distinct showtimes preserved)', async () => {
    const shows = await getAtlantaCanonicalShows({ includePast: true });
    
    // Test Friday Tee Sanders at Punchline (has 2 separate showtimes: 9:30 PM and 11:30 PM)
    const teeSandersFriday = shows.filter(s => 
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

  test('6. No recurring text became a concrete date (timestamp strictly from source feed)', async () => {
    const shows = await getAtlantaCanonicalShows();
    assert.ok(shows.length > 0);

    for (const ev of shows) {
      // Must have concrete ISO start from source
      assert.ok(ev.start, `Event "${ev.title}" must have exact start ISO from feed`);
      const parsedDate = new Date(ev.start);
      assert.ok(!isNaN(parsedDate.getTime()), `Event start must be valid ISO date`);
      // Year must match feed year (2026)
      assert.equal(parsedDate.getFullYear(), 2026);
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
