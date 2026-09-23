/**
 * Brinkberry Comedy Network: Two-Way Discovery Graph & Cross-Source Confirmation Engine
 *
 * Architecture:
 * - Bipartite graph linking Club Schedules <--> Comedian Tour Schedules
 * - Reconciles exact event details (performer, venue, date, time, city, ticket link)
 * - Assigns highest trust tier: 'confirmed_by_dual_official_sources'
 * - Discovers new candidate venues from touring comedians without synthesizing unconfirmed events
 */

const crypto = require('node:crypto');
const { CONFIRMATION_STATUSES } = require('../network/schema');
const { NATIONAL_COMEDY_VENUES, distMiles } = require('./national-registry');

/**
 * Normalizes performer names for robust matching (e.g. "Sam Tallent Live" -> "sam tallent")
 */
function normalizePerformerName(name = '') {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/^(presents\s*:\s*|live\s*:\s*|the\s+)/i, '')
    .replace(/(\s+live|\s+in\s+concert|\s+tour|\s+showcase|\s+special)$/i, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

function levenshteinSimilarity(a = '', b = '') {
  if (a === b) return 1.0;
  if (!a || !b) return 0.0;
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  const maxLen = Math.max(m, n);
  return (maxLen - d[m][n]) / maxLen;
}

/**
 * Checks performer string similarity and categorizes as exact, fuzzy, or none
 */
function matchPerformer(nameA = '', nameB = '') {
  const normA = normalizePerformerName(nameA);
  const normB = normalizePerformerName(nameB);
  if (!normA || !normB) return { isMatch: false, matchType: 'none', similarity: 0 };
  if (normA === normB) {
    return { isMatch: true, matchType: 'exact', similarity: 1.0 };
  }
  // Substring check for compound titles e.g. "Sam Tallent" in "Sam Tallent with Guests"
  if ((normA.length >= 5 && normB.startsWith(normA)) || (normB.length >= 5 && normA.startsWith(normB))) {
    return { isMatch: true, matchType: 'exact', similarity: 0.95 };
  }
  const sim = levenshteinSimilarity(normA, normB);
  if (sim >= 0.8) {
    return { isMatch: true, matchType: 'fuzzy', similarity: sim };
  }
  return { isMatch: false, matchType: 'none', similarity: sim };
}

/**
 * Checks if two performer strings refer to the same artist (exact match only)
 */
function isSamePerformer(nameA = '', nameB = '') {
  const match = matchPerformer(nameA, nameB);
  return match.isMatch && match.matchType === 'exact';
}

/**
 * Normalizes venue names for matching across sources
 */
function normalizeVenueName(name = '') {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/^(the\s+)/i, '')
    .replace(/(\s+comedy\s+club|\s+comedy\s+lounge|\s+lounge|\s+theatre|\s+theater|\s+club)$/i, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Checks if two venue strings refer to the same venue
 */
function isSameVenue(venueA = '', venueB = '') {
  const normA = normalizeVenueName(venueA);
  const normB = normalizeVenueName(venueB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;
  return false;
}

/**
 * Detects whether two ticketing links share the same underlying ticketing platform and event ID
 */
function detectTicketingCorrelation(urlA = '', urlB = '') {
  if (!urlA || !urlB) return { correlated: false, provider: null, sharedId: null };

  const strA = String(urlA).toLowerCase();
  const strB = String(urlB).toLowerCase();

  // Pattern definitions for popular ticketing platforms
  const platforms = [
    { name: 'eventbrite', regex: /eventbrite\.com\/e\/[^\/\?#]*?(\d{8,14})/i },
    { name: 'ticketmaster', regex: /ticketmaster\.com\/event\/([a-zA-Z0-9]+)/i },
    { name: 'ticketweb', regex: /ticketweb\.com\/event\/[^\/\?#]*?\/(\d{7,12})/i },
    { name: 'etix', regex: /etix\.com\/ticket\/p\/(\d+)/i },
    { name: 'tixr', regex: /tixr\.com\/groups\/[^\/\?#]+\/events\/[^\/\?#]+-(\d+)/i },
    { name: 'seatengine', regex: /([a-zA-Z0-9-]+\.seatengine\.com\/events\/\d+)/i }
  ];

  for (const p of platforms) {
    const matchA = strA.match(p.regex);
    const matchB = strB.match(p.regex);
    if (matchA && matchB && matchA[1] === matchB[1]) {
      return {
        correlated: true,
        provider: p.name,
        sharedId: matchA[1]
      };
    }
  }

  return { correlated: false, provider: null, sharedId: null };
}

/**
 * Extracts distinct touring comedian identities from club schedule events
 */
function extractLineupComedians(events = []) {
  const comedianMap = new Map();

  for (const ev of events) {
    if (!ev || ev.isCancelled) continue;
    const rawPerformer = ev.performer || ev.title;
    if (!rawPerformer) continue;

    // Filter out generic showcase / class / open mic / school / 'best of' titles
    if (/open\s*mic|class|workshop|improv|jam|pro-am|open\s*stage|comedy\s*school|best\s*of/i.test(rawPerformer)) {
      continue;
    }

    // Clean up compound titles (e.g. "Lace Larrabee Laugh Lab Graduation Show" -> "Lace Larrabee")
    let cleanName = rawPerformer
      .replace(/\s+(Laugh Lab.*|Graduation Show.*|Comedy Showcase.*)/i, '')
      .replace(/^(Presents\s*:\s*|Live\s*:\s*)/i, '')
      .trim();

    if (/show$|festival$|contest$/i.test(cleanName)) {
      continue;
    }

    const norm = normalizePerformerName(cleanName);
    if (!norm || norm.length < 3) continue;

    if (!comedianMap.has(norm)) {
      comedianMap.set(norm, {
        name: cleanName,
        normalizedName: norm,
        observedAtVenues: [
          {
            venueName: ev.venue_name || ev.venueName,
            venueSlug: ev.venue_slug || ev.venueSlug,
            city: ev.city,
            date: ev.civilDate || ev.localDate
          }
        ]
      });
    } else {
      const existing = comedianMap.get(norm);
      existing.observedAtVenues.push({
        venueName: ev.venue_name || ev.venueName,
        venueSlug: ev.venue_slug || ev.venueSlug,
        city: ev.city,
        date: ev.civilDate || ev.localDate
      });
    }
  }

  return Array.from(comedianMap.values());
}

/**
 * Normalizes an artist tour schedule entry into a verified tour date record
 */
function normalizeArtistTourDate(artist = {}, rawDate = {}) {
  const performer = artist.name || rawDate.performer;
  const venueName = rawDate.venueName || rawDate.venue || null;
  const city = rawDate.city || rawDate.locality || null;
  const state = rawDate.state || rawDate.region || null;
  const localDate = rawDate.localDate || rawDate.date || (rawDate.start ? rawDate.start.slice(0, 10) : null);
  const localTime = rawDate.localTime || rawDate.time || (rawDate.start && rawDate.start.length >= 16 ? rawDate.start.slice(11, 16) : null);
  const ticketUrl = rawDate.ticketUrl || rawDate.ticket_url || rawDate.url || null;
  const sourceUrl = rawDate.sourceUrl || artist.tourUrl || artist.website;
  const rawPayload = rawDate.rawPayload || JSON.stringify(rawDate);
  const contentHash = crypto.createHash('sha256').update(rawPayload).digest('hex');

  const isCityOnly = !venueName || venueName.trim().length === 0;
  const isAggregator = Boolean(rawDate.isAggregator || rawDate.sourceType === 'aggregator' || (sourceUrl && /bandsintown\.com|songkick\.com/i.test(sourceUrl)));
  const sourceType = isAggregator ? 'aggregator' : (rawDate.sourceType || 'official_artist');

  return {
    performer,
    venueName,
    city,
    state,
    localDate,
    localTime,
    start: rawDate.start || (localDate && localTime ? `${localDate}T${localTime}:00` : null),
    ticketUrl,
    sourceUrl,
    sourceType,
    isAggregator,
    contentHash,
    isCityOnly,
    rawPayload
  };
}

/**
 * Reconciles a venue calendar event with an array of official artist tour dates
 *
 * Evaluation rules:
 * 1. Exact match on performer, venue, date, time, city, ticket -> confirmed_by_dual_official_sources
 * 2. Match on date and city with venue/time confirmed by club -> confirmed_by_cross_source
 * 3. Artist lists city/date only -> corroborated_artist_lead (not published alone)
 */
function reconcileDualOfficialSources(venueEvent = {}, artistTourDates = []) {
  if (!venueEvent || !Array.isArray(artistTourDates) || artistTourDates.length === 0) {
    return {
      status: venueEvent.confirmationStatus || 'confirmed_by_official_calendar',
      event: venueEvent,
      matchedTourDate: null,
      correlatedTicketing: null
    };
  }

  const vPerformer = venueEvent.performer || venueEvent.title;
  const vVenue = venueEvent.venue_name || venueEvent.venueName;
  const vDate = venueEvent.civilDate || venueEvent.localDate || venueEvent.start?.slice(0, 10);
  const vTime = venueEvent.civilTime || venueEvent.localTime || venueEvent.start?.slice(11, 16);
  const vCity = venueEvent.city;
  const vTicket = venueEvent.ticket_url || venueEvent.ticketUrl;

  let fuzzyCandidate = null;
  let timeDiscrepancyCandidate = null;

  for (const tourDate of artistTourDates) {
    // 1. Date agreement check (strict civil date YYYY-MM-DD)
    if (vDate !== tourDate.localDate) {
      continue;
    }

    // 2. City agreement check
    const cityMatches = !vCity || !tourDate.city || (vCity.toLowerCase() === tourDate.city.toLowerCase());
    if (!cityMatches) {
      continue;
    }

    // 3. Performer agreement check
    const perfMatch = matchPerformer(vPerformer, tourDate.performer);
    if (!perfMatch.isMatch) {
      continue;
    }

    // If performer is a fuzzy match, flag for review rather than auto-confirming
    if (perfMatch.matchType === 'fuzzy') {
      const venueMatches = isSameVenue(vVenue, tourDate.venueName);
      if (venueMatches) {
        fuzzyCandidate = {
          tourDate,
          similarity: perfMatch.similarity,
          reason: `Fuzzy performer match (${Math.round(perfMatch.similarity * 100)}% similarity between "${vPerformer}" and "${tourDate.performer}") requires review`
        };
      }
      continue;
    }

    // 4. Handle city-only tour date (lead, not full dual confirmation)
    if (tourDate.isCityOnly) {
      return {
        status: CONFIRMATION_STATUSES.CONFIRMED_BY_CROSS_SOURCE,
        leadType: 'corroborated_artist_lead',
        event: {
          ...venueEvent,
          confirmationStatus: CONFIRMATION_STATUSES.CONFIRMED_BY_CROSS_SOURCE,
          sources: [
            venueEvent.sourceEvidence || { sourceUrl: venueEvent.canonical_url, type: 'official_venue_calendar' },
            {
              sourceId: `artist_${normalizePerformerName(tourDate.performer)}`,
              sourceUrl: tourDate.sourceUrl,
              feedType: 'artist_tour_page',
              contentHash: tourDate.contentHash,
              notes: 'Artist tour date confirmed city and date'
            }
          ]
        },
        matchedTourDate: tourDate,
        correlatedTicketing: detectTicketingCorrelation(vTicket, tourDate.ticketUrl)
      };
    }

    // 5. Check venue agreement
    const venueMatches = isSameVenue(vVenue, tourDate.venueName);
    if (!venueMatches) {
      continue;
    }

    // 6. Check exact time agreement
    const timeMatches = !vTime || !tourDate.localTime || (vTime === tourDate.localTime);
    const ticketingCorrelation = detectTicketingCorrelation(vTicket, tourDate.ticketUrl);
    const isAggregator = Boolean(tourDate.sourceType === 'aggregator' || tourDate.isAggregator);
    const ticketUrlDiff = Boolean(vTicket && tourDate.ticketUrl && vTicket !== tourDate.ticketUrl);

    if (timeMatches) {
      const confirmationStatus = isAggregator
        ? CONFIRMATION_STATUSES.AGGREGATOR_CORROBORATED
        : CONFIRMATION_STATUSES.CONFIRMED_BY_DUAL_OFFICIAL_SOURCES;

      // Dual official confirmation: exact agreement on performer, venue, date, time
      // Different ticket URLs are recorded as provenance differences, not matching failures
      const dualSources = [
        venueEvent.sourceEvidence || {
          sourceUrl: venueEvent.canonical_url,
          feedType: 'official_venue_calendar',
          confirmationStatus: 'confirmed_by_official_calendar',
          ticketUrl: vTicket
        },
        {
          sourceId: `artist_${normalizePerformerName(tourDate.performer)}`,
          sourceUrl: tourDate.sourceUrl,
          feedType: isAggregator ? 'aggregator_tour_schedule' : 'official_artist_tour_page',
          contentHash: tourDate.contentHash,
          performer: tourDate.performer,
          ticketUrl: tourDate.ticketUrl,
          confirmationStatus: isAggregator ? 'confirmed_by_aggregator' : 'confirmed_by_artist_tour_schedule'
        }
      ];

      return {
        status: confirmationStatus,
        isDualConfirmed: !isAggregator,
        isAggregatorCorroborated: isAggregator,
        ticketUrlDifference: ticketUrlDiff,
        event: {
          ...venueEvent,
          confirmationStatus,
          dualConfirmed: !isAggregator,
          sources: dualSources,
          provenanceDifference: ticketUrlDiff ? {
            ticketUrlNote: 'Artist tour page and venue calendar provide distinct ticket links',
            venueTicketUrl: vTicket,
            artistTicketUrl: tourDate.ticketUrl
          } : null,
          correlatedTicketingProvider: ticketingCorrelation.correlated ? ticketingCorrelation.provider : null,
          correlatedTicketingId: ticketingCorrelation.sharedId,
          lastDualConfirmedAt: new Date().toISOString()
        },
        matchedTourDate: tourDate,
        correlatedTicketing: ticketingCorrelation
      };
    } else {
      // Record time disparity candidate in case no later showtime on same day matches
      if (!timeDiscrepancyCandidate) {
        timeDiscrepancyCandidate = {
          tourDate,
          ticketingCorrelation,
          reviewReason: `Time discrepancy: venue lists ${vTime || 'none'}, artist lists ${tourDate.localTime || 'none'}`
        };
      }
    }
  }

  // If an exact date/venue match had a time disparity across all candidates, flag for review
  if (timeDiscrepancyCandidate) {
    return {
      status: CONFIRMATION_STATUSES.NEEDS_REVIEW || 'needs_review',
      timeDiscrepancy: true,
      reviewReason: timeDiscrepancyCandidate.reviewReason,
      event: {
        ...venueEvent,
        confirmationStatus: CONFIRMATION_STATUSES.NEEDS_REVIEW || 'needs_review',
        reviewNotes: timeDiscrepancyCandidate.reviewReason,
        sources: [
          venueEvent.sourceEvidence,
          {
            sourceId: `artist_${normalizePerformerName(timeDiscrepancyCandidate.tourDate.performer)}`,
            sourceUrl: timeDiscrepancyCandidate.tourDate.sourceUrl,
            feedType: 'artist_tour_page',
            contentHash: timeDiscrepancyCandidate.tourDate.contentHash
          }
        ]
      },
      matchedTourDate: timeDiscrepancyCandidate.tourDate,
      correlatedTicketing: timeDiscrepancyCandidate.ticketingCorrelation
    };
  }

  // If a fuzzy candidate was found, flag for review
  if (fuzzyCandidate) {
    return {
      status: CONFIRMATION_STATUSES.NEEDS_REVIEW || 'needs_review',
      isFuzzyMatch: true,
      reviewReason: fuzzyCandidate.reason,
      event: {
        ...venueEvent,
        confirmationStatus: CONFIRMATION_STATUSES.NEEDS_REVIEW || 'needs_review',
        reviewNotes: fuzzyCandidate.reason
      },
      matchedTourDate: fuzzyCandidate.tourDate,
      correlatedTicketing: null
    };
  }

  // No cross-source match found; maintain existing status
  return {
    status: venueEvent.confirmationStatus || 'confirmed_by_official_calendar',
    event: venueEvent,
    matchedTourDate: null,
    correlatedTicketing: null
  };
}

/**
 * Resolves venue identity across national registry, intake queue, and canonical inventory
 */
function resolveVenueIdentity(candidate = {}, context = {}) {
  const {
    nationalRegistry = require('./national-registry').NATIONAL_COMEDY_VENUES,
    promotedSlugs = require('./national-registry').PROMOTED_VENUE_SLUGS,
    intakeQueue = null
  } = context;

  const rawName = candidate.venueName || candidate.name || '';
  const normName = normalizeVenueName(rawName);
  const city = (candidate.city || '').toLowerCase().trim();

  // 1. Check if promoted in production (the 23 live clubs)
  for (const v of nationalRegistry) {
    if (promotedSlugs.includes(v.slug)) {
      if (isSameVenue(v.name, rawName) && (!city || v.city.toLowerCase() === city)) {
        return {
          matchType: 'promoted_production_venue',
          matchedVenue: v,
          isKnown: true,
          status: 'live',
          venueSlug: v.slug
        };
      }
    }
  }

  // 2. Check national candidate registry (e.g. Tacoma Comedy Club, Spokane Comedy Club)
  for (const v of nationalRegistry) {
    if (!promotedSlugs.includes(v.slug)) {
      if (isSameVenue(v.name, rawName) && (!city || v.city.toLowerCase() === city)) {
        return {
          matchType: 'already_known_candidate',
          matchedVenue: v,
          isKnown: true,
          source: 'national_registry',
          status: 'already_known_candidate',
          venueSlug: v.slug
        };
      }
    }
  }

  // 3. Check intake queue if available
  if (intakeQueue && intakeQueue.records) {
    for (const [slug, record] of intakeQueue.records) {
      if (isSameVenue(record.name, rawName) && (!city || (record.city || '').toLowerCase() === city)) {
        return {
          matchType: 'already_known_candidate',
          matchedVenue: record,
          isKnown: true,
          source: 'intake_queue',
          status: record.status || 'already_known_candidate',
          venueSlug: slug
        };
      }
    }
  }

  // 4. Net-new unmapped discovery
  return {
    matchType: 'net_new_discovery',
    matchedVenue: null,
    isKnown: false,
    status: 'discovered_venue_candidate',
    venueSlug: null
  };
}

/**
 * Identifies venue candidates from artist tour schedules and resolves identity
 */
function discoverNewVenuesFromTourDates(tourDates = [], contextOrVenues = {}) {
  let context = {};
  if (Array.isArray(contextOrVenues)) {
    context = { nationalRegistry: contextOrVenues };
  } else {
    context = contextOrVenues;
  }

  const nationalRegistry = context.nationalRegistry || require('./national-registry').NATIONAL_COMEDY_VENUES;
  const promotedSlugs = context.promotedSlugs || require('./national-registry').PROMOTED_VENUE_SLUGS;
  const intakeQueue = context.intakeQueue || null;

  const candidates = [];
  const seenSlugsOrNames = new Set();

  for (const td of tourDates) {
    if (td.isCityOnly || !td.venueName || !td.city) {
      continue;
    }

    const normVenue = normalizeVenueName(td.venueName);
    const idRes = resolveVenueIdentity(td, { nationalRegistry, promotedSlugs, intakeQueue });

    // If it's already a promoted production club, skip venue discovery (handled in dual confirmation)
    if (idRes.matchType === 'promoted_production_venue') {
      continue;
    }

    // Unless includeKnownCandidates is explicitly enabled (e.g. by TraversalEngine),
    // skip venues that are already known in the registry or intake queue
    if (!context.includeKnownCandidates && idRes.isKnown) {
      continue;
    }

    const dedupKey = idRes.venueSlug || `${normVenue}_${td.city.toLowerCase()}`;
    if (!seenSlugsOrNames.has(dedupKey)) {
      seenSlugsOrNames.add(dedupKey);

      candidates.push({
        candidateId: `cand_${crypto.createHash('sha256').update(`${normVenue}_${td.city}`).digest('hex').slice(0, 12)}`,
        venueName: td.venueName,
        normalizedName: normVenue,
        city: td.city,
        state: td.state || null,
        discoveredViaArtist: td.performer,
        tourDate: td.localDate,
        ticketUrl: td.ticketUrl,
        sourceUrl: td.sourceUrl,
        discoveryProvenance: `Observed on ${td.performer} official tour schedule for date ${td.localDate}`,
        status: idRes.status,
        classification: idRes.matchType, // 'already_known_candidate' | 'net_new_discovery'
        matchedRegistryVenue: idRes.matchedVenue,
        venueSlug: idRes.venueSlug,
        discoveredAt: new Date().toISOString()
      });
    }
  }

  return candidates;
}

// In-memory telemetry and discovery store
const tourGraphStore = {
  trackedComedians: new Map(),
  discoveredCandidates: new Map(),
  dualConfirmedEvents: new Map()
};

/**
 * Processes a batch of events through the Two-Way Tour Graph:
 * - Indexes observed touring comedians
 * - Reconciles cross-source dual confirmations
 * - Discovers new unlisted candidate venues
 */
function processBatchTourGraph(events = [], options = {}) {
  const existingVenues = options.existingVenues || NATIONAL_COMEDY_VENUES;
  const knownTourDates = options.knownTourDates || [];

  // 1. Extract comedians from club lineups
  const comedians = extractLineupComedians(events);
  for (const c of comedians) {
    if (!tourGraphStore.trackedComedians.has(c.normalizedName)) {
      tourGraphStore.trackedComedians.set(c.normalizedName, { ...c });
    } else {
      const existing = tourGraphStore.trackedComedians.get(c.normalizedName);
      existing.observedAtVenues.push(...c.observedAtVenues);
    }
  }

  // 2. Cross-reconcile dual sources
  let dualConfirmedCount = 0;
  const reconciledEvents = [];
  for (const ev of events) {
    if (knownTourDates.length > 0) {
      const rec = reconcileDualOfficialSources(ev, knownTourDates);
      if (rec.status === CONFIRMATION_STATUSES.CONFIRMED_BY_DUAL_OFFICIAL_SOURCES) {
        dualConfirmedCount++;
        tourGraphStore.dualConfirmedEvents.set(ev.id || ev.fingerprint, rec.event);
      }
      reconciledEvents.push(rec.event);
    } else {
      reconciledEvents.push(ev);
    }
  }

  // 3. Discover new venues from touring schedules
  const newCandidates = discoverNewVenuesFromTourDates(knownTourDates, existingVenues);
  for (const cand of newCandidates) {
    tourGraphStore.discoveredCandidates.set(cand.candidateId, cand);
  }

  return {
    comediansExtracted: comedians.length,
    dualConfirmedCount,
    candidateVenuesDiscovered: newCandidates.length,
    candidates: newCandidates,
    reconciledEvents
  };
}

/**
 * Returns current two-way tour graph telemetry
 */
function getTourGraphTelemetry() {
  return {
    totalTrackedComedians: tourGraphStore.trackedComedians.size,
    totalDualConfirmedEvents: tourGraphStore.dualConfirmedEvents.size,
    totalDiscoveredCandidates: tourGraphStore.discoveredCandidates.size,
    discoveredCandidates: Array.from(tourGraphStore.discoveredCandidates.values()),
    sampleTrackedComedians: Array.from(tourGraphStore.trackedComedians.values()).slice(0, 10)
  };
}

module.exports = {
  normalizePerformerName,
  isSamePerformer,
  normalizeVenueName,
  isSameVenue,
  detectTicketingCorrelation,
  extractLineupComedians,
  normalizeArtistTourDate,
  reconcileDualOfficialSources,
  resolveVenueIdentity,
  discoverNewVenuesFromTourDates,
  processBatchTourGraph,
  getTourGraphTelemetry,
  levenshteinSimilarity,
  matchPerformer,
  tourGraphStore
};

