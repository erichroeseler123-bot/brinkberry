import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPANSION_VENUES,
  ingestStardome,
  ingestComedyZone,
  ingestExpansionComedy,
  getCityCanonicalShows,
  deduplicateExpansionEvents
} from '../lib/comedy/expansion-ingestion.js';
import { defaultCanonicalStorage } from '../lib/storage/canonical-event-storage.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const routerHandler = require('../api/router.js');
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
  let finished = false;

  const res = {
    get statusCode() { return statusCode; },
    set statusCode(code) { statusCode = code; },
    setHeader(name, val) { responseHeaders[name.toLowerCase()] = String(val); return this; },
    getHeader(name) { return responseHeaders[name.toLowerCase()]; },
    write(chunk) { body += (chunk != null ? chunk.toString() : ''); return true; },
    end(chunk) {
      if (chunk != null) body += chunk.toString();
      finished = true;
      return this;
    },
    json(data) {
      responseHeaders['content-type'] = 'application/json; charset=utf-8';
      body = JSON.stringify(data);
      finished = true;
      return this;
    },
    send(data) {
      if (typeof data === 'object') return this.json(data);
      body = String(data);
      finished = true;
      return this;
    }
  };

  return { req, res, getBody: () => body, getStatus: () => statusCode, getHeaders: () => responseHeaders };
}

test('Network Expansion: Stardome Comedy Club (Birmingham, AL) Ingestion', async () => {
  const rep = await ingestStardome({ persist: true });
  assert.ok(rep.events.length >= 50, `Expected at least 50 events from Stardome, got ${rep.events.length}`);
  assert.equal(rep.venue.timezone, 'America/Chicago');
  assert.ok(/^[0-9a-f]{64}$/i.test(rep.rawHash), 'Must retain valid SHA-256 evidence snapshot hash');

  const sample = rep.events[0];
  assert.ok(sample.id.startsWith('bhm_star_'), 'ID must use Birmingham prefix');
  assert.ok(sample.title, 'Event must have a title');
  assert.equal(sample.timezone, 'America/Chicago', 'Timezone must be America/Chicago');
  assert.match(sample.civilDate, /^\d{4}-\d{2}-\d{2}$/, 'Must have valid civil date');
  assert.match(sample.civilTime, /^\d{2}:\d{2}$/, 'Must have valid civil time');
  assert.equal(sample.confirmationStatus, 'confirmed_by_official_calendar');
  assert.ok(sample.ticket_url.includes('stardome.com'), 'Ticket link must point directly to Stardome box office');
  assert.equal(sample.isCancelled, false);
});

test('Network Expansion: The Comedy Zone Charlotte Ingestion', async () => {
  const rep = await ingestComedyZone({ persist: true });
  assert.ok(rep.events.length >= 100, `Expected at least 100 events from Comedy Zone Charlotte, got ${rep.events.length}`);
  assert.equal(rep.venue.timezone, 'America/New_York');
  assert.ok(/^[0-9a-f]{64}$/i.test(rep.rawHash), 'Must retain valid SHA-256 evidence snapshot hash');

  const sample = rep.events[0];
  assert.ok(sample.id.startsWith('clt_zone_'), 'ID must use Charlotte prefix');
  assert.ok(sample.title, 'Event must have a title');
  assert.equal(sample.timezone, 'America/New_York', 'Timezone must be America/New_York');
  assert.match(sample.civilDate, /^\d{4}-\d{2}-\d{2}$/, 'Must have valid civil date');
  assert.match(sample.civilTime, /^\d{2}:\d{2}$/, 'Must have valid civil time');
  assert.equal(sample.confirmationStatus, 'confirmed_by_official_calendar');
  assert.ok(sample.ticket_url.includes('cltcomedyzone.com'), 'Ticket link must point directly to Comedy Zone box office');
  assert.equal(sample.isCancelled, false);
});

