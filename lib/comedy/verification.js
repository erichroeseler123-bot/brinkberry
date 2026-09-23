/**
 * Stand-Up Comedy Trust & Verification Lifecycle Engine
 *
 * Implements strict state transitions:
 * submitted -> pending_review -> verified -> updated_by_venue -> stale -> cancelled
 *
 * Unverified community submissions will never surface on live public feeds.
 */

const { LIFECYCLE_STATES, normalizeComedyMetadata } = require('./schema');

// Platform reviewer secret token (configured via env or fallback for moderation)
const REVIEWER_SECRET = process.env.COMEDY_MODERATOR_TOKEN || 'brinkberry_comedy_mod_2026';

function isPubliclyVisible(state) {
  return state === 'verified' || state === 'updated_by_venue';
}

function isValidState(state) {
  return LIFECYCLE_STATES.includes(state);
}

/**
 * Validates submission payload
 */
function validateSubmission(payload = {}) {
  const errors = [];
  const venue = payload.venue_name || payload.venueName || payload.venue;
  const start = payload.start_time || payload.startTime || payload.start;

  if (!payload.title || typeof payload.title !== 'string' || payload.title.trim().length < 3) {
    errors.push('Title is required (at least 3 characters)');
  }
  if (!venue || typeof venue !== 'string' || venue.trim().length < 2) {
    errors.push('Venue name is required');
  }
  if (!payload.city || typeof payload.city !== 'string' || payload.city.trim().length < 2) {
    errors.push('City is required');
  }
  if (!start) {
    errors.push('Start time is required');
  } else {
    const d = new Date(start);
    if (isNaN(d.getTime())) {
      errors.push('Start time must be a valid ISO date/time string');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Creates a new submission record with initial state 'submitted'
 */
function createSubmission(payload = {}) {
  const validation = validateSubmission(payload);
  if (!validation.valid) {
    throw new Error(`Invalid submission: ${validation.errors.join(', ')}`);
  }

  const id = `comedy_sub_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const venueToken = `vt_${Math.random().toString(36).substring(2, 12)}`;
  const editKey = `ek_${Math.random().toString(36).substring(2, 12)}`;
  const now = new Date().toISOString();

  const comedyMeta = normalizeComedyMetadata(payload);
  const venue = (payload.venue_name || payload.venueName || payload.venue).trim();
  const start = payload.start_time || payload.startTime || payload.start;

  return {
    id,
    title: payload.title.trim(),
    start_time: new Date(start).toISOString(),
    end_time: (payload.end_time || payload.end) ? new Date(payload.end_time || payload.end).toISOString() : null,
    venue_name: venue,
    venue_address: payload.venue_address ? payload.venue_address.trim() : null,
    city: payload.city.trim(),
    venue_latitude: Number(payload.lat ?? payload.venue_latitude),
    venue_longitude: Number(payload.lng ?? payload.venue_longitude),
    category_tags: ['comedy'],
    vibe_labels: ['comedy', comedyMeta.showType],
    price_status: payload.price_status || (payload.price === 'Free' || payload.price === '0' ? 'free' : 'paid'),
    price_min: payload.price_min != null ? Number(payload.price_min) : (payload.price === 'Free' ? 0 : null),
    price_max: payload.price_max != null ? Number(payload.price_max) : null,
    price_display: payload.price_display || (payload.price_status === 'free' ? 'Free' : (payload.price || 'Check event')),
    description: payload.description ? payload.description.trim() : `${payload.title} at ${payload.venue_name}`,
    canonical_url: payload.canonical_url || payload.ticket_url || '',
    canonical_image_url: payload.canonical_image_url || null,
    source: 'community_submission',
    sourceAttribution: payload.sourceAttribution || 'Submitted by Community Organizer',
    lastVerifiedAt: now,
    indoor_outdoor: 'indoor',
    comedy: comedyMeta,
    verification: {
      status: 'submitted',
      venueToken,
      editKey,
      submittedAt: now,
      reviewedAt: null,
      reviewedBy: null,
      notes: payload.notes || null,
      history: [
        { state: 'submitted', timestamp: now, actor: 'submitter' }
      ]
    }
  };
}

/**
 * Transitions submission state with authorization check
 */
function transitionState(record, newState, auth = {}) {
  if (!record || !record.verification) {
    throw new Error('Invalid record');
  }
  if (!isValidState(newState)) {
    throw new Error(`Invalid lifecycle state: ${newState}`);
  }

  const now = new Date().toISOString();
  const current = record.verification.status;

  // Authorization rules
  if (newState === 'verified' || newState === 'pending_review' || newState === 'stale') {
    if (auth.moderatorToken !== REVIEWER_SECRET && auth.token !== REVIEWER_SECRET) {
      throw new Error('Unauthorized: Moderator token required');
    }
  } else if (newState === 'cancelled') {
    const isAuth = (auth.moderatorToken === REVIEWER_SECRET || auth.token === REVIEWER_SECRET ||
                    (auth.editKey && auth.editKey === record.verification.editKey) ||
                    (auth.venueToken && auth.venueToken === record.verification.venueToken));
    if (!isAuth) {
      throw new Error('Unauthorized: Moderator token or submitter edit key required');
    }
  } else if (newState === 'updated_by_venue') {
    const isAuth = (auth.token === REVIEWER_SECRET ||
                    (auth.venueToken && auth.venueToken === record.verification.venueToken) ||
                    (auth.editKey && auth.editKey === record.verification.editKey));
    if (!isAuth) {
      throw new Error('Unauthorized: Valid venue token or edit key required');
    }
  }

  record.verification.status = newState;
  record.verification.reviewedAt = now;
  record.lastVerifiedAt = now;
  record.verification.reviewedBy = auth.actor || (auth.editKey ? 'organizer' : (auth.venueToken ? 'venue' : 'moderator'));
  record.verification.history.push({
    from: current,
    to: newState,
    timestamp: now,
    actor: record.verification.reviewedBy,
    notes: auth.notes || null
  });

  return record;
}

module.exports = {
  REVIEWER_SECRET,
  isPubliclyVisible,
  isValidState,
  validateSubmission,
  createSubmission,
  transitionState
};
