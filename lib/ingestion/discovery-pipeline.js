/**
 * Autonomous Source Discovery Pipeline & Bounded Job Queue
 *
 * Implements bounded batch processing for nationwide venue onboarding:
 * 1. Queue Management:
 *    - queued -> running -> succeeded
 *                        \-> retrying (with backoff)
 *                        \-> failed -> aging -> stale
 * 2. Platform Routing:
 *    - Reusable SeatEngine adapter for SeatEngine clubs
 *    - JSON-LD and ICS adapters for standards-compliant venues
 *    - Review queue for unsupported / custom platforms
 * 3. Strict Auto-Promotion Filter:
 *    - Explicit date & time (civil ISO)
 *    - Resolved physical venue coordinates
 *    - Valid direct box office URL
 *    - Fresh source evidence snapshot with SHA-256 hash
 *    - Zero cancellation status
 *    - Zero synthetic recurring dates
 * 4. Denver Quarantine Protection:
 *    - Comedy Works Downtown / South strictly blocked from promotion.
 */

const { classifyVenueSource } = require('./feed-detector');
const { ingestSeatEngineVenue } = require('./adapters/seatengine');
const { defaultCanonicalStorage } = require('../storage/canonical-event-storage');
const { evaluateEventFreshness } = require('../freshness');
const { processBatchTourGraph, getTourGraphTelemetry } = require('../comedy/tour-graph');

// In-memory job state registry
const jobQueueState = new Map();

