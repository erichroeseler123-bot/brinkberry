/**
 * Normalized Comedy Schema & Detection Utilities
 *
 * Defines the structured data model for stand-up comedy, open mics,
 * showcases, and improv shows.
 */

const SHOW_TYPES = [
  'standup',
  'open_mic',
  'showcase',
  'improv',
  'sketch',
  'headliner',
  'roast',
  'other'
];

const AGE_LIMITS = ['all_ages', '18+', '21+', 'unknown'];

const LIFECYCLE_STATES = [
  'submitted',
  'pending_review',
  'verified',
  'updated_by_venue',
  'stale',
  'cancelled'
];

/**
 * Heuristically detects show type from title, description, and tags
 */
function detectShowType(title = '', desc = '', tags = []) {
  const combined = `${title} ${desc} ${(tags || []).join(' ')}`.toLowerCase();
  if (/open\s*mic|open-mic/i.test(combined)) return 'open_mic';
  if (/improv|theatre\s*sports|second\s*city/i.test(combined)) return 'improv';
  if (/sketch/i.test(combined)) return 'sketch';
  if (/roast\s*battle|roast/i.test(combined)) return 'roast';
  if (/showcase|pro-am|locals\s*only/i.test(combined)) return 'showcase';
  if (/tour|headliner|presents:|in\s*concert/i.test(combined)) return 'headliner';
  if (/standup|stand-up|comedy\s*night|comedy\s*club/i.test(combined)) return 'standup';
  return 'standup';
}

/**
 * Detects age limit from description, notes, or venue details
 */
function detectAgeLimit(text = '') {
  const str = String(text || '').toLowerCase();
  if (/21\s*\+|21\s*and\s*over|two\s*drink\s*minimum|21\s*and\s*up/i.test(str)) return '21+';
  if (/18\s*\+|18\s*and\s*over|18\s*and\s*up/i.test(str)) return '18+';
  if (/all\s*ages|family\s*friendly|kids\s*welcome/i.test(str)) return 'all_ages';
  return 'unknown';
}

/**
 * Normalizes comedy metadata for an event record
 */
function normalizeComedyMetadata(raw = {}) {
  const title = String(raw.title || raw.name || '').trim();
  const desc = String(raw.description || raw.desc || raw.info || '').trim();
  const rawTags = raw.category_tags || raw.categories || [];

  // Comedians list extraction
  let comedians = [];
  if (Array.isArray(raw.comedians)) {
    comedians = raw.comedians.map(c => typeof c === 'string' ? c.trim() : c.name).filter(Boolean);
  } else if (typeof raw.comedians === 'string') {
    comedians = raw.comedians.split(/[,;&]/).map(s => s.trim()).filter(Boolean);
  }

  // If no explicit comedians array, attempt extraction from title (e.g. "John Mulaney: In Concert" or "Sam Tallent at Comedy Works")
  if (comedians.length === 0) {
    const titleMatch = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:\s*[:\-–—]\s*|\s+at\s+|\s+live)/);
    if (titleMatch && !/^(Live Comedy|Open Mic|Tuesday Night|The Comedy|Stand Up|Downtown)/i.test(titleMatch[1])) {
      comedians.push(titleMatch[1]);
    }
  }

  // Lineup structuring
  let lineup = [];
  if (Array.isArray(raw.lineup)) {
    lineup = raw.lineup.map(item => {
      if (typeof item === 'string') return { name: item.trim(), role: 'comic' };
      return {
        name: String(item.name || '').trim(),
        role: ['host', 'feature', 'headliner', 'comic'].includes(item.role) ? item.role : 'comic'
      };
    }).filter(i => i.name);
  } else if (comedians.length > 0) {
    lineup = comedians.map((c, i) => ({
      name: c,
      role: i === 0 && comedians.length === 1 ? 'headliner' : 'comic'
    }));
  }

  const showType = raw.showType && SHOW_TYPES.includes(raw.showType)
    ? raw.showType
    : detectShowType(title, desc, rawTags);

  const ageLimit = raw.ageLimit && AGE_LIMITS.includes(raw.ageLimit)
    ? raw.ageLimit
    : detectAgeLimit(`${desc} ${raw.notes || ''} ${title}`);

  const recurring = Boolean(raw.recurring || raw.is_recurring);
  const recurrenceText = raw.recurrenceText || (recurring ? 'Weekly show' : null);

  const sourceType = ['commercial', 'community_submission', 'verified_venue'].includes(raw.sourceType)
    ? raw.sourceType
    : (raw.source === 'ticketmaster' || raw.source === 'seatgeek' ? 'commercial' : 'community_submission');

  return {
    comedians,
    showType,
    ageLimit,
    recurring,
    recurrenceText,
    lineup,
    sourceType
  };
}

module.exports = {
  SHOW_TYPES,
  AGE_LIMITS,
  LIFECYCLE_STATES,
  detectShowType,
  detectAgeLimit,
  normalizeComedyMetadata
};
