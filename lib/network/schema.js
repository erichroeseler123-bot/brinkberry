/**
 * Vertical Ingestion Network Schemas
 *
 * Defines first-class domain models for Comedy and Motorsports:
 * - Comedy: ComedyVenue, ComedyShow, OpenMicSession
 * - Motorsports: TrackFacility, RaceEvent, SanctioningBody
 * - Evidence & Provenance: EvidenceRecord, SourceLifecycleState
 */

const SOURCE_LIFECYCLE_STATES = Object.freeze({
  PENDING_VERIFICATION: 'pending_verification',
  PENDING_VENUE_AUTHORIZATION: 'pending_venue_authorization',
  ACTIVE: 'active',
  AGING: 'aging',
  STALE: 'stale',
  DISABLED: 'disabled'
});

const CONFIRMATION_STATUSES = Object.freeze({
  CONFIRMED_BY_DUAL_OFFICIAL_SOURCES: 'confirmed_by_dual_official_sources',
  CONFIRMED_BY_OFFICIAL_CALENDAR: 'confirmed_by_official_calendar',
  CONFIRMED_BY_CROSS_SOURCE: 'confirmed_by_cross_source',
  CORROBORATED_ARTIST_LEAD: 'corroborated_artist_lead',
  OFFICIAL_SOCIAL_CORROBORATED: 'official_social_corroborated',
  AGGREGATOR_CORROBORATED: 'aggregator_corroborated',
  CONFIRMED_BY_AGGREGATOR: 'confirmed_by_aggregator',
  VERIFIED_COMMUNITY_SUBMISSION: 'verified_community_submission',
  ADMIN_VERIFIED: 'admin_verified',
  ORGANIZER_CONFIRMED: 'organizer_confirmed',
  COMMUNITY_SUBMITTED: 'community_submitted',
  NEEDS_REVIEW: 'needs_review',
  PENDING_REVIEW: 'pending_review',
  UNCONFIRMED_EXTERNAL_SOURCE: 'unconfirmed_external_source',
  UNCONFIRMED_SEED: 'unconfirmed_seed'
});

const TRACK_SURFACES = Object.freeze({
  DIRT_OVAL: 'dirt_oval',
  ASPHALT_OVAL: 'asphalt_oval',
  DRAG_STRIP: 'drag_strip',
  ROAD_COURSE: 'road_course',
  KARTING: 'karting'
});

const COMEDY_ROOM_TYPES = Object.freeze({
  DEDICATED_CLUB: 'dedicated_club',
  THEATER: 'theater',
  INDEPENDENT_ROOM: 'independent_room',
  IMPROV_THEATER: 'improv_theater',
  BAR_ROOM: 'bar_room',
  COMMUNITY_SPACE: 'community_space'
});

/**
 * Validates and normalizes a Comedy Venue record
 */
function createComedyVenue(data = {}) {
  if (!data.id || !data.name || !data.city || !data.state) {
    throw new Error('Comedy venue requires id, name, city, and state');
  }

  return {
    id: String(data.id).trim(),
    name: String(data.name).trim(),
    roomType: data.roomType || COMEDY_ROOM_TYPES.INDEPENDENT_ROOM,
    city: String(data.city).trim(),
    state: String(data.state).trim(),
    lat: Number(data.lat),
    lon: Number(data.lon),
    timezone: data.timezone || 'America/Denver',
    website: data.website || null,
    ticketingUrl: data.ticketingUrl || null,
    isClaimed: Boolean(data.isClaimed),
    claimVerifiedAt: data.claimVerifiedAt || null,
    metadata: data.metadata || {}
  };
}

/**
 * Validates and normalizes a Motorsports Track record
 */
function createTrackFacility(data = {}) {
  if (!data.id || !data.name || !data.city || !data.state) {
    throw new Error('Track facility requires id, name, city, and state');
  }

  return {
    id: String(data.id).trim(),
    name: String(data.name).trim(),
    surface: data.surface || TRACK_SURFACES.DIRT_OVAL,
    lengthMiles: data.lengthMiles != null ? Number(data.lengthMiles) : null,
    city: String(data.city).trim(),
    state: String(data.state).trim(),
    lat: Number(data.lat),
    lon: Number(data.lon),
    timezone: data.timezone || 'America/New_York',
    website: data.website || null,
    scheduleUrl: data.scheduleUrl || null,
    sanctioningBodies: Array.isArray(data.sanctioningBodies) ? data.sanctioningBodies : [],
    isClaimed: Boolean(data.isClaimed),
    claimVerifiedAt: data.claimVerifiedAt || null,
    metadata: data.metadata || {}
  };
}

/**
 * Validates an Evidence Record attached to every canonical event
 */
function createEvidenceRecord(data = {}) {
  if (!data.sourceId || !data.confirmationStatus) {
    throw new Error('Evidence record requires sourceId and confirmationStatus');
  }

  return {
    sourceId: String(data.sourceId),
    sourceType: data.sourceType || 'official_box_office',
    confirmationStatus: data.confirmationStatus,
    httpStatus: Number(data.httpStatus) || 200,
    contentHash: data.contentHash || null,
    fetchedAt: data.fetchedAt || new Date().toISOString(),
    isCancelled: Boolean(data.isCancelled),
    rawPayloadSnippet: data.rawPayloadSnippet || null,
    exactConfirmationFields: data.exactConfirmationFields || { title: true, date: true }
  };
}

module.exports = {
  SOURCE_LIFECYCLE_STATES,
  CONFIRMATION_STATUSES,
  TRACK_SURFACES,
  COMEDY_ROOM_TYPES,
  createComedyVenue,
  createTrackFacility,
  createEvidenceRecord
};
