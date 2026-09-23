/**
 * Deterministic Event Identity & Multi-Source Merge Engine
 *
 * Implements deterministic identity fingerprints and multi-source event deduplication.
 * When multiple sources (commercial, curated, community) refer to the same physical
 * performance or race:
 * - Generates consistent fingerprint ID
 * - Merges them into a single canonical event record
 * - Preserves all source records in `sources[]`
 * - Prefers the strongest evidence confirmation tier
 * - Explicitly exposes conflicts (start times, prices, titles) instead of hiding them
 */

const crypto = require('node:crypto');

const CONFIRMATION_PRIORITY = {
  confirmed_exact_event: 5,
  confirmed_by_official_calendar: 4,
  confirmed_by_aggregator: 3,
  community_submitted: 2,
  unconfirmed_seed: 1,
  venue_presence_only: 0
};

/**
 * Normalizes title string for identity comparison
 */
function normalizeTitle(title = '') {
  return String(title || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes venue identifier
 */
function normalizeVenueId(venue = '', venueId = '', city = '') {
  if (venueId) return String(venueId).toLowerCase().trim();
  return `${String(venue || '').toLowerCase().replace(/[^\w]/g, '')}_${String(city || '').toLowerCase().replace(/[^\w]/g, '')}`;
}

/**
 * Normalizes local civil date/time to exact minute (YYYY-MM-DDTHH:mm)
 */
function getCivilTimeBucket(isoDateStr) {
  if (!isoDateStr) return 'unknown_time';
  const d = new Date(isoDateStr);
  if (isNaN(d.getTime())) return 'invalid_time';
  // Exact civil time down to the minute: 'YYYY-MM-DDTHH:mm'
  return d.toISOString().slice(0, 16);
}

/**
 * Computes deterministic SHA-256 fingerprint for an event
 */
function computeEventFingerprint(params = {}) {
  const {
    venue = '',
    venueId = '',
    city = '',
    startTime = '',
    title = '',
    performerOrSeries = ''
  } = params;

  const vNorm = normalizeVenueId(venue, venueId, city);
  const tExact = getCivilTimeBucket(startTime);
  const titleNorm = normalizeTitle(title);
  const perfNorm = normalizeTitle(performerOrSeries);

  const rawKey = `${vNorm}|${tExact}|${titleNorm}|${perfNorm}`;
  const hash = crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 16);
  return `evt_${hash}`;
}

/**
 * Detects conflicts between two candidate records for the same event
 */
function detectEventConflicts(primary, candidate) {
  const conflicts = [];

  // Start time discrepancy (e.g. door vs showtime discrepancy within the 15-min merge tolerance)
  const t1 = new Date(primary.start || primary.start_time).getTime();
  const t2 = new Date(candidate.start || candidate.start_time).getTime();
  if (Number.isFinite(t1) && Number.isFinite(t2) && Math.abs(t1 - t2) > 0) {
    conflicts.push({
      field: 'start_time',
      primaryValue: primary.start || primary.start_time,
      candidateValue: candidate.start || candidate.start_time,
      candidateSource: candidate.source || 'unknown'
    });
  }

  // Price discrepancy
  const p1 = primary.price_display || primary.priceDisplay;
  const p2 = candidate.price_display || candidate.priceDisplay;
  if (p1 && p2 && p1 !== p2 && p1 !== 'Check event' && p2 !== 'Check event') {
    conflicts.push({
      field: 'price',
      primaryValue: p1,
      candidateValue: p2,
      candidateSource: candidate.source || 'unknown'
    });
  }

  // Age restriction discrepancy
  const a1 = primary.ageRestriction || primary.age_restriction || primary.comedy?.ageLimit;
  const a2 = candidate.ageRestriction || candidate.age_restriction || candidate.comedy?.ageLimit;
  if (a1 && a2 && a1 !== a2 && a1 !== 'unknown' && a2 !== 'unknown') {
    conflicts.push({
      field: 'age_limit',
      primaryValue: a1,
      candidateValue: a2,
      candidateSource: candidate.source || 'unknown'
    });
  }

  return conflicts;
}

/**
 * Deterministically deduplicates and merges an array of events
 */
function getRecordPriority(rec = {}) {
  if (rec.source === 'official_ingestion') return 6;
  if (rec.confirmationStatus && CONFIRMATION_PRIORITY[rec.confirmationStatus] != null) {
    return CONFIRMATION_PRIORITY[rec.confirmationStatus];
  }
  if (rec.source === 'curated') return CONFIRMATION_PRIORITY.confirmed_by_official_calendar;
  if (rec.source === 'seatgeek' || rec.source === 'ticketmaster') return CONFIRMATION_PRIORITY.confirmed_by_aggregator;
  if (rec.source === 'verified_community' || rec.sourceType === 'open_mic_host') return CONFIRMATION_PRIORITY.community_submitted;
  return CONFIRMATION_PRIORITY.unconfirmed_seed;
}

function cleanAlphaNumeric(str = '') {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function areVenuesSimilar(e1, e2) {
  const slug1 = cleanAlphaNumeric(e1.venueSlug || e1.venueId || e1.trackSlug);
  const slug2 = cleanAlphaNumeric(e2.venueSlug || e2.venueId || e2.trackSlug);
  if (slug1 && slug2 && slug1 === slug2) return true;

  const v1 = cleanAlphaNumeric(e1.venue || e1.venue_name || e1.trackName);
  const v2 = cleanAlphaNumeric(e2.venue || e2.venue_name || e2.trackName);
  if (!v1 || !v2) return true;
  if (v1 === v2) return true;
  if (v1.length > 5 && v2.length > 5 && (v1.includes(v2) || v2.includes(v1))) return true;
  if (slug1 && (slug1.includes(v2) || v2.includes(slug1))) return true;
  if (slug2 && (slug2.includes(v1) || v1.includes(slug2))) return true;

  return false;
}

function areTitlesSimilar(title1 = '', title2 = '') {
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);
  if (!norm1 || !norm2) return false;
  if (norm1 === norm2) return true;
  if (norm1.length > 8 && norm2.length > 8 && (norm1.includes(norm2) || norm2.includes(norm1))) return true;

  // Strip common event stop words
  const stopWords = new Set(['live', 'tour', 'show', 'showcase', 'standup', 'stand', 'up', 'allstars', 'night', 'saturday', 'friday', 'sunday', 'tickets', 'special', 'event', 'at', '18', '21']);
  const words1 = norm1.split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w));
  const words2 = norm2.split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w));

  const intersection = words1.filter(w => words2.includes(w));
  if (intersection.length >= 2) return true;
  if (intersection.length === 1 && intersection[0].length >= 5) return true;

  return false;
}