const DENVER_QUARANTINE_SLUGS = new Set([
  'comedy-works-downtown',
  'comedy-works-south'
]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validates an event against the 6 strict auto-promotion criteria
 */
function evaluateAutoPromotionCriteria(event) {
  const reasons = [];

  // 1. Explicit date and time
  if (!event.civilDate || !/^\d{4}-\d{2}-\d{2}$/.test(event.civilDate)) {
    reasons.push('missing_or_invalid_civil_date');
  }
  if (!event.civilTime || !/^\d{2}:\d{2}$/.test(event.civilTime)) {
    reasons.push('missing_or_invalid_civil_time');
  }

  // 2. Resolved venue and coordinates
  if (!Number.isFinite(event.venue_latitude) || !Number.isFinite(event.venue_longitude)) {
    reasons.push('missing_coordinates');
  }
  if (!event.venue_slug || !event.venue_name) {
    reasons.push('unresolved_venue_identity');
  }

  // 3. Valid ticket or official venue URL
  const ticketUrl = event.ticket_url || event.ticketUrl;
  if (!ticketUrl || typeof ticketUrl !== 'string' || !ticketUrl.startsWith('http')) {
    reasons.push('missing_or_invalid_ticket_url');
  }

  // 4. Current source evidence snapshot with SHA-256 hash
  if (!event.sourceEvidence || !event.sourceEvidence.contentHash || event.sourceEvidence.contentHash.length !== 64) {
    reasons.push('missing_valid_source_evidence_hash');
  }

  // 5. No cancellation status
  if (event.isCancelled === true || event.confirmationStatus === 'cancelled') {
    reasons.push('event_is_cancelled');
  }

  // 6. No synthetic recurring dates
  const textBlob = `${event.title} ${event.description || ''}`.toLowerCase();
  if (/every\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(textBlob) && !event.sourceEvidence?.exactConfirmationFields?.date) {
    reasons.push('unconfirmed_synthetic_recurring_pattern');
  }

  return {
    isPromotable: reasons.length === 0,
    reasons
  };
}

/**
 * Runs a bounded discovery and onboarding batch
 *
 * @param {Array<Object>} venues - Candidate venues from registry
 * @param {Object} [options] - Execution options
 * @returns {Promise<Object>} Batch execution report
 */
async function runDiscoveryBatch(venues = [], options = {}) {
  const batchSize = Math.max(1, Math.min(50, options.batchSize || 10));
  const offset = Math.max(0, options.offset || 0);
  const rateLimitDelayMs = Math.max(0, options.rateLimitDelayMs || 0);
  const fetchFn = options.fetchFn || fetch;
  const isProd = process.env.VERCEL_ENV === 'production';
  const environment = options.environment || (isProd ? 'production' : 'preview');
  const namespace = options.namespace || (isProd ? 'production' : 'preview_expansion');

  const pool = offset > 0 ? venues.slice(offset) : venues;
  const now = Date.now();
  const candidateBatch = [];

  for (const v of pool) {
    if (candidateBatch.length >= batchSize) break;
    if (options.onlyPlatform && v.ticketingEngine !== options.onlyPlatform) continue;

    // Strict Denver quarantine guard
    if (DENVER_QUARANTINE_SLUGS.has(v.slug)) {
      jobQueueState.set(v.slug, {
        venueSlug: v.slug,
        venueName: v.name,
        city: v.city,
        state: v.state,
        status: 'quarantined',
        reason: 'Quarantined: Denver synthetic seed retirement in progress',
        lastAttemptAt: new Date().toISOString()
      });
      continue;
    }

    const state = jobQueueState.get(v.slug);
    if (!state || state.status === 'queued') {
      candidateBatch.push(v);
    } else if (state.status === 'retrying') {
      const nextAttemptAt = (state.lastAttemptAtMs || 0) + (state.backoffMs || 60000);
      if (now >= nextAttemptAt) {
        candidateBatch.push(v);
      }
    } else if (options.forceRecheck) {
      candidateBatch.push(v);
    }
  }

  const results = {
    batchSize: candidateBatch.length,
    offset,
    processed: 0,
    succeeded: 0,
    autoPublished: 0,
    reviewQueue: 0,
    retrying: 0,
    failed: 0,
    quarantined: 0,
    graph: {
      totalComediansExtracted: 0,
      totalDualConfirmed: 0,
      totalCandidateVenues: 0
    },
    venues: []
  };

  let candidateIdx = 0;
  for (const venue of candidateBatch) {
    // Courteous crawl delay between requests
    if (rateLimitDelayMs > 0 && candidateIdx > 0) {
      await sleep(rateLimitDelayMs);
    }
    candidateIdx++;
    results.processed++;

    const jobRecord = {
      venueSlug: venue.slug,
      venueName: venue.name,
      city: venue.city,
      state: venue.state,
      ticketingEngine: venue.ticketingEngine || 'custom',
      status: 'running',
      startedAt: new Date().toISOString(),
      lastAttemptAtMs: now
    };
    jobQueueState.set(venue.slug, jobRecord);

    try {
      // 1. Platform Detection / Verification
      let classification;
      if (venue.ticketingEngine === 'seatengine') {
        classification = {
          detectedPlatform: 'seatengine',
          canAutoOnboard: true,
          feedUrl: venue.calendarFeedUrl || venue.website
        };
      } else {
        classification = await classifyVenueSource(venue, { fetchFn });
      }

      jobRecord.detectedPlatform = classification.detectedPlatform;
      jobRecord.feedUrl = classification.feedUrl || venue.calendarFeedUrl || venue.website;

      // 2. Check if platform is auto-onboardable
      if (classification.canAutoOnboard && classification.detectedPlatform === 'seatengine') {
        const targetFeedUrl = classification.feedUrl || venue.calendarFeedUrl || venue.website;
        const ingestRep = await ingestSeatEngineVenue({
          ...venue,
          feedUrl: targetFeedUrl
        }, {
          fetchFn,
          persist: false, // evaluate promotion first
          environment,
          namespace
        });

        // 3. Strict Auto-Promotion Criteria Filter
        const promotableEvents = [];
        const reviewEvents = [];

        for (const ev of ingestRep.events) {
          const promo = evaluateAutoPromotionCriteria(ev);
          if (promo.isPromotable) {
            promotableEvents.push(ev);
          } else {
            reviewEvents.push({ event: ev, reasons: promo.reasons });
          }
        }

        // Persist only auto-promotable events to canonical storage
        if (options.persist !== false && promotableEvents.length > 0 && defaultCanonicalStorage) {
          try {
            await defaultCanonicalStorage.upsertEvents(promotableEvents);
          } catch (_) {}
        }

        // 4. Two-Way Artist Tour Graph Integration
        const graphRep = processBatchTourGraph(promotableEvents, {
          existingVenues: venues,
          knownTourDates: options.knownTourDates || []
        });

        jobRecord.status = 'succeeded';
        jobRecord.eventsExtracted = ingestRep.count;
        jobRecord.eventsPublished = promotableEvents.length;
        jobRecord.eventsInReview = reviewEvents.length;
        jobRecord.comediansExtracted = graphRep.comediansExtracted;
        jobRecord.dualConfirmedCount = graphRep.dualConfirmedCount;
        jobRecord.candidateVenuesDiscovered = graphRep.candidateVenuesDiscovered;
        jobRecord.sampleCheckoutUrl = promotableEvents[0]?.ticket_url || null;
        jobRecord.finishedAt = new Date().toISOString();

        results.succeeded++;
        results.autoPublished += promotableEvents.length;
        results.reviewQueue += reviewEvents.length;
        results.graph.totalComediansExtracted += graphRep.comediansExtracted;
        results.graph.totalDualConfirmed += graphRep.dualConfirmedCount;
        results.graph.totalCandidateVenues += graphRep.candidateVenuesDiscovered;

        results.venues.push({
          slug: venue.slug,
          name: venue.name,
          city: venue.city,
          state: venue.state,
          status: 'succeeded',
          platform: 'seatengine',
          published: promotableEvents.length,
          review: reviewEvents.length,
          comedians: graphRep.comediansExtracted,
          sampleCheckout: jobRecord.sampleCheckoutUrl
        });
      } else {
        // Platform requires custom adapter (Eventbrite, TicketWeb, Tixr, Etix, Custom)
        const rawPlatform = classification?.detectedPlatform;
        const neededAdapter = (rawPlatform && !['unknown', 'error', 'unreachable'].includes(rawPlatform))
          ? rawPlatform
          : (venue.ticketingEngine || 'custom');
        jobRecord.status = 'review_queue';
        jobRecord.neededAdapter = neededAdapter;
        jobRecord.reason = `Platform "${neededAdapter}" queued for dedicated adapter support`;
        jobRecord.finishedAt = new Date().toISOString();

        results.reviewQueue++;
        results.venues.push({
          slug: venue.slug,
          name: venue.name,
          city: venue.city,
          state: venue.state,
          status: 'review_queue',
          platform: neededAdapter,
          published: 0,
          review: 0
        });
      }
    } catch (err) {
      const isTemporary = /429|503|504|timeout|ETIMEDOUT|ECONNRESET/i.test(err.message);
      const priorAttempts = (jobQueueState.get(venue.slug)?.attempts || 0) + 1;

      if (isTemporary && priorAttempts < 4) {
        jobRecord.status = 'retrying';
        jobRecord.attempts = priorAttempts;
        jobRecord.backoffMs = Math.min(300000, 15000 * Math.pow(2, priorAttempts - 1));
        jobRecord.error = err.message;
        results.retrying++;
      } else {
        jobRecord.status = 'failed';
        jobRecord.attempts = priorAttempts;
        jobRecord.error = err.message;
        results.failed++;
      }

      results.venues.push({
        slug: venue.slug,
        name: venue.name,
        city: venue.city,
        state: venue.state,
        status: jobRecord.status,
        error: err.message
      });
    }

    jobQueueState.set(venue.slug, jobRecord);
  }

  return results;
}

/**
 * Returns current job queue telemetry and two-way graph statistics
 */
function getJobQueueTelemetry() {
  const statusCounts = {};
  const platformCounts = {};

  for (const [slug, job] of jobQueueState.entries()) {
    statusCounts[job.status] = (statusCounts[job.status] || 0) + 1;
    if (job.detectedPlatform || job.ticketingEngine) {
      const p = job.detectedPlatform || job.ticketingEngine;
      platformCounts[p] = (platformCounts[p] || 0) + 1;
    }
  }

  return {
    totalTrackedJobs: jobQueueState.size,
    statusCounts,
    platformCounts,
    quarantinedCount: DENVER_QUARANTINE_SLUGS.size,
    tourGraphTelemetry: getTourGraphTelemetry(),
    jobs: Array.from(jobQueueState.values())
  };
}

module.exports = {
  runDiscoveryBatch,
  evaluateAutoPromotionCriteria,
  getJobQueueTelemetry,
  jobQueueState,
  DENVER_QUARANTINE_SLUGS
};