test('Network Expansion: Multi-Showtime Preservation & Deduplication', async () => {
  // Simulate distinct showtimes on the same day
  const rawMock = [
    {
      fingerprint: 'comedy_stardome_2026-10-16_19_headliner-show',
      title: 'Headliner Show',
      civilDate: '2026-10-16',
      civilTime: '19:00',
      start: '2026-10-17T00:00:00Z',
      ticket_url: 'https://www.stardome.com/shows/1',
      sourceEvidence: { sourceId: 'test_1' }
    },
    {
      fingerprint: 'comedy_stardome_2026-10-16_21_headliner-show',
      title: 'Headliner Show',
      civilDate: '2026-10-16',
      civilTime: '21:30',
      start: '2026-10-17T02:30:00Z',
      ticket_url: 'https://www.stardome.com/shows/2',
      sourceEvidence: { sourceId: 'test_2' }
    },
    {
      // Duplicate of first show
      fingerprint: 'comedy_stardome_2026-10-16_19_headliner-show',
      title: 'Headliner Show',
      civilDate: '2026-10-16',
      civilTime: '19:00',
      start: '2026-10-17T00:00:00Z',
      ticket_url: 'https://www.stardome.com/shows/1?ref=calendar',
      sourceEvidence: { sourceId: 'test_3' }
    }
  ];

  const deduped = deduplicateExpansionEvents(rawMock);
  assert.equal(deduped.length, 2, 'Must deduplicate identical showtime while preserving separate showtime');
  assert.equal(deduped[0].civilTime, '19:00');
  assert.equal(deduped[1].civilTime, '21:30');
  assert.equal(deduped[0].sources.length, 2, 'Duplicate source evidence must be merged into canonical record');
  assert.ok(deduped[0].ticket_url.includes('ref=calendar'), 'Must retain deepest ticket URL');
});

test('Network Expansion: Local Canonical Storage Querying', async () => {
  // Query Birmingham from storage
  const bhmShows = await defaultCanonicalStorage.queryEvents({
    category: 'comedy',
    lat: EXPANSION_VENUES.stardome.lat,
    lon: EXPANSION_VENUES.stardome.lon,
    radiusMiles: 35,
    includePreview: true,
    windowStart: '2026-01-01T00:00:00.000Z',
    windowEnd: '2099-01-01T00:00:00.000Z'
  });
  assert.ok(bhmShows.length > 0, 'Must query stored Birmingham events from local canonical storage');
  assert.equal(bhmShows[0].city, 'Birmingham');

  // Query Charlotte from storage
  const cltShows = await defaultCanonicalStorage.queryEvents({
    category: 'comedy',
    lat: EXPANSION_VENUES.comedyZone.lat,
    lon: EXPANSION_VENUES.comedyZone.lon,
    radiusMiles: 35,
    includePreview: true,
    windowStart: '2026-01-01T00:00:00.000Z',
    windowEnd: '2099-01-01T00:00:00.000Z'
  });
  assert.ok(cltShows.length > 0, 'Must query stored Charlotte events from local canonical storage');
  assert.equal(cltShows[0].city, 'Charlotte');
});

test('Network Expansion: Provenance Conflict Tracking (Tee Sanders Discrepancy)', async () => {
  const result = await ingestExpansionComedy({ persist: false });
  const teeEvent = result.events.find(e => e.title.toLowerCase().includes('tee sanders'));
  assert.ok(teeEvent, 'Tee Sanders performance must be present in Stardome inventory');
  assert.ok(teeEvent.provenanceConflict, 'Must capture provenanceConflict for date discrepancy');
  assert.equal(teeEvent.provenanceConflict.conflictType, 'artist_venue_date_discrepancy');
  assert.equal(teeEvent.provenanceConflict.artistExpectedDate, '2026-10-09');
  assert.ok(['2026-09-23', '2026-12-13'].includes(teeEvent.civilDate));
  assert.equal(teeEvent.timezone, 'America/Chicago');
  assert.ok(teeEvent.provenanceConflict.note.includes('Venue schedule retained as canonical inventory'));
});