function areEventsDuplicate(e1, e2) {
  if (e1.fingerprint && e2.fingerprint && e1.fingerprint === e2.fingerprint) {
    return true;
  }

  // Distinct external IDs from the SAME provider/source must NEVER merge
  if (e1.source && e2.source && e1.source === e2.source) {
    const id1 = e1.id || e1.externalId;
    const id2 = e2.id || e2.externalId;
    if (id1 && id2 && id1 !== id2) {
      return false;
    }
  }

  // Must be at equivalent or similar venues
  if (!areVenuesSimilar(e1, e2)) return false;

  const t1 = new Date(e1.start_time || e1.start || e1.datetime_utc).getTime();
  const t2 = new Date(e2.start_time || e2.start || e2.datetime_utc).getTime();

  if (!Number.isFinite(t1) || !Number.isFinite(t2)) {
    return false;
  }

  const diffMinutes = Math.abs(t1 - t2) / (60 * 1000);
  // Distinct same-venue showtimes (e.g. 6:30 PM vs 9:00 PM is 150 mins) must NEVER merge.
  // Narrow tolerance: Door vs showtime or minor timezone drift <= 15 minutes.
  if (diffMinutes > 15) {
    return false;
  }

  // Exact same show title or performer within the narrow start time tolerance
  if (areTitlesSimilar(e1.title, e2.title)) return true;

  const p1 = normalizeTitle(e1.comedy?.comedians?.[0] || e1.racing?.sanction || '');
  const p2 = normalizeTitle(e2.comedy?.comedians?.[0] || e2.racing?.sanction || '');
  if (p1 && p2 && p1 === p2) return true;

  // Racetrack program deduplication: a single physical track hosts one race program per evening within 15 min window
  const isRacing1 = e1.category === 'racing' || (e1.category_tags || []).includes('racing') || Boolean(e1.racing) || Boolean(e1.trackSlug);
  const isRacing2 = e2.category === 'racing' || (e2.category_tags || []).includes('racing') || Boolean(e2.racing) || Boolean(e2.trackSlug);
  if (isRacing1 && isRacing2 && diffMinutes <= 15) {
    return true;
  }

  return false;
}

