import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { parseCsvSchedule } = require('../lib/submissions/csv-parser.js');
const { EventSubmissionManager, defaultSubmissionManager } = require('../lib/submissions/submission-manager.js');
const { defaultCanonicalStorage } = require('../lib/storage/canonical-event-storage.js');
const eventSubmissionsHandler = require('../api/event-submissions.js');
const networkEventsHandler = require('../api/network-events.js');
const feedHandler = require('../api/feed.js');

const TEST_ADMIN_TOKEN = 'test_admin_token_secret_2026';
process.env.ADMIN_TOKEN = TEST_ADMIN_TOKEN;
process.env.ADMIN_AUDIT_TOKEN = TEST_ADMIN_TOKEN;

function mockReqRes(method, path, body = {}, headers = {}) {
  const u = new URL(path, 'https://brinkberry.local');
  const req = {
    method,
    url: u.pathname + u.search,
    headers: { ...headers },
    body
  };
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; return this; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.data = data; return this; }
  };
  return { req, res };
}

describe('Event Submissions & Admin Review Portal Suite (Phase A & B)', () => {
  let submissionManager;

  beforeEach(() => {
    submissionManager = new EventSubmissionManager();
  });

  describe('1. Deterministic CSV Schedule Parser', () => {
    it('parses comedy club CSV with standard headers and quotes', () => {
      const csv = `Date,Start Time,Event Title,Lineup,Ticket Link,Price
2026-10-09,19:30,"Friday Night Showcase","Sam Tallent, Adam Cayton-Holland",https://club.com/tix1,$20
2026-10-10,21:00,"Late Show Headliner","Rory Scovel",https://club.com/tix2,25.00`;

      const result = parseCsvSchedule(csv, {
        venueOrTrack: { name: 'Denver Comedy Room', city: 'Denver', state: 'CO' }
      });

      assert.equal(result.errors.length, 0);
      assert.equal(result.events.length, 2);

      const ev1 = result.events[0];
      assert.equal(ev1.title, 'Friday Night Showcase');
      assert.equal(ev1.localCivilDate, '2026-10-09');
      assert.equal(ev1.localCivilTime, '19:30');
      assert.equal(ev1.start, '2026-10-09T19:30:00');
      assert.deepEqual(ev1.lineup, ['Sam Tallent', 'Adam Cayton-Holland']);
      assert.equal(ev1.priceDisplay, '$20');
      assert.equal(ev1.ticketUrl, 'https://club.com/tix1');
      assert.ok(result.contentHash);
    });

    it('parses motorsports CSV with gates_open and division classes', () => {
      const csv = `race_date,gates_open,race_name,divisions,admission,url
2026-10-17,17:00,Fall Dirt Nationals,"410 Sprints, Modifieds, Street Stocks",30,https://speedway.com/tix`;

      const result = parseCsvSchedule(csv, {
        venueOrTrack: { name: 'Eldora Speedway', city: 'Rossburg', state: 'OH' }
      });

      assert.equal(result.errors.length, 0);
      assert.equal(result.events.length, 1);
      const race = result.events[0];
      assert.equal(race.title, 'Fall Dirt Nationals');
      assert.equal(race.localCivilDate, '2026-10-17');
      assert.equal(race.localCivilTime, '17:00');
      assert.deepEqual(race.lineup, ['410 Sprints', 'Modifieds', 'Street Stocks']);
      assert.equal(race.priceDisplay, '$30');
    });

    it('rejects CSV missing required date or title columns', () => {
      const csv = `Location,Price,Notes\nClub A,$10,Fun`;
      const result = parseCsvSchedule(csv);
      assert.equal(result.events.length, 0);
      assert.match(result.errors[0], /must contain at least "Date" and "Title"/);
    });
  });

  describe('2. Schedule Intake & Evidence Verification Guardrails', () => {
    it('requires submitter name and email for accountability', async () => {
      await assert.rejects(async () => {
        await submissionManager.submitSchedule({ submitterName: 'Anon' });
      }, /Submitter name and email are required/);
    });

    it('rejects evidence-free submissions missing both content and scheduleUrl', async () => {
      await assert.rejects(async () => {
        await submissionManager.submitSchedule({
          submitterName: 'Dave Submitter',
          submitterEmail: 'dave@comedy.local',
          vertical: 'comedy'
        });
      }, /Evidence required: content or scheduleUrl must be provided/);
    });

    it('rejects evidence-free submissions where 0 valid events can be parsed', async () => {
      await assert.rejects(async () => {
        await submissionManager.submitSchedule({
          submitterName: 'Dave Submitter',
          submitterEmail: 'dave@comedy.local',
          vertical: 'comedy',
          format: 'csv',
          content: 'Random text with no headers or dates\nJust words here'
        });
      }, /Evidence verification failed: No valid events could be extracted/);
    });

    it('returns receipt ONLY in public intake response (NO capability token exposed)', async () => {
      const csv = `Date,Start Time,Title\n2026-10-20,19:00,Open Mic Night`;
      const result = await submissionManager.submitSchedule({
        vertical: 'comedy',
        submitterName: 'Jane Promoter',
        submitterEmail: 'jane@comedyclub.com',
        submitterRole: 'promoter',
        venueOrTrack: { name: 'Jane Comedy Lounge', city: 'Boulder', state: 'CO' },
        format: 'csv',
        content: csv
      });

      assert.ok(result.submissionId.startsWith('sub_'));
      assert.equal(result.status, 'pending_review');
      assert.equal(result.candidateCount, 1);
      assert.ok(result.contentHash);
      // STRICT SECURITY INVARIANT: Public intake response MUST NOT return a capability token
      assert.equal(result.capabilityToken, undefined, 'Capability token must NOT be returned in intake response');

      const record = await submissionManager.getSubmission(result.submissionId);
      assert.ok(record);
      assert.equal(record.submitter.name, 'Jane Promoter');
      assert.equal(record.candidates[0].candidateConfirmationStatus, 'organizer_confirmed');
    });
  });

  describe('3. Durable Replay Protection & Capability Token Nonces', () => {
    it('creates capability token for out-of-band delivery and exchanges it once', async () => {
      const submission = await submissionManager.submitSchedule({
        vertical: 'comedy',
        submitterName: 'Organizer',
        submitterEmail: 'org@club.com',
        content: `Date,Start Time,Title\n2026-10-21,20:00,Comedy Jam`
      });

      // Token generated strictly out-of-band
      const token = submissionManager.createCapabilityToken(submission.submissionId);
      assert.ok(token.startsWith('cap_'));

      // First exchange: succeeds
      const ex1 = await submissionManager.exchangeCapabilityToken(token);
      assert.equal(ex1.success, true);
      assert.ok(ex1.sessionId.startsWith('sess_'));
      assert.equal(submissionManager.validateSession(ex1.sessionId), true);

      // Second exchange with same token: rejected
      const ex2 = await submissionManager.exchangeCapabilityToken(token);
      assert.equal(ex2.success, false);
      assert.match(ex2.error, /already been exchanged/);
    });

    it('enforces durable replay protection across separate manager instances', async () => {
      const sub = await submissionManager.submitSchedule({
        vertical: 'comedy',
        submitterName: 'Durability Submitter',
        submitterEmail: 'durable@test.local',
        content: `Date,Start Time,Title\n2026-10-22,20:00,Durability Event`
      });

      const token = submissionManager.createCapabilityToken(sub.submissionId);

      // Exchange on instance 1
      const ex1 = await submissionManager.exchangeCapabilityToken(token);
      assert.equal(ex1.success, true);

      // Attempt replay on fresh instance 2 (simulating separate serverless container)
      const freshManager = new EventSubmissionManager();
      const replayResult = await freshManager.exchangeCapabilityToken(token);
      assert.equal(replayResult.success, false);
      assert.match(replayResult.error, /already been exchanged/);
    });

    it('rejects invalid, corrupted, or expired capability tokens', async () => {
      const res = await submissionManager.exchangeCapabilityToken('cap_bogus_token.invalid_signature');
      assert.equal(res.success, false);
      assert.match(res.error, /Invalid|Malformed|expired/i);
    });
  });

  describe('4. Organizer Confirmation vs. Publication Boundary', () => {
    it('marks submission organizer_confirmed but NEVER writes to canonical storage or publishes events', async () => {
      const sub = await submissionManager.submitSchedule({
        vertical: 'comedy',
        submitterName: 'Club Owner',
        submitterEmail: 'owner@room.local',
        venueOrTrack: { name: 'Boulder Comedy Den', city: 'Boulder', state: 'CO' },
        content: `Date,Start Time,Title\n2026-10-23,20:00,Boulder Standup Showcase`
      });

      // Organizer confirms out-of-band
      const confirmRes = await submissionManager.confirmOrganizer(sub.submissionId, {
        name: 'Club Owner',
        email: 'owner@room.local'
      });

      assert.equal(confirmRes.status, 'organizer_confirmed');
      assert.equal(confirmRes.published, false, 'Organizer confirmation must NEVER publish events');

      const updated = await submissionManager.getSubmission(sub.submissionId);
      assert.equal(updated.status, 'organizer_confirmed');
      assert.equal(updated.candidates[0].candidateConfirmationStatus, 'organizer_confirmed');

      // Verify canonical storage does NOT have the event
      const stored = await defaultCanonicalStorage.queryEvents({ category: 'comedy' });
      const found = stored.find(e => e.title === 'Boulder Standup Showcase');
      assert.equal(found, undefined, 'Organizer-confirmed event must NOT exist in canonical storage before admin review');
    });

    it('POST /api/event-submissions/organizer-confirm confirms organizer without publishing', async () => {
      // 1. Submit via handler
      const { req: subReq, res: subRes } = mockReqRes('POST', '/api/event-submissions', {
        vertical: 'comedy',
        submitterName: 'Denver Organizer',
        submitterEmail: 'organizer@denvercomedy.local',
        format: 'csv',
        content: `Date,Start Time,Title\n2026-10-24,20:00,Denver Local Showcase`
      });
      await eventSubmissionsHandler(subReq, subRes);
      assert.equal(subRes.statusCode, 201);
      const submissionId = subRes.data.submissionId;

      // 2. Generate out-of-band capability token
      const token = defaultSubmissionManager.createCapabilityToken(submissionId);

      // 3. Organizer confirmation via API using capability token
      const { req: confReq, res: confRes } = mockReqRes('POST', '/api/event-submissions/organizer-confirm', {
        token,
        organizerInfo: { name: 'Denver Organizer', email: 'organizer@denvercomedy.local' }
      });
      await eventSubmissionsHandler(confReq, confRes);

      assert.equal(confRes.statusCode, 200);
      assert.equal(confRes.data.status, 'organizer_confirmed');
      assert.equal(confRes.data.published, false);
      assert.match(confRes.data.message, /NOT published to the public canonical feed/);
    });
  });

  describe('5. Admin Review Authorization & Trust Boundary', () => {
    it('strictly REJECTS submitter sessions from calling /review with 401 Unauthorized', async () => {
      // Create session
      const sub = await defaultSubmissionManager.submitSchedule({
        vertical: 'comedy',
        submitterName: 'Submitter Session User',
        submitterEmail: 'subuser@test.local',
        content: `Date,Start Time,Title\n2026-10-25,20:00,Submitter Cant Review Show`
      });
      const token = defaultSubmissionManager.createCapabilityToken(sub.submissionId);
      const exRes = await defaultSubmissionManager.exchangeCapabilityToken(token);
      const submitterSession = exRes.sessionId;

      // Attempt to call /review with submitter session
      const { req, res } = mockReqRes('POST', '/api/event-submissions/review', {
        submissionId: sub.submissionId,
        action: 'approve'
      }, {
        'x-submission-session': submitterSession
      });

      await eventSubmissionsHandler(req, res);

      assert.equal(res.statusCode, 401);
      assert.match(res.data.error, /Admin authentication required|Submitter sessions cannot review/);
    });

    it('strictly REJECTS unauthenticated requests to /review with 401 Unauthorized', async () => {
      const { req, res } = mockReqRes('POST', '/api/event-submissions/review', {
        submissionId: 'sub_test123',
        action: 'approve'
      });

      await eventSubmissionsHandler(req, res);
      assert.equal(res.statusCode, 401);
    });

    it('rejects submission cleanly with review record when admin rejects', async () => {
      const sub = await submissionManager.submitSchedule({
        vertical: 'motorsports',
        submitterName: 'Suspicious Submitter',
        submitterEmail: 'suspicious@speedway.local',
        content: `Date,Start Time,Title\n2026-11-01,12:00,Suspicious Dirt Race`
      });

      const review = await submissionManager.reviewSubmission(sub.submissionId, {
        action: 'reject',
        reviewer: 'admin_security_curator',
        notes: 'Track ownership could not be verified'
      });

      assert.equal(review.status, 'rejected');
      assert.equal(review.promotedCount, 0);

      const record = await submissionManager.getSubmission(sub.submissionId);
      assert.equal(record.status, 'rejected');
      assert.equal(record.reviewRecord.notes, 'Track ownership could not be verified');
    });

    it('approves submission and assigns admin_verified — NEVER confirmed_by_official_calendar', async () => {
      const sub = await defaultSubmissionManager.submitSchedule({
        vertical: 'comedy',
        submitterName: 'Verified Club Curator',
        submitterEmail: 'curator@club.local',
        venueOrTrack: { name: 'Denver Underground Club', city: 'Denver', state: 'CO', lat: 39.7392, lon: -104.9903 },
        content: `Date,Start Time,Title,Lineup\n2026-10-26,20:00,Denver Headliner Night,Sam Tallent`
      });

      // Admin reviews and approves using Bearer token
      const { req, res } = mockReqRes('POST', '/api/event-submissions/review', {
        submissionId: sub.submissionId,
        action: 'approve',
        notes: 'Verified against club official Instagram and promoter ID'
      }, {
        'authorization': `Bearer ${TEST_ADMIN_TOKEN}`
      });

      await eventSubmissionsHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.status, 'approved');
      assert.equal(res.data.promotedCount, 1);

      const promoted = res.data.events[0];
      assert.equal(promoted.confirmationStatus, 'admin_verified');
      // STRICT EVIDENCE INVARIANT: Must NEVER be labeled confirmed_by_official_calendar
      assert.notEqual(promoted.confirmationStatus, 'confirmed_by_official_calendar');
      assert.equal(promoted.provenance.reviewedBy, 'admin_reviewer');
    });
  });

  describe('6. Feed Isolation & Proof of Zero Leakage (/api/feed & /api/network-events)', () => {
    it('proves unapproved submissions NEVER appear in /api/feed or /api/network-events', async () => {
      // Create an unapproved submission in Denver
      const intakeRes = await defaultSubmissionManager.submitSchedule({
        vertical: 'comedy',
        submitterName: 'Unapproved Submitter',
        submitterEmail: 'unapproved@test.local',
        venueOrTrack: { name: 'Secret Den', city: 'Denver', state: 'CO', lat: 39.7392, lon: -104.9903 },
        content: `Date,Start Time,Title\n2026-10-27,20:00,Unapproved Secret Show`
      });
      assert.equal(intakeRes.status, 'pending_review');

      // Query /api/network-events
      const { req: netReq, res: netRes } = mockReqRes('GET', '/api/network-events?vertical=comedy&lat=39.7392&lng=-104.9903&radius=50&window=48h');
      await networkEventsHandler(netReq, netRes);
      assert.equal(netRes.statusCode, 200);
      const netFound = (netRes.data.events || []).find(e => e.title === 'Unapproved Secret Show');
      assert.equal(netFound, undefined, 'Unapproved submission MUST NOT appear in /api/network-events');

      // Query /api/feed
      const { req: feedReq, res: feedRes } = mockReqRes('GET', '/api/feed?lat=39.7392&lng=-104.9903&category=comedy&window=48h');
      await feedHandler(feedReq, feedRes);
      assert.equal(feedRes.statusCode, 200);
      const feedFound = (feedRes.data.events || []).find(e => e.title === 'Unapproved Secret Show');
      assert.equal(feedFound, undefined, 'Unapproved submission MUST NOT appear in /api/feed');
    });

    it('proves organizer-only confirmed submissions NEVER appear in /api/feed or /api/network-events', async () => {
      // Create and organizer-confirm a submission (NO admin approval)
      const intake = await defaultSubmissionManager.submitSchedule({
        vertical: 'comedy',
        submitterName: 'Organizer Only',
        submitterEmail: 'orgonly@test.local',
        venueOrTrack: { name: 'Organizer Club', city: 'Denver', state: 'CO', lat: 39.7392, lon: -104.9903 },
        content: `Date,Start Time,Title\n2026-10-28,20:00,Organizer Only Standup Night`
      });
      await defaultSubmissionManager.confirmOrganizer(intake.submissionId);

      // Verify status is organizer_confirmed
      const subRecord = await defaultSubmissionManager.getSubmission(intake.submissionId);
      assert.equal(subRecord.status, 'organizer_confirmed');

      // Query /api/network-events
      const { req: netReq, res: netRes } = mockReqRes('GET', '/api/network-events?vertical=comedy&lat=39.7392&lng=-104.9903&radius=50&window=48h');
      await networkEventsHandler(netReq, netRes);
      assert.equal(netRes.statusCode, 200);
      const netFound = (netRes.data.events || []).find(e => e.title === 'Organizer Only Standup Night');
      assert.equal(netFound, undefined, 'Organizer-only confirmed submission MUST NOT appear in /api/network-events');

      // Query /api/feed
      const { req: feedReq, res: feedRes } = mockReqRes('GET', '/api/feed?lat=39.7392&lng=-104.9903&category=comedy&window=48h');
      await feedHandler(feedReq, feedRes);
      assert.equal(feedRes.statusCode, 200);
      const feedFound = (feedRes.data.events || []).find(e => e.title === 'Organizer Only Standup Night');
      assert.equal(feedFound, undefined, 'Organizer-only confirmed submission MUST NOT appear in /api/feed');
    });

    it('proves admin-promoted event appears in /api/network-events as admin_verified and in /api/feed', async () => {
      // Calculate a date strictly within rolling 48-hour window
      const targetTime = new Date(Date.now() + 12 * 3600e3);
      const dateStr = targetTime.toISOString().slice(0, 10);
      const timeStr = '18:00';
      const eventTitle = `Admin Verified Showcase ${Date.now()}`;

      // 1. Submit
      const intake = await defaultSubmissionManager.submitSchedule({
        vertical: 'comedy',
        submitterName: 'Legit Promoter',
        submitterEmail: 'legit@promoter.local',
        venueOrTrack: { name: 'Denver Downtown Comedy', city: 'Denver', state: 'CO', lat: 39.7392, lon: -104.9903 },
        content: `Date,Start Time,Title\n${dateStr},${timeStr},"${eventTitle}"`
      });

      // 2. Admin Review & Approval
      const { req: revReq, res: revRes } = mockReqRes('POST', '/api/event-submissions/review', {
        submissionId: intake.submissionId,
        action: 'approve',
        notes: 'Legitimate promoter and venue contract verified'
      }, {
        'authorization': `Bearer ${TEST_ADMIN_TOKEN}`
      });
      await eventSubmissionsHandler(revReq, revRes);
      assert.equal(revRes.statusCode, 200);
      assert.equal(revRes.data.promotedCount, 1);

      // 3. Verify presence in /api/network-events
      const { req: netReq, res: netRes } = mockReqRes('GET', '/api/network-events?vertical=comedy&lat=39.7392&lng=-104.9903&radius=50&window=48h');
      await networkEventsHandler(netReq, netRes);
      assert.equal(netRes.statusCode, 200);
      const netFound = (netRes.data.events || []).find(e => e.title === eventTitle);
      assert.ok(netFound, 'Admin-approved event must appear in /api/network-events');
      assert.equal(netFound.confirmation.status, 'admin_verified');
      assert.notEqual(netFound.confirmation.status, 'confirmed_by_official_calendar');

      // 4. Verify min_confirmation=confirmed_by_official_calendar correctly excludes admin_verified
      const { req: strictReq, res: strictRes } = mockReqRes('GET', '/api/network-events?vertical=comedy&lat=39.7392&lng=-104.9903&radius=50&window=48h&min_confirmation=confirmed_by_official_calendar');
      await networkEventsHandler(strictReq, strictRes);
      assert.equal(strictRes.statusCode, 200);
      const strictFound = (strictRes.data.events || []).find(e => e.title === eventTitle);
      assert.equal(strictFound, undefined, 'Official-only filter must exclude admin_verified submission');

      // 5. Verify presence in /api/feed
      const { req: feedReq, res: feedRes } = mockReqRes('GET', '/api/feed?lat=39.7392&lng=-104.9903&category=comedy&window=48h');
      await feedHandler(feedReq, feedRes);
      assert.equal(feedRes.statusCode, 200);
      const feedFound = (feedRes.data.events || []).find(e => e.title === eventTitle);
      assert.ok(feedFound, 'Admin-approved event must appear in /api/feed');
      assert.equal(feedFound.confirmationStatus, 'admin_verified');
    });
  });
});

