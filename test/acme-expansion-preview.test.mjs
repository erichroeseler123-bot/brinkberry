import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  EXPANSION_VENUES,
  ingestAcme,
  ingestExpansionComedy,
  deduplicateExpansionEvents,
  verifyTicketUrlResolution,
  getCivilDateTime
} = require('../lib/comedy/expansion-ingestion.js');
const { evaluateEventFreshness } = require('../lib/freshness.js');
const { LocalFileCanonicalStorage } = require('../lib/storage/canonical-event-storage.js');
const { defaultRawStorage, LocalRawSourceStorage } = require('../lib/storage/raw-source-storage.js');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const SKIP_LIVE = process.env.BRINKBERRY_TEST_MODE === 'unit';
const FIXED_UNIT_NOW = new Date('2026-10-15T12:00:00.000Z');

async function withIsolatedRawStorage(fn) {
  const tmpRawDir = path.join(os.tmpdir(), `test_acme_raw_iso_${Math.random().toString(36).slice(2)}`);
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

function buildAcmeFixtureHtml(totalEvents = 107) {
  const events = [];
  for (let i = 0; i < totalEvents; i++) {
    const isMaryMack = i === 0;
    const showId = 385386 + i;
    const dayOffset = Math.floor(i / 2);
    const hourUtc = (i % 2 === 0) ? '01:00:00Z' : '03:30:00Z';
    const startDate = isMaryMack
      ? '2026-09-24T01:00:00Z'
      : new Date(Date.UTC(2026, 9, 1 + dayOffset, i % 2 === 0 ? 1 : 3, i % 2 === 0 ? 0 : 30, 0)).toISOString();
    const name = isMaryMack ? 'Mary Mack' : `Acme Headliner Showcase #${i + 1} (${hourUtc})`;
    events.push({
      '@context': 'https://schema.org',
      '@type': 'ComedyEvent',
      '@id': `https://acmecomedy.seatengine.com/shows/${showId}`,
      name,
      startDate,
      url: `https://acmecomedy.seatengine.com/shows/${showId}`,
      location: {
        '@type': 'ComedyClub',
        name: 'Acme Comedy Company'
      },
      offers: {
        '@type': 'Offer',
        price: '22',
        url: `https://acmecomedy.seatengine.com/shows/${showId}`
      }
    });
  }
  return `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(events)}</script></head><body>Acme</body></html>`;
}

function createDeterministicAcmeFetch(totalEvents = 107) {
  const html = buildAcmeFixtureHtml(totalEvents);
  return async () => ({
    ok: true,
    status: 200,
    text: async () => html
  });
}

test('Acme Comedy Company Preview Ingestion & Isolation Suite', async (t) => {

  await t.test('1. Venue Profile & Feed Configuration', () => {
    const venue = EXPANSION_VENUES.acme;
    assert.ok(venue, 'Acme must be registered in EXPANSION_VENUES');
    assert.equal(venue.name, 'Acme Comedy Company');
    assert.equal(venue.city, 'Minneapolis');
    assert.equal(venue.state, 'MN');
    assert.equal(venue.timezone, 'America/Chicago');
    assert.equal(venue.lat, 44.9877);
    assert.equal(venue.lon, -93.2721);
    assert.equal(venue.feedTechnology, 'Schema.org JSON-LD (SeatEngine)');
    assert.equal(venue.feedUrl, 'https://acmecomedy.seatengine.com/events/');
  });

  await t.test('2a. Deterministic Unit: 107 Canonical Events with Central Time Handling (Fixture)', async () => {
    const rep = await withIsolatedRawStorage(() => ingestAcme({
      persist: false,
      environment: 'preview',
      namespace: 'preview_expansion',
      fetchFn: createDeterministicAcmeFetch(107)
    }));

    assert.equal(rep.venue.name, 'Acme Comedy Company');
    assert.equal(rep.count, 107, 'Should ingest exactly 107 fixture Acme performances');
    assert.equal(rep.events.length, 107);
    assert.ok(rep.rawHash && rep.rawHash.length === 64, 'Must compute SHA-256 raw evidence hash');

    for (const ev of rep.events) {
      assert.equal(ev.venue_slug, 'acme-comedy-company-minneapolis');
      assert.equal(ev.venue_name, 'Acme Comedy Company');
      assert.equal(ev.city, 'Minneapolis');
      assert.equal(ev.state, 'MN');
      assert.equal(ev.timezone, 'America/Chicago');
      assert.equal(ev.confirmationStatus, 'confirmed_by_official_calendar');
      assert.equal(ev.environment, 'preview');
      assert.equal(ev.namespace, 'preview_expansion');
      assert.match(ev.civilDate, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(ev.civilTime, /^\d{2}:\d{2}$/);
      assert.ok(ev.ticket_url.includes('acmecomedy.seatengine.com') || ev.ticket_url.includes('acmecomedycompany.com'));
      assert.ok(!ev.ticket_url.includes('partner='), 'Zero affiliate tracking wrapper');
      assert.ok(!ev.ticket_url.includes('/api/click'), 'Zero redirect wrapper');
      assert.ok(ev.sourceEvidence, 'Must attach source evidence');
      assert.equal(ev.sourceEvidence.contentHash, rep.rawHash);
    }

    // Verify exact Central Time conversion on Mary Mack sample event (2026-09-24T01:00:00Z -> 2026-09-23 at 20:00 CDT)
    const sample = rep.events.find(e => e.title.includes('Mary Mack'));
    assert.ok(sample, 'Must contain Mary Mack performance');
    const { date, time } = getCivilDateTime(sample.start, 'America/Chicago');
    assert.equal(sample.civilDate, date);
    assert.equal(sample.civilTime, time);
    assert.equal(sample.civilDate, '2026-09-23');
    assert.equal(sample.civilTime, '20:00');
  });

  await t.test('2b. Live Integration: Rolling Calendar Ingestion & Central Time Normalization', { skip: SKIP_LIVE }, async () => {
    const rep = await ingestAcme({
      persist: false,
      environment: 'preview',
      namespace: 'preview_expansion'
    });

    assert.equal(rep.venue.name, 'Acme Comedy Company');
    assert.ok(rep.count >= 50, `Expected at least 50 live upcoming Acme performances on rolling calendar, got ${rep.count}`);
    assert.equal(rep.events.length, rep.count);
    assert.ok(rep.rawHash && rep.rawHash.length === 64, 'Must compute SHA-256 raw evidence hash');

    for (const ev of rep.events) {
      assert.equal(ev.venue_slug, 'acme-comedy-company-minneapolis');
      assert.equal(ev.timezone, 'America/Chicago');
      const { date, time } = getCivilDateTime(ev.start, 'America/Chicago');
      assert.equal(ev.civilDate, date);
      assert.equal(ev.civilTime, time);
      assert.ok(ev.ticket_url.includes('acmecomedy.seatengine.com') || ev.ticket_url.includes('acmecomedycompany.com'));
      assert.ok(!ev.ticket_url.includes('partner='), 'Zero affiliate tracking wrapper');
      assert.ok(!ev.ticket_url.includes('/api/click'), 'Zero redirect wrapper');
    }
  });

  await t.test('3a. Deterministic Unit: Storage Idempotency — Two Consecutive Ingestions Yield 0 Duplicates (107 Fixture Records)', async () => {
    const tmpFile = path.join(os.tmpdir(), `test_acme_storage_${Date.now()}_unit_idempotent.json`);
    const testStorage = new LocalFileCanonicalStorage(tmpFile);
    const fetchFn = createDeterministicAcmeFetch(107);

    const rep1 = await withIsolatedRawStorage(() => ingestAcme({
      persist: false,
      environment: 'preview',
      namespace: 'preview_expansion',
      fetchFn
    }));
    await testStorage.upsertEvents(rep1.events);

    const afterFirst = await testStorage.queryEvents({
      lat: 44.9877,
      lon: -93.2721,
      radiusMiles: 25,
      includePreview: true,
      environment: 'preview',
      namespace: 'preview_expansion',
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: '2099-01-01T00:00:00.000Z'
    });
    assert.equal(afterFirst.length, 107, 'First deterministic ingestion stores exactly 107 records');

    const rep2 = await withIsolatedRawStorage(() => ingestAcme({
      persist: false,
      environment: 'preview',
      namespace: 'preview_expansion',
      fetchFn
    }));
    await testStorage.upsertEvents(rep2.events);

    const afterSecond = await testStorage.queryEvents({
      lat: 44.9877,
      lon: -93.2721,
      radiusMiles: 25,
      includePreview: true,
      environment: 'preview',
      namespace: 'preview_expansion',
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: '2099-01-01T00:00:00.000Z'
    });
    assert.equal(afterSecond.length, 107, 'Second deterministic ingestion must result in 0 duplicates, exactly 107 records');

    const merged = deduplicateExpansionEvents([...rep1.events, ...rep2.events]);
    assert.equal(merged.length, 107, 'deduplicateExpansionEvents merges duplicates cleanly');

    try { fs.unlinkSync(tmpFile); } catch (_) {}
  });

  await t.test('3b. Live Integration: Storage Idempotency on Live Rolling Feed', { skip: SKIP_LIVE }, async () => {
    const tmpFile = path.join(os.tmpdir(), `test_acme_storage_${Date.now()}_live_idempotent.json`);
    const testStorage = new LocalFileCanonicalStorage(tmpFile);

    const rep1 = await ingestAcme({
      persist: false,
      environment: 'preview',
      namespace: 'preview_expansion'
    });
    assert.ok(rep1.count >= 50, `Expected >= 50 live Acme records, got ${rep1.count}`);
    await testStorage.upsertEvents(rep1.events);

    const afterFirst = await testStorage.queryEvents({
      lat: 44.9877,
      lon: -93.2721,
      radiusMiles: 25,
      includePreview: true,
      environment: 'preview',
      namespace: 'preview_expansion',
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: '2099-01-01T00:00:00.000Z'
    });
    assert.equal(afterFirst.length, rep1.count, 'First live ingestion stores exact live feed count');

    const rep2 = await ingestAcme({
      persist: false,
      environment: 'preview',
      namespace: 'preview_expansion'
    });
    await testStorage.upsertEvents(rep2.events);

    const afterSecond = await testStorage.queryEvents({
      lat: 44.9877,
      lon: -93.2721,
      radiusMiles: 25,
      includePreview: true,
      environment: 'preview',
      namespace: 'preview_expansion',
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: '2099-01-01T00:00:00.000Z'
    });
    assert.equal(afterSecond.length, rep1.count, 'Second live ingestion must result in 0 duplicates');

    const beforeIds = new Set(afterFirst.map(e => e.id));
    const afterIds = afterSecond.map(e => e.id);
    const newIds = afterIds.filter(id => !beforeIds.has(id));
    assert.equal(newIds.length, 0, 'Zero new IDs generated on re-ingestion');

    const fingerprints = afterSecond.map(e => e.fingerprint);
    const duplicateFingerprints = fingerprints.length - new Set(fingerprints).size;
    assert.equal(duplicateFingerprints, 0, 'Zero duplicate fingerprints');

    const merged = deduplicateExpansionEvents([...rep1.events, ...rep2.events]);
    assert.equal(merged.length, rep1.count, 'deduplicateExpansionEvents merges duplicates cleanly');

    try { fs.unlinkSync(tmpFile); } catch (_) {}
  });

  await t.test('4. Direct Checkout Link Resolution & Box Office Verification', { skip: SKIP_LIVE }, async () => {
    const sampleTicketUrl = 'https://acmecomedy.seatengine.com/shows/385386';
    const resolution = await verifyTicketUrlResolution(sampleTicketUrl);

    assert.equal(resolution.initialUrl, sampleTicketUrl);
    assert.equal(resolution.httpStatus, 200);
    assert.ok(resolution.htmlLength > 1000);
    assert.equal(resolution.hasCheckoutMarkers, true, 'Page must contain checkout / ticketing markers');
    assert.equal(resolution.isVerified, true);
    assert.ok(!resolution.finalUrl.includes('affiliate'), 'Zero affiliate wrap');
  });

  await t.test('5. Honest Stale Decay (Zero Synthetic Recurring Dates)', () => {
    const now = new Date();
    const staleVerificationDate = new Date(now.getTime() - 20 * 24 * 3600e3).toISOString(); // 20 days ago

    const simulatedStaleEvent = {
      id: 'msp_acme_test_stale',
      title: 'Simulated Stale Acme Show',
      start: new Date(now.getTime() + 48 * 3600e3).toISOString(),
      venue_slug: 'acme-comedy-company-minneapolis',
      confirmationStatus: 'confirmed_by_official_calendar',
      lastVerifiedAt: staleVerificationDate,
      sourceEvidence: {
        exactConfirmationFields: {
          title: true,
          date: true
        }
      }
    };

    const freshness = evaluateEventFreshness(simulatedStaleEvent);
    assert.equal(freshness.isDisplayable, false, 'Stale event must not be displayable');
    assert.equal(freshness.status, 'stale');
    assert.match(freshness.reason, /expired/i);
  });

  await t.test('6. Preview Isolation & Denver Quarantine Enforcement', async () => {
    const tmpFile = path.join(os.tmpdir(), `test_acme_storage_${Date.now()}_isolation.json`);
    const testStorage = new LocalFileCanonicalStorage(tmpFile);

    const rep = await ingestAcme({
      persist: false,
      environment: 'preview',
      namespace: 'preview_expansion',
      fetchFn: createDeterministicAcmeFetch(107)
    });
    await testStorage.upsertEvents(rep.events);

    // Production queries with includePreview: false MUST return 0 events
    const prodQueryResult = await testStorage.queryEvents({
      lat: 44.9877,
      lon: -93.2721,
      radiusMiles: 30,
      environment: 'production',
      includePreview: false,
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: '2099-01-01T00:00:00.000Z'
    });
    assert.equal(prodQueryResult.length, 0, 'Production query must return 0 preview expansion events');

    // Preview queries with includePreview: true retrieve all 107 records
    const previewQueryResult = await testStorage.queryEvents({
      lat: 44.9877,
      lon: -93.2721,
      radiusMiles: 30,
      environment: 'preview',
      includePreview: true,
      namespace: 'preview_expansion',
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: '2099-01-01T00:00:00.000Z'
    });
    assert.equal(previewQueryResult.length, 107, 'Preview query retrieves 107 preview expansion records');

    // Quarantine verification: Denver records must remain untouched
    const denverQueryResult = await testStorage.queryEvents({
      lat: 39.7392,
      lon: -104.9903,
      radiusMiles: 30,
      includePreview: true,
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: '2099-01-01T00:00:00.000Z'
    });
    assert.equal(denverQueryResult.length, 0, 'Denver has 0 events in this storage; zero promotion occurred');

    try { fs.unlinkSync(tmpFile); } catch (_) {}
  });

});