/**
 * Deterministically deduplicates and merges an array of events
 */
function mergeEvents(events = []) {
  if (!Array.isArray(events) || events.length === 0) return [];

  const groups = [];

  for (const raw of events) {
    let matchedGroup = groups.find(g => areEventsDuplicate(g.records[0], raw));
    if (matchedGroup) {
      matchedGroup.records.push(raw);
    } else {
      const fp = raw.fingerprint || computeEventFingerprint({
        venue: raw.venue || raw.venue_name || '',
        venueId: raw.venueSlug || raw.venue_id || raw.venueId || '',
        city: raw.city || '',
        startTime: raw.start || raw.start_time || raw.datetime_utc || '',
        title: raw.title || '',
        performerOrSeries: raw.comedy?.comedians?.[0] || raw.racing?.sanction || ''
      });
      groups.push({ fingerprint: fp, records: [raw] });
    }
  }

  const merged = [];

  for (const { fingerprint, records } of groups) {
    if (records.length === 1) {
      const rec = records[0];
      merged.push({
        ...rec,
        fingerprint,
        sources: [
          {
            source: rec.source || 'curated',
            id: rec.id,
            confirmationStatus: rec.confirmationStatus || (rec.source === 'seatgeek' || rec.source === 'ticketmaster' ? 'confirmed_by_aggregator' : 'unconfirmed_seed'),
            ticketUrl: rec.ticketUrl || rec.ticket_url || rec.canonical_url || null,
            price: rec.priceDisplay || rec.price_display || null
          }
        ],
        conflicts: []
      });
      continue;
    }

    // Sort by evidence priority descending
    records.sort((a, b) => getRecordPriority(b) - getRecordPriority(a));

    const primary = { ...records[0] };
    const allSources = [];
    const allConflicts = [];

    for (const r of records) {
      allSources.push({
        source: r.source || 'unknown',
        id: r.id,
        confirmationStatus: r.confirmationStatus || (r.source === 'seatgeek' || r.source === 'ticketmaster' ? 'confirmed_by_aggregator' : 'unconfirmed_seed'),
        ticketUrl: r.ticketUrl || r.ticket_url || r.canonical_url || null,
        price: r.priceDisplay || r.price_display || null
      });

      if (r !== records[0]) {
        const cfl = detectEventConflicts(primary, r);
        if (cfl.length > 0) allConflicts.push(...cfl);
      }

      if (!primary.canonical_image_url && (r.canonical_image_url || r.image)) {
        primary.canonical_image_url = r.canonical_image_url || r.image;
      }
      if (!primary.comedy && r.comedy) primary.comedy = r.comedy;
      if (!primary.racing && r.racing) primary.racing = r.racing;
      if (!primary.official_source_url && (r.official_source_url || r.officialSourceUrl)) {
        primary.official_source_url = r.official_source_url || r.officialSourceUrl;
      }
      if (!primary.sourceEvidence && r.sourceEvidence) {
        primary.sourceEvidence = r.sourceEvidence;
      }
      if ((!primary.category_tags || primary.category_tags.length === 0) && r.category_tags) {
        primary.category_tags = r.category_tags;
      }
    }

    // Retain best URLs and metadata
    const getTicket = (r) => r ? (r.ticketUrl || r.ticket_url || r.canonical_url || null) : null;
    const officialTicket = getTicket(records.find(r => r.sourceType === 'official_box_office')) || getTicket(primary);
    const commercialTicket = getTicket(records.find(r => r.source === 'seatgeek' || r.source === 'ticketmaster'));
    const chosenTicket = officialTicket || commercialTicket || getTicket(primary);

    merged.push({
      ...primary,
      fingerprint,
      ticketUrl: chosenTicket,
      ticket_url: chosenTicket,
      sourceCount: records.length,
      sources: allSources,
      conflicts: allConflicts,
      provenance: {
        primarySource: primary.source || 'curated',
        contributingSources: records.map(r => r.source || 'unknown'),
        mergedAt: new Date().toISOString()
      }
    });
  }

  return merged;
}

module.exports = {
  CONFIRMATION_PRIORITY,
  normalizeTitle,
  normalizeVenueId,
  getCivilTimeBucket,
  computeEventFingerprint,
  detectEventConflicts,
  areEventsDuplicate,
  mergeEvents
};
