/**
 * lib/crawling/venue-classification.js
 *
 * Authoritative Venue Approval Classification & Canonical Identity Resolver
 *
 * Requirements:
 * 1. "already_live": Venue is in the promoted production registry (23 original baseline + 2 approved Comedy Works = 25 live venues).
 *    - venueApprovalStatus: "already_live"
 *    - adminReviewEligible: false
 *    - publicationEligible: false (read-only refresh crawl; not a new promotion candidate)
 *    - reviewQueueAction: "refresh_existing_venue"
 *    - queueStatus: "live"
 *    - Invariant: NEVER labeled as "venue_not_approved".
 *
 * 2. "candidate": Venue is a known verified identity in NATIONAL_COMEDY_VENUES, but not yet promoted.
 *    - venueApprovalStatus: "candidate"
 *    - If exact events extracted:
 *        adminReviewEligible: true
 *        reviewQueueAction: "new_venue_review"
 *        queueStatus: "parsed_successfully"
 *    - If zero exact events / no_exact_events / custom_parser_required:
 *        adminReviewEligible: false
 *        reviewQueueAction: "custom_parser_required"
 *        queueStatus: "needs_review"
 *        (NEVER labeled "awaiting_admin_approval" or counted as ready for promotion)
 *
 * 3. "awaiting_review": Net-new venue identity (discovered through crawl/tour graph, uncatalogued).
 *    - venueApprovalStatus: "awaiting_review"
 *    - If zero exact events / custom_parser_required:
 *        adminReviewEligible: false
 *        reviewQueueAction: "custom_parser_required"
 *        queueStatus: "needs_review"
 *    - If exact events extracted:
 *        adminReviewEligible: true
 *        reviewQueueAction: "new_venue_review"
 *        queueStatus: "needs_review"
 *
 * 4. "not_applicable": Artist or ticketing source.
 *    - venueApprovalStatus: "not_applicable"
 *    - adminReviewEligible: false
 *    - publicationEligible: false
 *    - reviewQueueAction: "quarantine_lead"
 *    - queueStatus: "needs_review"
 */

const {
  PROMOTED_VENUE_SLUGS,
  NATIONAL_COMEDY_VENUES
} = require('../comedy/national-registry');

// Baseline 25 Production Venues (23 original promoted clubs + 2 approved Comedy Works clubs)
const BASELINE_25_LIVE_SLUGS = new Set([
  ...PROMOTED_VENUE_SLUGS,
  'laughing-skull-lounge-atlanta',
  'comedy-works-downtown',
  'comedy-works-downtown-denver',
  'comedy-works-south',
  'comedy-works-south-greenwood-village'
]);

// Newly Promoted 5 SeatEngine Venues
const PROMOTED_BATCH5_SLUGS = [
  'louisville-comedy-club',
  'bricktown-comedy-club-okc',
  'tacoma-comedy-club',
  'spokane-comedy-club',
  'skyline-comedy-club-appleton'
];

// Authoritative Production Venues Registry (25 baseline + dynamically promoted clubs)
const LIVE_PRODUCTION_VENUE_SLUGS = new Set([
  ...BASELINE_25_LIVE_SLUGS
]);

function registerPromotedProductionVenues(slugs = PROMOTED_BATCH5_SLUGS) {
  for (const s of slugs) {
    LIVE_PRODUCTION_VENUE_SLUGS.add(s);
    KNOWN_CANDIDATE_SLUGS.delete(s);
  }
  return LIVE_PRODUCTION_VENUE_SLUGS.size;
}

// Set of known candidate slugs from national registry that are NOT in production
const KNOWN_CANDIDATE_SLUGS = new Set(
  NATIONAL_COMEDY_VENUES
    .map(v => v.slug)
    .filter(slug => !LIVE_PRODUCTION_VENUE_SLUGS.has(slug))
);