test('Network Expansion: Unresolved Leads Preserved Without Synthetic Events', async () => {
  const result = await ingestExpansionComedy({ persist: true });
  assert.equal(result.unresolvedLeads.length, 2, 'Must track Lace Larrabee and Yakov Smirnoff as unresolved leads');

  const laceLead = result.unresolvedLeads.find(l => l.performer === 'Lace Larrabee');
  assert.ok(laceLead, 'Lace Larrabee must be recorded as unresolved lead');
  assert.equal(laceLead.status, 'corroborated_artist_lead');
  assert.equal(laceLead.city, 'Charlotte');

  const yakovLead = result.unresolvedLeads.find(l => l.performer === 'Yakov Smirnoff');
  assert.ok(yakovLead, 'Yakov Smirnoff must be recorded as unresolved lead');
  assert.equal(yakovLead.status, 'client_rendered_unresolved');
  assert.equal(yakovLead.venueName, 'Yakov Smirnoff Theatre');

  // Verify that zero fake events were synthesized for Lace Larrabee or Yakov Smirnoff
  const laceEvent = result.events.find(e => e.performer?.toLowerCase().includes('lace larrabee') || e.title.toLowerCase().includes('lace larrabee'));
  assert.equal(laceEvent, undefined, 'Zero synthetic events must be created for unconfirmed artist leads');
  const yakovEvent = result.events.find(e => e.venue_name?.toLowerCase().includes('yakov') || e.title.toLowerCase().includes('yakov smirnoff'));
  assert.equal(yakovEvent, undefined, 'Zero synthetic events must be created for unverified venues');

});

test('Network Expansion: City Feeds /birmingham/comedy and /charlotte/comedy', async () => {
  // Test /birmingham/comedy route
  const { req: bhmReq, res: bhmRes, getBody: getBhmBody, getStatus: getBhmStatus } = createMockReqRes({
    method: 'GET',
    url: '/birmingham/comedy'
  });
  await routerHandler(bhmReq, bhmRes);
  assert.equal(getBhmStatus(), 200, '/birmingham/comedy must return HTTP 200');
  const bhmHtml = getBhmBody();
  assert.ok(bhmHtml.includes('Birmingham'), 'Must include Birmingham');
  assert.ok(bhmHtml.includes('Stardome Comedy Club'), 'Must render Stardome Comedy Club');
  assert.ok(bhmHtml.includes('America/Chicago') || bhmHtml.includes('CDT') || bhmHtml.includes('CST') || bhmHtml.includes('Official Calendar') || bhmHtml.includes('stardome.com'), 'Must render official calendar markers');

  // Test /charlotte/comedy route
  const { req: cltReq, res: cltRes, getBody: getCltBody, getStatus: getCltStatus } = createMockReqRes({
    method: 'GET',
    url: '/charlotte/comedy'
  });
  await routerHandler(cltReq, cltRes);
  assert.equal(getCltStatus(), 200, '/charlotte/comedy must return HTTP 200');
  const cltHtml = getCltBody();
  assert.ok(cltHtml.includes('Charlotte'), 'Must include Charlotte');
  assert.ok(cltHtml.includes('The Comedy Zone Charlotte') || cltHtml.includes('Comedy Zone'), 'Must render The Comedy Zone Charlotte');
  assert.ok(cltHtml.includes('cltcomedyzone.com') || cltHtml.includes('Official Calendar'), 'Must render official calendar markers');
});

test('Network Expansion: Milestone Invariant & Zero Production Side-Effects', () => {
  assert.equal(
    AUDIT_MILESTONE,
    'Dynamic official-source ingestion pilot deployed; verified inventory expansion in progress.',
    'Milestone invariant must remain strictly identical'
  );
  assert.equal(defaultCanonicalStorage.classification, 'test_and_development_only', 'Storage must remain local test/dev only');
  assert.equal(defaultCanonicalStorage.isProductionDurable, false, 'No production database writes permitted');
});
