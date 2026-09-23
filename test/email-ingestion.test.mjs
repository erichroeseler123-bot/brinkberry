import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { PILOT_CONSENTING_CLUBS, VenueEmailConsentRegistry, defaultEmailConsentRegistry } = require('../lib/network/email-consent.js');
const { validateSenderAuthentication, parseEmailPayload } = require('../lib/submissions/email-parser.js');
const { InboundEmailIngestionEngine, defaultEmailIngestionEngine } = require('../lib/submissions/email-ingestion.js');
const { defaultSubmissionManager } = require('../lib/submissions/submission-manager.js');
const { defaultCanonicalStorage } = require('../lib/storage/canonical-event-storage.js');
const { defaultRawStorage } = require('../lib/storage/raw-source-storage.js');
const inboundEmailHandler = require('../api/inbound-email.js');
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

describe('Inbound Email Schedule Ingestion Suite (Phase C)', () => {
  let consentRegistry;
  let ingestionEngine;

  beforeEach(() => {
    consentRegistry = new VenueEmailConsentRegistry();
    ingestionEngine = new InboundEmailIngestionEngine({
      consentRegistry,
      rawStorage: defaultRawStorage,
      submissionManager: defaultSubmissionManager
    });
  });

  describe('1. Pilot Cohort & Explicit Venue Consent Registry', () => {
    it('initializes pilot cohort with 10 consenting clubs across benchmark markets', () => {
      assert.equal(PILOT_CONSENTING_CLUBS.length, 10);
      const denverClubs = PILOT_CONSENTING_CLUBS.filter(c => c.city === 'Denver');
      assert.equal(denverClubs.length, 3); // RISE Comedy, Comedy Works Downtown, Denver Comedy Lounge

      const rise = consentRegistry.getConsentByVenueId('venue_rise_comedy');
      assert.ok(rise);
      assert.equal(rise.clubName, 'RISE Comedy');
      assert.equal(rise.status, 'active');
      assert.ok(rise.authorizedSenders.includes('booking@risecomedy.com'));
    });

    it('rejects email ingestion when explicit club consent is not on file', async () => {
      const result = await ingestionEngine.processInboundEmail({
        targetVenueId: 'venue_unconsented_random_room',
        from: 'promoter@randomroom.com',
        headers: {
          'received-spf': 'pass',
          'authentication-results': 'dkim=pass spf=pass'
        },
        textBody: '2026-10-25 19:30 - Unconsented Show'
      });

      assert.equal(result.success, false);
      assert.equal(result.status, 'consent_not_granted');
      assert.match(result.error, /Explicit consent is not on file/);
      assert.equal(result.candidateCount, 0);
      assert.equal(result.published, false);
    });
  });

  describe('2. Decoupled Sender Authentication vs. Venue Authorization', () => {
    it('rejects incoming email with failing SPF or DKIM at the edge', async () => {
      // 1. SPF Fail
      const spfFailResult = await ingestionEngine.processInboundEmail({
        targetVenueId: 'venue_rise_comedy',
        from: 'booking@risecomedy.com',
        headers: {
          'received-spf': 'fail (domain does not designate IP)',
          'authentication-results': 'spf=fail dkim=pass'
        },
        textBody: '2026-10-25 19:30 - Forged Showcase'
      });
      assert.equal(spfFailResult.success, false);
      assert.equal(spfFailResult.status, 'sender_auth_failed');
      assert.match(spfFailResult.error, /SPF verification failed/);

      // 2. DKIM Fail
      const dkimFailResult = await ingestionEngine.processInboundEmail({
        targetVenueId: 'venue_rise_comedy',
        from: 'booking@risecomedy.com',
        headers: {
          'received-spf': 'pass',
          'authentication-results': 'spf=pass dkim=fail (signature did not verify)'
        },
        textBody: '2026-10-25 19:30 - Spoofed Showcase'
      });
      assert.equal(dkimFailResult.success, false);
      assert.equal(dkimFailResult.status, 'sender_auth_failed');
      assert.match(dkimFailResult.error, /DKIM verification failed/);
    });

    it('quarantines authenticated email when sender is NOT authorized for the target venue', async () => {
      // Email is genuine and passes DKIM/SPF from a comic's personal address
      // But the comic has NO authority to submit on behalf of RISE Comedy
      const result = await ingestionEngine.processInboundEmail({
        targetVenueId: 'venue_rise_comedy',
        from: 'unauthorized_performer@gmail.com',
        headers: {
          'received-spf': 'pass',
          'authentication-results': 'spf=pass dkim=pass'
        },
        textBody: '2026-10-25 19:30 - Performer Self-Submission'
      });

      assert.equal(result.success, false);
      assert.equal(result.status, 'unauthorized_sender');
      assert.match(result.error, /not authorized to submit for venue venue_rise_comedy/);
      assert.equal(result.candidateCount, 0);
      assert.equal(result.published, false);
    });

    it('accepts authenticated email from an authorized club sender address', async () => {
      const result = await ingestionEngine.processInboundEmail({
        targetVenueId: 'venue_rise_comedy',
        from: 'booking@risecomedy.com',
        headers: {
          'received-spf': 'pass',
          'authentication-results': 'spf=pass dkim=pass'
        },
        textBody: '2026-10-25 19:30 - Legitimate Authorized RISE Improv Showcase'
      });

      assert.equal(result.success, true);
      assert.equal(result.status, 'pending_review');
      assert.equal(result.candidateCount, 1);
      assert.equal(result.published, false);
      assert.ok(result.contentHash);
    });
  });

  describe('3. Private Raw MIME Evidence Preservation', () => {
    it('preserves full raw email payload in private raw storage with SHA-256 hash', async () => {
      const rawMimeStream = `Received-SPF: pass\r\nAuthentication-Results: spf=pass dkim=pass\r\nFrom: booking@risecomedy.com\r\nTo: schedules@ingest.brinkberry.com\r\nSubject: Fall Lineup\r\n\r\n2026-10-26 20:00 - Mainstage Improv Showcase`;

      const result = await ingestionEngine.processInboundEmail({
        rawMime: rawMimeStream,
        targetVenueId: 'venue_rise_comedy',
        from: 'booking@risecomedy.com',
        headers: {
          'received-spf': 'pass',
          'authentication-results': 'spf=pass dkim=pass'
        },
        textBody: '2026-10-26 20:00 - Mainstage Improv Showcase'
      });

      assert.equal(result.success, true);

      // Verify private evidence snapshot
      const rawRecord = await defaultRawStorage.getLatestRawEvidence(`email_mime_${result.submissionId}`);
      assert.ok(rawRecord);
      assert.equal(rawRecord.isPrivateEvidence, true, 'Raw email MIME must be flagged private evidence');
      assert.equal(rawRecord.contentHash, result.contentHash);
      assert.ok(rawRecord.content.includes('Mainstage Improv Showcase'));
    });
  });

  describe('4. Prohibition of Recurring-Date Synthesis', () => {
    it('STRICTLY PROHIBITS recurring-date synthesis from generic phrases ("every Tuesday")', async () => {
      const emailBodyWithRecurringOnly = `
Join us at RISE Comedy!
- Open Mic every Tuesday at 8pm
- Improv Jam weekly on Thursdays at 7pm
- Pro showcase every Friday night at 8pm
Tickets at the door!
      `;

      const result = await ingestionEngine.processInboundEmail({
        targetVenueId: 'venue_rise_comedy',
        from: 'booking@risecomedy.com',
        headers: {
          'received-spf': 'pass',
          'authentication-results': 'spf=pass dkim=pass'
        },
        textBody: emailBodyWithRecurringOnly
      });

      // Must fail or extract 0 candidate events without inventing future dates
      assert.equal(result.success, false);
      assert.equal(result.status, 'no_valid_events_extracted');
      assert.match(result.error, /recurring schedules without explicit dates are strictly prohibited/);
      assert.equal(result.candidateCount, 0);
      assert.ok(result.unparsedPatterns.length >= 3, 'Must record skipped recurring patterns');
      assert.equal(result.unparsedPatterns[0].reason, 'RECURRING_SYNTHESIS_PROHIBITED');
    });

    it('extracts ONLY explicit civil dates when email contains both recurring text and dated shows', async () => {
      const mixedEmailBody = `
RISE Comedy Schedule Update:
Note: Weekly open mic happens every Tuesday (not ticketed).

Upcoming Headliners:
2026-10-29 20:00 - Special Headliner Night
October 30, 2026 21:30 - Late Night Improv Extravaganza
      `;

      const result = await ingestionEngine.processInboundEmail({
        targetVenueId: 'venue_rise_comedy',
        from: 'booking@risecomedy.com',
        headers: {
          'received-spf': 'pass',
          'authentication-results': 'spf=pass dkim=pass'
        },
        textBody: mixedEmailBody
      });

      assert.equal(result.success, true);
      assert.equal(result.status, 'pending_review');
      // Exactly 2 dated events extracted; 0 synthetic dates generated for Tuesday open mic
      assert.equal(result.candidateCount, 2);

      const submission = await defaultSubmissionManager.getSubmission(result.submissionId);
      assert.equal(submission.candidates[0].localCivilDate, '2026-10-29');
      assert.equal(submission.candidates[0].title, 'Special Headliner Night');
      assert.equal(submission.candidates[1].localCivilDate, '2026-10-30');
      assert.equal(submission.candidates[1].title, 'Late Night Improv Extravaganza');
    });

    it('parses attached ICS file deterministically without date synthesis', async () => {
      const sampleIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//RISE Comedy//Schedule//EN
BEGIN:VEVENT
UID:rise_show_101
DTSTART:20261031T200000
DTEND:20261031T213000
SUMMARY:Halloween Comedy Spooktacular
LOCATION:RISE Comedy, Denver CO
END:VEVENT
END:VCALENDAR`;

      const result = await ingestionEngine.processInboundEmail({
        targetVenueId: 'venue_rise_comedy',
        from: 'booking@risecomedy.com',
        headers: {
          'received-spf': 'pass',
          'authentication-results': 'spf=pass dkim=pass'
        },
        attachments: [
          {
            filename: 'schedule.ics',
            contentType: 'text/calendar',
            content: sampleIcs
          }
        ]
      });

      assert.equal(result.success, true);
      assert.equal(result.candidateCount, 1);
      const sub = await defaultSubmissionManager.getSubmission(result.submissionId);
      assert.equal(sub.candidates[0].title, 'Halloween Comedy Spooktacular');
      assert.equal(sub.candidates[0].start, '2026-10-31T20:00:00.000Z');
    });
  });

  describe('5. Public Feed Isolation & Admin Approval Invariants', () => {
    it('proves unapproved email submissions NEVER appear in /api/feed or /api/network-events', async () => {
      // Ingest email submission
      const emailResult = await ingestionEngine.processInboundEmail({
        targetVenueId: 'venue_rise_comedy',
        from: 'booking@risecomedy.com',
        headers: {
          'received-spf': 'pass',
          'authentication-results': 'spf=pass dkim=pass'
        },
        textBody: '2026-11-05 20:00 - Quarantined Unapproved Email Show'
      });

      assert.equal(emailResult.success, true);
      assert.equal(emailResult.status, 'pending_review');

      // 1. Query /api/network-events
      const { req: netReq, res: netRes } = mockReqRes('GET', '/api/network-events?vertical=comedy&lat=39.7538&lng=-104.9942&radius=50&window=48h');
      await networkEventsHandler(netReq, netRes);
      assert.equal(netRes.statusCode, 200);
      const netFound = (netRes.data.events || []).find(e => e.title.includes('Quarantined Unapproved Email Show'));
      assert.equal(netFound, undefined, 'Unapproved email submission MUST NOT appear in /api/network-events');

      // 2. Query /api/feed
      const { req: feedReq, res: feedRes } = mockReqRes('GET', '/api/feed?lat=39.7538&lng=-104.9942&category=comedy&window=48h');
      await feedHandler(feedReq, feedRes);
      assert.equal(feedRes.statusCode, 200);
      const feedFound = (feedRes.data.events || []).find(e => e.title.includes('Quarantined Unapproved Email Show'));
      assert.equal(feedFound, undefined, 'Unapproved email submission MUST NOT appear in /api/feed');
    });

    it('promotes email candidate to canonical storage ONLY via authenticated admin review as admin_verified', async () => {
      // Calculate date in active 48-hour planning horizon
      const eventTime = new Date(Date.now() + 20 * 3600e3);
      const dateStr = eventTime.toISOString().slice(0, 10);
      const uniqueTitle = `Approved Email Headliner ${Date.now()}`;

      // 1. Inbound email ingestion
      const emailRes = await ingestionEngine.processInboundEmail({
        targetVenueId: 'venue_rise_comedy',
        from: 'booking@risecomedy.com',
        headers: {
          'received-spf': 'pass',
          'authentication-results': 'spf=pass dkim=pass'
        },
        textBody: `${dateStr} 20:00 - ${uniqueTitle}`
      });

      assert.equal(emailRes.success, true);
      const submissionId = emailRes.submissionId;

      // 2. Attempt review with unauthorized submitter session -> rejected with 401
      const token = defaultSubmissionManager.createCapabilityToken(submissionId);
      const exRes = await defaultSubmissionManager.exchangeCapabilityToken(token);
      const { req: badRevReq, res: badRevRes } = mockReqRes('POST', '/api/event-submissions/review', {
        submissionId,
        action: 'approve'
      }, {
        'x-submission-session': exRes.sessionId
      });
      await eventSubmissionsHandler(badRevReq, badRevRes);
      assert.equal(badRevRes.statusCode, 401, 'Submitter session cannot approve email submission');

      // 3. Authenticated Admin Review -> Approved
      const { req: adminRevReq, res: adminRevRes } = mockReqRes('POST', '/api/event-submissions/review', {
        submissionId,
        action: 'approve',
        notes: 'Verified against RISE Comedy booking newsletter'
      }, {
        'authorization': `Bearer ${TEST_ADMIN_TOKEN}`
      });
      await eventSubmissionsHandler(adminRevReq, adminRevRes);
      assert.equal(adminRevRes.statusCode, 200);
      assert.equal(adminRevRes.data.promotedCount, 1);

      const promoted = adminRevRes.data.events[0];
      assert.equal(promoted.confirmationStatus, 'admin_verified');
      assert.notEqual(promoted.confirmationStatus, 'confirmed_by_official_calendar');
      assert.equal(promoted.sourceType, 'producer_submission');

      // 4. Verify presence in /api/network-events
      const { req: netReq, res: netRes } = mockReqRes('GET', '/api/network-events?vertical=comedy&lat=39.7538&lng=-104.9942&radius=50&window=48h');
      await networkEventsHandler(netReq, netRes);
      assert.equal(netRes.statusCode, 200);
      const netFound = (netRes.data.events || []).find(e => e.title === uniqueTitle);
      assert.ok(netFound, 'Admin-approved email event must appear in /api/network-events');
      assert.equal(netFound.confirmation.status, 'admin_verified');

      // 5. Verify presence in /api/feed
      const { req: feedReq, res: feedRes } = mockReqRes('GET', '/api/feed?lat=39.7538&lng=-104.9942&category=comedy&window=48h');
      await feedHandler(feedReq, feedRes);
      assert.equal(feedRes.statusCode, 200);
      const feedFound = (feedRes.data.events || []).find(e => e.title === uniqueTitle);
      assert.ok(feedFound, 'Admin-approved email event must appear in /api/feed');
      assert.equal(feedFound.confirmationStatus, 'admin_verified');
    });
  });

  describe('6. Webhook API Endpoint Contract (/api/inbound-email)', () => {
    it('dispatches webhook payload through router to inboundEmailHandler', async () => {
      const { req, res } = mockReqRes('POST', '/api/inbound-email/webhook', {
        targetVenueId: 'venue_rise_comedy',
        from: 'booking@risecomedy.com',
        headers: {
          'received-spf': 'pass',
          'authentication-results': 'spf=pass dkim=pass'
        },
        textBody: '2026-11-10 19:30 - Webhook Ingested Showcase'
      });

      await inboundEmailHandler(req, res);

      assert.equal(res.statusCode, 202);
      assert.equal(res.data.success, true);
      assert.equal(res.data.status, 'pending_review');
      assert.equal(res.data.candidateCount, 1);
      assert.ok(res.data.submissionId);
      assert.equal(res.data.capabilityToken, undefined, 'Zero capability tokens exposed in webhook response');
    });

    it('rejects malformed or non-POST requests with appropriate HTTP codes', async () => {
      const { req, res } = mockReqRes('GET', '/api/inbound-email');
      await inboundEmailHandler(req, res);
      assert.equal(res.statusCode, 405);
    });
  });
});