const VENUE_APPROVAL_STATUSES = {
  ALREADY_LIVE: 'already_live',
  CANDIDATE: 'candidate',
  AWAITING_REVIEW: 'awaiting_review',
  NOT_APPLICABLE: 'not_applicable'
};

const REVIEW_QUEUE_ACTIONS = {
  REFRESH_EXISTING_VENUE: 'refresh_existing_venue',
  NEW_VENUE_REVIEW: 'new_venue_review',
  QUARANTINE_LEAD: 'quarantine_lead',
  CUSTOM_PARSER_REQUIRED: 'custom_parser_required'
};

const QUEUE_LIFECYCLE_STATUSES = {
  PUBLIC_SCHEDULE_FOUND: 'public_schedule_found',
  PARSED_SUCCESSFULLY: 'parsed_successfully',
  NEEDS_REVIEW: 'needs_review',
  LIVE: 'live',
  BLOCKED_OR_UNSUPPORTED: 'blocked_or_unsupported'
};

/**
 * Extracts and normalizes hostname from a URL string or domain.
 * Strips protocol, port, www., trailing slash, and path.
 */
function extractNormalizedHostname(urlOrHost) {
  if (!urlOrHost || typeof urlOrHost !== 'string') return '';
  const trimmed = urlOrHost.trim();
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch (_) {
    return trimmed.toLowerCase().replace(/^www\./, '').split('/')[0].split(':')[0];
  }
}

/**
 * Normalizes a slug or string identifier into a clean dashed key.
 */
