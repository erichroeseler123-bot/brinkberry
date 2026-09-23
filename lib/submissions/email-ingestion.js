/**
 * Inbound Email Schedule Ingestion Engine
 *
 * Implements:
 * 1. Cryptographic sender authentication (SPF/DKIM)
 * 2. Decoupled venue authorization & explicit club consent
 * 3. Private raw MIME evidence preservation
 * 4. Prohibition of recurring-date synthesis
 * 5. Isolation from public feeds until authenticated admin approval
 */

const crypto = require('crypto');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { validateSenderAuthentication, parseEmailPayload } = require('./email-parser');
const { defaultEmailConsentRegistry } = require('../network/email-consent');
const { defaultRawStorage } = require('../storage/raw-source-storage');
const { defaultSubmissionManager } = require('./submission-manager');

class InboundEmailIngestionEngine {
  constructor(options = {}) {
    this.consentRegistry = options.consentRegistry || defaultEmailConsentRegistry;
    this.rawStorage = options.rawStorage || defaultRawStorage;
    this.submissionManager = options.submissionManager || defaultSubmissionManager;
    this.quarantinedEmails = new Map(); // submissionId -> quarantineRecord
  }

  /**
   * Processes inbound email webhook payload
   */
  async processInboundEmail(payload = {}) {
    const {
      rawMime = '',
      headers = {},
      from = '',
      targetVenueId = null,
      subject = '',
      textBody = '',
      htmlBody = '',
      attachments = []
    } = payload;

    const senderEmail = from.replace(/^.*<([^>]+)>.*$/, '$1').trim().toLowerCase();
    const rawContent = rawMime || `Headers: ${JSON.stringify(headers)}\nFrom: ${from}\nSubject: ${subject}\nBody: ${textBody}`;
    const contentHash = crypto.createHash('sha256').update(rawContent).digest('hex').slice(0, 16);
    const submissionId = `sub_eml_${crypto.randomBytes(12).toString('hex')}`;

    // STAGE 1: Cryptographic Sender Authentication (SPF / DKIM)
    const authResult = validateSenderAuthentication(headers);
    if (!authResult.authenticated) {
      // Save private evidence of failed auth
      try {
        await this.rawStorage.saveRawEvidence({
          sourceId: `quarantine_${submissionId}`,
          content: rawContent,
          httpStatus: 403,
          parserStatus: 'sender_auth_failed',
          isPrivateEvidence: true,
          authResult
        });
      } catch (_) {}

      return {
        success: false,
        status: 'sender_auth_failed',
        error: authResult.error || 'Cryptographic sender authentication failed',
        candidateCount: 0,
        published: false
      };
    }

    // STAGE 2: Venue Authorization & Explicit Club Consent
    if (!targetVenueId || !this.consentRegistry.isVenueConsented(targetVenueId)) {
      const consentRecord = {
        submissionId,
        targetVenueId,
        senderEmail,
        status: 'consent_not_granted',
        contentHash,
        receivedAt: new Date().toISOString()
      };
      this.quarantinedEmails.set(submissionId, consentRecord);

      try {
        await this.rawStorage.saveRawEvidence({
          sourceId: `quarantine_${submissionId}`,
          content: rawContent,
          httpStatus: 403,
          parserStatus: 'consent_not_granted',
          isPrivateEvidence: true
        });
      } catch (_) {}

      return {
        success: false,
        status: 'consent_not_granted',
        error: `Explicit consent is not on file for venue: ${targetVenueId}`,
        candidateCount: 0,
        published: false
      };
    }

    // Verify sender authorization for this specific venue
    const isAuthorized = this.consentRegistry.isSenderAuthorizedForVenue(targetVenueId, senderEmail);
    if (!isAuthorized) {
      const authRecord = {
        submissionId,
        targetVenueId,
        senderEmail,
        status: 'unauthorized_sender',
        contentHash,
        receivedAt: new Date().toISOString()
      };
      this.quarantinedEmails.set(submissionId, authRecord);

      try {
        await this.rawStorage.saveRawEvidence({
          sourceId: `quarantine_${submissionId}`,
          content: rawContent,
          httpStatus: 403,
          parserStatus: 'unauthorized_sender',
          isPrivateEvidence: true
        });
      } catch (_) {}

      return {
        success: false,
        status: 'unauthorized_sender',
        error: `Sender ${senderEmail} is not authorized to submit for venue ${targetVenueId}`,
        candidateCount: 0,
        published: false
      };
    }

    const consent = this.consentRegistry.getConsentByVenueId(targetVenueId);

    // STAGE 3: Private Raw MIME Archival
    try {
      await this.rawStorage.saveRawEvidence({
        sourceId: `email_mime_${submissionId}`,
        content: rawContent,
        contentHash,
        httpStatus: 200,
        parserName: 'inbound_email_processor',
        parserStatus: 'pending_review',
        isPrivateEvidence: true,
        submitter: {
          email: senderEmail,
          venueId: targetVenueId,
          clubName: consent.clubName
        }
      });
    } catch (_) {}

    // STAGE 4: Deterministic Extraction (prohibiting recurring date synthesis)
    const venueOrTrack = {
      id: consent.venueId,
      name: consent.clubName,
      city: consent.city,
      state: consent.state,
      lat: consent.lat,
      lon: consent.lon
    };

    const parseResult = parseEmailPayload({
      headers,
      from,
      subject,
      textBody,
      htmlBody,
      attachments
    }, { venueOrTrack });

    if (parseResult.parsedEvents.length === 0) {
      return {
        success: false,
        status: 'no_valid_events_extracted',
        error: 'No valid dated events found. Note: recurring schedules without explicit dates are strictly prohibited.',
        unparsedPatterns: parseResult.unparsedPatterns,
        candidateCount: 0,
        published: false
      };
    }

    // STAGE 5: Record candidates in event_submissions queue (ISOLATED from canonical storage)
    const candidateEvents = parseResult.parsedEvents.map(ev => ({
      ...ev,
      submissionId,
      vertical: 'comedy',
      status: 'pending_review',
      candidateConfirmationStatus: 'organizer_confirmed',
      sourceType: 'inbound_email',
      venueOrTrack
    }));

    const submissionRecord = {
      submissionId,
      vertical: 'comedy',
      sourceType: 'inbound_email',
      venueId: targetVenueId,
      venueOrTrack,
      submitter: {
        name: consent.consentedBy?.name || 'Authorized Club Representative',
        email: senderEmail,
        role: 'club_organizer'
      },
      format: attachments.some(a => a.filename?.endsWith('.ics')) ? 'ics' : (attachments.some(a => a.filename?.endsWith('.csv')) ? 'csv' : 'email_body'),
      contentHash,
      status: 'pending_review',
      submittedAt: new Date().toISOString(),
      candidateCount: candidateEvents.length,
      candidates: candidateEvents,
      unparsedPatterns: parseResult.unparsedPatterns,
      reviewRecord: null
    };

    // Store in submissionManager queue
    this.submissionManager.submissions.set(submissionId, submissionRecord);

    try {
      const tmpFile = path.join(os.tmpdir(), `bb_sub_${submissionId}.json`);
      fs.writeFileSync(tmpFile, JSON.stringify(submissionRecord));
    } catch (_) {}

    // Public response returns receipt ONLY, NEVER capability tokens, ZERO canonical writes
    return {
      success: true,
      submissionId,
      venueId: targetVenueId,
      status: 'pending_review',
      candidateCount: candidateEvents.length,
      unparsedPatternsCount: parseResult.unparsedPatterns.length,
      contentHash,
      published: false
    };
  }
}

const defaultEmailIngestionEngine = new InboundEmailIngestionEngine();

module.exports = {
  InboundEmailIngestionEngine,
  defaultEmailIngestionEngine
};
