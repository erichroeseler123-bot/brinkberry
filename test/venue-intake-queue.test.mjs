// test/venue-intake-queue.test.mjs
// Comprehensive test suite for Venue Intake Queue, /submit endpoint, and Feed Isolation

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { VenueIntakeQueue, QUEUE_STATES } = require('../lib/ingestion/venue-intake-queue.js');
const submitHandler = require('../api/submit.js');
const feedHandler = require('../api/feed.js');

function createMockReqRes({
  method = 'GET',
  url = '/',
  headers = {},
  body = null
} = {}) {
  const req = {
    method,
    url,
    headers: { host: 'brinkberry.local', ...headers },
    body,
    query: {}
  };

  let statusCode = 200;
  let responseHeaders = {};
  let responseBody = '';

  const res = {
    get statusCode() { return statusCode; },
    set statusCode(code) { statusCode = code; },
    setHeader(name, val) { responseHeaders[name.toLowerCase()] = String(val); return this; },
    getHeader(name) { return responseHeaders[name.toLowerCase()]; },
    write(chunk) { responseBody += (chunk != null ? chunk.toString() : ''); return true; },
    end(chunk) { if (chunk != null) responseBody += chunk.toString(); return this; },
    status(code) { statusCode = code; return this; },
    json(data) {
      responseHeaders['content-type'] = 'application/json; charset=utf-8';
      responseBody = JSON.stringify(data);
      return this;
    },
    send(data) {
      if (typeof data === 'object') return this.json(data);
      responseBody = String(data);
      return this;
    }
  };

  return {
    req,
    res,
    getBody: () => responseBody,
    getStatus: () => statusCode,
    getJson: () => {
      try {
        return JSON.parse(responseBody);
      } catch (e) {
        throw new Error(`Failed to parse response body as JSON: "${responseBody}" - ${e.message}`);
      }
    }
  };
}

