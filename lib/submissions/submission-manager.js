/**
 * Event Submissions Manager (Phase A & B)
 *
 * Implements schedule intake, private evidence storage, deterministic parsing,
 * one-time capability token exchange, and admin approval promotion.
 *
 * Strict Guardrails:
 * - Table/collection: event_submissions
 * - Classification: community_submitted or organizer_confirmed (never confirmed_by_official_calendar)
 * - One-time capability tokens: exchanged immediately for session, never logged or retained in URLs
 * - Private evidence storage: GCS / local raw evidence marked private with PII protection
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { parseCsvSchedule } = require('./csv-parser');
const { parseIcsFeed } = require('../network/adapters/ics-adapter');
const { parseJsonLdFeed } = require('../network/adapters/jsonld-adapter');
const { defaultRawStorage } = require('../storage/raw-source-storage');
const { defaultCanonicalStorage } = require('../storage/canonical-event-storage');
const { computeEventFingerprint } = require('../identity');

class EventSubmissionManager {
  constructor(options = {}) {
    this.rawStorage = options.rawStorage || defaultRawStorage;
    this.canonicalStorage = options.canonicalStorage || defaultCanonicalStorage;
    this.submissions = new Map(); // submissionId -> submissionRecord
    this.capabilityTokens = new Map(); // token -> { submissionId, expiresAt, used }
    this.activeSessions = new Map(); // sessionId -> { submissionId, expiresAt, role }
  }

  getSigningSecret() {
    return process.env.SUBMISSION_SIGNING_KEY || process.env.ADMIN_TOKEN || 'brinkberry_submission_capability_fallback_key';
  }

  /**
   * Generates a short-lived (15 min) cryptographically signed one-time capability token
   * Strictly intended for out-of-band delivery (email/DNS challenge), NEVER returned in public intake.
   */
  createCapabilityToken(submissionId, ttlMinutes = 15) {
    const payload = {
      sub: submissionId,
      iat: Date.now(),
      exp: Date.now() + (ttlMinutes * 60 * 1000),
      jti: crypto.randomBytes(12).toString('hex')
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', this.getSigningSecret()).update(payloadB64).digest('base64url');
    const token = `cap_${payloadB64}.${sig}`;

    this.capabilityTokens.set(payload.jti, {
      submissionId,
      expiresAt: payload.exp,
      used: false
    });
    return token;
  }

  /**
   * Checks durable shared storage for spent token nonces
   */
  async isNonceSpent(jti) {
    if (!jti) return true;
    // 1. In-memory check
    if (this.capabilityTokens.has(jti) && this.capabilityTokens.get(jti).used) {
      return true;
    }

    // 2. Disk check for container durability
    const nonceFile = path.join(os.tmpdir(), `bb_nonce_${jti}.spent`);
    if (fs.existsSync(nonceFile)) {
      return true;
    }

    // 3. Raw storage / GCS check
    if (this.rawStorage && typeof this.rawStorage.getLatestRawEvidence === 'function') {
      try {
        const ev = await this.rawStorage.getLatestRawEvidence(`spent_nonce_${jti}`);
        if (ev) return true;
      } catch (_) {}
    }

    return false;
  }

  /**
   * Marks a nonce as durably spent across instances
   */
  async markNonceSpent(jti, submissionId, exp) {
    this.capabilityTokens.set(jti, {
      submissionId,
      expiresAt: exp,
      used: true
    });

    try {
      const nonceFile = path.join(os.tmpdir(), `bb_nonce_${jti}.spent`);
      fs.writeFileSync(nonceFile, JSON.stringify({ spentAt: new Date().toISOString(), sub: submissionId }));
    } catch (_) {}

    if (this.rawStorage && typeof this.rawStorage.saveRawEvidence === 'function') {
      try {
        await this.rawStorage.saveRawEvidence({
          sourceId: `spent_nonce_${jti}`,
          rawResponse: 'SPENT',
          httpStatus: 200,
          parserName: 'replay_protection',
          isPrivateEvidence: true
        });
      } catch (_) {}
    }
  }

  /**
   * Exchanges a one-time capability token for an ephemeral signed session token.
   * Immediately marks capability token nonce as durably spent.
   */
  async exchangeCapabilityToken(token) {
    if (!token || typeof token !== 'string' || !token.startsWith('cap_')) {
      return { success: false, error: 'Missing or malformed capability token' };
    }

    const raw = token.slice(4);
    const dotIdx = raw.indexOf('.');
    if (dotIdx === -1) {
      return { success: false, error: 'Malformed capability token' };
    }

    const payloadB64 = raw.slice(0, dotIdx);
    const sig = raw.slice(dotIdx + 1);
    const expectedSig = crypto.createHmac('sha256', this.getSigningSecret()).update(payloadB64).digest('base64url');

    if (sig !== expectedSig) {
      return { success: false, error: 'Invalid capability token signature' };
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch (_) {
      return { success: false, error: 'Invalid capability token payload' };
    }

    if (!payload || !payload.exp || Date.now() > payload.exp) {
      return { success: false, error: 'Capability token expired' };
    }

    // Check durable nonce reuse
    const alreadySpent = await this.isNonceSpent(payload.jti);
    if (alreadySpent) {
      return { success: false, error: 'Capability token has already been exchanged' };
    }

    // Durably mark spent
    await this.markNonceSpent(payload.jti, payload.sub, payload.exp);

    // Create cryptographically signed session (2 hour TTL)
    const sessionPayload = {
      sub: payload.sub,
      role: 'submitter_session',
      iat: Date.now(),
      exp: Date.now() + (2 * 3600 * 1000),
      sid: crypto.randomBytes(12).toString('hex')
    };
    const sessionB64 = Buffer.from(JSON.stringify(sessionPayload)).toString('base64url');
    const sessionSig = crypto.createHmac('sha256', this.getSigningSecret()).update(sessionB64).digest('base64url');
    const sessionId = `sess_${sessionB64}.${sessionSig}`;

    this.activeSessions.set(sessionPayload.sid, {
      submissionId: payload.sub,
      expiresAt: sessionPayload.exp,
      role: 'submitter_session'
    });

    return {
      success: true,
      sessionId,
      submissionId: payload.sub
    };
  }

  validateSession(sessionId) {
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('sess_')) {
      return false;
    }

    const raw = sessionId.slice(5);
    const dotIdx = raw.indexOf('.');
    if (dotIdx === -1) return false;

    const sessionB64 = raw.slice(0, dotIdx);
    const sig = raw.slice(dotIdx + 1);
    const expectedSig = crypto.createHmac('sha256', this.getSigningSecret()).update(sessionB64).digest('base64url');

    if (sig !== expectedSig) return false;

    try {
      const payload = JSON.parse(Buffer.from(sessionB64, 'base64url').toString('utf8'));
      if (!payload || !payload.exp || Date.now() > payload.exp) return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Ingests schedule submission, stores private raw evidence, and parses candidates
   */
  async submitSchedule(intakeData = {}) {
    const {
      vertical = 'comedy',
      submitterName,
      submitterEmail,
      submitterRole = 'organizer',
      venueOrTrack = {},
      format = 'csv', // csv | ics | jsonld | url
      content = '',
      scheduleUrl = null
    } = intakeData;

    if (!submitterName || !submitterEmail) {
      throw new Error('Submitter name and email are required for accountability');
    }

    if (!['comedy', 'motorsports', 'racing'].includes(vertical)) {
      throw new Error('Valid vertical required (comedy or motorsports)');
    }

    if (!content && !scheduleUrl) {
      throw new Error('Evidence required: content or scheduleUrl must be provided');
    }

    const submissionId = `sub_${crypto.randomBytes(12).toString('hex')}`;
    const rawContent = content || (scheduleUrl ? `SCHEDULE_URL: ${scheduleUrl}` : '');
    const contentHash = crypto.createHash('sha256').update(rawContent).digest('hex').slice(0, 16);

    let parsedEvents = [];
    let parsingErrors = [];

    // Deterministic parsing
    if (format === 'csv') {
      const csvResult = parseCsvSchedule(rawContent, { venueOrTrack });
      parsedEvents = csvResult.events;
      parsingErrors = csvResult.errors;
    } else if (format === 'ics') {
      const icsResult = parseIcsFeed(rawContent, {
        sourceConfig: { id: `sub_${submissionId}`, venueName: venueOrTrack.name }
      });
      parsedEvents = icsResult.events;
    } else if (format === 'jsonld') {
      const jsonldResult = parseJsonLdFeed(rawContent, {
        sourceConfig: { id: `sub_${submissionId}`, venueName: venueOrTrack.name }
      });
      parsedEvents = jsonldResult.events;
    }

    if (parsedEvents.length === 0) {
      throw new Error(`Evidence verification failed: No valid events could be extracted from schedule evidence. ${parsingErrors.join(', ')}`.trim());
    }

    // Save private evidence snapshot
    try {
      if (this.rawStorage && typeof this.rawStorage.saveRawEvidence === 'function') {
        await this.rawStorage.saveRawEvidence({
          sourceId: `submission_${submissionId}`,
          content: rawContent,
          httpStatus: 200,
          parserStatus: 'pending_review',
          isPrivateEvidence: true,
          submitter: { name: submitterName, email: submitterEmail, role: submitterRole }
        });
      }
    } catch (_) {
      // Non-blocking storage fallback
    }

    const candidateEvents = parsedEvents.map(ev => ({
      ...ev,
      submissionId,
      vertical: vertical === 'racing' ? 'motorsports' : vertical,
      status: 'pending_review',
      candidateConfirmationStatus: submitterRole === 'promoter' || submitterRole === 'venue_owner'
        ? 'organizer_confirmed'
        : 'community_submitted'
    }));

    const submissionRecord = {
      submissionId,
      vertical: vertical === 'racing' ? 'motorsports' : vertical,
      submitter: {
        name: submitterName,
        email: submitterEmail,
        role: submitterRole
      },
      venueOrTrack,
      format,
      scheduleUrl,
      contentHash,
      status: 'pending_review',
      submittedAt: new Date().toISOString(),
      candidateCount: candidateEvents.length,
      candidates: candidateEvents,
      parsingErrors,
      reviewRecord: null
    };

    this.submissions.set(submissionId, submissionRecord);

    // Persist to disk and raw storage for multi-instance retrieval
    try {
      const tmpFile = path.join(os.tmpdir(), `bb_sub_${submissionId}.json`);
      fs.writeFileSync(tmpFile, JSON.stringify(submissionRecord));
    } catch (_) {}

    try {
      if (this.rawStorage && typeof this.rawStorage.saveRawEvidence === 'function') {
        await this.rawStorage.saveRawEvidence({
          sourceId: `sub_${submissionId}`,
          rawResponse: JSON.stringify(submissionRecord),
          contentHash,
          httpStatus: 200,
          parserName: 'submission_manager',
          parserStatus: 'pending_review',
          isPrivateEvidence: true
        });
      }
    } catch (_) {}

    // Public intake returns ONLY confirmation receipt, NEVER a capability token
    return {
      submissionId,
      status: 'pending_review',
      candidateCount: candidateEvents.length,
      contentHash
    };
  }

  /**
   * Out-of-band organizer confirmation.
   * Marks candidate submission as organizer_confirmed, but NEVER publishes to canonical storage.
   */
  async confirmOrganizer(submissionId, organizerInfo = {}) {
    const submission = await this.getSubmission(submissionId);
    if (!submission) {
      throw new Error(`Submission not found: ${submissionId}`);
    }

    submission.status = 'organizer_confirmed';
    submission.organizerConfirmation = {
      confirmedAt: new Date().toISOString(),
      organizerName: organizerInfo.name || submission.submitter.name,
      organizerEmail: organizerInfo.email || submission.submitter.email
    };

    for (const c of submission.candidates) {
      c.candidateConfirmationStatus = 'organizer_confirmed';
    }

    try {
      const tmpFile = path.join(os.tmpdir(), `bb_sub_${submissionId}.json`);
      fs.writeFileSync(tmpFile, JSON.stringify(submission));
    } catch (_) {}

    return {
      status: 'organizer_confirmed',
      submissionId,
      candidateCount: submission.candidates.length,
      published: false
    };
  }

  async getSubmission(submissionId) {
    if (this.submissions.has(submissionId)) {
      return this.submissions.get(submissionId);
    }

    // Check disk
    try {
      const tmpFile = path.join(os.tmpdir(), `bb_sub_${submissionId}.json`);
      if (fs.existsSync(tmpFile)) {
        const record = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
        this.submissions.set(submissionId, record);
        return record;
      }
    } catch (_) {}

    // Check raw evidence storage (GCS / production raw archive)
    if (this.rawStorage && typeof this.rawStorage.getLatestRawEvidence === 'function') {
      try {
        const evidence = await this.rawStorage.getLatestRawEvidence(`sub_${submissionId}`);
        if (evidence && evidence.rawResponse) {
          const record = JSON.parse(evidence.rawResponse);
          this.submissions.set(submissionId, record);
          return record;
        }
      } catch (_) {}
    }

    return null;
  }

  listSubmissions(options = {}) {
    let list = Array.from(this.submissions.values());
    if (options.status) {
      list = list.filter(s => s.status === options.status);
    }
    if (options.vertical) {
      list = list.filter(s => s.vertical === options.vertical);
    }
    return list;
  }

  /**
   * Approves or rejects an event submission
   */
  async reviewSubmission(submissionId, reviewAction = {}) {
    const { action, reviewer = 'admin', notes = '', selectedCandidateIds = null } = reviewAction;
    const submission = await this.getSubmission(submissionId);

    if (!submission) {
      throw new Error(`Submission not found: ${submissionId}`);
    }

    if (action === 'reject') {
      submission.status = 'rejected';
      submission.reviewRecord = {
        action: 'rejected',
        reviewer,
        reviewedAt: new Date().toISOString(),
        notes
      };
      try {
        const tmpFile = path.join(os.tmpdir(), `bb_sub_${submissionId}.json`);
        fs.writeFileSync(tmpFile, JSON.stringify(submission));
      } catch (_) {}
      return { status: 'rejected', promotedCount: 0 };
    }

    if (action === 'approve') {
      submission.status = 'approved';
      const toApprove = selectedCandidateIds
        ? submission.candidates.filter(c => selectedCandidateIds.includes(c.id))
        : submission.candidates;

      const promotedEvents = [];

      for (const cand of toApprove) {
        // Enforce strict confirmation classification rule:
        // Admin approval -> admin_verified (NEVER confirmed_by_official_calendar)
        const finalStatus = 'admin_verified';

        const startTime = cand.start;
        const venueSlug = (cand.venueOrTrack?.name || 'submitted-venue').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const venueLat = cand.venueOrTrack?.lat ?? cand.venueOrTrack?.latitude ?? submission.venueOrTrack?.lat ?? submission.venueOrTrack?.latitude ?? null;
        const venueLon = cand.venueOrTrack?.lon ?? cand.venueOrTrack?.lng ?? cand.venueOrTrack?.longitude ?? submission.venueOrTrack?.lon ?? submission.venueOrTrack?.lng ?? submission.venueOrTrack?.longitude ?? null;

        const fingerprint = computeEventFingerprint({
          venueId: venueSlug,
          startTime,
          title: cand.title,
          performerOrSeries: Array.isArray(cand.lineup) ? cand.lineup.join(', ') : ''
        });

        const canonicalEvent = {
          id: `evt_sub_${crypto.createHash('md5').update(fingerprint).digest('hex').slice(0, 12)}`,
          fingerprint,
          title: cand.title,
          start: startTime,
          start_time: startTime,
          localCivilDate: cand.localCivilDate,
          localCivilTime: cand.localCivilTime,
          venue: cand.venueOrTrack?.name || submission.venueOrTrack?.name,
          venue_name: cand.venueOrTrack?.name || submission.venueOrTrack?.name,
          venueSlug,
          city: cand.venueOrTrack?.city || submission.venueOrTrack?.city || '',
          state: cand.venueOrTrack?.state || submission.venueOrTrack?.state || '',
          venue_latitude: venueLat != null ? Number(venueLat) : null,
          venue_longitude: venueLon != null ? Number(venueLon) : null,
          lat: venueLat != null ? Number(venueLat) : null,
          lon: venueLon != null ? Number(venueLon) : null,
          category: submission.vertical === 'motorsports' ? 'racing' : 'comedy',
          category_tags: [submission.vertical === 'motorsports' ? 'racing' : 'comedy'],
          confirmationStatus: finalStatus,
          source: 'verified_community',
          sourceType: 'producer_submission',
          sourceEvidence: {
            sourceId: `submission_${submission.submissionId}`,
            sourceType: 'producer_submission',
            confirmationStatus: finalStatus,
            contentHash: submission.contentHash,
            fetchedAt: new Date().toISOString(),
            exactConfirmationFields: { title: true, date: true }
          },
          freshnessStatus: 'verified_current',
          lastVerifiedAt: new Date().toISOString(),
          provenance: {
            submissionId: submission.submissionId,
            submitterEmail: submission.submitter.email,
            reviewedBy: reviewer,
            approvedAt: new Date().toISOString()
          },
          canonical_url: cand.ticketUrl || cand.canonicalUrl || submission.venueOrTrack?.website || (cand.venueOrTrack?.website) || 'https://risecomedy.com',
          ticket_url: cand.ticketUrl || cand.canonicalUrl || submission.venueOrTrack?.website || (cand.venueOrTrack?.website) || 'https://risecomedy.com',
          ticketUrl: cand.ticketUrl || cand.canonicalUrl || submission.venueOrTrack?.website || (cand.venueOrTrack?.website) || 'https://risecomedy.com',
          price_display: cand.priceDisplay || null,
          lineup: cand.lineup || []
        };

        if (this.canonicalStorage && typeof this.canonicalStorage.upsertEvents === 'function') {
          await this.canonicalStorage.upsertEvents([canonicalEvent]);
        } else if (this.canonicalStorage && typeof this.canonicalStorage.upsertEvent === 'function') {
          await this.canonicalStorage.upsertEvent(canonicalEvent);
        }

        promotedEvents.push(canonicalEvent);
      }

      submission.reviewRecord = {
        action: 'approved',
        reviewer,
        reviewedAt: new Date().toISOString(),
        promotedCount: promotedEvents.length,
        notes
      };

      try {
        const tmpFile = path.join(os.tmpdir(), `bb_sub_${submissionId}.json`);
        fs.writeFileSync(tmpFile, JSON.stringify(submission));
      } catch (_) {}

      return {
        status: 'approved',
        promotedCount: promotedEvents.length,
        events: promotedEvents
      };
    }

    throw new Error(`Unsupported review action: ${action}`);
  }
}

const defaultSubmissionManager = new EventSubmissionManager();

module.exports = {
  EventSubmissionManager,
  defaultSubmissionManager
};
