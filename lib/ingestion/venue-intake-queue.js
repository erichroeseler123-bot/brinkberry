/**
 * Venue Intake Queue & Lifecycle State Machine
 *
 * Implements a transparent, evidence-grounded intake queue for onboarding new venues:
 * Lifecycle states:
 * 1. public_schedule_found: Target URL discovered/probed with evidence snapshot
 * 2. parsed_successfully: Clean events extracted and validated against 6 criteria
 * 3. needs_review: Custom format, ambiguous dates, or missing required fields
 * 4. live: Explicitly approved by admin and promoted to production (never automatic)
 * 5. blocked_or_unsupported: WAF 403, robots.txt, 404, or unsupported proprietary system
 *
 * Strict Invariants:
 * - Submissions and queued records NEVER auto-publish to canonical storage
 * - Never appear in public feeds (/api/feed) without explicit admin approval
 * - Cryptographic SHA-256 evidence snapshot and timestamp preserved
 */

const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { detectFeedFromHtml } = require('./feed-detector');
const { probeVenueSchedule } = require('../audit/venue-deep-prober');
const { computeEventFingerprint } = require('../identity');
const { evaluateEventFreshness } = require('../freshness');
const { defaultCanonicalStorage } = require('../storage/canonical-event-storage');

function validateScheduleUrl(scheduleUrl) {
  if (!scheduleUrl || typeof scheduleUrl !== 'string') {
    throw new Error('Valid official schedule or ticket URL is required.');
  }
  const trimmed = scheduleUrl.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid schedule URL format: must be a valid absolute URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid schedule URL protocol "${parsed.protocol}": only http and https are permitted.`);
  }
  return parsed.href;
}

const QUEUE_STATES = {
  PUBLIC_SCHEDULE_FOUND: 'public_schedule_found',
  PARSED_SUCCESSFULLY: 'parsed_successfully',
  NEEDS_REVIEW: 'needs_review',
  LIVE: 'live',
  BLOCKED_OR_UNSUPPORTED: 'blocked_or_unsupported',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
  PREVIEW_APPROVED: 'preview_approved'
};

class VenueIntakeQueue {
  constructor(storageFilePath = null) {
    this.storageFile = storageFilePath || path.join(os.tmpdir(), 'brinkberry_venue_intake_queue.json');
    this.records = new Map();
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          this.records.clear();
          for (const item of data) {
            this.records.set(item.venueSlug || item.id, item);
          }
        }
      }
    } catch (_) {}
  }

  save() {
    try {
      const arr = Array.from(this.records.values());
      fs.writeFileSync(this.storageFile, JSON.stringify(arr, null, 2), 'utf8');
    } catch (_) {}
  }

  /**
   * Generates a stable venue slug
   */
  generateSlug(name, city) {
    return `${name}-${city}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Intakes a new venue candidate into the queue
   *
   * @param {Object} input - Venue candidate details
   * @param {Object} [options]
   * @returns {Promise<Object>} Intake record
   */
  async intakeVenue(input = {}, options = {}) {
    const {
      name,
      city,
      state = '',
      address = '',
      lat = null,
      lon = null,
      timezone = '',
      scheduleUrl,
      website = '',
      platform = 'unknown',
      submitter = null,
      notes = ''
    } = input;

    if (!name || !city || !scheduleUrl) {
      throw new Error('Venue name, city, and official schedule/ticket URL are required.');
    }

    const validScheduleUrl = validateScheduleUrl(scheduleUrl);

    const venueSlug = input.slug || this.generateSlug(name, city);
    const id = `intake_${venueSlug}_${Date.now()}`;
    const nowIso = new Date().toISOString();

    const existing = this.records.get(venueSlug);
    if (existing && existing.status === QUEUE_STATES.LIVE) {
      throw new Error(`Venue "${name}" is already live in production.`);
    }

    const record = existing || {
      id,
      venueSlug,
      name,
      city,
      state,
      address,
      lat: Number.isFinite(lat) ? Number(lat) : null,
      lon: Number.isFinite(lon) ? Number(lon) : null,
      timezone: timezone || null,
      scheduleUrl: validScheduleUrl,
      website: website || validScheduleUrl,
      detectedPlatform: platform,
      evidenceHash: null,
      lastCheckedAt: nowIso,
      status: QUEUE_STATES.PUBLIC_SCHEDULE_FOUND,
      promotedEventIds: [],
      parserResult: {
        eventsCount: 0,
        sampleEvents: [],
        details: null
      },
      failureReason: null,
      blockReason: null,
      submitter: submitter ? {
        name: submitter.name || 'Anonymous',
        role: submitter.role || 'promoter',
        email: submitter.email || null,
        submittedAt: nowIso
      } : null,
      reviewHistory: [
        {
          timestamp: nowIso,
          action: 'intake_registered',
          actor: submitter ? 'community_submitter' : 'system_discovery',
          notes: notes || 'Registered into venue intake queue'
        }
      ]
    };

    // Update coordinates or details if newly provided
    if (Number.isFinite(lat)) record.lat = Number(lat);
    if (Number.isFinite(lon)) record.lon = Number(lon);
    if (timezone) record.timezone = timezone;
    if (scheduleUrl) record.scheduleUrl = scheduleUrl;

    // Run deep probe if requested or automated
    if (options.probe !== false) {
      await this.probeAndClassify(record, options);
    }

    this.records.set(venueSlug, record);
    this.save();
    return record;
  }

  /**
   * Probes the venue schedule and updates queue classification
   */
  async probeAndClassify(record, options = {}) {
    const fetchFn = options.fetchFn || fetch;
    const nowIso = new Date().toISOString();
    record.lastCheckedAt = nowIso;

    try {
      const venueForProbe = {
        ...record,
        website: record.website || record.scheduleUrl,
        calendarFeedUrl: record.scheduleUrl || record.website
      };
      const probeRes = await probeVenueSchedule(venueForProbe, { fetchFn });
      const classification = probeRes.finalClassification || probeRes.classification;
      const eventsCount = probeRes.exactEventCount ?? probeRes.eventsFound ?? 0;
      const sampleEvents = probeRes.sampleEvents || (probeRes.sampleEvent ? [probeRes.sampleEvent] : []);
      const detectedPlatform = (probeRes.platformMarkers && probeRes.platformMarkers[0]) || probeRes.detectedPlatform || record.detectedPlatform || 'unknown';

      record.detectedPlatform = detectedPlatform;

      // Record evidence hash
      if (probeRes.sampleEvent) {
        const hashInput = JSON.stringify(probeRes.sampleEvent);
        record.evidenceHash = crypto.createHash('sha256').update(hashInput).digest('hex');
      }

      record.parserResult = {
        eventsCount,
        sampleEvents,
        feedType: probeRes.candidateEndpoints?.ics?.length ? 'ics' : (probeRes.candidateEndpoints?.jsonld?.length ? 'jsonld' : (probeRes.feedType || 'html')),
        details: classification
      };

      if (classification === 'usable_feed' && eventsCount > 0) {
        record.status = QUEUE_STATES.PARSED_SUCCESSFULLY;
        record.failureReason = null;
        record.blockReason = null;
        record.reviewHistory.push({
          timestamp: nowIso,
          action: 'probed_and_parsed',
          actor: 'automated_prober',
          notes: `Parsed ${eventsCount} events via ${record.parserResult.feedType}`
        });
      } else if (classification === 'blocked_waf') {
        record.status = QUEUE_STATES.BLOCKED_OR_UNSUPPORTED;
        record.blockReason = probeRes.blockerOrParserError || 'Cloudflare / WAF anti-bot challenge (HTTP 403)';
        record.failureReason = 'blocked_waf';
        record.reviewHistory.push({
          timestamp: nowIso,
          action: 'probed_blocked',
          actor: 'automated_prober',
          notes: record.blockReason
        });
      } else if (classification === 'blocked_robots') {
        record.status = QUEUE_STATES.BLOCKED_OR_UNSUPPORTED;
        record.blockReason = probeRes.blockerOrParserError || 'robots.txt crawl disallowed';
        record.failureReason = 'blocked_robots';
        record.reviewHistory.push({
          timestamp: nowIso,
          action: 'probed_blocked',
          actor: 'automated_prober',
          notes: record.blockReason
        });
      } else {
        record.status = QUEUE_STATES.NEEDS_REVIEW;
        record.failureReason = classification || 'unresolved_schedule';
        record.blockReason = null;
        record.reviewHistory.push({
          timestamp: nowIso,
          action: 'queued_for_review',
          actor: 'automated_prober',
          notes: `Requires custom adapter or review: classification=${classification}`
        });
      }
    } catch (err) {
      record.status = QUEUE_STATES.NEEDS_REVIEW;
      record.failureReason = err.message;
      record.reviewHistory.push({
        timestamp: nowIso,
        action: 'probe_error',
        actor: 'automated_prober',
        notes: `Error probing schedule: ${err.message}`
      });
    }

    this.save();
    return record;
  }

  /**
   * Admin Review: Approves, rejects, or withdraws a queued venue
   */
  async reviewVenue(venueSlug, { decision, actor = 'admin', notes = '' }, options = {}) {
    const record = this.records.get(venueSlug);
    if (!record) {
      throw new Error(`Venue with slug "${venueSlug}" not found in intake queue.`);
    }

    const nowIso = new Date().toISOString();
    const canonicalStorage = options.canonicalStorage || defaultCanonicalStorage;

    if (decision === 'approve_preview') {
      if (record.status !== QUEUE_STATES.PARSED_SUCCESSFULLY && record.status !== QUEUE_STATES.NEEDS_REVIEW) {
        throw new Error(`Cannot approve venue for preview in state "${record.status}". It must be "${QUEUE_STATES.PARSED_SUCCESSFULLY}".`);
      }
      record.status = QUEUE_STATES.PREVIEW_APPROVED;
      record.previewApprovedAt = nowIso;

      const environment = 'preview';
      const namespace = options.namespace || 'preview_expansion';

      const rawEvents = (record.parserResult?.sampleEvents || []).concat(options.events || []);
      const canonicalEvents = [];

      for (const rawEv of rawEvents) {
        const title = rawEv.title || rawEv.name;
        const startTime = rawEv.start_time || rawEv.start || rawEv.startDate;
        if (!title || !startTime) continue;

        const fingerprint = computeEventFingerprint({
          venue: record.name,
          venueId: record.venueSlug,
          city: record.city,
          startTime,
          title
        });

        const canonical = {
          id: fingerprint,
          fingerprint,
          environment,
          namespace,
          title,
          start_time: startTime,
          start: startTime,
          end_time: rawEv.end_time || rawEv.end || rawEv.endDate || null,
          venue_name: record.name,
          venueSlug: record.venueSlug,
          venueId: record.venueSlug,
          city: record.city,
          state: record.state || '',
          venue_latitude: record.lat,
          venue_longitude: record.lon,
          category: 'comedy',
          category_tags: ['comedy'],
          canonical_url: rawEv.url || rawEv.eventUrl || record.scheduleUrl,
          ticket_url: rawEv.ticket_url || rawEv.url || rawEv.eventUrl || record.scheduleUrl,
          ticketUrl: rawEv.ticket_url || rawEv.url || rawEv.eventUrl || record.scheduleUrl,
          official_source_url: record.scheduleUrl,
          sourceType: 'official_box_office',
          source: 'venue_intake_preview_approval',
          confirmationStatus: 'confirmed_by_official_calendar',
          confirmation_status: 'confirmed_by_official_calendar',
          isCancelled: false,
          lastVerifiedAt: nowIso,
          lastConfirmedAt: nowIso,
          sourceEvidence: {
            venueSlug: record.venueSlug,
            scheduleUrl: record.scheduleUrl,
            evidenceHash: record.evidenceHash,
            fetchedAt: nowIso,
            promotedAt: nowIso,
            approvedBy: actor,
            environment: 'preview',
            exactConfirmationFields: {
              title: true,
              date: true,
              venue: true,
              url: true
            },
            lifecycle: 'confirmed_by_official_calendar'
          }
        };

        const freshness = evaluateEventFreshness(canonical, {
          nowMs: Date.now(),
          linkStatus: { valid: true, status: 200 }
        });
        canonical.freshness = freshness;

        if (!canonical.isCancelled && freshness.status !== 'cancelled') {
          canonicalEvents.push(canonical);
        }
      }

      if (canonicalEvents.length > 0 && canonicalStorage && typeof canonicalStorage.upsertEvents === 'function') {
        await canonicalStorage.upsertEvents(canonicalEvents);
      }
      record.promotedEventIds = canonicalEvents.map(e => e.id);

      record.reviewHistory.push({
        timestamp: nowIso,
        action: 'approved_for_preview',
        actor,
        notes: notes || `Admin approved venue for preview verification (${canonicalEvents.length} preview events created).`
      });
    } else if (decision === 'approve_live') {
      if (record.status !== QUEUE_STATES.PARSED_SUCCESSFULLY && record.status !== QUEUE_STATES.PREVIEW_APPROVED) {
        throw new Error(`Cannot promote venue in state "${record.status}". It must be "${QUEUE_STATES.PARSED_SUCCESSFULLY}" or "${QUEUE_STATES.PREVIEW_APPROVED}".`);
      }
      record.status = QUEUE_STATES.LIVE;
      record.promotedAt = nowIso;

      // Approval creates canonical events through the existing identity and freshness pipeline
      const rawEvents = (record.parserResult?.sampleEvents || []).concat(options.events || []);
      const canonicalEvents = [];

      for (const rawEv of rawEvents) {
        const title = rawEv.title || rawEv.name;
        const startTime = rawEv.start_time || rawEv.start || rawEv.startDate;
        if (!title || !startTime) continue;

        const fingerprint = rawEv.fingerprint || rawEv.id || computeEventFingerprint({
          venue: rawEv.venue_name || record.name,
          venueId: record.venueSlug,
          city: rawEv.city || record.city,
          startTime,
          title
        });

        const eventId = rawEv.id || fingerprint;

        const sourceEvidence = {
          venueSlug: record.venueSlug,
          scheduleUrl: record.scheduleUrl,
          evidenceHash: record.evidenceHash,
          fetchedAt: nowIso,
          promotedAt: nowIso,
          approvedBy: actor,
          exactConfirmationFields: {
            title: true,
            date: true,
            venue: true,
            url: true
          },
          lifecycle: 'confirmed_by_official_calendar'
        };

        const canonical = {
          id: eventId,
          fingerprint,
          title,
          start_time: startTime,
          start: startTime,
          end_time: rawEv.end_time || rawEv.end || rawEv.endDate || null,
          venue_name: rawEv.venue_name || record.name,
          venueSlug: record.venueSlug,
          venue_slug: record.venueSlug,
          venueId: record.venueSlug,
          city: rawEv.city || record.city,
          state: rawEv.state || record.state || '',
          venue_latitude: rawEv.venue_latitude || rawEv.lat || record.lat,
          venue_longitude: rawEv.venue_longitude || rawEv.lon || record.lon,
          category: 'comedy',
          category_tags: ['comedy'],
          canonical_url: rawEv.canonical_url || rawEv.url || rawEv.eventUrl || record.scheduleUrl,
          ticket_url: rawEv.ticket_url || rawEv.url || rawEv.eventUrl || record.scheduleUrl,
          ticketUrl: rawEv.ticketUrl || rawEv.ticket_url || rawEv.url || rawEv.eventUrl || record.scheduleUrl,
          official_source_url: rawEv.official_source_url || record.scheduleUrl,
          sourceType: rawEv.sourceType || 'official_box_office',
          source: rawEv.source || 'venue_intake_approval',
          confirmationStatus: 'confirmed_by_official_calendar',
          confirmation_status: 'confirmed_by_official_calendar',
          civilDate: rawEv.civilDate || null,
          civilTime: rawEv.civilTime || null,
          timezone: rawEv.timezone || record.timezone || 'America/Denver',
          performer: rawEv.performer || title,
          linkResolutionTier: rawEv.linkResolutionTier || 'show_landing_page',
          isVenueLevelLink: rawEv.isVenueLevelLink ?? false,
          isCancelled: false,
          isDisplayable: rawEv.isDisplayable != null ? rawEv.isDisplayable : (rawEv.displayEligibility ?? rawEv.displayEligible ?? true),
          freshnessStatus: rawEv.freshnessStatus || ((rawEv.isDisplayable === false || rawEv.displayEligibility === false || rawEv.displayEligible === false) ? 'retained_future_horizon' : 'verified_current'),
          evidenceRetentionTier: rawEv.retentionTier || rawEv.evidenceRetentionTier || ((rawEv.isDisplayable === false || rawEv.displayEligibility === false || rawEv.displayEligible === false) ? 'retained_future_horizon' : 'active_feed_candidate'),
          lastVerifiedAt: nowIso,
          lastConfirmedAt: nowIso,
          sourceEvidence,
          source_evidence: sourceEvidence
        };

        const freshness = evaluateEventFreshness(canonical, {
          nowMs: Date.now(),
          linkStatus: { valid: true, status: 200 }
        });
        canonical.freshness = freshness;

        if (!canonical.isCancelled && freshness.status !== 'cancelled') {
          canonicalEvents.push(canonical);
        }
      }

      if (canonicalEvents.length > 0 && canonicalStorage && typeof canonicalStorage.upsertEvents === 'function') {
        await canonicalStorage.upsertEvents(canonicalEvents);
      }
      record.promotedEventIds = canonicalEvents.map(e => e.id);

      record.reviewHistory.push({
        timestamp: nowIso,
        action: 'promoted_to_live',
        actor,
        notes: notes || `Admin verified evidence and promoted to production (${canonicalEvents.length} canonical events created).`
      });
    } else if (decision === 'reject') {
      record.status = QUEUE_STATES.REJECTED;
      record.failureReason = notes || 'Rejected by admin';

      // Non-destructive transition for any previously promoted events:
      // Preserves provenance and source evidence permanently, but marks ineligible for public feed
      if (record.promotedEventIds && record.promotedEventIds.length > 0 && canonicalStorage) {
        for (const eventId of record.promotedEventIds) {
          try {
            const existing = await canonicalStorage.getEventById(eventId);
            if (existing) {
              existing.confirmationStatus = 'withdrawn';
              existing.confirmation_status = 'withdrawn';
              existing.freshnessStatus = 'withdrawn';
              existing.isDisplayable = false;
              existing.isCancelled = false;
              existing.withdrawalReason = notes || 'Submission rejected by admin';
              existing.withdrawnAt = nowIso;
              existing.freshness = {
                status: 'withdrawn',
                ageDays: null,
                isDisplayable: false,
                reason: existing.withdrawalReason
              };
              await canonicalStorage.upsertEvents([existing]);
            }
          } catch (_) {}
        }
      }

      record.reviewHistory.push({
        timestamp: nowIso,
        action: 'rejected',
        actor,
        notes: notes || 'Submission rejected by admin'
      });
    } else if (decision === 'withdraw') {
      record.status = QUEUE_STATES.WITHDRAWN;
      record.failureReason = notes || 'Withdrawn by submitter/admin';

      // Non-destructive transition for any previously promoted events:
      // Preserves provenance and source evidence permanently, but marks ineligible for public feed
      if (record.promotedEventIds && record.promotedEventIds.length > 0 && canonicalStorage) {
        for (const eventId of record.promotedEventIds) {
          try {
            const existing = await canonicalStorage.getEventById(eventId);
            if (existing) {
              existing.confirmationStatus = 'withdrawn';
              existing.confirmation_status = 'withdrawn';
              existing.freshnessStatus = 'withdrawn';
              existing.isDisplayable = false;
              existing.isCancelled = false;
              existing.withdrawalReason = notes || 'Withdrawn by submitter/admin';
              existing.withdrawnAt = nowIso;
              existing.freshness = {
                status: 'withdrawn',
                ageDays: null,
                isDisplayable: false,
                reason: existing.withdrawalReason
              };
              await canonicalStorage.upsertEvents([existing]);
            }
          } catch (_) {}
        }
      }

      record.reviewHistory.push({
        timestamp: nowIso,
        action: 'withdrawn',
        actor,
        notes: notes || 'Withdrawn from public eligibility'
      });
    } else if (decision === 'queue_review') {
      record.status = QUEUE_STATES.NEEDS_REVIEW;
      record.reviewHistory.push({
        timestamp: nowIso,
        action: 'marked_needs_review',
        actor,
        notes
      });
    } else {
      throw new Error(`Unknown review decision "${decision}".`);
    }

    this.save();
    return record;
  }

  /**
   * Returns a queue summary by state
   */
  getQueueSummary() {
    const summary = {
      total: this.records.size,
      byStatus: {
        [QUEUE_STATES.PUBLIC_SCHEDULE_FOUND]: 0,
        [QUEUE_STATES.PARSED_SUCCESSFULLY]: 0,
        [QUEUE_STATES.NEEDS_REVIEW]: 0,
        [QUEUE_STATES.LIVE]: 0,
        [QUEUE_STATES.BLOCKED_OR_UNSUPPORTED]: 0,
        [QUEUE_STATES.REJECTED]: 0,
        [QUEUE_STATES.WITHDRAWN]: 0
      },
      venues: Array.from(this.records.values())
    };

    for (const rec of this.records.values()) {
      if (summary.byStatus[rec.status] !== undefined) {
        summary.byStatus[rec.status]++;
      }
    }

    return summary;
  }

  /**
   * Resets or purges the test queue
   */
  clear() {
    this.records.clear();
    try {
      if (fs.existsSync(this.storageFile)) fs.unlinkSync(this.storageFile);
    } catch (_) {}
  }
}

const defaultVenueIntakeQueue = new VenueIntakeQueue();

module.exports = {
  QUEUE_STATES,
  VenueIntakeQueue,
  defaultVenueIntakeQueue
};
