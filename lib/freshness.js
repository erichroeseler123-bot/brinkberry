/**
 * Time-Based Freshness Decay & Evidence Evaluation Engine
 *
 * Verification status is dynamically computed from age and source evidence:
 * - verified_current: Fresh source evidence within category TTL
 * - aging: Beyond fresh TTL, pending reverification
 * - stale: Beyond aging limit, confirmation expired
 * - unlinked: Source confirmation failed or broken link
 * - cancelled: Explicitly cancelled or removed from box office
 * - unknown: No verification timestamp or provenance
 *
 * Prevents venue homepage HTTP 200 from renewing an event date indefinitely.
 */

const TTL_CONFIG = {
  comedy_headliner: {
    freshDays: 7,
    agingDays: 14,
    description: 'Touring & club headliners require weekly schedule confirmation'
  },
  open_mic: {
    freshDays: 7,
    agingDays: 14,
    description: 'Weekly open mics require weekly verification before next occurrence'
  },
  race_single_event: {
    freshDays: 3,
    agingDays: 7,
    description: 'Single-event races require race-week confirmation for weather/schedule adjustments'
  },
  race_recurring_schedule: {
    freshDays: 14,
    agingDays: 30,
    description: 'Bi-weekly and monthly grassroots short track points races'
  },
  season_schedule: {
    freshDays: 30,
    agingDays: 60,
    description: 'Full season master calendars published annually'
  },
  default: {
    freshDays: 7,
    agingDays: 14,
    description: 'Standard local event schedule'
  }
};

/**
 * Resolves TTL profile based on event characteristics
 */
function resolveTtlProfile(event = {}) {
  if (event.category === 'racing' || event.racing) {
    if (event.racing?.sanction || event.title?.includes('Nationals') || event.title?.includes('Shootout')) {
      return TTL_CONFIG.race_single_event;
    }
    if (event.recurring) {
      return TTL_CONFIG.race_recurring_schedule;
    }
    return TTL_CONFIG.race_single_event;
  }

  if (event.category === 'comedy' || event.comedy) {
    if (event.comedy?.showType === 'open_mic' || /open\s*mic/i.test(event.title || '')) {
      return TTL_CONFIG.open_mic;
    }
    if (event.comedy?.showType === 'headliner' || event.comedy?.showType === 'showcase') {
      return TTL_CONFIG.comedy_headliner;
    }
    return TTL_CONFIG.comedy_headliner;
  }

  return TTL_CONFIG.default;
}

const SOURCE_CONFIRMATION_TAXONOMY = {
  OFFICIAL_CALENDAR: 'confirmed_by_official_calendar',
  OFFICIAL_EMAIL: 'confirmed_by_official_email',
  AGGREGATOR: 'confirmed_by_aggregator',
  OFFICIAL_SOCIAL: 'official_social_evidence',
  EXTERNAL_DIRECTORY: 'unconfirmed_external_source',
  COMMUNITY: 'community_submitted'
};

/**
 * Evaluates the freshness decay status of an event
 *
 * @param {Object} event - The event object
 * @param {Object} options - Verification context
 * @returns {Object} { status, ageDays, ttlDays, isDisplayable }
 */
