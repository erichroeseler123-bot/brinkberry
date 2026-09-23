// test/event-validation-record.test.mjs
// Comprehensive test suite for Strict Deterministic Event-Validation Pipeline

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  validateExtractedEvent,
  validateDateTimeRoundTrip,
  isValidCalendarDate,
  isValidCivilTime,
  normalizePerformerIdentity,
  PUBLICATION_TIERS,
  LINK_RESOLUTION_TIERS
} = require('../lib/crawling/event-validation-record.js');
const { probeTicketPage } = require('../lib/crawling/ticket-probe.js');
const { EventValidationStorage } = require('../lib/storage/event-validation-storage.js');
const { computeLedgerKey, SOURCE_KINDS } = require('../lib/crawling/crawl-ledger.js');

describe('Strict Deterministic Event-Validation Pipeline Suite', () => {
  const validSourceHash = 'a'.repeat(64);
  const validTicketHash = 'b'.repeat(64);
  const validUpcomingDate = new Date(Date.now() + 5 * 86400e3).toISOString().slice(0, 10); // 5 days out (within 14d horizon)

  const mockLiveVenueCrawlContext = {
    id: computeLedgerKey('https://comedyworks.com/shows/calendar', SOURCE_KINDS.VENUE),
    canonicalUrl: 'https://comedyworks.com/shows/calendar',
    sourceKind: 'venue',
    venueName: 'Comedy Works Downtown',
    venueSlug: 'comedy-works-downtown-denver',
    timezone: 'America/Denver',
    contentHash: validSourceHash,
    parserName: 'comedy_works_adapter',
    parserVersion: '1.0'
  };

  const mockCandidateCrawlContext = {
    id: computeLedgerKey('https://denvercomedyunderground.com/events', SOURCE_KINDS.VENUE),
    canonicalUrl: 'https://denvercomedyunderground.com/events',
    sourceKind: 'venue',
    venueName: 'Denver Comedy Underground',
    venueSlug: 'denver-comedy-underground-denver',
    timezone: 'America/Denver',
    contentHash: validSourceHash,
    parserName: 'seatengine',
    parserVersion: '1.0'
  };

  const mockCrawlContext = mockCandidateCrawlContext;

  const mockTicketProbeSuccess = {
    ok: true,
    finalTicketResolvedUrl: 'https://denvercomedyunderground.com/events/mark-normand',
    ticketResponseBodyHash: validTicketHash,
    ticketRedirectChain: [
      { url: 'https://denvercomedyunderground.com/events/mark-normand', status: 200, host: 'denvercomedyunderground.com' }
    ],
    detectedTicketProvider: 'box_office',
    ticketPageSignals: { hasCartPath: true, hasTicketButton: true, hasShowtimeSelector: true, isReseller: false }
  };

  const mockApprovalContext = {
    venueApproved: true,
    adminApproved: true
  };

  // -------------------------------------------------------------------------
  // 1. Timezone & DateTime Round-Trip Verification (Gate 1 - 4)
  // -------------------------------------------------------------------------
  describe('1. Timezone & Strict DateTime Round-Trip Handling', () => {
    it('rejects invalid calendar dates (Feb 30, April 31)', () => {
      assert.equal(isValidCalendarDate('2027-02-30'), false);
      assert.equal(isValidCalendarDate('2027-04-31'), false);
      assert.equal(isValidCalendarDate('2027-13-01'), false);
      assert.equal(isValidCalendarDate('2027-00-10'), false);
      assert.equal(isValidCalendarDate('2027-02-28'), true);
      assert.equal(isValidCalendarDate('2028-02-29'), true); // Leap year
    });

    it('rejects malformed civil times', () => {
      assert.equal(isValidCivilTime('evening'), false);
      assert.equal(isValidCivilTime('25:00'), false);
      assert.equal(isValidCivilTime('12:65'), false);
      assert.equal(isValidCivilTime('8pm'), false);
      assert.equal(isValidCivilTime('19:30'), true);
      assert.equal(isValidCivilTime('00:00'), true);
    });

    it('rejects nonexistent spring-forward gap times (e.g. 2:30 AM on DST Sunday in Denver)', () => {
      // 2026-03-08 is US Spring Forward; 2:00 AM skips to 3:00 AM in America/Denver
      const res = validateDateTimeRoundTrip('2026-03-08', '02:30', 'America/Denver');
      assert.equal(res.valid, false);
      assert.equal(res.reason, 'nonexistent_spring_forward_time_gap');
    });

    it('rejects ambiguous fall-back repeat times when source supplies no UTC offset', () => {
      // 2026-11-01 is US Fall Back; 1:30 AM occurs twice in America/Denver
      const resAmbiguous = validateDateTimeRoundTrip('2026-11-01', '01:30', 'America/Denver');
      assert.equal(resAmbiguous.valid, false);
      assert.equal(resAmbiguous.reason, 'ambiguous_fall_back_time_without_offset');

      // But accepts ambiguous time if explicit UTC offset is supplied by source
      const resWithOffset = validateDateTimeRoundTrip('2026-11-01', '01:30', 'America/Denver', '2026-11-01T01:30:00-06:00');
      assert.equal(resWithOffset.valid, true);
    });

    it('accepts ordinary standard and daylight dates with exact round-trip', () => {
      // Ordinary DST summer date
      const summerRes = validateDateTimeRoundTrip('2026-07-15', '20:00', 'America/Denver');
      assert.equal(summerRes.valid, true);

      // Ordinary Winter standard date
      const winterRes = validateDateTimeRoundTrip('2026-12-15', '19:30', 'America/Denver');
      assert.equal(winterRes.valid, true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Performer Identity & Hyphen-Preserving Normalization (Gate 12)
  // -------------------------------------------------------------------------
  describe('2. Conservative, Versioned Performer Identity', () => {
    it('preserves hyphens and does not split legitimate hyphenated names', () => {
      const norm = normalizePerformerIdentity('Jean-Luc');
      assert.equal(norm, 'jean-luc');
    });

    it('maintains distinct identities across collision candidates', () => {
      const n1 = normalizePerformerIdentity('Jean-Luc');
      const n2 = normalizePerformerIdentity('Mark Normand');
      const n3 = normalizePerformerIdentity('Mark Normand Live');
      const n4 = normalizePerformerIdentity("Mark Normand: Ya Don't Say");

      assert.equal(n1, 'jean-luc');
      assert.equal(n2, 'mark normand');
      assert.equal(n3, 'mark normand live');
      assert.equal(n4, "mark normand ya don't say");

      const set = new Set([n1, n2, n3, n4]);
      assert.equal(set.size, 4, 'All 4 performer candidates must produce distinct normalized identities');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Strict Publication Rule & Decoupled State
  // -------------------------------------------------------------------------
  describe('3. Strict Publication Rule & Decoupled Layer', () => {
    it('authoritative classification: already_live venue is never labeled venue_not_approved and action is refresh', () => {
      const raw = {
        title: 'Mark Normand',
        venue_name: 'Comedy Works Downtown',
        civilDate: validUpcomingDate,
        civilTime: '19:30',
        ticket_url: 'https://comedyworks.com/comedians/mark-normand',
        linkResolutionTier: LINK_RESOLUTION_TIERS.SHOW_LANDING_PAGE
      };

      const liveRecord = validateExtractedEvent(raw, mockLiveVenueCrawlContext, mockTicketProbeSuccess);
      assert.equal(liveRecord.venueApprovalStatus, 'already_live');
      assert.equal(liveRecord.adminReviewEligible, false, 'Already live venues are not new review candidates');
      assert.equal(liveRecord.reviewQueueAction, 'refresh_existing_venue');
      assert.ok(!liveRecord.rejectionReasons.includes('venue_not_approved'), 'Live venue must never be labeled venue_not_approved');
      assert.ok(!liveRecord.rejectionReasons.includes('awaiting_admin_approval'));
    });

    it('unpromoted candidate requires explicit admin approval to publish', () => {
      const raw = {
        title: 'Mark Normand',
        venue_name: 'Denver Comedy Underground',
        civilDate: validUpcomingDate,
        civilTime: '19:30',
        ticket_url: 'https://denvercomedyunderground.com/events/123',
        linkResolutionTier: LINK_RESOLUTION_TIERS.SHOW_LANDING_PAGE
      };

      // Case A: Unapproved candidate -> isPublishable is FALSE, adminReviewEligible is TRUE
      const unapprovedRecord = validateExtractedEvent(raw, mockCandidateCrawlContext, mockTicketProbeSuccess, { venueApproved: false, adminApproved: false });
      assert.equal(unapprovedRecord.venueApprovalStatus, 'candidate');
      assert.equal(unapprovedRecord.adminReviewEligible, true);
      assert.equal(unapprovedRecord.isPublishable, false);
      assert.equal(unapprovedRecord.reviewQueueAction, 'new_venue_review');
      assert.ok(unapprovedRecord.rejectionReasons.includes('venue_not_approved'));
      assert.ok(unapprovedRecord.rejectionReasons.includes('awaiting_admin_approval'));

      // Case B: Fully approved candidate -> isPublishable is TRUE
      const approvedRecord = validateExtractedEvent(raw, mockCandidateCrawlContext, mockTicketProbeSuccess, mockApprovalContext);
      assert.equal(approvedRecord.isPublishable, true);
      assert.equal(approvedRecord.publicationTier, PUBLICATION_TIERS.CONFIRMED_OFFICIAL_CALENDAR);
    });

    it('parsed page with no exact time remains non-publishable', () => {
      const raw = {
        title: 'Mark Normand',
        venue_name: 'Denver Comedy Underground',
        civilDate: validUpcomingDate,
        civilTime: '', // missing time
        ticket_url: 'https://denvercomedyunderground.com/events/mark-normand'
      };

      const record = validateExtractedEvent(raw, mockCrawlContext, mockTicketProbeSuccess, mockApprovalContext);
      assert.equal(record.isPublishable, false);
      assert.equal(record.validationChecks.hasExactCivilTime, false);
      assert.ok(record.rejectionReasons.includes('invalid_or_missing_civil_time'));
    });

    it('strictly quarantines artist-only tour stops as unconfirmed_lead (NEVER publishable)', () => {
      const artistCrawl = {
        ...mockCrawlContext,
        sourceKind: 'artist',
        canonicalUrl: 'https://marknormandcomedy.com/tour'
      };

      const raw = {
        title: 'Mark Normand',
        venue_name: 'Tacoma Comedy Club',
        civilDate: validUpcomingDate,
        civilTime: '19:30',
        ticket_url: 'https://tacomacomedyclub.com/shows/12345'
      };

      const record = validateExtractedEvent(raw, artistCrawl, mockTicketProbeSuccess, mockApprovalContext);
      assert.equal(record.isPublishable, false);
      assert.equal(record.publicationTier, PUBLICATION_TIERS.UNCONFIRMED_LEAD);
      assert.ok(record.rejectionReasons.includes('artist_discovery_is_lead_only'));
    });

    it('retains candidate with missing ticket URL as failed candidate rather than discarding', () => {
      const raw = {
        title: 'Mark Normand',
        civilDate: validUpcomingDate,
        civilTime: '19:30',
        ticket_url: null // missing ticket URL
      };

      const record = validateExtractedEvent(raw, mockCrawlContext, {}, mockApprovalContext);
      assert.ok(record);
      assert.equal(record.isPublishable, false);
      assert.equal(record.validationChecks.hasDirectOrShowLandingPage, false);
      assert.ok(record.rejectionReasons.includes('missing_direct_or_show_landing_ticket_url'));
    });
  });

  // -------------------------------------------------------------------------
  // 4. Ticket Safety & Unauthorized Reseller / Redirection Audit (Gate 8 & 9)
  // -------------------------------------------------------------------------
  describe('4. Ticket Safety & Reseller Rejection', () => {
    it('rejects fake lookalike domains such as fakecomedyworks.com', () => {
      const fakeProbe = {
        ok: false,
        finalTicketResolvedUrl: 'https://fakecomedyworks.com/tickets',
        ticketResponseBodyHash: validTicketHash,
        ticketRedirectChain: [{ url: 'https://fakecomedyworks.com/tickets', status: 200, host: 'fakecomedyworks.com' }],
        detectedTicketProvider: 'unknown',
        ticketPageSignals: { hasCartPath: false, hasTicketButton: false, hasShowtimeSelector: false, isReseller: true }
      };

      const raw = {
        title: 'Mark Normand',
        civilDate: validUpcomingDate,
        civilTime: '19:30',
        ticket_url: 'https://fakecomedyworks.com/tickets'
      };

      const record = validateExtractedEvent(raw, mockCrawlContext, fakeProbe, mockApprovalContext);
      assert.equal(record.isPublishable, false);
      assert.equal(record.validationChecks.hasSafeUrlAndRedirectChain, false);
      assert.ok(record.rejectionReasons.includes('fake_or_untrusted_domain'));
    });

    it('rejects unauthorized reseller redirect chains (e.g. hop to vividseats.com)', () => {
      const resellerProbe = {
        ok: false,
        finalTicketResolvedUrl: 'https://www.vividseats.com/comedy/mark-normand',
        ticketResponseBodyHash: validTicketHash,
        ticketRedirectChain: [
          { url: 'https://short.link/123', status: 302, host: 'short.link' },
          { url: 'https://www.vividseats.com/comedy/mark-normand', status: 403, host: 'www.vividseats.com', blocked: true }
        ],
        detectedTicketProvider: 'reseller',
        ticketPageSignals: { hasCartPath: false, hasTicketButton: false, hasShowtimeSelector: false, isReseller: true }
      };

      const raw = {
        title: 'Mark Normand',
        civilDate: validUpcomingDate,
        civilTime: '19:30',
        ticket_url: 'https://short.link/123'
      };

      const record = validateExtractedEvent(raw, mockCrawlContext, resellerProbe, mockApprovalContext);
      assert.equal(record.isPublishable, false);
      assert.equal(record.validationChecks.hasSafeUrlAndRedirectChain, false);
      assert.ok(record.rejectionReasons.includes('unauthorized_or_unsafe_redirect_chain'));
      assert.ok(record.rejectionReasons.includes('unauthorized_secondary_reseller'));
    });

    it('rejects events when ticket page returns HTTP 404 or 500', () => {
      const errorProbe = {
        ok: false,
        status: 404,
        finalTicketResolvedUrl: 'https://comedyworks.com/shows/dead-link',
        ticketResponseBodyHash: null,
        ticketRedirectChain: [{ url: 'https://comedyworks.com/shows/dead-link', status: 404, host: 'comedyworks.com' }],
        detectedTicketProvider: 'unknown',
        ticketPageSignals: { hasCartPath: false, hasTicketButton: false, hasShowtimeSelector: false, isReseller: false }
      };

      const raw = {
        title: 'Mark Normand',
        civilDate: validUpcomingDate,
        civilTime: '19:30',
        ticket_url: 'https://comedyworks.com/shows/dead-link'
      };

      const record = validateExtractedEvent(raw, mockCrawlContext, errorProbe, mockApprovalContext);
      assert.equal(record.isPublishable, false);
      assert.equal(record.validationChecks.hasCryptographicEvidenceHashes, false);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Durable Storage & Repeatable Migrations
  // -------------------------------------------------------------------------
  describe('5. Durable Storage & Idempotency', () => {
    let tmpFile;
    let store;

    beforeEach(() => {
      tmpFile = path.join(os.tmpdir(), `test_eval_store_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
      store = new EventValidationStorage(tmpFile);
    });

    it('applying upserts twice does not duplicate records or destroy history', async () => {
      const raw = {
        id: 'evt_test_dedup_01',
        title: 'Mark Normand',
        civilDate: validUpcomingDate,
        civilTime: '19:30',
        ticket_url: 'https://comedyworks.com/comedians/mark-normand'
      };

      const rec1 = validateExtractedEvent(raw, mockCrawlContext, mockTicketProbeSuccess, mockApprovalContext);
      await store.upsertValidationRecords([rec1]);
      assert.equal(store.records.size, 1);

      // Run 2: Same event ID, modified admin status
      const rec2 = validateExtractedEvent(raw, mockCrawlContext, mockTicketProbeSuccess, { venueApproved: true, adminApproved: false });
      await store.upsertValidationRecords([rec2]);

      assert.equal(store.records.size, 1, 'Store must not duplicate record on re-run');
      const stored = await store.getRecordById('evt_test_dedup_01');
      assert.equal(stored.validationHistory.length, 1, 'Previous attempt history must be preserved');
      assert.equal(stored.validationHistory[0].isPublishable, true);
      assert.equal(stored.isPublishable, false);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Explicit Negative Tests for All 15 Failure Modes & Provenance Integrity
  // -------------------------------------------------------------------------
  describe('6. Explicit Negative Tests for All 15 Failure Modes & Provenance Integrity', () => {
    const baseValidRaw = {
      title: 'Mark Normand',
      venue_name: 'Denver Comedy Underground',
      civilDate: validUpcomingDate,
      civilTime: '19:30',
      timezone: 'America/Denver',
      ticket_url: 'https://denvercomedyunderground.com/events/mark-normand',
      linkResolutionTier: LINK_RESOLUTION_TIERS.SHOW_LANDING_PAGE
    };

    // Mode 1: Malformed calendar dates (e.g. Feb 30, April 31, bad syntax)
    it('Negative Mode 1: Rejects malformed dates (Feb 30, April 31)', () => {
      const raw = { ...baseValidRaw, civilDate: '2026-02-30' };
      const record = validateExtractedEvent(raw, mockCrawlContext, mockTicketProbeSuccess, mockApprovalContext);
      assert.equal(record.validationChecks.hasExplicitCivilDate, false);
      assert.equal(record.isPublishable, false);
      assert.ok(record.rejectionReasons.includes('invalid_or_missing_calendar_date'));
    });

    // Mode 2: Impossible civil times (e.g. 25:00, 12:65)
    it('Negative Mode 2: Rejects impossible times (25:00, 12:65)', () => {
      const raw = { ...baseValidRaw, civilTime: '25:00' };
      const record = validateExtractedEvent(raw, mockCrawlContext, mockTicketProbeSuccess, mockApprovalContext);
      assert.equal(record.validationChecks.hasExactCivilTime, false);
      assert.equal(record.isPublishable, false);
      assert.ok(record.rejectionReasons.includes('invalid_or_missing_civil_time'));
    });

    // Mode 3: Spring-forward DST gap (nonexistent local time)
    it('Negative Mode 3: Rejects nonexistent spring-forward DST gap times', () => {
      const raw = { ...baseValidRaw, civilDate: '2026-03-08', civilTime: '02:30', timezone: 'America/Denver' };
      const record = validateExtractedEvent(raw, mockCrawlContext, mockTicketProbeSuccess, mockApprovalContext);
      assert.equal(record.validationChecks.hasStrictDateTimeRoundTrip, false);
      assert.equal(record.isPublishable, false);
      assert.ok(record.rejectionReasons.includes('nonexistent_spring_forward_time_gap'));
    });

    // Mode 4: Fall-back ambiguous time without explicit offset
    it('Negative Mode 4: Rejects ambiguous fall-back times without explicit offset', () => {
      const raw = { ...baseValidRaw, civilDate: '2026-11-01', civilTime: '01:30', timezone: 'America/Denver' };
      const record = validateExtractedEvent(raw, mockCrawlContext, mockTicketProbeSuccess, mockApprovalContext);
      assert.equal(record.validationChecks.hasStrictDateTimeRoundTrip, false);
      assert.equal(record.isPublishable, false);
      assert.ok(record.rejectionReasons.includes('ambiguous_fall_back_time_without_offset'));
    });

    // Mode 5: Missing ticket URL
    it('Negative Mode 5: Rejects missing ticket URL', () => {
      const raw = { ...baseValidRaw, ticket_url: '' };
      const record = validateExtractedEvent(raw, mockCrawlContext, mockTicketProbeSuccess, mockApprovalContext);
      assert.equal(record.validationChecks.hasDirectOrShowLandingPage, false);
      assert.equal(record.isPublishable, false);
      assert.ok(record.rejectionReasons.includes('missing_direct_or_show_landing_ticket_url'));
    });

    // Mode 6: Generic venue homepage or calendar
    it('Negative Mode 6: Rejects generic venue homepage or calendar', () => {
      const raw = {
        ...baseValidRaw,
        ticket_url: 'https://comedyworks.com/calendar',
        isVenueLevelLink: true,
        linkResolutionTier: LINK_RESOLUTION_TIERS.VENUE_CALENDAR
      };
      const record = validateExtractedEvent(raw, mockCrawlContext, mockTicketProbeSuccess, mockApprovalContext);
      assert.equal(record.validationChecks.hasDirectOrShowLandingPage, false);
      assert.equal(record.isPublishable, false);
      assert.ok(record.rejectionReasons.includes('generic_venue_homepage_not_allowed'));
    });

    // Mode 7: Unauthorized secondary reseller (e.g. vividseats.com)
    it('Negative Mode 7: Rejects unauthorized secondary reseller in redirect chain', () => {
      const resellerProbe = {
        ...mockTicketProbeSuccess,
        finalTicketResolvedUrl: 'https://www.vividseats.com/comedy/mark-normand',
        ticketRedirectChain: [
          { url: 'https://short.link/123', status: 302, host: 'short.link' },
          { url: 'https://www.vividseats.com/comedy/mark-normand', status: 403, host: 'www.vividseats.com', blocked: true }
        ],
        detectedTicketProvider: 'reseller',
        ticketPageSignals: { hasCartPath: false, hasTicketButton: false, hasShowtimeSelector: false, isReseller: true }
      };
      const raw = { ...baseValidRaw, ticket_url: 'https://short.link/123' };
      const record = validateExtractedEvent(raw, mockCrawlContext, resellerProbe, mockApprovalContext);
      assert.equal(record.validationChecks.hasSafeUrlAndRedirectChain, false);
      assert.equal(record.isPublishable, false);
      assert.ok(record.rejectionReasons.includes('unauthorized_secondary_reseller'));
    });

    // Mode 8: Unsafe redirect URL parameter
    it('Negative Mode 8: Rejects unsafe redirect URL parameter', () => {
      const raw = {
        ...baseValidRaw,
        ticket_url: 'https://comedyworks.com/out?redirect=https://evil-phishing-site.com/login'
      };
      const record = validateExtractedEvent(raw, mockCrawlContext, mockTicketProbeSuccess, mockApprovalContext);
      assert.equal(record.validationChecks.hasSafeUrlAndRedirectChain, false);
      assert.equal(record.isPublishable, false);
      assert.ok(record.rejectionReasons.includes('unsafe_redirect_url_parameter'));
    });

    // Mode 9: Fake or lookalike domain (fakecomedyworks.com)
    it('Negative Mode 9: Rejects fake or lookalike domain (fakecomedyworks.com)', () => {
      const fakeProbe = {
        ...mockTicketProbeSuccess,
        finalTicketResolvedUrl: 'https://fakecomedyworks.com/tickets',
        ticketRedirectChain: [{ url: 'https://fakecomedyworks.com/tickets', status: 200, host: 'fakecomedyworks.com' }]
      };
      const raw = { ...baseValidRaw, ticket_url: 'https://fakecomedyworks.com/tickets' };
      const record = validateExtractedEvent(raw, mockCrawlContext, fakeProbe, mockApprovalContext);
      assert.equal(record.validationChecks.hasSafeUrlAndRedirectChain, false);
      assert.equal(record.isPublishable, false);
      assert.ok(record.rejectionReasons.includes('fake_or_untrusted_domain'));
    });

    // Mode 10: Missing source cryptographic hash
    it('Negative Mode 10: Rejects missing source response hash', () => {
      const contextWithoutSourceHash = { ...mockCrawlContext, contentHash: null };
      const record = validateExtractedEvent(baseValidRaw, contextWithoutSourceHash, mockTicketProbeSuccess, mockApprovalContext);
      assert.equal(record.validationChecks.hasCryptographicEvidenceHashes, false);
      assert.equal(record.isPublishable, false);
      assert.ok(record.rejectionReasons.includes('missing_or_invalid_source_hash'));
    });

    // Mode 11: Missing ticket hash & reused source hash as ticket hash
    it('Negative Mode 11: Rejects missing ticket hash and rejects reused source hash as ticket hash', () => {
      // 11A: Missing ticket hash
      const probeWithoutTicketHash = { ...mockTicketProbeSuccess, ticketResponseBodyHash: null };
      const recA = validateExtractedEvent(baseValidRaw, mockCrawlContext, probeWithoutTicketHash, mockApprovalContext);
      assert.equal(recA.validationChecks.hasCryptographicEvidenceHashes, false);
      assert.ok(recA.rejectionReasons.includes('missing_or_invalid_ticket_hash'));

      // 11B: Reused source hash as ticket hash (MUST be distinct hashes)
      const probeWithReusedHash = { ...mockTicketProbeSuccess, ticketResponseBodyHash: validSourceHash };
      const recB = validateExtractedEvent(baseValidRaw, mockCrawlContext, probeWithReusedHash, mockApprovalContext);
      assert.equal(recB.validationChecks.hasCryptographicEvidenceHashes, false);
      assert.ok(recB.rejectionReasons.includes('identical_or_reused_evidence_hash'));
      assert.ok(recB.rejectionReasons.includes('reused_source_hash_as_ticket_hash'));
    });

    // Mode 12: Synthetic recurring date pattern
    it('Negative Mode 12: Rejects synthetic recurring date pattern (Every Tuesday)', () => {
      const raw = { ...baseValidRaw, title: 'Every Tuesday Comedy Open Mic' };
      const record = validateExtractedEvent(raw, mockCrawlContext, mockTicketProbeSuccess, mockApprovalContext);
      assert.equal(record.validationChecks.isNotSyntheticRecurring, false);
      assert.equal(record.isPublishable, false);
      assert.ok(record.rejectionReasons.includes('synthetic_recurring_pattern_detected'));
    });

    // Mode 13: Past event
    it('Negative Mode 13: Rejects past event while retaining historical evidence', () => {
      const raw = { ...baseValidRaw, civilDate: '2020-01-01' };
      const record = validateExtractedEvent(raw, mockCrawlContext, mockTicketProbeSuccess, mockApprovalContext);
      assert.equal(record.validationChecks.isWithinPublicationWindow, false);
      assert.equal(record.isPublishable, false);
      assert.equal(record.evidenceRetentionTier, 'retained_historical');
      assert.ok(record.rejectionReasons.includes('event_in_the_past'));
    });

    // Mode 14: Event beyond public feed horizon
    it('Negative Mode 14: Rejects event beyond public feed horizon while retaining future evidence', () => {
      const distantDate = new Date(Date.now() + 60 * 86400e3).toISOString().slice(0, 10); // 60 days out (> 14d horizon)
      const raw = { ...baseValidRaw, civilDate: distantDate };
      const record = validateExtractedEvent(raw, mockCrawlContext, mockTicketProbeSuccess, mockApprovalContext);
      assert.equal(record.structurallyValid, true, 'Event beyond horizon must remain structurally valid');
      assert.equal(record.displayEligible, false, 'Event beyond horizon must not be display eligible');
      assert.equal(record.adminReviewEligible, true, 'Venue event beyond horizon is admin review eligible');
      assert.equal(record.publicationEligible, false, 'Event beyond horizon is not publication eligible');
      assert.equal(record.validationChecks.isWithinPublicationWindow, false);
      assert.equal(record.isPublishable, false);
      assert.equal(record.evidenceRetentionTier, 'retained_future_horizon');
      assert.ok(record.rejectionReasons.includes('event_beyond_public_horizon'));
    });

    // Mode 15: Artist-only source
    it('Negative Mode 15: Quarantines artist-only source as lead only (never publishable)', () => {
      const artistCrawlContext = { ...mockCrawlContext, sourceKind: 'artist' };
      const record = validateExtractedEvent(baseValidRaw, artistCrawlContext, mockTicketProbeSuccess, mockApprovalContext);
      assert.equal(record.structurallyValid, true, 'Artist tour stop with valid fields can be structurally valid');
      assert.equal(record.displayEligible, false, 'Artist lead must never be display eligible');
      assert.equal(record.adminReviewEligible, false, 'Artist lead must never be admin review eligible');
      assert.equal(record.publicationEligible, false, 'Artist lead must never be publication eligible');
      assert.equal(record.evidenceRetentionTier, 'artist_discovery_lead');
      assert.equal(record.isPublishable, false);
      assert.equal(record.publicationTier, PUBLICATION_TIERS.UNCONFIRMED_LEAD);
      assert.ok(record.rejectionReasons.includes('artist_discovery_is_lead_only'));
    });

    // Evidence Provenance Verification
    it('Provenance Verification: Accepted candidate has distinct hashes, URLs, and IDs', () => {
      const acceptedRecord = validateExtractedEvent(baseValidRaw, mockCrawlContext, mockTicketProbeSuccess, mockApprovalContext);
      assert.equal(acceptedRecord.isPublishable, true);
      assert.equal(acceptedRecord.publicationTier, PUBLICATION_TIERS.CONFIRMED_OFFICIAL_CALENDAR);

      // Verify cryptographic distinction
      assert.notEqual(acceptedRecord.sourceResponseHash, acceptedRecord.ticketResponseBodyHash);
      assert.equal(acceptedRecord.sourceResponseHash.length, 64);
      assert.equal(acceptedRecord.ticketResponseBodyHash.length, 64);

      // Verify URL distinction
      assert.notEqual(acceptedRecord.sourceFinalResolvedUrl, acceptedRecord.finalTicketResolvedUrl);

      // Verify audit IDs
      assert.ok(acceptedRecord.crawlLedgerId);
      assert.ok(acceptedRecord.validationRunId);
      assert.equal(acceptedRecord.parserVersion, '1.0');
    });
  });

  // -------------------------------------------------------------------------
  // 7. Authoritative Venue Approval Classification Suite
  // -------------------------------------------------------------------------
  describe('7. Authoritative Venue Approval Classification Suite', () => {
    it('Case 1: Promoted production venue classified as already_live with refresh action', () => {
      const liveCrawl = {
        id: 'cl_cw_dt',
        canonicalUrl: 'https://comedyworks.com/shows/calendar',
        sourceKind: 'venue',
        venueName: 'Comedy Works Downtown',
        venueSlug: 'comedy-works-downtown-denver',
        contentHash: validSourceHash,
        parserName: 'comedy_works_official',
        parserVersion: '1.0'
      };
      const raw = {
        title: 'Dave Attell',
        venue_name: 'Comedy Works Downtown',
        civilDate: validUpcomingDate,
        civilTime: '20:00',
        ticket_url: 'https://comedyworks.com/comedians/dave-attell'
      };

      const record = validateExtractedEvent(raw, liveCrawl, mockTicketProbeSuccess);
      assert.equal(record.venueApprovalStatus, 'already_live');
      assert.equal(record.adminReviewEligible, false);
      assert.equal(record.publicationEligible, false);
      assert.equal(record.reviewQueueAction, 'refresh_existing_venue');
      assert.ok(!record.rejectionReasons.includes('venue_not_approved'));
      assert.ok(!record.rejectionReasons.includes('awaiting_admin_approval'));
    });

    it('Case 2: Known unpromoted candidate from national registry classified as candidate', () => {
      const candidateCrawl = {
        id: 'cl_dcu',
        canonicalUrl: 'https://denvercomedyunderground.com/events',
        sourceKind: 'venue',
        venueName: 'Denver Comedy Underground',
        venueSlug: 'denver-comedy-underground-denver',
        contentHash: validSourceHash,
        parserName: 'seatengine',
        parserVersion: '1.0'
      };
      const raw = {
        title: 'Local Showcase',
        venue_name: 'Denver Comedy Underground',
        civilDate: validUpcomingDate,
        civilTime: '20:00',
        ticket_url: 'https://denvercomedyunderground.com/events/local-showcase'
      };

      const record = validateExtractedEvent(raw, candidateCrawl, mockTicketProbeSuccess);
      assert.equal(record.venueApprovalStatus, 'candidate');
      assert.equal(record.adminReviewEligible, true);
      assert.equal(record.publicationEligible, false);
      assert.equal(record.reviewQueueAction, 'new_venue_review');
      assert.ok(record.rejectionReasons.includes('awaiting_admin_approval'));
    });

    it('Case 3: Net-new uncatalogued venue classified as awaiting_review', () => {
      const netNewCrawl = {
        id: 'cl_netnew',
        canonicalUrl: 'https://seattlesecretcomedy.com/calendar',
        sourceKind: 'venue',
        venueName: 'Seattle Secret Comedy',
        venueSlug: 'seattle-secret-comedy-seattle',
        contentHash: validSourceHash,
        parserName: 'custom_html',
        parserVersion: '1.0'
      };
      const raw = {
        title: 'Secret Showcase',
        venue_name: 'Seattle Secret Comedy',
        civilDate: validUpcomingDate,
        civilTime: '20:00',
        ticket_url: 'https://seattlesecretcomedy.com/shows/1'
      };

      const record = validateExtractedEvent(raw, netNewCrawl, mockTicketProbeSuccess);
      assert.equal(record.venueApprovalStatus, 'awaiting_review');
      assert.equal(record.adminReviewEligible, true);
      assert.equal(record.publicationEligible, false);
      assert.equal(record.reviewQueueAction, 'new_venue_review');
      assert.ok(record.rejectionReasons.includes('awaiting_admin_approval'));
    });

    it('Case 4: Artist tour discovery classified as not_applicable lead only', () => {
      const artistCrawl = {
        id: 'cl_artist',
        canonicalUrl: 'https://marknormandcomedy.com/tour',
        sourceKind: 'artist',
        contentHash: validSourceHash,
        parserName: 'artist_tour',
        parserVersion: '1.0'
      };
      const raw = {
        title: 'Mark Normand',
        venue_name: 'Tacoma Comedy Club',
        civilDate: validUpcomingDate,
        civilTime: '20:00',
        ticket_url: 'https://tacomacomedyclub.com/shows/123'
      };

      const record = validateExtractedEvent(raw, artistCrawl, mockTicketProbeSuccess);
      assert.equal(record.venueApprovalStatus, 'not_applicable');
      assert.equal(record.adminReviewEligible, false);
      assert.equal(record.publicationEligible, false);
      assert.equal(record.reviewQueueAction, 'quarantine_lead');
      assert.ok(record.rejectionReasons.includes('artist_discovery_is_lead_only'));
    });

    it('Case 5: Known candidate cannot become awaiting_review merely because of an alias mismatch', () => {
      const { resolveCanonicalVenueIdentity } = require('../lib/crawling/venue-classification.js');
      const skylineVariants = [
        { venueSlug: 'skyline-comedy-club-appleton' },
        { venueSlug: 'skyline-comedy-club' },
        { venueSlug: 'skyline-comedy' },
        { canonicalUrl: 'https://skylinecomedy.com/events' },
        { canonicalUrl: 'https://www.skylinecomedy.com/calendar' },
        { canonicalUrl: 'https://skylinecomedy.seatengine.com/events' },
        { venueName: 'Skyline Comedy Club' }
      ];

      for (const variant of skylineVariants) {
        const resolved = resolveCanonicalVenueIdentity(variant);
        assert.equal(
          resolved.canonicalSlug,
          'skyline-comedy-club-appleton',
          `Variant ${JSON.stringify(variant)} must resolve to canonical slug skyline-comedy-club-appleton`
        );
        assert.equal(
          resolved.venueApprovalStatus,
          'candidate',
          `Variant ${JSON.stringify(variant)} must resolve to 'candidate' and NEVER 'awaiting_review'`
        );
        assert.equal(
          resolved.isLiveProductionVenue,
          false,
          `Variant ${JSON.stringify(variant)} must not be live production venue`
        );
      }
    });

    it('Case 6: Candidate with zero exact events and custom_parser_required has adminReviewEligible false and action custom_parser_required', () => {
      const { resolveCanonicalVenueIdentity } = require('../lib/crawling/venue-classification.js');
      const customCandidate = resolveCanonicalVenueIdentity({
        venueSlug: 'the-comedy-store',
        venueName: 'The Comedy Store',
        canonicalUrl: 'https://thecomedystore.com/calendar',
        crawlStatus: 'no_exact_events',
        exactEventsCount: 0,
        blockedReason: 'custom_parser_required'
      });

      assert.equal(customCandidate.venueApprovalStatus, 'candidate');
      assert.equal(customCandidate.queueStatus, 'needs_review');
      assert.equal(customCandidate.adminReviewEligible, false, 'Must not be counted as ready for promotion');
      assert.equal(customCandidate.reviewQueueAction, 'custom_parser_required');
      assert.equal(customCandidate.isLiveProductionVenue, false);
    });
  });
});
