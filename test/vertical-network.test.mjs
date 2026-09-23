import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  SOURCE_LIFECYCLE_STATES,
  CONFIRMATION_STATUSES,
  TRACK_SURFACES,
  COMEDY_ROOM_TYPES,
  createComedyVenue,
  createTrackFacility,
  createEvidenceRecord
} = require('../lib/network/schema.js');

const {
  PIONEER_SOURCES,
  VerticalSourceRegistry
} = require('../lib/network/source-registry.js');

const { parseIcsFeed, parseIcsDate } = require('../lib/network/adapters/ics-adapter.js');
const { parseJsonLdFeed } = require('../lib/network/adapters/jsonld-adapter.js');
const { reconcileScheduleCycle } = require('../lib/network/cancellation.js');
const { VerticalClaimManager } = require('../lib/network/claims.js');
const networkEventsHandler = require('../api/network-events.js');

describe('Vertical Ingestion Network Architecture Suite', () => {

  describe('1. Schema & Domain Models', () => {
    it('creates validated comedy venue record with defaults', () => {
      const v = createComedyVenue({
        id: 'venue_comedy_works',
        name: 'Comedy Works Downtown',
        city: 'Denver',
        state: 'CO',
        lat: 39.7483,
        lon: -104.9972,
        roomType: COMEDY_ROOM_TYPES.DEDICATED_CLUB
      });
      assert.equal(v.id, 'venue_comedy_works');
      assert.equal(v.name, 'Comedy Works Downtown');
      assert.equal(v.roomType, 'dedicated_club');
      assert.equal(v.timezone, 'America/Denver');
      assert.equal(v.isClaimed, false);
    });

    it('rejects comedy venue with missing required geographic fields', () => {
      assert.throws(() => {
        createComedyVenue({ id: 'bad_venue', name: 'No Location Club' });
      }, /requires id, name, city, and state/);
    });

    it('creates validated motorsports track facility with surface', () => {
      const t = createTrackFacility({
        id: 'track_volusia',
        name: 'Volusia Speedway Park',
        surface: TRACK_SURFACES.DIRT_OVAL,
        lengthMiles: 0.5,
        city: 'Barberville',
        state: 'FL',
        lat: 29.1868,
        lon: -81.5218
      });
      assert.equal(t.id, 'track_volusia');
      assert.equal(t.surface, 'dirt_oval');
      assert.equal(t.lengthMiles, 0.5);
      assert.equal(t.timezone, 'America/New_York');
    });

    it('creates evidence record and enforces confirmation status', () => {
      const ev = createEvidenceRecord({
        sourceId: 'src_volusia_speedway',
        confirmationStatus: CONFIRMATION_STATUSES.CONFIRMED_BY_OFFICIAL_CALENDAR,
        httpStatus: 200,
        contentHash: 'hash_abc123'
      });
      assert.equal(ev.sourceId, 'src_volusia_speedway');
      assert.equal(ev.confirmationStatus, 'confirmed_by_official_calendar');
      assert.equal(ev.httpStatus, 200);
      assert.equal(ev.contentHash, 'hash_abc123');
      assert.ok(ev.fetchedAt);
    });
  });

  describe('2. Source Registry & Lifecycle States', () => {
    it('pioneer sources contain distinct comedy and motorsports providers', () => {
      const registry = new VerticalSourceRegistry();
      const comedySources = registry.listSources({ vertical: 'comedy' });
      const racingSources = registry.listSources({ vertical: 'motorsports' });

      assert.ok(comedySources.length >= 3);
      assert.ok(racingSources.length >= 4);

      const volusia = registry.getSourceById('src_volusia_speedway');
      assert.ok(volusia);
      assert.equal(volusia.status, SOURCE_LIFECYCLE_STATES.ACTIVE);

      const rise = registry.getSourceById('src_rise_comedy_denver');
      assert.ok(rise);
      assert.equal(rise.status, SOURCE_LIFECYCLE_STATES.PENDING_VENUE_AUTHORIZATION);
    });

    it('registering a new source defaults to pending_verification', () => {
      const registry = new VerticalSourceRegistry([]);
      const newSource = registry.registerSource({
        id: 'src_new_room',
        vertical: 'comedy',
        adapter: 'ics',
        scheduleUrl: 'https://newroom.com/calendar.ics'
      });
      assert.equal(newSource.status, SOURCE_LIFECYCLE_STATES.PENDING_VERIFICATION);
      assert.ok(newSource.registeredAt);

      registry.updateSourceStatus('src_new_room', SOURCE_LIFECYCLE_STATES.ACTIVE, 'Verified official calendar');
      assert.equal(registry.getSourceById('src_new_room').status, SOURCE_LIFECYCLE_STATES.ACTIVE);
    });
  });

  describe('3. RFC 5545 iCalendar (ICS) Official Adapter', () => {
    it('parses valid events and detects STATUS:CANCELLED', () => {
      const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test Club//EN
BEGIN:VEVENT
UID:evt-open-mic-01
SUMMARY:Tuesday Night Showcase
DTSTART:20261013T190000Z
DTEND:20261013T210000Z
DESCRIPTION:Weekly live standup showcase
URL:https://testclub.com/shows/tuesday
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:evt-cancelled-02
SUMMARY:Late Night Mic (Cancelled)
DTSTART:20261013T220000Z
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;

      const result = parseIcsFeed(ics, {
        sourceConfig: { id: 'src_test_club', venueName: 'Test Club' }
      });

      assert.equal(result.events.length, 1);
      assert.equal(result.cancelledUids.length, 1);
      assert.equal(result.cancelledUids[0], 'evt-cancelled-02');

      const activeEvent = result.events[0];
      assert.equal(activeEvent.id, 'evt-open-mic-01');
      assert.equal(activeEvent.title, 'Tuesday Night Showcase');
      assert.equal(activeEvent.start, '2026-10-13T19:00:00.000Z');
      assert.equal(activeEvent.sourceEvidence.confirmationStatus, 'confirmed_by_official_calendar');
      assert.ok(result.contentHash);
    });

    it('unfolds multi-line folded text correctly', () => {
      const ics = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:evt-long\nSUMMARY:Very Long Showcase Name That Spans Multiple Lines\n  In RFC 5545 Specification\nDTSTART:20261014T200000Z\nEND:VEVENT\nEND:VCALENDAR`;
      const result = parseIcsFeed(ics);
      assert.equal(result.events.length, 1);
      assert.match(result.events[0].title, /Multiple Lines In RFC 5545 Specification/);
    });
  });

  describe('4. Schema.org JSON-LD Adapter', () => {
    it('extracts structured ComedyEvent and SportsEvent markup', () => {
      const html = `
        <!doctype html>
        <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "ComedyEvent",
            "@id": "jsonld_comedy_101",
            "name": "Maria Bamford Live",
            "startDate": "2026-10-23T19:30:00-06:00",
            "endDate": "2026-10-23T21:00:00-06:00",
            "performer": { "@type": "Person", "name": "Maria Bamford" },
            "offers": { "url": "https://club.com/tickets/maria", "price": "35.00" }
          }
          </script>
        </head>
        </html>
      `;

      const result = parseJsonLdFeed(html, {
        sourceConfig: { id: 'src_jsonld_club', venueName: 'Denver Improv' }
      });

      assert.equal(result.events.length, 1);
      const ev = result.events[0];
      assert.equal(ev.id, 'jsonld_comedy_101');
      assert.equal(ev.title, 'Maria Bamford Live');
      assert.equal(ev.start, new Date('2026-10-23T19:30:00-06:00').toISOString());
      assert.deepEqual(ev.lineup, ['Maria Bamford']);
      assert.equal(ev.priceDisplay, '$35.00');
      assert.equal(ev.sourceEvidence.confirmationStatus, 'confirmed_by_official_calendar');
    });

    it('rejects EventCancelled events into cancelledIds', () => {
      const html = `
        <script type="application/ld+json">
        {
          "@type": "SportsEvent",
          "@id": "rainout_race_202",
          "name": "Mid-Season 100",
          "startDate": "2026-10-10T18:00:00Z",
          "eventStatus": "https://schema.org/EventCancelled"
        }
        </script>
      `;
      const result = parseJsonLdFeed(html);
      assert.equal(result.events.length, 0);
      assert.equal(result.cancelledIds.length, 1);
      assert.equal(result.cancelledIds[0], 'rainout_race_202');
    });
  });

  describe('5. Cancellation & Schedule Change Reconciliation', () => {
    it('identifies explicit cancellations, disappeared events, and schedule shifts', () => {
      const priorEvents = [
        { id: 'evt_keep', title: 'Friday Feature', start: '2026-10-16T19:00:00Z' },
        { id: 'evt_cancel', title: 'Saturday Early', start: '2026-10-17T18:00:00Z' },
        { id: 'evt_rainout', title: 'Sunday Dirt Nationals', start: '2026-10-18T17:00:00Z' },
        { id: 'evt_shift', title: 'Late Show Shift', start: '2026-10-17T21:00:00Z' }
      ];

      const incomingCycle = {
        events: [
          { id: 'evt_keep', title: 'Friday Feature', start: '2026-10-16T19:00:00Z' },
          { id: 'evt_shift', title: 'Late Show Shift', start: '2026-10-17T21:30:00Z' }, // 30 min shift
          { id: 'evt_brand_new', title: 'Sunday Added Show', start: '2026-10-18T20:00:00Z' }
        ],
        cancelledUids: ['evt_cancel'] // Explicit cancellation
        // evt_rainout disappeared from feed
      };

      const reconciled = reconcileScheduleCycle(priorEvents, incomingCycle);

      assert.equal(reconciled.totalActive, 3); // evt_keep, evt_shift, evt_brand_new
      assert.equal(reconciled.totalCancelled, 2); // evt_cancel (explicit) + evt_rainout (disappeared)
      assert.equal(reconciled.totalChanged, 1); // evt_shift start time moved

      const explicitCancel = reconciled.cancelledEvents.find(e => e.id === 'evt_cancel');
      assert.equal(explicitCancel.cancellationReason, 'explicit_source_cancellation');

      const disappearedCancel = reconciled.cancelledEvents.find(e => e.id === 'evt_rainout');
      assert.equal(disappearedCancel.cancellationReason, 'disappeared_from_official_calendar');

      assert.equal(reconciled.scheduleChanges[0].id, 'evt_shift');
      assert.equal(reconciled.scheduleChanges[0].newStart, '2026-10-17T21:30:00Z');
    });
  });

  describe('6. Venue & Track Claim Manager', () => {
    it('creates claim with domain matching check', () => {
      const manager = new VerticalClaimManager();
      const claim = manager.createClaim({
        entityId: 'track_eldora',
        entityType: 'track',
        name: 'Eldora Speedway',
        website: 'https://eldoraspeedway.com'
      }, {
        claimantEmail: 'promoter@eldoraspeedway.com',
        claimantName: 'Track Promoter'
      });

      assert.ok(claim.claimId);
      assert.equal(claim.domainMatches, true);
      assert.equal(claim.status, 'pending_verification');
      assert.match(claim.verificationToken, /^bb_claim_/);
    });

    it('verifies on-site meta tag challenge', async () => {
      const manager = new VerticalClaimManager();
      const claim = manager.createClaim({
        entityId: 'venue_rise',
        entityType: 'venue',
        name: 'RISE Comedy',
        website: 'https://risecomedy.com'
      }, {
        claimantEmail: 'booking@risecomedy.com'
      });

      // Mock fetch returning page with verification meta tag
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        text: async () => `<html><head><meta name="brinkberry-verification" content="${claim.verificationToken}"></head></html>`
      });

      const res = await manager.verifySiteToken(claim.claimId, mockFetch);
      assert.equal(res.verified, true);
      assert.equal(manager.isEntityVerified('venue_rise'), true);
      assert.equal(claim.status, 'verified');
    });

    it('approves claim via email magic token', () => {
      const manager = new VerticalClaimManager();
      const claim = manager.createClaim({
        entityId: 'track_volusia',
        entityType: 'track',
        name: 'Volusia Speedway Park'
      }, {
        claimantEmail: 'boxoffice@volusiaspeedwaypark.com'
      });

      const res = manager.verifyEmailMagicToken(claim.claimId, claim.verificationToken);
      assert.equal(res.verified, true);
      assert.equal(manager.isEntityVerified('track_volusia'), true);
    });
  });

  describe('7. Delivery API Endpoint Contract (/api/network-events)', () => {
    function mockReqRes(query = {}) {
      const u = new URL('https://brinkberry.local/api/network-events');
      for (const [k, v] of Object.entries(query)) {
        u.searchParams.set(k, v);
      }
      const req = {
        method: 'GET',
        url: u.pathname + u.search,
        headers: {}
      };
      const res = {
        statusCode: 200,
        headers: {},
        setHeader(k, v) { this.headers[k] = v; return this; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.data = payload; return this; }
      };
      return { req, res };
    }

    it('returns delivery contract for comedy with verified evidence criteria', async () => {
      const { req, res } = mockReqRes({
        vertical: 'comedy',
        lat: '39.7392',
        lng: '-104.9903',
        radius: '50',
        window: '48h'
      });

      await networkEventsHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.network, 'brinkberry_vertical_network');
      assert.equal(res.data.vertical, 'comedy');
      assert.equal(res.data.evidenceCriteria.unconfirmedSeedsExcluded, true);
      assert.equal(res.data.evidenceCriteria.requestRelativeTimestampsExcluded, true);
      assert.ok(Array.isArray(res.data.events));

      // If events are returned, ensure each follows the canonical contract
      if (res.data.events.length > 0) {
        const ev = res.data.events[0];
        assert.ok(ev.id);
        assert.ok(ev.title);
        assert.ok(ev.venue);
        assert.ok(ev.confirmation);
        assert.notEqual(ev.confirmation.status, 'unconfirmed_seed');
      }
    });

    it('rejects unsupported verticals with 400', async () => {
      const { req, res } = mockReqRes({ vertical: 'esports' });
      await networkEventsHandler(req, res);
      assert.equal(res.statusCode, 400);
      assert.match(res.data.error, /Invalid vertical/);
    });

    it('rejects non-GET methods with 405 Method Not Allowed', async () => {
      const req = { method: 'POST', url: '/api/network-events', headers: {} };
      const res = {
        statusCode: 200,
        headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(code) { this.statusCode = code; return this; },
        json(data) { this.data = data; return this; }
      };
      await networkEventsHandler(req, res);
      assert.equal(res.statusCode, 405);
    });
  });
});
