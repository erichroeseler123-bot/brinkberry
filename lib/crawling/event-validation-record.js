/**
 * lib/crawling/event-validation-record.js
 *
 * Strict Deterministic Event-Validation Pipeline & Provenance Record
 *
 * Decoupled from crawl execution:
 * - Crawl Ledger: "We crawled this source successfully" (HTTP 200, parsed, throttled)
 * - Event Validation: "This source produced a publishable event" (12 deterministic gates)
 *
 * Invariants:
 * 1. An event is NEVER publishable just because crawl status is "parsed".
 * 2. Artist-only discoveries are strictly leads ('unconfirmed_lead'), NEVER public events.
 * 3. 12 Deterministic Gates must ALL pass for publication eligibility:
 *    - Gate 1: hasExplicitCivilDate (strict YYYY-MM-DD, real calendar date; rejects Feb 30, April 31)
 *    - Gate 2: hasExactCivilTime (strict 24h HH:MM; rejects generic, empty, or out-of-range times)
 *    - Gate 3: hasValidIanaTimezone (valid IANA timezone string)
 *    - Gate 4: hasStrictDateTimeRoundTrip (rejects nonexistent spring-forward times & ambiguous fall-back times)
 *    - Gate 5: hasKnownVenueIdentity (valid venue name and verified venue identity)
 *    - Gate 6: hasOfficialSourceUrl (valid official box office or schedule URL)
 *    - Gate 7: hasDirectOrShowLandingPage (direct_checkout or show_landing_page, not venue_calendar)
 *    - Gate 8: hasSafeUrlAndRedirectChain (audited host-by-host; rejects secondary resellers and unsafe params)
 *    - Gate 9: hasCryptographicEvidenceHashes (source SHA-256 AND distinct ticket SHA-256)
 *    - Gate 10: isNotSyntheticRecurring (rejects "Every Tuesday" regex synthesis)
 *    - Gate 11: isWithinPublicationWindow (future or today, within reasonable booking window)
 *    - Gate 12: hasExactPerformerIdentity (conservative versioned normalization; non-generic performer)
 *
 * Publication Invariant:
 * validation_passed (12 gates)
 * + official venue source
 * + valid direct/show-level ticket path
 * + venue approved
 * + explicit admin approval
 * = eligible for canonical publication
 */

const crypto = require('node:crypto');
const { computeEventFingerprint } = require('../identity');
const { validateUrlSafety, isUnauthorizedResellerHost } = require('./ticket-probe');
const { calculateIanaBounds } = require('../timezone');
const {
  classifyVenueApproval,
  VENUE_APPROVAL_STATUSES,
  REVIEW_QUEUE_ACTIONS
} = require('./venue-classification');

const PERFORMER_IDENTITY_VERSION = 'v1';
const DEFAULT_PUBLIC_FEED_HORIZON_DAYS = 14;

const PUBLICATION_TIERS = {
  CONFIRMED_DUAL_OFFICIAL: 'confirmed_by_dual_official_sources',
  CONFIRMED_OFFICIAL_CALENDAR: 'confirmed_by_official_calendar',
  UNCONFIRMED_LEAD: 'unconfirmed_lead'
};

const LINK_RESOLUTION_TIERS = {
  DIRECT_CHECKOUT: 'direct_checkout',
  SHOW_LANDING_PAGE: 'show_landing_page',
  VENUE_CALENDAR: 'venue_calendar'
};

/**
 * Validates calendar date strictly:
 * Must match YYYY-MM-DD format and correspond to a genuine calendar date.
 * Rejects nonexistent dates like 2027-02-30 or 2027-04-31.
 */
function isValidCalendarDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const d = parseInt(dayStr, 10);

  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;

  // Strict calendar day verification via UTC constructor
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y &&
         check.getUTCMonth() === (m - 1) &&
         check.getUTCDate() === d;
}

/**
 * Validates 24-hour civil time strictly:
 * Must match HH:MM with hours 00-23 and minutes 00-59.
 */
function isValidCivilTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return false;
  const match = timeStr.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return Boolean(match);
}

/**
 * Formats a Date object in a specific IANA timezone into civil components
 */
function getLocalCivilString(utcDate, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(utcDate);

  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === '24' ? '00' : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
}

