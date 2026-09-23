// scripts/generate-final-approval-manifest.mjs
// Generates and verifies the final promotion approval manifest for the 5 SeatEngine venues

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { evaluateDisplayHorizon, validateDateTimeRoundTrip } = require('../lib/crawling/event-validation-record.js');
const { LIVE_PRODUCTION_VENUE_SLUGS } = require('../lib/crawling/venue-classification.js');

const CANDIDATE_EVENTS_FILE = 'candidate_promotion_ready_events.json';
const MANIFEST_OUTPUT_FILE = 'candidate_promotion_approval_manifest.json';

const SEATENGINE_TARGET_VENUES = [
  'louisville-comedy-club',
  'bricktown-comedy-club-okc',
  'tacoma-comedy-club',
  'spokane-comedy-club',
  'skyline-comedy-club-appleton'
];

async function main() {
  console.log('======================================================================');
  console.log('GENERATING FINAL CANDIDATE PROMOTION APPROVAL MANIFEST');
  console.log('Target: 5 SeatEngine Candidate Venues (358 Structurally Valid Events)');
  console.log('======================================================================\n');

  if (!fs.existsSync(CANDIDATE_EVENTS_FILE)) {
    throw new Error(`Source file ${CANDIDATE_EVENTS_FILE} does not exist.`);
  }

  const rawEvents = JSON.parse(fs.readFileSync(CANDIDATE_EVENTS_FILE, 'utf8'));
  console.log(`Loaded ${rawEvents.length} candidate promotion-ready events.`);

  const refDate = new Date('2026-09-22T20:08:12.467Z');

  const manifest = [];
  const seenIds = new Set();
  const seenFps = new Set();
  let displayCount = 0;
  let retainedFutureCount = 0;

  for (const ev of rawEvents) {
    // 1. Venue Verification
    assert.ok(SEATENGINE_TARGET_VENUES.includes(ev.venueSlug), `Venue ${ev.venueSlug} must be in the 5 candidate venues`);
    assert.ok(!LIVE_PRODUCTION_VENUE_SLUGS.has(ev.venueSlug), `Venue ${ev.venueSlug} must NOT overlap with 25 live production venues`);

    // 2. Date/Time & Horizon Reconciliation
    const [civilDate, civilTime] = ev.civilDateTime.split(' ');
    assert.ok(civilDate && /^\d{4}-\d{2}-\d{2}$/.test(civilDate), `Invalid civilDate: ${civilDate}`);
    assert.ok(civilTime && /^\d{2}:\d{2}$/.test(civilTime), `Invalid civilTime: ${civilTime}`);

    const rt = validateDateTimeRoundTrip(civilDate, civilTime, ev.timezone);
    assert.ok(rt.valid, `Date/time round trip failed for ${ev.eventId}: ${rt.reason}`);

    const horizonEval = evaluateDisplayHorizon(civilDate, civilTime, ev.timezone, rt.resolvedUtcDate, {
      now: refDate,
      horizonDays: 14
    });

    const isDisplay = Boolean(horizonEval.isDisplayEligible);
    const retentionTier = isDisplay ? 'active_feed_candidate' : 'retained_future_horizon';

    if (isDisplay) displayCount++;
    else retainedFutureCount++;

    // 3. ID and Fingerprint Deduplication
    assert.ok(!seenIds.has(ev.eventId), `Duplicate event ID detected: ${ev.eventId}`);
    assert.ok(!seenFps.has(ev.fingerprint), `Duplicate fingerprint detected: ${ev.fingerprint}`);
    seenIds.add(ev.eventId);
    seenFps.add(ev.fingerprint);

    // 4. Ticket URL Verification (No generic calendar URLs)
    const ticketUrl = ev.officialTicketUrl;
    assert.ok(ticketUrl && ticketUrl.startsWith('https://'), `Official ticket URL must be HTTPS: ${ticketUrl}`);
    const u = new URL(ticketUrl);
    const p = u.pathname.replace(/\/+$/, '');
    assert.ok(
      p !== '' && p !== '/calendar' && p !== '/events' && p !== '/shows' && p !== '/schedule',
      `Generic calendar link prohibited in manifest: ${ticketUrl}`
    );

    // 5. Evidence Hashes
    assert.ok(/^[0-9a-f]{64}$/i.test(ev.sourceHash), `Invalid sourceHash for ${ev.eventId}`);
    assert.ok(/^[0-9a-f]{64}$/i.test(ev.ticketHash), `Invalid ticketHash for ${ev.eventId}`);

    // 6. Synthetic event prevention
    assert.ok(!ev.eventId.includes('synthetic') && !ev.eventId.includes('seed_'), `Synthetic ID prohibited: ${ev.eventId}`);
    assert.ok(!/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(ev.title), `Recurring placeholder prohibited: ${ev.title}`);

    manifest.push({
      venueSlug: ev.venueSlug,
      canonicalEventId: ev.eventId,
      stableFingerprint: ev.fingerprint,
      title: ev.title,
      civilDate,
      civilTime,
      ianaTimezone: ev.timezone,
      directTicketUrl: ticketUrl,
      sourceEvidenceHash: ev.sourceHash,
      ticketEvidenceHash: ev.ticketHash,
      parserVersion: 'seatengine/1.0',
      displayEligibility: isDisplay,
      retentionTier
    });
  }

  // Final Assertions on Manifest
  assert.equal(manifest.length, 358, 'Manifest must contain exactly 358 structurally valid events');
  assert.equal(displayCount, 54, 'Manifest must contain exactly 54 display-eligible events');
  assert.equal(retainedFutureCount, 304, 'Manifest must contain exactly 304 retained-future events');
  assert.equal(displayCount + retainedFutureCount, 358, 'Display + Retained must equal total');

  fs.writeFileSync(MANIFEST_OUTPUT_FILE, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('--- Manifest Verification Checks ---');
  console.log(`Total events verified:        ${manifest.length}`);
  console.log(`Active-window display:        ${displayCount}`);
  console.log(`Retained future evidence:     ${retainedFutureCount}`);
  console.log(`Duplicate IDs:                0`);
  console.log(`Duplicate Fingerprints:       0`);
  console.log(`Overlap with 25 live venues:  0`);
  console.log(`Generic calendar URLs:        0`);
  console.log(`Synthetic recurring events:   0`);
  console.log(`Manifest written to:          ${MANIFEST_OUTPUT_FILE}\n`);
}

main().catch(err => {
  console.error('Fatal manifest generation error:', err);
  process.exit(1);
});