function normalizeIdentifier(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Known alias map mapping alternative slugs, hostnames, and names to canonical slugs.
 */
const CANONICAL_ALIAS_MAP = new Map([
  // Skyline Comedy Club
  ['skyline-comedy-club', 'skyline-comedy-club-appleton'],
  ['skyline-comedy', 'skyline-comedy-club-appleton'],
  ['skyline', 'skyline-comedy-club-appleton'],
  ['skylinecomedy.com', 'skyline-comedy-club-appleton'],
  ['skylinecomedy.seatengine.com', 'skyline-comedy-club-appleton'],
  ['skyline comedy club', 'skyline-comedy-club-appleton'],

  // Denver Comedy Underground
  ['denver-comedy-underground-denver', 'denver-comedy-underground'],
  ['denvercomedyunderground.com', 'denver-comedy-underground'],
  ['denver comedy underground', 'denver-comedy-underground'],

  // Tacoma Comedy Club
  ['tacoma-comedy-club-tacoma', 'tacoma-comedy-club'],
  ['tacomacomedyclub.com', 'tacoma-comedy-club'],
  ['tacomacomedy.seatengine.com', 'tacoma-comedy-club'],
  ['tacoma comedy club', 'tacoma-comedy-club'],

  // Spokane Comedy Club
  ['spokane-comedy-club-spokane', 'spokane-comedy-club'],
  ['spokanecomedyclub.com', 'spokane-comedy-club'],
  ['spokanecomedy.seatengine.com', 'spokane-comedy-club'],
  ['spokane comedy club', 'spokane-comedy-club'],

  // Bricktown Comedy Club
  ['bricktown-comedy-club', 'bricktown-comedy-club-okc'],
  ['bricktowncomedy.com', 'bricktown-comedy-club-okc'],
  ['bricktowncomedy.seatengine.com', 'bricktown-comedy-club-okc'],
  ['bricktown comedy club', 'bricktown-comedy-club-okc'],

  // Louisville Comedy Club
  ['louisville-comedy-club-louisville', 'louisville-comedy-club'],
  ['louisvillecomedy.com', 'louisville-comedy-club'],
  ['louisvillecomedy.seatengine.com', 'louisville-comedy-club'],
  ['louisville comedy club', 'louisville-comedy-club'],

  // Zanies Comedy Club Chicago
  ['zanies-chicago', 'zanies-comedy-club-chicago'],
  ['zanies-comedy-club', 'zanies-comedy-club-chicago'],
  ['chicago.zanies.com', 'zanies-comedy-club-chicago'],
  ['zanies.com', 'zanies-comedy-club-chicago'],
  ['zanies comedy club', 'zanies-comedy-club-chicago'],

  // The Comedy Store
  ['the-comedy-store-west-hollywood', 'the-comedy-store'],
  ['thecomedystore.com', 'the-comedy-store'],
  ['the comedy store', 'the-comedy-store'],

  // The Bug Theatre
  ['the-bug-theatre-denver', 'the-bug-theatre'],
  ['bugtheatre.org', 'the-bug-theatre'],
  ['bugtheatre.info', 'the-bug-theatre'],
  ['the bug theatre', 'the-bug-theatre'],

  // RISE Comedy
  ['rise-comedy-denver', 'rise-comedy'],
  ['risecomedy.com', 'rise-comedy'],
  ['rise comedy', 'rise-comedy'],

  // Live Venues Aliases
  ['comedy-works-downtown-denver', 'comedy-works-downtown'],
  ['comedy-works-south-greenwood-village', 'comedy-works-south'],
  ['comedyworks.com', 'comedy-works-downtown'],
  ['acmecomedy.seatengine.com', 'acme-comedy-company-minneapolis'],
  ['capcitycomedy.com', 'cap-city-comedy-club-austin'],
  ['laughingskulllounge.com', 'laughing-skull-lounge']
]);

/**
 * Builds dynamic lookup index across NATIONAL_COMEDY_VENUES.
 */
const REGISTRY_BY_SLUG = new Map();
const REGISTRY_BY_HOST = new Map();
const REGISTRY_BY_NAME = new Map();

for (const v of NATIONAL_COMEDY_VENUES) {
  REGISTRY_BY_SLUG.set(v.slug, v);
  const host = extractNormalizedHostname(v.website || v.calendarFeedUrl);
  if (host) REGISTRY_BY_HOST.set(host, v);
  if (v.name) REGISTRY_BY_NAME.set(v.name.toLowerCase().trim(), v);
}

/**
 * One Canonical Resolver for Venue Identity
 *
 * Normalizes incoming slug, name, URL, or aliases to authoritative registry metadata:
 * - canonicalSlug
 * - aliases
 * - normalizedHostname
 * - registryRecord
 * - live-production status
 * - candidate status
 * - queue status
 * - adminReviewEligible
 * - reviewQueueAction
 *
 * @param {Object} params
 * @param {string} [params.venueSlug]
 * @param {string} [params.venueName]
 * @param {string} [params.canonicalUrl]
 * @param {string} [params.sourceKind]
 * @param {string} [params.crawlStatus]
 * @param {number} [params.exactEventsCount]
 * @param {string} [params.blockedReason]
 * @returns {Object} Canonical identity record
 */
function resolveCanonicalVenueIdentity({
  venueSlug = null,
  venueName = '',
  canonicalUrl = '',
  sourceKind = 'venue',
  crawlStatus = null,
  exactEventsCount = null,
  blockedReason = null,
  liveProductionSlugs = null
} = {}) {
  if (sourceKind === 'artist' || sourceKind === 'ticketing') {
    return {
      canonicalSlug: venueSlug || normalizeIdentifier(venueName) || 'artist-lead',
      aliases: [],
      normalizedHostname: extractNormalizedHostname(canonicalUrl),
      registryRecord: null,
      isLiveProductionVenue: false,
      venueApprovalStatus: VENUE_APPROVAL_STATUSES.NOT_APPLICABLE,
      queueStatus: QUEUE_LIFECYCLE_STATUSES.NEEDS_REVIEW,
      adminReviewEligible: false,
      publicationEligible: false,
      reviewQueueAction: REVIEW_QUEUE_ACTIONS.QUARANTINE_LEAD
    };
  }

  const rawSlug = normalizeIdentifier(venueSlug);
  const rawName = (venueName || '').toLowerCase().trim();
  const rawHost = extractNormalizedHostname(canonicalUrl);

  // 1. Resolve canonical slug through alias map or direct registry lookup
  let resolvedSlug = rawSlug;
  if (CANONICAL_ALIAS_MAP.has(rawSlug)) {
    resolvedSlug = CANONICAL_ALIAS_MAP.get(rawSlug);
  } else if (rawHost && CANONICAL_ALIAS_MAP.has(rawHost)) {
    resolvedSlug = CANONICAL_ALIAS_MAP.get(rawHost);
  } else if (rawName && CANONICAL_ALIAS_MAP.has(rawName)) {
    resolvedSlug = CANONICAL_ALIAS_MAP.get(rawName);
  }

  // 2. Find registry record
  let registryRecord = null;
  if (resolvedSlug && REGISTRY_BY_SLUG.has(resolvedSlug)) {
    registryRecord = REGISTRY_BY_SLUG.get(resolvedSlug);
  } else if (rawSlug && REGISTRY_BY_SLUG.has(rawSlug)) {
    registryRecord = REGISTRY_BY_SLUG.get(rawSlug);
    resolvedSlug = registryRecord.slug;
  } else if (rawHost && REGISTRY_BY_HOST.has(rawHost)) {
    registryRecord = REGISTRY_BY_HOST.get(rawHost);
    resolvedSlug = registryRecord.slug;
  } else if (rawName && REGISTRY_BY_NAME.has(rawName)) {
    registryRecord = REGISTRY_BY_NAME.get(rawName);
    resolvedSlug = registryRecord.slug;
  }

  const canonicalSlug = resolvedSlug || rawSlug || (registryRecord ? registryRecord.slug : null);
  const normalizedHostname = rawHost || (registryRecord ? extractNormalizedHostname(registryRecord.website) : '');

  // 3. Compile all known aliases
  const aliases = new Set();
  if (rawSlug) aliases.add(rawSlug);
  if (canonicalSlug) aliases.add(canonicalSlug);
  if (normalizedHostname) aliases.add(normalizedHostname);
  if (registryRecord) {
    aliases.add(registryRecord.slug);
    aliases.add(registryRecord.name.toLowerCase());
    if (registryRecord.website) aliases.add(extractNormalizedHostname(registryRecord.website));
  }
  for (const [alias, target] of CANONICAL_ALIAS_MAP) {
    if (target === canonicalSlug || target === resolvedSlug) {
      aliases.add(alias);
    }
  }

  // 4. Check if live production venue
  const liveSlugs = liveProductionSlugs || LIVE_PRODUCTION_VENUE_SLUGS;
  const isDirectLiveSlug = Boolean(canonicalSlug && liveSlugs.has(canonicalSlug));
  const isRawLiveSlug = Boolean(rawSlug && liveSlugs.has(rawSlug));
  const isComedyWorks = rawName.includes('comedy works') || normalizedHostname.includes('comedyworks.com') || (canonicalSlug && canonicalSlug.includes('comedy-works'));
  const isAcme = rawName.includes('acme comedy') || normalizedHostname.includes('acmecomedy') || (canonicalSlug && canonicalSlug.includes('acme-comedy'));
  const isCapCity = rawName.includes('cap city') || normalizedHostname.includes('capcitycomedy') || (canonicalSlug && canonicalSlug.includes('cap-city'));
  const isLaughingSkull = rawName.includes('laughing skull') || normalizedHostname.includes('laughingskulllounge') || (canonicalSlug && canonicalSlug.includes('laughing-skull'));
  const isPunchline = (rawName.includes('punchline') || (canonicalSlug && canonicalSlug.includes('punchline'))) && rawName.includes('atlanta');
  const isStardome = rawName.includes('stardome') || normalizedHostname.includes('stardome') || (canonicalSlug && canonicalSlug.includes('stardome'));

  const isLiveProductionVenue = Boolean(
    isDirectLiveSlug ||
    isRawLiveSlug ||
    isComedyWorks ||
    isAcme ||
    isCapCity ||
    isLaughingSkull ||
    isPunchline ||
    isStardome
  );

  if (isLiveProductionVenue) {
    return {
      canonicalSlug,
      aliases: Array.from(aliases),
      normalizedHostname,
      registryRecord,
      isLiveProductionVenue: true,
      venueApprovalStatus: VENUE_APPROVAL_STATUSES.ALREADY_LIVE,
      queueStatus: QUEUE_LIFECYCLE_STATUSES.LIVE,
      adminReviewEligible: false,
      publicationEligible: false,
      reviewQueueAction: REVIEW_QUEUE_ACTIONS.REFRESH_EXISTING_VENUE
    };
  }

  // 5. Determine if known candidate from registry
  const isKnownCandidate = Boolean(
    registryRecord ||
    (canonicalSlug && KNOWN_CANDIDATE_SLUGS.has(canonicalSlug)) ||
    (rawSlug && KNOWN_CANDIDATE_SLUGS.has(rawSlug))
  );

  const venueApprovalStatus = isKnownCandidate
    ? VENUE_APPROVAL_STATUSES.CANDIDATE
    : VENUE_APPROVAL_STATUSES.AWAITING_REVIEW;

  // 6. Check custom parser / exact events status
  const hasZeroExactEvents = exactEventsCount === 0 || (exactEventsCount != null && exactEventsCount === 0);
  const isCustomParserRequired = Boolean(
    crawlStatus === 'no_exact_events' ||
    blockedReason === 'custom_parser_required' ||
    (crawlStatus === 'no_exact_events' && hasZeroExactEvents)
  );

  if (isCustomParserRequired) {
    return {
      canonicalSlug,
      aliases: Array.from(aliases),
      normalizedHostname,
      registryRecord,
      isLiveProductionVenue: false,
      venueApprovalStatus,
      queueStatus: QUEUE_LIFECYCLE_STATUSES.NEEDS_REVIEW,
      adminReviewEligible: false, // NOT ready for admin review or promotion
      publicationEligible: false,
      reviewQueueAction: REVIEW_QUEUE_ACTIONS.CUSTOM_PARSER_REQUIRED
    };
  }

  const hasParsedEvents = exactEventsCount != null && exactEventsCount > 0;
  const queueStatus = hasParsedEvents
    ? QUEUE_LIFECYCLE_STATUSES.PARSED_SUCCESSFULLY
    : QUEUE_LIFECYCLE_STATUSES.PUBLIC_SCHEDULE_FOUND;

  return {
    canonicalSlug,
    aliases: Array.from(aliases),
    normalizedHostname,
    registryRecord,
    isLiveProductionVenue: false,
    venueApprovalStatus,
    queueStatus,
    adminReviewEligible: true,
    publicationEligible: false,
    reviewQueueAction: REVIEW_QUEUE_ACTIONS.NEW_VENUE_REVIEW
  };
}

/**
 * Classifies a venue against the authoritative registries.
 * Wraps resolveCanonicalVenueIdentity for backward compatibility.
 */
function classifyVenueApproval(params = {}) {
  return resolveCanonicalVenueIdentity(params);
}

module.exports = {
  resolveCanonicalVenueIdentity,
  classifyVenueApproval,
  LIVE_PRODUCTION_VENUE_SLUGS,
  BASELINE_25_LIVE_SLUGS,
  PROMOTED_BATCH5_SLUGS,
  registerPromotedProductionVenues,
  KNOWN_CANDIDATE_SLUGS,
  VENUE_APPROVAL_STATUSES,
  REVIEW_QUEUE_ACTIONS,
  QUEUE_LIFECYCLE_STATUSES,
  extractNormalizedHostname,
  normalizeIdentifier
};