function evaluateEventFreshness(event = {}, options = {}) {
  // 1. Check explicit cancellation, withdrawal, or retained future horizon
  if (event.freshnessStatus === 'retained_future_horizon' || event.evidenceRetentionTier === 'retained_future_horizon') {
    return {
      status: 'retained_future_horizon',
      ageDays: 0,
      isDisplayable: false,
      reason: 'Event is retained beyond active feed display horizon'
    };
  }

  if (
    event.isCancelled ||
    event.is_cancelled ||
    event.event_status === 'cancelled' ||
    event.confirmationStatus === 'withdrawn' ||
    event.confirmation_status === 'withdrawn' ||
    event.freshnessStatus === 'withdrawn' ||
    event.isDisplayable === false
  ) {
    const isWithdrawn = event.confirmationStatus === 'withdrawn' ||
      event.confirmation_status === 'withdrawn' ||
      event.freshnessStatus === 'withdrawn' ||
      event.isDisplayable === false;
    return {
      status: isWithdrawn ? 'withdrawn' : 'cancelled',
      ageDays: null,
      isDisplayable: false,
      reason: event.withdrawalReason || (isWithdrawn ? 'Event was withdrawn from public eligibility' : 'Event was cancelled or withdrawn')
    };
  }

  // 2. Reject unconfirmed seeds, venue presence, unconfirmed external directories, and organizer-only without admin review
  if (
    event.confirmationStatus === 'venue_presence_only' ||
    event.confirmationStatus === 'unconfirmed_seed' ||
    event.confirmationStatus === 'unconfirmed_external_source' ||
    event.confirmationStatus === 'organizer_confirmed' ||
    event.sourceType === 'venue_presence'
  ) {
    return {
      status: 'unconfirmed',
      ageDays: null,
      isDisplayable: false,
      reason: event.confirmationStatus === 'organizer_confirmed'
        ? 'Organizer confirmation pending required admin review'
        : (event.confirmationStatus === 'unconfirmed_external_source'
            ? 'Third-party directory source without independent confirmation'
            : 'Unconfirmed seed or venue presence only')
    };
  }

  // 3. Check source URL health
  if (options.linkStatus && !options.linkStatus.valid) {
    return {
      status: 'unlinked',
      ageDays: null,
      isDisplayable: false,
      reason: `Source URL is broken or unreachable (${options.linkStatus.reason || 'failed'})`
    };
  }

  // 4. Commercial aggregator feeds with real provider evidence
  const isAggregator = event.confirmationStatus === 'confirmed_by_aggregator' ||
    ['seatgeek', 'ticketmaster', 'paris_opendata'].includes(event.source);

  if (isAggregator) {
    const hasAggregatorEvidence = Boolean(
      event.sourceEvidence ||
      event.providerEvidence ||
      ['seatgeek', 'ticketmaster', 'paris_opendata'].includes(event.source) ||
      (Array.isArray(event.sources) && event.sources.some(s => ['seatgeek', 'ticketmaster', 'paris_opendata'].includes(s.source || s.provider)))
    );

    if (!hasAggregatorEvidence) {
      return {
        status: 'unconfirmed',
        ageDays: null,
        isDisplayable: false,
        reason: 'Aggregator event missing required provider evidence'
      };
    }

    return {
      status: 'verified_current',
      ageDays: 0,
      isDisplayable: true,
      reason: 'Live ticketing network on-sale confirmation'
    };
  }

  // 5. Official calendar or official email confirmation requires exact fetched source evidence
  if (
    event.confirmationStatus === 'confirmed_by_official_calendar' ||
    event.confirmationStatus === 'confirmed_by_official_email'
  ) {
    const evidence = event.sourceEvidence || event.sources?.find(s => s.sourceEvidence)?.sourceEvidence;
    const hasExactEvidence = Boolean(
      (evidence &&
       evidence.exactConfirmationFields &&
       evidence.exactConfirmationFields.title === true &&
       evidence.exactConfirmationFields.date === true) ||
      (Array.isArray(event.sources) && event.sources.some(s => s.status === 'confirmed'))
    );

    if (!hasExactEvidence) {
      return {
        status: 'unconfirmed',
        ageDays: null,
        isDisplayable: false,
        reason: `Missing exact fetched source evidence for ${event.confirmationStatus}`
      };
    }
  }

  // 5b. Public community listing or official government calendar confirmation
  if (
    event.confirmationStatus === 'public_community_listing' ||
    event.confirmationStatus === 'official_government_calendar'
  ) {
    const hasSource = Boolean(
      event.sourceEvidence ||
      event.provenance?.sourceUrl ||
      event.provenance?.feedUrl ||
      event.canonical_url
    );
    if (!hasSource) {
      return {
        status: 'unconfirmed',
        ageDays: null,
        isDisplayable: false,
        reason: `Missing public source URL for ${event.confirmationStatus}`
      };
    }
  }

  // 6. Public social evidence requires review or calendar corroboration
  if (event.confirmationStatus === 'official_social_evidence') {
    const isCorroborated = Boolean(event.isReviewed || event.reviewRecord || event.corroborated);
    if (!isCorroborated) {
      return {
        status: 'pending_review',
        ageDays: null,
        isDisplayable: false,
        reason: 'Public social post evidence pending review or calendar corroboration'
      };
    }
  }

  // 5c. Autonomous community post: immediately displayable without admin review
  if (event.source === 'community_post' || event.isAutonomousCommunityPost === true) {
    const hasDate = Boolean(event.start_time || event.start);
    if (!hasDate) {
      return {
        status: 'unconfirmed',
        ageDays: null,
        isDisplayable: false,
        reason: 'Community post missing event date'
      };
    }
    return {
      status: 'verified_current',
      ageDays: 0,
      isDisplayable: true,
      reason: 'Live autonomous community submission'
    };
  }

  // 6. Curated community submitted or admin-verified confirmation requires real submitted date and review record
  if (
    event.confirmationStatus === 'community_submitted' ||
    event.confirmationStatus === 'verified_community' ||
    event.confirmationStatus === 'admin_verified'
  ) {
    const hasDate = Boolean(event.start_time || event.start || event.submittedDate);
    const hasReview = Boolean(
      event.reviewRecord ||
      event.review_record ||
      event.verification?.reviewRecord ||
      event.verification?.reviewedBy ||
      event.reviewedAt ||
      event.provenance?.reviewedBy ||
      event.provenance?.approvedAt ||
      event.community?.status === 'approved'
    );

    if (!hasDate || !hasReview) {
      return {
        status: 'unconfirmed',
        ageDays: null,
        isDisplayable: false,
        reason: 'Submission missing valid event date or review record'
      };
    }
  }

  // 7. Resolve verification timestamp
  const verifiedAt = event.lastVerifiedAt || event.last_verified_at || event.verification?.lastVerifiedAt || event.provenance?.fetchedAt || event.sourceEvidence?.fetchedAt || null;
  if (!verifiedAt) {
    return {
      status: 'unknown',
      ageDays: null,
      isDisplayable: false,
      reason: 'No verified source timestamp recorded'
    };
  }

  const verifiedTime = new Date(verifiedAt).getTime();
  if (isNaN(verifiedTime)) {
    return {
      status: 'unknown',
      ageDays: null,
      isDisplayable: false,
      reason: 'Invalid verification timestamp'
    };
  }

  const now = options.nowMs || Date.now();
  const ageDays = Number(((now - verifiedTime) / (86400 * 1000)).toFixed(1));

  // 8. Evaluate against TTL profile
  const profile = resolveTtlProfile(event);

  if (ageDays <= profile.freshDays) {
    return {
      status: 'verified_current',
      ageDays,
      freshLimitDays: profile.freshDays,
      isDisplayable: true,
      reason: `Fresh confirmation within ${profile.freshDays}-day TTL`
    };
  }

  if (ageDays <= profile.agingDays) {
    return {
      status: 'aging',
      ageDays,
      freshLimitDays: profile.freshDays,
      agingLimitDays: profile.agingDays,
      isDisplayable: true,
      reason: `Verification aging (${ageDays} days old); pending reverification`
    };
  }

  return {
    status: 'stale',
    ageDays,
    freshLimitDays: profile.freshDays,
    agingLimitDays: profile.agingDays,
    isDisplayable: false,
    reason: `Verification expired (${ageDays} days old exceeds ${profile.agingDays}-day limit)`
  };
}

module.exports = {
  TTL_CONFIG,
  SOURCE_CONFIRMATION_TAXONOMY,
  resolveTtlProfile,
  evaluateEventFreshness
};