/**
 * Strict IANA Date/Time Round-Trip & DST Transition Validator:
 * - Detects nonexistent times during spring-forward gap (e.g. 2:30 AM jumps to 3:00 AM) -> REJECT
 * - Detects ambiguous times during fall-back repeat (e.g. 1:30 AM repeats) -> REJECT unless explicit numeric offset supplied
 * - Ordinary standard and daylight dates round-trip accurately -> PASS
 */
function validateDateTimeRoundTrip(dateStr, timeStr, timezone, explicitStartIso = null) {
  if (!isValidCalendarDate(dateStr) || !isValidCivilTime(timeStr)) {
    return { valid: false, reason: 'invalid_date_or_time_syntax' };
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch (_) {
    return { valid: false, reason: 'invalid_iana_timezone' };
  }

  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  const targetCivil = `${dateStr}T${timeStr}`;

  // If source explicitly supplied a numeric UTC offset in start ISO (e.g. -06:00 or -07:00)
  const hasExplicitOffset = explicitStartIso && /([+-]\d{2}:\d{2}|Z)$/.test(explicitStartIso);

  // Search for UTC candidate timestamps that produce targetCivil in target timezone
  // Candidate offsets range between UTC-12 and UTC+14 (in 15-minute increments)
  const baseUtc = Date.UTC(y, m - 1, d, h, min);
  const matchingCandidates = [];

  for (let offsetMinutes = -840; offsetMinutes <= 840; offsetMinutes += 15) {
    const candidateUtc = new Date(baseUtc - offsetMinutes * 60000);
    const local = getLocalCivilString(candidateUtc, timezone);
    if (local === targetCivil) {
      matchingCandidates.push(candidateUtc);
    }
  }

  if (matchingCandidates.length === 0) {
    // Nonexistent time caused by spring-forward clock jump (e.g. 2:30 AM on DST transition day)
    return {
      valid: false,
      reason: 'nonexistent_spring_forward_time_gap',
      targetCivil,
      timezone
    };
  }

  if (matchingCandidates.length > 1 && !hasExplicitOffset) {
    // Ambiguous time during fall-back repeat, and no explicit offset was provided by source
    return {
      valid: false,
      reason: 'ambiguous_fall_back_time_without_offset',
      targetCivil,
      timezone
    };
  }

  return {
    valid: true,
    resolvedUtcDate: matchingCandidates[0],
    matchesCount: matchingCandidates.length
  };
}

/**
 * Evaluates whether an event falls inside the active product feed window.
 * Decouples display eligibility from structural validation.
 *
 * Supported window configurations:
 * - window: '48h' | 'tonight' | 'tomorrow' | 'this_weekend' | 'next_weekend' | '30d' | 'season' | 'all'
 * - window: '14d' (or horizonDays: 14)
 * - explicit windowStart & windowEnd
 */
function evaluateDisplayHorizon(dateStr, timeStr, timezone = 'America/Denver', resolvedUtcDate = null, options = {}) {
  const now = options.now || new Date();
  let todayCivil;
  try {
    todayCivil = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);
  } catch (_) {
    todayCivil = now.toISOString().slice(0, 10);
  }

  const isPast = Boolean(dateStr && dateStr < todayCivil);

  // Resolve window bounds
  let windowStart = now;
  let windowEnd;

  if (options.windowStart && options.windowEnd) {
    windowStart = new Date(options.windowStart);
    windowEnd = new Date(options.windowEnd);
  } else if (options.horizonDays) {
    windowStart = now;
    windowEnd = new Date(now.getTime() + options.horizonDays * 86400e3);
  } else if (typeof options.window === 'string' && /^\d+d$/.test(options.window)) {
    const days = parseInt(options.window, 10);
    windowStart = now;
    windowEnd = new Date(now.getTime() + days * 86400e3);
  } else if (typeof options.horizon === 'string' && /^\d+d$/.test(options.horizon)) {
    const days = parseInt(options.horizon, 10);
    windowStart = now;
    windowEnd = new Date(now.getTime() + days * 86400e3);
  } else if (options.window || options.horizon) {
    const windowName = options.window || options.horizon;
    try {
      const bounds = calculateIanaBounds(windowName, timezone, now);
      windowStart = bounds[0];
      windowEnd = bounds[1];
    } catch (_) {
      windowEnd = new Date(now.getTime() + 365 * 86400e3);
    }
  } else {
    windowStart = now;
    windowEnd = new Date(now.getTime() + DEFAULT_PUBLIC_FEED_HORIZON_DAYS * 86400e3);
  }

  // Calculate event target UTC time
  let eventTimeUtc = 0;
  if (resolvedUtcDate instanceof Date && !isNaN(resolvedUtcDate.getTime())) {
    eventTimeUtc = resolvedUtcDate.getTime();
  } else if (dateStr) {
    eventTimeUtc = new Date(`${dateStr}T${timeStr || '19:00'}:00Z`).getTime();
  }

  const startMs = windowStart.getTime();
  const endMs = windowEnd.getTime();

  const isDisplayEligible = !isPast && eventTimeUtc >= startMs && eventTimeUtc <= endMs;
  const isFutureBeyondWindow = !isPast && eventTimeUtc > endMs;

  return {
    isPast,
    isDisplayEligible,
    isFutureBeyondWindow,
    windowStart,
    windowEnd
  };
}