describe('Venue Intake Queue Suite', () => {
  let tempQueueFile;
  let queue;

  beforeEach(() => {
    tempQueueFile = path.join(os.tmpdir(), `test_queue_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    queue = new VenueIntakeQueue(tempQueueFile);
  });

  // -------------------------------------------------------------------------
  // 1. Queue Lifecycle State Machine
  // -------------------------------------------------------------------------
  describe('1. Lifecycle State Machine & Probing Transitions', () => {
    it('registers a venue into public_schedule_found when probe=false', async () => {
      const record = await queue.intakeVenue({
        name: 'The Gilded Laugh',
        city: 'Madison',
        state: 'WI',
        scheduleUrl: 'https://gildedlaugh.com/events',
        notes: 'Independent room'
      }, { probe: false });

      assert.equal(record.status, QUEUE_STATES.PUBLIC_SCHEDULE_FOUND);
      assert.equal(record.name, 'The Gilded Laugh');
      assert.equal(record.venueSlug, 'the-gilded-laugh-madison');
      assert.ok(record.lastCheckedAt);
      assert.equal(record.reviewHistory.length, 1);
      assert.equal(record.reviewHistory[0].action, 'intake_registered');
    });

    it('transitions to parsed_successfully when probe finds usable feed events', async () => {
      // Mock prober returning usable events
      const mockFetch = async () => {
        return {
          ok: true,
          status: 200,
          text: async () => `<html><head><script type="application/ld+json">
            {"@context":"https://schema.org","@type":"ComedyEvent","name":"Friday Standup Showcase","startDate":"2026-10-10T20:00:00"}
          </script></head><body><h1>Schedule</h1></body></html>`
        };
      };

      const record = await queue.intakeVenue({
        name: 'Skyline Comedy Lounge',
        city: 'Appleton',
        state: 'WI',
        scheduleUrl: 'https://skylinecomedy.com/shows'
      }, { probe: true, fetchFn: mockFetch });

      assert.equal(record.status, QUEUE_STATES.PARSED_SUCCESSFULLY);
      assert.ok(record.evidenceHash, 'Must generate cryptographic evidence hash');
      assert.equal(record.parserResult.eventsCount, 1);
      assert.ok(record.reviewHistory.some(h => h.action === 'probed_and_parsed'));
    });

    it('transitions to blocked_or_unsupported when encountering WAF 403 challenge', async () => {
      const mockFetch = async () => {
        return {
          ok: false,
          status: 403,
          text: async () => '<html><head><title>Attention Required! | Cloudflare</title></head><body>WAF Block</body></html>'
        };
      };

      const record = await queue.intakeVenue({
        name: 'WAF Protected Club',
        city: 'Chicago',
        state: 'IL',
        scheduleUrl: 'https://wafclub.com/tickets'
      }, { probe: true, fetchFn: mockFetch });

      assert.equal(record.status, QUEUE_STATES.BLOCKED_OR_UNSUPPORTED);
      assert.ok(record.blockReason.includes('WAF'));
      assert.equal(record.failureReason, 'blocked_waf');
      assert.ok(record.reviewHistory.some(h => h.action === 'probed_blocked'));
    });

    it('transitions to needs_review when schedule format is ambiguous or has zero events', async () => {
      const mockFetch = async () => {
        return {
          ok: true,
          status: 200,
          text: async () => '<html><body>Welcome to our bar! Call us for showtimes.</body></html>'
        };
      };

      const record = await queue.intakeVenue({
        name: 'Mystery Comedy Cellar',
        city: 'Omaha',
        state: 'NE',
        scheduleUrl: 'https://mysterycomedy.com'
      }, { probe: true, fetchFn: mockFetch });

      assert.equal(record.status, QUEUE_STATES.NEEDS_REVIEW);
      assert.ok(record.reviewHistory.some(h => h.action === 'queued_for_review'));
    });
  });

  // -------------------------------------------------------------------------
  // 2. Admin Review Workflow & Approval Guardrails
  // -------------------------------------------------------------------------
  describe('2. Admin Review Workflow & Guardrails', () => {
    it('promotes parsed_successfully venue to live with admin approval', async () => {
      const record = await queue.intakeVenue({
        name: 'Green Bay Comedy House',
        city: 'Green Bay',
        state: 'WI',
        scheduleUrl: 'https://gbcomedy.com/shows'
      }, { probe: false });

      // Manually set status to parsed_successfully to simulate successful probe
      record.status = QUEUE_STATES.PARSED_SUCCESSFULLY;
      queue.save();

      const reviewed = await queue.reviewVenue('green-bay-comedy-house-green-bay', {
        decision: 'approve_live',
        actor: 'senior_admin',
        notes: 'Verified direct ticket links and calendar dates'
      });

      assert.equal(reviewed.status, QUEUE_STATES.LIVE);
      assert.ok(reviewed.promotedAt);
      assert.ok(reviewed.reviewHistory.some(h => h.action === 'promoted_to_live' && h.actor === 'senior_admin'));
    });

    it('REFUSES promotion to live if status is not parsed_successfully', async () => {
      await queue.intakeVenue({
        name: 'Unparsed Club',
        city: 'Kenosha',
        state: 'WI',
        scheduleUrl: 'https://kenoshacomedy.com'
      }, { probe: false });

      // Currently public_schedule_found, not parsed_successfully
      await assert.rejects(
        () => queue.reviewVenue('unparsed-club-kenosha', { decision: 'approve_live' }),
        /Cannot promote venue in state "public_schedule_found"/
      );
    });

    it('rejects venue and sets rejected status with notes', async () => {
      await queue.intakeVenue({
        name: 'Fake Showroom',
        city: 'Racine',
        state: 'WI',
        scheduleUrl: 'https://fakeshows.com'
      }, { probe: false });

      const reviewed = await queue.reviewVenue('fake-showroom-racine', {
        decision: 'reject',
        actor: 'admin',
        notes: 'Speculative ticket reseller domain'
      });

      assert.equal(reviewed.status, QUEUE_STATES.REJECTED);
      assert.equal(reviewed.failureReason, 'Speculative ticket reseller domain');
    });

    it('summarizes queue state accurately', async () => {
      await queue.intakeVenue({ name: 'V1', city: 'C1', scheduleUrl: 'https://v1.com' }, { probe: false });
      await queue.intakeVenue({ name: 'V2', city: 'C2', scheduleUrl: 'https://v2.com' }, { probe: false });
      
      const summary = queue.getQueueSummary();
      assert.equal(summary.total, 2);
      assert.equal(summary.byStatus[QUEUE_STATES.PUBLIC_SCHEDULE_FOUND], 2);
      assert.equal(summary.byStatus[QUEUE_STATES.LIVE], 0);
    });
  });

  // -------------------------------------------------------------------------
  // 3. HTTP Endpoints (/submit, /for-venues, /api/submit)
  // -------------------------------------------------------------------------
  describe('3. HTTP Endpoints & Submission Form', () => {
    it('serves responsive HTML on GET /submit and GET /for-venues with the Distribution Guarantee', async () => {
      for (const path of ['/submit', '/for-venues']) {
        const { req, res, getBody, getStatus } = createMockReqRes({ method: 'GET', url: path });
        await submitHandler(req, res);

        assert.equal(getStatus(), 200);
        assert.ok(getBody().includes('Submit Your Venue or Tour Dates'));
        assert.ok(getBody().includes('The Brinkberry Distribution Guarantee'));
        assert.ok(getBody().includes('100% Free Forever'));
        assert.ok(getBody().includes('Direct Box Office Links'));
        assert.ok(getBody().includes('Zero Artificial Dates'));
      }
    });

    it('accepts valid submission via POST /api/submit and enters queue without publishing', async () => {
      const payload = {
        name: 'Milwaukee Underground Comedy',
        city: 'Milwaukee',
        state: 'WI',
        scheduleUrl: 'https://mkecomedy.com/calendar',
        notes: 'Weekly Wednesday open mic and Saturday showcase',
        submitter: {
          name: 'Sam Producer',
          role: 'promoter',
          email: 'sam@mkecomedy.com'
        }
      };

      const { req, res, getJson, getStatus } = createMockReqRes({
        method: 'POST',
        url: '/api/submit',
        body: payload
      });

      await submitHandler(req, res);
      assert.equal(getStatus(), 200);
      const json = getJson();
      assert.equal(json.success, true);
      assert.equal(json.venueSlug, 'milwaukee-underground-comedy-milwaukee');
      assert.notEqual(json.status, QUEUE_STATES.LIVE, 'Public submission must NEVER be live automatically');
      assert.ok(json.message.includes('strictly verified before live promotion'));
    });

    it('rejects POST /api/submit with 400 when missing required fields', async () => {
      const { req, res, getStatus } = createMockReqRes({
        method: 'POST',
        url: '/api/submit',
        body: { name: 'Incomplete Club' } // Missing city and scheduleUrl
      });

      await submitHandler(req, res);
      assert.equal(getStatus(), 400);
    });

    it('blocks unauthorized access to GET /api/submit (admin only)', async () => {
      const { req, res, getStatus } = createMockReqRes({ method: 'GET', url: '/api/submit' });
      await submitHandler(req, res);
      assert.equal(getStatus(), 401);
    });

    it('allows authorized access to GET /api/submit with valid ADMIN_TOKEN', async () => {
      const originalToken = process.env.ADMIN_TOKEN;
      process.env.ADMIN_TOKEN = 'test-secret-token-12345';

      try {
        const { req, res, getStatus, getJson } = createMockReqRes({
          method: 'GET',
          url: '/api/submit',
          headers: { authorization: 'Bearer test-secret-token-12345' }
        });

        await submitHandler(req, res);
        assert.equal(getStatus(), 200);
        const json = getJson();
        assert.ok(typeof json.total === 'number');
        assert.ok(json.byStatus);
      } finally {
        process.env.ADMIN_TOKEN = originalToken;
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4. Strict Public Feed Isolation Guarantee
  // -------------------------------------------------------------------------
  describe('4. Strict Public Feed Isolation Guarantee', () => {
    it('PROVES that queued, unapproved, or rejected venues NEVER leak into /api/feed', async () => {
      // 1. Submit a venue into the queue
      const unapprovedVenueName = 'Secret Unapproved Comedy Basement';
      const payload = {
        name: unapprovedVenueName,
        city: 'Denver',
        state: 'CO',
        scheduleUrl: 'https://secretbasementcomedy.com/shows',
        submitter: { name: 'Comedian Bob', role: 'performer' }
      };

      const submitReq = createMockReqRes({
        method: 'POST',
        url: '/api/submit',
        body: payload
      });
      await submitHandler(submitReq.req, submitReq.res);
      assert.equal(submitReq.getStatus(), 200);

      // 2. Query the public feed for Denver (lat: 39.7392, lng: -104.9903)
      const feedReq = createMockReqRes({
        method: 'GET',
        url: '/api/feed?lat=39.7392&lng=-104.9903&window=week&mode=comedy'
      });

      await feedHandler(feedReq.req, feedReq.res);
      assert.equal(feedReq.getStatus(), 200);
      const feedData = feedReq.getJson();

      assert.ok(Array.isArray(feedData.events), 'Feed must return an events array');

      // 3. Verify zero occurrences of the queued venue in public feed
      const leaked = feedData.events.filter(e =>
        (e.venue_name || e.venue || '').toLowerCase().includes('secret unapproved') ||
        (e.title || '').toLowerCase().includes('secret unapproved')
      );

      assert.equal(leaked.length, 0, 'Queued unapproved venues must NEVER leak into /api/feed');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Formal Acceptance Criteria Matrix (10 Strict Production Proofs)
  // -------------------------------------------------------------------------
  describe('5. Formal Acceptance Criteria Matrix', () => {
    beforeEach(() => {
      submitHandler.clearRateLimits();
    });

    it('1. Public submissions enter public_schedule_found', async () => {
      const record = await queue.intakeVenue({
        name: 'The Comedy Attic',
        city: 'Bloomington',
        state: 'IN',
        scheduleUrl: 'https://comedyattic.com/shows',
        notes: 'Independent club calendar'
      }, { probe: false });

      assert.equal(record.status, QUEUE_STATES.PUBLIC_SCHEDULE_FOUND);
      assert.equal(record.venueSlug, 'the-comedy-attic-bloomington');
      assert.ok(record.lastCheckedAt);
      assert.equal(record.reviewHistory[0].action, 'intake_registered');
    });

    it('2. Official URL probing creates evidence and SHA-256 hashes', async () => {
      const mockHtml = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "ComedyEvent",
                "name": "Live Standup Showcase",
                "startDate": "2026-10-15T20:00:00Z",
                "url": "https://comedyattic.com/shows/showcase"
              }
            </script>
          </head>
          <body><h1>Live Comedy</h1></body>
        </html>
      `;

      const record = await queue.intakeVenue({
        name: 'The Comedy Attic',
        city: 'Bloomington',
        state: 'IN',
        scheduleUrl: 'https://comedyattic.com/shows'
      }, {
        probe: true,
        fetchFn: async () => ({
          ok: true,
          status: 200,
          text: async () => mockHtml
        })
      });

      assert.equal(record.status, QUEUE_STATES.PARSED_SUCCESSFULLY);
      assert.ok(record.evidenceHash, 'Must generate evidence hash');
      assert.match(record.evidenceHash, /^[a-f0-9]{64}$/, 'Evidence hash must be a 64-char SHA-256 hex string');
      assert.ok(record.parserResult.eventsCount >= 1);
    });

    it('3. Unsupported/WAF/robots failures remain queued with reasons', async () => {
      // 3A: WAF 403
      const wafRecord = await queue.intakeVenue({
        name: 'Cloudflare Protected Club',
        city: 'Austin',
        state: 'TX',
        scheduleUrl: 'https://cloudflareclub.com/events'
      }, {
        probe: true,
        fetchFn: async () => ({
          ok: false,
          status: 403,
          text: async () => '<html><title>Just a moment... Cloudflare</title></html>'
        })
      });

      assert.equal(wafRecord.status, QUEUE_STATES.BLOCKED_OR_UNSUPPORTED);
      assert.equal(wafRecord.failureReason, 'blocked_waf');
      assert.ok(wafRecord.blockReason.includes('WAF'));

      // 3B: Robots.txt Disallowed
      const robotsRecord = await queue.intakeVenue({
        name: 'Private Showcase Club',
        city: 'Dallas',
        state: 'TX',
        scheduleUrl: 'https://privateclub.com/events'
      }, {
        probe: true,
        fetchFn: async (url) => {
          if (String(url).includes('robots.txt')) {
            return {
              ok: true,
              status: 200,
              text: async () => 'User-agent: *\nDisallow: /'
            };
          }
          return { ok: true, status: 200, text: async () => '<html>Events</html>' };
        }
      });

      assert.equal(robotsRecord.status, QUEUE_STATES.BLOCKED_OR_UNSUPPORTED);
      assert.equal(robotsRecord.failureReason, 'blocked_robots');

      // Both records MUST remain queued in storage
      assert.equal(queue.records.size, 2);
    });

    it('4. Submitter sessions can never approve their own submission', async () => {
      // Submitter passes a user session token or submitter header
      const { req, res, getStatus, getJson } = createMockReqRes({
        method: 'POST',
        url: '/api/submit/review',
        headers: {
          authorization: 'Bearer submitter_session_token_xyz_987',
          'x-submitter-email': 'owner@venue.com',
          'x-user-role': 'venue_operator'
        },
        body: {
          venueSlug: 'the-comedy-attic-bloomington',
          decision: 'approve_live'
        }
      });

      await submitHandler(req, res);
      assert.equal(getStatus(), 401, 'Submitter session MUST NOT be able to review or approve submissions');
      assert.ok(getJson().error.includes('Admin authorization required'));
    });

    it('5. Review requires the admin authorization header only', async () => {
      const originalToken = process.env.ADMIN_TOKEN;
      process.env.ADMIN_TOKEN = 'super-secret-admin-token-777';

      try {
        // Missing auth -> 401
        const unauth = createMockReqRes({
          method: 'POST',
          url: '/api/submit/review',
          body: { venueSlug: 'test', decision: 'approve_live' }
        });
        await submitHandler(unauth.req, unauth.res);
        assert.equal(unauth.getStatus(), 401);

        // Incorrect auth -> 401
        const wrongAuth = createMockReqRes({
          method: 'POST',
          url: '/api/submit/review',
          headers: { authorization: 'Bearer wrong-token' },
          body: { venueSlug: 'test', decision: 'approve_live' }
        });
        await submitHandler(wrongAuth.req, wrongAuth.res);
        assert.equal(wrongAuth.getStatus(), 401);

        // Valid ADMIN_TOKEN -> accepted
        const validAuth = createMockReqRes({
          method: 'GET',
          url: '/api/submit',
          headers: { authorization: 'Bearer super-secret-admin-token-777' }
        });
        await submitHandler(validAuth.req, validAuth.res);
        assert.equal(validAuth.getStatus(), 200);
      } finally {
        process.env.ADMIN_TOKEN = originalToken;
      }
    });

    it('6. Unapproved venues never appear in /api/feed', async () => {
      // Queue a venue in parsed_successfully state, but NOT approved
      const record = await queue.intakeVenue({
        name: 'Hidden Unapproved Comedy Haven',
        city: 'Denver',
        state: 'CO',
        scheduleUrl: 'https://hiddenhaven.com/shows'
      }, { probe: false });

      record.status = QUEUE_STATES.PARSED_SUCCESSFULLY;
      queue.save();

      // Query public feed
      const feedReq = createMockReqRes({
        method: 'GET',
        url: '/api/feed?lat=39.7392&lng=-104.9903&window=week&mode=comedy'
      });
      await feedHandler(feedReq.req, feedReq.res);
      assert.equal(feedReq.getStatus(), 200);
      const data = feedReq.getJson();

      const found = data.events.some(e =>
        (e.venue_name || e.venue || '').toLowerCase().includes('hidden unapproved')
      );
      assert.equal(found, false, 'Unapproved parsed_successfully venue MUST NOT leak into /api/feed');
    });

    it('7. Approval creates canonical events through the existing identity and freshness pipeline', async () => {
      const { LocalFileCanonicalStorage } = require('../lib/storage/canonical-event-storage.js');
      const testStoreFile = path.join(os.tmpdir(), `test_canonical_store_${Date.now()}.json`);
      const testStorage = new LocalFileCanonicalStorage(testStoreFile);

      const record = await queue.intakeVenue({
        name: 'Summit Comedy Spot',
        city: 'Boulder',
        state: 'CO',
        lat: 40.0150,
        lon: -105.2705,
        scheduleUrl: 'https://summitcomedy.com/shows'
      }, { probe: false });

      record.status = QUEUE_STATES.PARSED_SUCCESSFULLY;
      record.parserResult = {
        eventsCount: 1,
        sampleEvents: [
          {
            title: 'Maria Bamford Live in Boulder',
            start_time: '2026-11-20T20:00:00Z',
            end_time: '2026-11-20T22:00:00Z',
            url: 'https://summitcomedy.com/shows/maria-bamford',
            ticket_url: 'https://summitcomedy.com/tickets/maria-bamford'
          }
        ]
      };
      record.evidenceHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      queue.save();

      // Admin approves venue
      const reviewed = await queue.reviewVenue('summit-comedy-spot-boulder', {
        decision: 'approve_live',
        actor: 'lead_curator',
        notes: 'Verified official ticket links'
      }, { canonicalStorage: testStorage });

      assert.equal(reviewed.status, QUEUE_STATES.LIVE);
      assert.ok(Array.isArray(reviewed.promotedEventIds));
      assert.equal(reviewed.promotedEventIds.length, 1);

      // Verify canonical event in storage
      const eventId = reviewed.promotedEventIds[0];
      assert.ok(eventId.startsWith('evt_'), 'Event ID must follow deterministic evt_ prefix');
      const canonical = await testStorage.getEventById(eventId);
      assert.ok(canonical, 'Event must exist in canonical storage');
      assert.equal(canonical.title, 'Maria Bamford Live in Boulder');
      assert.equal(canonical.confirmationStatus, 'confirmed_by_official_calendar');
      assert.equal(canonical.sourceType, 'official_box_office');
      assert.ok(canonical.freshness, 'Must have evaluated freshness');
      assert.equal(canonical.freshness.status, 'verified_current');

      // Cleanup
      try { fs.unlinkSync(testStoreFile); } catch (_) {}
    });

    it('8. Reject/withdraw removes them from public eligibility non-destructively', async () => {
      const { LocalFileCanonicalStorage } = require('../lib/storage/canonical-event-storage.js');
      const testStoreFile = path.join(os.tmpdir(), `test_canonical_store_rw_${Date.now()}.json`);
      const testStorage = new LocalFileCanonicalStorage(testStoreFile);

      // 8A: Verify distinct 'rejected' state
      const rejectedVenue = await queue.intakeVenue({
        name: 'Declined Showcase',
        city: 'Denver',
        state: 'CO',
        scheduleUrl: 'https://declined.com/shows'
      }, { probe: false });
      const rejectedReview = await queue.reviewVenue('declined-showcase-denver', {
        decision: 'reject',
        actor: 'admin',
        notes: 'Admin declined submission'
      });
      assert.equal(rejectedReview.status, QUEUE_STATES.REJECTED, 'Rejection must transition to rejected state');

      // 8B: Verify distinct 'withdrawn' state & non-destructive evidence retention
      const record = await queue.intakeVenue({
        name: 'Temporary Comedy Room',
        city: 'Denver',
        state: 'CO',
        scheduleUrl: 'https://tempcomedy.com/shows'
      }, { probe: false });

      record.status = QUEUE_STATES.PARSED_SUCCESSFULLY;
      record.parserResult = {
        sampleEvents: [{ title: 'Show 1', start_time: '2026-10-20T20:00:00Z' }]
      };
      queue.save();

      // Approve first
      await queue.reviewVenue('temporary-comedy-room-denver', { decision: 'approve_live' }, { canonicalStorage: testStorage });
      assert.equal(record.status, QUEUE_STATES.LIVE);
      const promotedId = record.promotedEventIds[0];
      const liveEv = await testStorage.getEventById(promotedId);
      assert.ok(liveEv, 'Event is initially in storage');
      assert.equal(liveEv.confirmationStatus, 'confirmed_by_official_calendar');

      // Now withdraw (previously published event removed)
      const withdrawn = await queue.reviewVenue('temporary-comedy-room-denver', {
        decision: 'withdraw',
        actor: 'admin',
        notes: 'Room permanently closed'
      }, { canonicalStorage: testStorage });

      assert.equal(withdrawn.status, QUEUE_STATES.WITHDRAWN, 'Withdrawal must transition to withdrawn state');

      // Verify event is RETAINED permanently in storage (NOT deleted)
      const retainedEv = await testStorage.getEventById(promotedId);
      assert.ok(retainedEv, 'Event must NOT be deleted from canonical storage (evidence retained permanently)');
      assert.equal(retainedEv.confirmationStatus, 'withdrawn');
      assert.equal(retainedEv.freshnessStatus, 'withdrawn');
      assert.equal(retainedEv.isDisplayable, false);
      assert.equal(retainedEv.isCancelled, false, 'Withdrawal must not set isCancelled: true (reserved for source-reported cancellations)');
      assert.ok(retainedEv.sourceEvidence, 'Source evidence and provenance must be retained permanently');

      // Public feed query must strictly exclude the withdrawn event
      const publicQuery = await testStorage.queryEvents({
        includeCancelled: false,
        windowStart: '2026-01-01T00:00:00.000Z',
        windowEnd: '2099-01-01T00:00:00.000Z'
      });
      assert.equal(publicQuery.some(e => e.id === promotedId), false, 'Withdrawn event must be excluded from public query');

      // Cleanup
      try { fs.unlinkSync(testStoreFile); } catch (_) {}
    });

    it('9. Public responses expose no contact data, internal storage paths, or tokens', async () => {
      const sensitivePayload = {
        name: 'Privacy Comedy Club',
        city: 'Chicago',
        state: 'IL',
        scheduleUrl: 'https://privacycomedy.com/events',
        submitter: {
          name: 'Confidential Booker',
          role: 'venue_operator',
          email: 'strictly_confidential_do_not_leak@venue.com',
          phone: '555-0199'
        },
        notes: 'Internal notes with sensitive details'
      };

      const { req, res, getStatus, getJson, getBody } = createMockReqRes({
        method: 'POST',
        url: '/api/submit',
        headers: { 'x-test-bypass-rate-limit': 'true' },
        body: sensitivePayload
      });

      await submitHandler(req, res);
      assert.equal(getStatus(), 200);
      const json = getJson();
      const rawBody = getBody();

      // Verify explicit public contract keys only
      const allowedKeys = ['success', 'venueSlug', 'status', 'parsedEvents', 'message'];
      for (const key of Object.keys(json)) {
        assert.ok(allowedKeys.includes(key), `Public response must not contain unexpected key "${key}"`);
      }

      // Verify no sensitive substrings leak into the output
      assert.equal(rawBody.includes('strictly_confidential_do_not_leak@venue.com'), false);
      assert.equal(rawBody.includes('555-0199'), false);
      assert.equal(rawBody.includes('Internal notes with sensitive details'), false);
      assert.equal(rawBody.includes('.json'), false);
      assert.equal(rawBody.includes('tmpdir'), false);
      assert.equal(rawBody.includes('storageFile'), false);
    });

    it('10. Rate limits and file/URL validation are enforced', async () => {
      // 10A: File and Malformed URLs are rejected with 400
      const invalidUrls = [
        'file:///etc/passwd',
        'javascript:alert(1)',
        'data:text/html,<html>',
        'ftp://files.example.com/calendar.ics',
        'not-a-valid-url',
        ''
      ];

      for (const badUrl of invalidUrls) {
        const { req, res, getStatus, getJson } = createMockReqRes({
          method: 'POST',
          url: '/api/submit',
          headers: { 'x-test-bypass-rate-limit': 'true' },
          body: {
            name: 'Test Venue',
            city: 'Denver',
            scheduleUrl: badUrl
          }
        });

        await submitHandler(req, res);
        assert.equal(getStatus(), 400, `Must reject bad scheduleUrl: "${badUrl}"`);
        assert.ok(getJson().error);
      }

      // 10B: Rate Limit Enforcement (max 5 requests per IP)
      submitHandler.clearRateLimits();
      const testIp = '198.51.100.42';

      for (let i = 1; i <= 5; i++) {
        const { req, res, getStatus } = createMockReqRes({
          method: 'POST',
          url: '/api/submit',
          headers: { 'x-forwarded-for': testIp },
          body: {
            name: `Club ${i}`,
            city: 'Denver',
            scheduleUrl: `https://club${i}.com/events`
          }
        });
        await submitHandler(req, res);
        assert.equal(getStatus(), 200, `Request ${i} should be allowed`);
      }

      // 6th request from the same IP MUST be throttled with HTTP 429
      const throttledReq = createMockReqRes({
        method: 'POST',
        url: '/api/submit',
        headers: { 'x-forwarded-for': testIp },
        body: {
          name: 'Club 6',
          city: 'Denver',
          scheduleUrl: 'https://club6.com/events'
        }
      });
      await submitHandler(throttledReq.req, throttledReq.res);
      assert.equal(throttledReq.getStatus(), 429, '6th request must receive HTTP 429 Too Many Requests');
      const throttleJson = throttledReq.getJson();
      assert.ok(throttleJson.error.includes('Rate limit exceeded'));
      assert.ok(throttleJson.retryAfter > 0);
      assert.ok(throttledReq.res.getHeader('retry-after'));
    });
  });
});