function isWithinPublicationWindow(dateStr, timezone = 'America/Denver', options = {}) {
  const evalRes = evaluateDisplayHorizon(dateStr, '20:00', timezone, null, options);
  if (evalRes.isPast) return { valid: false, reason: 'event_in_the_past', retentionTier: 'retained_historical' };
  if (evalRes.isFutureBeyondWindow) return { valid: false, reason: 'event_beyond_public_horizon', retentionTier: 'retained_future_horizon' };
  return { valid: true, reason: 'within_planning_horizon', retentionTier: 'active_feed_candidate' };
}

/**
 * Conservative, Versioned Performer Normalization
 *
 * Requirements:
 * - Preserves legitimate hyphens (e.g. "Jean-Luc" remains "jean-luc")
 * - Versioned for deterministic tracking ('v1')
 * - Does not collapse distinct titles/shows:
 *   "Jean-Luc", "Mark Normand", "Mark Normand Live", "Mark Normand: Ya Don't Say"
 *   all maintain distinct identities.
 */
function normalizePerformerIdentity(rawName = '') {
  if (!rawName || typeof rawName !== 'string') return '';
  const trimmed = rawName.trim();
  if (!trimmed) return '';

  return trimmed
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove accent marks
    .toLowerCase()
    .replace(/[^\w\s-']/g, '')      // keep letters, digits, whitespace, hyphens, and apostrophes
    .replace(/\s+/g, ' ')           // collapse extra whitespace
    .trim();
}

/**
 * Evaluates an extracted event against the 12 Strict Deterministic Validation Gates
 *
 * @param {Object} rawEvent - Parsed event from source adapter
 * @param {Object} crawlContext - Context from CrawlLedger record
 * @param {Object} [ticketProbeResult] - Separate ticket probe audit result
 * @param {Object} [approvalContext] - Venue/admin approval metadata
 * @returns {Object} EventValidationRecord
 */
function validateExtractedEvent(rawEvent = {}, crawlContext = {}, ticketProbeResult = {}, approvalContext = {}) {
  const {
    id: crawlLedgerId = null,
    canonicalUrl = '',
    sourceKind = 'venue',
    contentHash: sourceResponseHash = null,
    parserName = 'unknown_parser',
    parserVersion = '1.0'
  } = crawlContext;

  const validationRunId = `vr_${crypto.randomBytes(8).toString('hex')}`;
  const nowIso = new Date().toISOString();

  // 1. Performer & Title Extraction
  const rawPerformer = String(rawEvent.performer || rawEvent.title || '').trim();
  const normalizedPerformer = normalizePerformerIdentity(rawPerformer);

  // 2. Venue Identity
  const venueName = String(rawEvent.venue_name || rawEvent.venue || crawlContext.venueName || '').trim();
  const venueSlug = rawEvent.venue_slug || rawEvent.venueSlug || crawlContext.venueSlug || null;
  const city = rawEvent.city || crawlContext.city || '';
  const state = rawEvent.state || crawlContext.state || '';

  // 3. Date & Time Parsing
  const rawCivilDate = rawEvent.civilDate || (rawEvent.start ? rawEvent.start.slice(0, 10) : '');
  const rawCivilTime = rawEvent.civilTime || (rawEvent.start && rawEvent.start.length >= 16 ? rawEvent.start.slice(11, 16) : '');
  const timezone = rawEvent.timezone || crawlContext.timezone || 'America/Denver';
  const explicitStart = rawEvent.start || null;

  // 4. Source & Ticket URLs
  const sourceUrl = crawlContext.canonicalUrl || rawEvent.official_source_url || rawEvent.url || '';
  const sourceFinalResolvedUrl = crawlContext.finalResolvedUrl || sourceUrl;
  const sourceRedirectChain = crawlContext.sourceRedirectChain || [{ url: sourceUrl, status: 200, host: '' }];

  const rawTicketUrl = rawEvent.ticket_url || rawEvent.ticketUrl || rawEvent.url || '';
  const finalTicketResolvedUrl = ticketProbeResult.finalTicketResolvedUrl || rawTicketUrl;
  const ticketResponseBodyHash = ticketProbeResult.ticketResponseBodyHash || rawEvent.ticketResponseBodyHash || null;
  const ticketRedirectChain = ticketProbeResult.ticketRedirectChain || (rawTicketUrl ? [{ url: rawTicketUrl, status: 200, host: '' }] : []);
  const detectedTicketProvider = ticketProbeResult.detectedTicketProvider || rawEvent.detectedTicketProvider || 'box_office';
  const ticketPageSignals = ticketProbeResult.ticketPageSignals || { hasCartPath: false, hasTicketButton: false, hasShowtimeSelector: false, isReseller: false };

  const linkResolutionTier = rawEvent.linkResolutionTier || LINK_RESOLUTION_TIERS.SHOW_LANDING_PAGE;
  const isVenueLevelLink = Boolean(rawEvent.isVenueLevelLink ?? (linkResolutionTier === LINK_RESOLUTION_TIERS.VENUE_CALENDAR));

  // --- EVALUATE THE 12 DETERMINISTIC GATES ---

  // Gate 1: Strict Explicit Civil Date
  const hasExplicitCivilDate = isValidCalendarDate(rawCivilDate);

  // Gate 2: Strict Exact Civil Time (24-hour HH:MM)
  const hasExactCivilTime = isValidCivilTime(rawCivilTime);

  // Gate 3: Valid IANA Timezone
  let hasValidIanaTimezone = false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    hasValidIanaTimezone = Boolean(timezone && timezone.includes('/'));
  } catch (_) {
    hasValidIanaTimezone = false;
  }

  // Gate 4: Strict Date/Time Round-Trip & DST/Gap Validation
  const roundTripTest = (hasExplicitCivilDate && hasExactCivilTime && hasValidIanaTimezone)
    ? validateDateTimeRoundTrip(rawCivilDate, rawCivilTime, timezone, explicitStart)
    : { valid: false, reason: 'syntax_error' };
  const hasStrictDateTimeRoundTrip = roundTripTest.valid;

  // Gate 5: Valid Known Venue Identity
  const hasKnownVenueIdentity = Boolean(venueName && venueName.length >= 3 && !/^(unknown|tbd|venue)$/i.test(venueName));

  // Gate 6: Official Source URL
  const hasOfficialSourceUrl = Boolean(
    sourceUrl &&
    (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) &&
    !isUnauthorizedResellerHost(new URL(sourceUrl).hostname.toLowerCase())
  );

  // Gate 7: Direct Official or Show Landing Page (Not venue-level calendar or homepage)
  const isGenericHomepage = (url) => {
    if (!url) return false;
    try {
      const u = new URL(url);
      const p = u.pathname.replace(/\/+$/, '');
      return p === '' || p === '/calendar' || p === '/events' || p === '/shows' || p === '/schedule';
    } catch (_) {
      return false;
    }
  };
  const isGenericOrVenueCalendar = Boolean(
    isVenueLevelLink ||
    linkResolutionTier === LINK_RESOLUTION_TIERS.VENUE_CALENDAR ||
    (rawTicketUrl && isGenericHomepage(rawTicketUrl))
  );

  const hasDirectOrShowLandingPage = Boolean(
    rawTicketUrl &&
    (rawTicketUrl.startsWith('http://') || rawTicketUrl.startsWith('https://')) &&
    !isGenericOrVenueCalendar &&
    (linkResolutionTier === LINK_RESOLUTION_TIERS.DIRECT_CHECKOUT || linkResolutionTier === LINK_RESOLUTION_TIERS.SHOW_LANDING_PAGE)
  );

  // Gate 8: Safe URL & Redirect Chain (Host-by-host audit, no unauthorized resellers)
  let hasSafeUrlAndRedirectChain = false;
  let urlSafetyReason = null;
  if (rawTicketUrl) {
    const safetyCheck = validateUrlSafety(rawTicketUrl);
    if (!safetyCheck.safe) {
      urlSafetyReason = safetyCheck.reason;
    } else if (ticketPageSignals.isReseller) {
      urlSafetyReason = 'unauthorized_secondary_reseller';
    } else {
      // Validate every hop in redirect chain
      const anyUnsafeHop = ticketRedirectChain.some(hop => {
        try {
          const h = new URL(hop.url).hostname.toLowerCase();
          return isUnauthorizedResellerHost(h) || hop.blocked;
        } catch (_) {
          return true;
        }
      });
      if (anyUnsafeHop) {
        urlSafetyReason = 'unauthorized_secondary_reseller';
      } else {
        hasSafeUrlAndRedirectChain = true;
      }
    }
  }

  // Gate 9: Valid 64-Character Cryptographic Evidence Hashes
  // (Both source and ticket page must have valid SHA-256 hashes, and must be distinct)
  const isValidSha256 = (h) => typeof h === 'string' && /^[0-9a-f]{64}$/i.test(h);
  const hasValidSourceHash = isValidSha256(sourceResponseHash);
  const hasValidTicketHash = isValidSha256(ticketResponseBodyHash);
  const hashesAreDistinct = hasValidSourceHash && hasValidTicketHash && (sourceResponseHash.toLowerCase() !== ticketResponseBodyHash.toLowerCase());

  const hasCryptographicEvidenceHashes = Boolean(hasValidSourceHash && hasValidTicketHash && hashesAreDistinct);

  // Gate 10: Not Synthetic Recurring Pattern
  const isSynthetic = /every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(rawPerformer);
  const isNotSyntheticRecurring = !isSynthetic;

  // Horizon & Display Evaluation
  const horizonOptions = crawlContext.horizonOptions || crawlContext || {};
  const horizonEval = evaluateDisplayHorizon(rawCivilDate, rawCivilTime, timezone, roundTripTest.resolvedUtcDate, horizonOptions);

  // Exact Performer Identity Present
  const hasExactPerformerIdentity = Boolean(
    normalizedPerformer &&
    normalizedPerformer.length >= 2 &&
    !/^(event|show|comedy show|standup|live|tba|tbd)$/i.test(normalizedPerformer)
  );

  const validationChecks = {
    hasExplicitCivilDate,
    hasExactCivilTime,
    hasValidIanaTimezone,
    hasStrictDateTimeRoundTrip,
    hasKnownVenueIdentity,
    hasOfficialSourceUrl,
    hasDirectOrShowLandingPage,
    hasSafeUrlAndRedirectChain,
    hasCryptographicEvidenceHashes,
    isNotSyntheticRecurring,
    isWithinPublicationWindow: Boolean(horizonEval && horizonEval.isDisplayEligible),
    hasExactPerformerIdentity
  };

  // 1. Structural Validity (Decoupled from display window)
  const structurallyValid = Boolean(
    hasExplicitCivilDate &&
    hasExactCivilTime &&
    hasValidIanaTimezone &&
    hasStrictDateTimeRoundTrip &&
    hasKnownVenueIdentity &&
    hasOfficialSourceUrl &&
    hasDirectOrShowLandingPage &&
    hasSafeUrlAndRedirectChain &&
    hasCryptographicEvidenceHashes &&
    isNotSyntheticRecurring &&
    hasExactPerformerIdentity
  );

  // 2. Evidence Retention Tier
  let evidenceRetentionTier = 'active_feed_candidate';
  if (sourceKind === 'artist') {
    evidenceRetentionTier = 'artist_discovery_lead';
  } else if (horizonEval.isPast) {
    evidenceRetentionTier = 'retained_historical';
  } else if (horizonEval.isFutureBeyondWindow) {
    evidenceRetentionTier = 'retained_future_horizon';
  } else {
    evidenceRetentionTier = 'active_feed_candidate';
  }

  // 3. Display Eligibility (Falls inside active feed window requested by product)
  const displayEligible = Boolean(
    structurallyValid &&
    sourceKind === 'venue' &&
    horizonEval.isDisplayEligible
  );

  // Authoritative Venue Approval Classification
  const venueClassification = classifyVenueApproval({
    venueSlug,
    venueName,
    canonicalUrl: sourceUrl,
    sourceKind
  });

  const venueApprovalStatus = approvalContext.venueApprovalStatus || venueClassification.venueApprovalStatus;
  const isAlreadyLive = venueApprovalStatus === VENUE_APPROVAL_STATUSES.ALREADY_LIVE;

  // 4. Admin Review Eligibility
  // Invariant: Already-live venues are NOT eligible for new admin review (they are already promoted, eligible for refresh).
  // Known unpromoted candidates and net-new venues ARE admin-review eligible.
  const adminReviewEligible = Boolean(
    structurallyValid &&
    sourceKind === 'venue' &&
    !isAlreadyLive
  );

  // Review Queue Action
  const reviewQueueAction = isAlreadyLive
    ? REVIEW_QUEUE_ACTIONS.REFRESH_EXISTING_VENUE
    : (sourceKind === 'artist' ? REVIEW_QUEUE_ACTIONS.QUARANTINE_LEAD : REVIEW_QUEUE_ACTIONS.NEW_VENUE_REVIEW);

  // 5. Publication Eligibility
  // Invariant: For already-live venues in read-only refresh crawl, publicationEligible is false (refresh, not new candidate).
  // For unpromoted candidates: requires structural validity, display eligibility, approved venue, and admin approval.
  const isVenueApproved = Boolean(approvalContext.venueApproved || isAlreadyLive);
  const isAdminApproved = Boolean(approvalContext.adminApproved);
  const publicationEligible = Boolean(
    structurallyValid &&
    displayEligible &&
    sourceKind === 'venue' &&
    !isAlreadyLive &&
    isVenueApproved &&
    isAdminApproved
  );

  let publicationTier = PUBLICATION_TIERS.UNCONFIRMED_LEAD;
  if (sourceKind === 'artist') {
    publicationTier = PUBLICATION_TIERS.UNCONFIRMED_LEAD;
  } else if (structurallyValid) {
    if (rawEvent.dualConfirmed || rawEvent.confirmationStatus === PUBLICATION_TIERS.CONFIRMED_DUAL_OFFICIAL) {
      publicationTier = PUBLICATION_TIERS.CONFIRMED_DUAL_OFFICIAL;
    } else {
      publicationTier = PUBLICATION_TIERS.CONFIRMED_OFFICIAL_CALENDAR;
    }
  }

  const rejectionReasons = [];
  if (!hasExplicitCivilDate) rejectionReasons.push('invalid_or_missing_calendar_date');
  if (!hasExactCivilTime) rejectionReasons.push('invalid_or_missing_civil_time');
  if (!hasValidIanaTimezone) rejectionReasons.push('invalid_iana_timezone');
  if (!hasStrictDateTimeRoundTrip) rejectionReasons.push(roundTripTest.reason || 'date_time_round_trip_failed');
  if (!hasKnownVenueIdentity) rejectionReasons.push('unknown_venue_identity');
  if (!hasOfficialSourceUrl) rejectionReasons.push('invalid_official_source_url');

  if (!rawTicketUrl) {
    rejectionReasons.push('missing_direct_or_show_landing_ticket_url');
  } else if (isGenericOrVenueCalendar) {
    rejectionReasons.push('generic_venue_homepage_not_allowed');
  } else if (!hasDirectOrShowLandingPage) {
    rejectionReasons.push('missing_direct_or_show_landing_ticket_url');
  }

  if (!hasSafeUrlAndRedirectChain) {
    rejectionReasons.push('unauthorized_or_unsafe_redirect_chain');
    if (urlSafetyReason === 'fake_or_untrusted_domain') {
      rejectionReasons.push('fake_or_untrusted_domain');
    } else if (urlSafetyReason === 'unsafe_redirect_url_parameter') {
      rejectionReasons.push('unsafe_redirect_url_parameter');
    } else if (urlSafetyReason === 'unauthorized_secondary_reseller' || urlSafetyReason === 'unauthorized_secondary_reseller_host') {
      rejectionReasons.push('unauthorized_secondary_reseller');
    }
  }

  if (!hasValidSourceHash) rejectionReasons.push('missing_or_invalid_source_hash');
  if (!hasValidTicketHash) rejectionReasons.push('missing_or_invalid_ticket_hash');
  if (hasValidSourceHash && hasValidTicketHash && !hashesAreDistinct) {
    rejectionReasons.push('identical_or_reused_evidence_hash');
    rejectionReasons.push('reused_source_hash_as_ticket_hash');
  }

  if (!isNotSyntheticRecurring) rejectionReasons.push('synthetic_recurring_pattern_detected');
  if (!hasExactPerformerIdentity) rejectionReasons.push('generic_or_missing_performer_identity');

  // Horizon & Quarantine reasons (for display / publication audit)
  if (sourceKind === 'artist') {
    rejectionReasons.push('artist_discovery_is_lead_only');
  } else if (sourceKind !== 'venue') {
    rejectionReasons.push('non_venue_source_not_publishable');
  }

  if (horizonEval.isPast) {
    rejectionReasons.push('event_in_the_past');
  } else if (horizonEval.isFutureBeyondWindow) {
    rejectionReasons.push('event_beyond_public_horizon');
  }

  if (sourceKind === 'venue' && structurallyValid) {
    if (isAlreadyLive) {
      // Invariant: NEVER label an already-live venue as venue_not_approved or awaiting_admin_approval
    } else {
      if (!isVenueApproved) rejectionReasons.push('venue_not_approved');
      if (!isAdminApproved) rejectionReasons.push('awaiting_admin_approval');
    }
  }

  // Deterministic Fingerprint ID
  const eventId = rawEvent.id || computeEventFingerprint({
    venue: venueName,
    venueId: venueSlug,
    city,
    startTime: explicitStart || `${rawCivilDate}T${rawCivilTime}:00`,
    title: rawPerformer
  });

  return {
    id: eventId,
    crawlLedgerId,
    validationRunId,
    sourceKind,

    // Venue Approval & Action
    venueApprovalStatus,
    reviewQueueAction,

    // Performer Provenance
    rawPerformer,
    normalizedPerformer,
    performerIdentityVersion: PERFORMER_IDENTITY_VERSION,

    // Venue Provenance
    venueName,
    venueSlug,
    city,
    state,

    // Date/Time Provenance
    civilDate: rawCivilDate,
    civilTime: rawCivilTime,
    timezone,
    startIso: explicitStart || (hasStrictDateTimeRoundTrip && roundTripTest.resolvedUtcDate ? roundTripTest.resolvedUtcDate.toISOString() : null),

    // Source Provenance
    sourceUrl,
    sourceFinalResolvedUrl,
    sourceResponseHash,
    sourceRedirectChain,
    parserName,
    parserVersion,

    // Ticket Provenance (Separately Probed)
    ticketUrl: rawTicketUrl,
    finalTicketResolvedUrl,
    ticketResponseBodyHash,
    ticketRedirectChain,
    detectedTicketProvider,
    ticketPageSignals,
    linkResolutionTier,
    isVenueLevelLink,

    // Deterministic Gates & Outcome
    validationChecks,
    structurallyValid,
    displayEligible,
    adminReviewEligible,
    publicationEligible,
    isPublishable: publicationEligible,
    publicationTier,
    evidenceRetentionTier,
    rejectionReasons,
    validatedAt: nowIso
  };
}

module.exports = {
  validateExtractedEvent,
  validateDateTimeRoundTrip,
  isValidCalendarDate,
  isValidCivilTime,
  evaluateDisplayHorizon,
  isWithinPublicationWindow,
  normalizePerformerIdentity,
  classifyVenueApproval,
  VENUE_APPROVAL_STATUSES,
  REVIEW_QUEUE_ACTIONS,
  DEFAULT_PUBLIC_FEED_HORIZON_DAYS,
  PERFORMER_IDENTITY_VERSION,
  PUBLICATION_TIERS,
  LINK_RESOLUTION_TIERS
};
