/**
 * Brinkberry Autonomous Community Post System
 *
 * Lightweight, zero-bureaucracy public posting engine for local discovery:
 * - Anyone can post an event without accounts, venue claims, or admin approval.
 * - Publishes immediately at Level 1 (Block / Neighborhood).
 * - Broadcast Ladder (Levels 1–7): Block, Hood, Quadrant, City, County, State, Country.
 * - Rolling 48-hour discovery window & automatic post expiration.
 * - Location modes: Exact, Approximate, General Neighborhood.
 * - Accountability acknowledgment & audit record creation (without public names/signatures).
 * - Manage URL and deletion key for self-service post removal.
 * - Granular flagging taxonomy with protection for lawful opinion/protest.
 * - Standardized source labeling: "Community-submitted*" with neutral provenance tooltip.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { normalizeCategory } = require('../providers/normalizer');

const STORAGE_FILE = path.join(os.tmpdir(), 'brinkberry_community_posts.json');
const DELETED_STORAGE_FILE = path.join(os.tmpdir(), 'brinkberry_deleted_community_posts.json');

// Memory cache for active process
let memoryPosts = new Map();
let deletedPostIds = new Set();
let rateLimitLedger = new Map(); // ipHash -> [timestamps]
let isLoaded = false;

const BROADCAST_LEVELS = [
  { level: 1, id: 'block', name: 'Block / Neighborhood', radiusMiles: 2, requirement: 'Live immediately upon posting', autoApprove: true },
  { level: 2, id: 'hood', name: 'Hood / Part of Town', radiusMiles: 6, requirement: 'Requires confirmed email' },
  { level: 3, id: 'quadrant', name: 'Quadrant', radiusMiles: 15, requirement: 'Requires email + verified phone' },
  { level: 4, id: 'city', name: 'City', radiusMiles: 30, requirement: 'Stronger details, public link, trusted history, or review' },
  { level: 5, id: 'county', name: 'County', radiusMiles: 60, requirement: 'Trusted history, public source, or review' },
  { level: 6, id: 'state', name: 'State', radiusMiles: 150, requirement: 'Official/public source or stronger review' },
  { level: 7, id: 'country', name: 'Country', radiusMiles: 3000, requirement: 'National relevance and highest review' }
];

const VALID_FLAG_CATEGORIES = [
  'spam',
  'scam',
  'violence',
  'harassment',
  'doxxing',
  'impersonation',
  'illegal',
  'false_logistics',
  'broken_details'
];

function distMiles(lat1, lon1, lat2, lon2) {
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
    return null;
  }
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function loadPostsFromDisk() {
  if (isLoaded) return;
  isLoaded = true;
  try {
    if (fs.existsSync(DELETED_STORAGE_FILE)) {
      const delData = fs.readFileSync(DELETED_STORAGE_FILE, 'utf8');
      const parsedDel = JSON.parse(delData);
      if (Array.isArray(parsedDel)) {
        deletedPostIds = new Set(parsedDel);
      }
    }
  } catch (_) {}

  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const data = fs.readFileSync(STORAGE_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.id) {
            memoryPosts.set(item.id, item);
          }
        }
      }
    }
  } catch (_) {}
}

function savePostsToDisk() {
  try {
    const list = Array.from(memoryPosts.values());
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (_) {}

  try {
    const delList = Array.from(deletedPostIds);
    fs.writeFileSync(DELETED_STORAGE_FILE, JSON.stringify(delList, null, 2), 'utf8');
  } catch (_) {}
}

function hashIp(ip) {
  if (!ip) return 'anonymous';
  return crypto.createHash('sha256').update(String(ip).trim()).digest('hex').slice(0, 16);
}

function computeFingerprint(title, dateStr, lat, lon) {
  const normTitle = String(title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normDate = String(dateStr || '').slice(0, 10);
  const rLat = Number.isFinite(lat) ? Math.round(lat * 100) / 100 : 0;
  const rLon = Number.isFinite(lon) ? Math.round(lon * 100) / 100 : 0;
  return crypto.createHash('sha256').update(`${normTitle}:${normDate}:${rLat}:${rLon}`).digest('hex');
}

function sanitizeAddressForPrivacy(rawAddress = '', city = '', venueName = '') {
  let clean = String(rawAddress || '').trim();
  clean = clean.replace(/^\d+[-\d]*\s+/i, ''); // strip leading street numbers
  if (!clean || clean.length < 3) {
    clean = venueName || city || 'General Neighborhood';
  }
  return clean;
}

function checkRateLimit(ipHash) {
  const now = Date.now();
  const history = rateLimitLedger.get(ipHash) || [];
  const recent = history.filter(ts => (now - ts) < 24 * 3600 * 1000);
  rateLimitLedger.set(ipHash, recent);

  const lastHour = recent.filter(ts => (now - ts) < 3600 * 1000);
  if (lastHour.length >= 5) {
    return { allowed: false, error: 'Rate limit reached: Maximum 5 posts per hour. Please try again later.' };
  }

  if (recent.length >= 15) {
    return { allowed: false, error: 'Daily post cap reached: Maximum 15 posts per day.' };
  }

  return { allowed: true };
}

function validateContent(payload, options = {}) {
  const title = String(payload.title || '').trim();
  if (title.length < 3) {
    return { valid: false, error: 'Title must be at least 3 characters.' };
  }
  if (title.length > 100) {
    return { valid: false, error: 'Title must not exceed 100 characters.' };
  }

  const desc = String(payload.description || '').trim();
  if (desc.length > 500) {
    return { valid: false, error: 'Description must not exceed 500 characters.' };
  }

  const detailsUrl = payload.detailsUrl || payload.url || '';
  if (detailsUrl) {
    const trimmed = String(detailsUrl).trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return { valid: false, error: 'URL must start with http:// or https://' };
    }
  }

  // Accountability & Terms Check
  if (options.strictAcknowledgments || payload.accountabilityAcknowledged === false) {
    if (!payload.accountabilityAcknowledged) {
      return { valid: false, error: 'You must acknowledge responsibility for the event details before posting.' };
    }
  }
  if (options.strictAcknowledgments || payload.termsAccepted === false) {
    if (!payload.termsAccepted) {
      return { valid: false, error: 'You must agree to the Brinkberry Community Terms and Guidelines before posting.' };
    }
  }

  const fullText = `${title} ${desc}`.toLowerCase();
  const spamPatterns = [
    /\b(wire transfer|western union|crypto double|send btc|guaranteed profit)\b/i,
    /\b(call this number now for hot|free gift cards no scam)\b/i
  ];
  for (const pat of spamPatterns) {
    if (pat.test(fullText)) {
      return { valid: false, error: 'Submission flagged as suspicious promotional spam.' };
    }
  }

  return { valid: true };
}

/**
 * Sequential Broadcast Ladder evaluation:
 * Level 1 (Block / Neighborhood) is live immediately.
 * Higher levels (Hood, Quadrant, City, County, State, Country) approve sequentially.
 * If higher level is unverified/denied, event remains live at highest approved level.
 */
function evaluateBroadcastLadder(record = {}, overrides = {}) {
  const desiredLevelId = String(record.desiredBroadcastLevel || record.broadcastLevel || 'block').toLowerCase();
  let targetLevelObj = BROADCAST_LEVELS.find(l => l.id === desiredLevelId);
  if (!targetLevelObj) {
    // Map radius aliases
    if (desiredLevelId === 'neighborhood' || desiredLevelId === '1' || desiredLevelId === '2') {
      targetLevelObj = BROADCAST_LEVELS[0];
    } else if (desiredLevelId === 'hood' || desiredLevelId === 'nearby' || desiredLevelId === '5' || desiredLevelId === '10') {
      targetLevelObj = BROADCAST_LEVELS[1];
    } else if (desiredLevelId === 'quadrant' || desiredLevelId === '15') {
      targetLevelObj = BROADCAST_LEVELS[2];
    } else if (desiredLevelId === 'city' || desiredLevelId === 'broad' || desiredLevelId === 'broad_local' || desiredLevelId === '25' || desiredLevelId === '30' || desiredLevelId === '35') {
      targetLevelObj = BROADCAST_LEVELS[3];
    } else if (desiredLevelId === 'county' || desiredLevelId === '50' || desiredLevelId === '60') {
      targetLevelObj = BROADCAST_LEVELS[4];
    } else if (desiredLevelId === 'state' || desiredLevelId === '150') {
      targetLevelObj = BROADCAST_LEVELS[5];
    } else if (desiredLevelId === 'country' || desiredLevelId === 'national') {
      targetLevelObj = BROADCAST_LEVELS[6];
    } else {
      targetLevelObj = BROADCAST_LEVELS[0];
    }
  }

  const targetLevelNum = targetLevelObj.level;
  let highestApprovedLevel = 1; // Level 1 is always approved immediately

  const ladder = BROADCAST_LEVELS.map(lvl => {
    let status = 'not_requested';
    let statusReason = '';

    if (lvl.level <= targetLevelNum) {
      if (lvl.level === 1) {
        status = 'approved';
        statusReason = 'Immediate local reach (live now)';
      } else if (lvl.level === 2) {
        const hasEmail = Boolean(record.verifiedEmail || overrides.verifiedEmail || record.emailConfirmed || (record.contact && record.contact.includes('@')));
        if (highestApprovedLevel === 1 && hasEmail) {
          status = 'approved';
          highestApprovedLevel = 2;
          statusReason = 'Email confirmed';
        } else if (highestApprovedLevel < 1) {
          status = 'pending_prerequisite';
          statusReason = 'Prerequisite level not approved';
        } else {
          status = 'pending';
          statusReason = 'Requires confirmed email';
        }
      } else if (lvl.level === 3) {
        const hasEmail = highestApprovedLevel >= 2;
        const hasPhone = Boolean(record.verifiedPhone || overrides.verifiedPhone || record.phoneConfirmed);
        if (hasEmail && hasPhone) {
          status = 'approved';
          highestApprovedLevel = 3;
          statusReason = 'Email + phone confirmed';
        } else if (!hasEmail) {
          status = 'pending_prerequisite';
          statusReason = 'Requires Level 2 (confirmed email) first';
        } else {
          status = 'pending';
          statusReason = 'Requires verified phone';
        }
      } else if (lvl.level === 4) {
        const hasPrereq = highestApprovedLevel >= 3;
        const hasLinkOrReview = Boolean(record.detailsUrl || record.isTrustedPoster || record.adminApprovedLevel >= 4);
        if (hasPrereq && hasLinkOrReview) {
          status = 'approved';
          highestApprovedLevel = 4;
          statusReason = record.detailsUrl ? 'Public link verified' : 'Review approved';
        } else if (!hasPrereq) {
          status = 'pending_prerequisite';
          statusReason = 'Requires Level 3 (Quadrant) first';
        } else {
          status = 'pending';
          statusReason = 'Requires stronger details, public link, or review';
        }
      } else if (lvl.level === 5) {
        const hasPrereq = highestApprovedLevel >= 4;
        const hasReview = Boolean(record.isTrustedPoster || record.adminApprovedLevel >= 5);
        if (hasPrereq && hasReview) {
          status = 'approved';
          highestApprovedLevel = 5;
          statusReason = 'County broad reach approved';
        } else if (!hasPrereq) {
          status = 'pending_prerequisite';
          statusReason = 'Requires Level 4 (City) first';
        } else {
          status = 'pending';
          statusReason = 'Requires trusted history, public source, or review';
        }
      } else if (lvl.level === 6) {
        const hasPrereq = highestApprovedLevel >= 5;
        const hasReview = Boolean(record.adminApprovedLevel >= 6);
        if (hasPrereq && hasReview) {
          status = 'approved';
          highestApprovedLevel = 6;
          statusReason = 'State broadcast approved by review';
        } else if (!hasPrereq) {
          status = 'pending_prerequisite';
          statusReason = 'Requires Level 5 (County) first';
        } else {
          status = 'pending';
          statusReason = 'Requires official/public source or review';
        }
      } else if (lvl.level === 7) {
        const hasPrereq = highestApprovedLevel >= 6;
        const hasReview = Boolean(record.adminApprovedLevel >= 7 && record.isNationallyRelevant);
        if (hasPrereq && hasReview) {
          status = 'approved';
          highestApprovedLevel = 7;
          statusReason = 'National relevance verified';
        } else if (!hasPrereq) {
          status = 'pending_prerequisite';
          statusReason = 'Requires Level 6 (State) first';
        } else {
          status = 'pending';
          statusReason = 'Requires national relevance and highest review';
        }
      }
    }

    return {
      level: lvl.level,
      id: lvl.id,
      name: lvl.name,
      radiusMiles: lvl.radiusMiles,
      requirement: lvl.requirement,
      status,
      statusReason
    };
  });

  const approvedObj = BROADCAST_LEVELS.find(l => l.level === highestApprovedLevel) || BROADCAST_LEVELS[0];

  return {
    ladder,
    currentLevel: highestApprovedLevel,
    currentLevelId: approvedObj.id,
    currentLevelName: approvedObj.name,
    approvedRadiusMiles: approvedObj.radiusMiles,
    targetLevel: targetLevelNum,
    targetLevelId: targetLevelObj.id
  };
}

function createCommunityPost(payload = {}, options = {}) {
  loadPostsFromDisk();

  const ip = options.ip || '127.0.0.1';
  const ipHash = hashIp(ip);

  if (!options.bypassRateLimit) {
    const rateCheck = checkRateLimit(ipHash);
    if (!rateCheck.allowed) {
      return { success: false, error: rateCheck.error, status: 429 };
    }
  }

  const contentCheck = validateContent(payload, options);
  if (!contentCheck.valid) {
    return { success: false, error: contentCheck.error, status: 400 };
  }

  const now = Date.now();
  let datePart = String(payload.date || '').trim();
  let timePart = String(payload.startTime || '').trim();
  let combinedStr = timePart;
  if (datePart && timePart && !timePart.includes('-') && !timePart.includes('/')) {
    combinedStr = `${datePart}T${timePart.replace(/^T/, '')}`;
  } else if (!timePart && datePart) {
    combinedStr = datePart;
  }
  let startTimeMs = combinedStr ? new Date(combinedStr).getTime() : NaN;
  if (isNaN(startTimeMs) && datePart) {
    startTimeMs = new Date(datePart).getTime();
  }

  if (isNaN(startTimeMs)) {
    return { success: false, error: 'A valid event date and time are required.', status: 400 };
  }

  const diffHours = (startTimeMs - now) / (3600 * 1000);
  if (diffHours < -3) {
    return { success: false, error: 'Event date has already passed.', status: 400 };
  }
  if (diffHours > 48.5) {
    return { success: false, error: 'Brinkberry community posts are temporary for upcoming events within the next 48 hours.', status: 400 };
  }

  const startTimeIso = new Date(startTimeMs).toISOString();
  const endTimeMs = payload.endTime ? new Date(payload.endTime).getTime() : (startTimeMs + 3 * 3600 * 1000);
  const endTimeIso = new Date(endTimeMs).toISOString();

  // Coordinates are taken strictly from the user-entered location, NEVER silently from device GPS
  let lat = Number.isFinite(Number(payload.lat)) ? Number(payload.lat) : null;
  let lon = Number.isFinite(Number(payload.lon)) ? Number(payload.lon) : null;

  if (lat == null && Number.isFinite(Number(payload.latitude))) lat = Number(payload.latitude);
  if (lon == null && Number.isFinite(Number(payload.longitude))) lon = Number(payload.longitude);

  const city = String(payload.city || 'Nearby').trim();

  // If coordinates are missing, attempt lookup from city name / location
  if (lat == null || lon == null) {
    const searchTarget = `${city} ${payload.location || ''}`.toLowerCase();
    const cityCoords = [
      { name: 'denver', lat: 39.7392, lon: -104.9903 },
      { name: 'boulder', lat: 40.0150, lon: -105.2705 },
      { name: 'eau claire', lat: 44.8113, lon: -91.4985 },
      { name: 'minneapolis', lat: 44.9778, lon: -93.2650 },
      { name: 'st. paul', lat: 44.9537, lon: -93.0900 },
      { name: 'chicago', lat: 41.8781, lon: -87.6298 },
      { name: 'austin', lat: 30.2672, lon: -97.7431 },
      { name: 'seattle', lat: 47.6062, lon: -122.3321 },
      { name: 'new york', lat: 40.7128, lon: -74.0060 },
      { name: 'los angeles', lat: 34.0522, lon: -118.2437 }
    ];
    for (const c of cityCoords) {
      if (searchTarget.includes(c.name)) {
        if (lat == null) lat = c.lat;
        if (lon == null) lon = c.lon;
        break;
      }
    }
  }

  // Location Privacy Mode: 'exact', 'approximate', 'neighborhood'
  let locationMode = String(payload.locationMode || '').toLowerCase();
  if (!locationMode) {
    if (payload.isApproximateLocation || payload.isPrivateLocation) {
      locationMode = 'approximate';
    } else {
      locationMode = 'exact';
    }
  }

  let publicLat = lat;
  let publicLon = lon;
  let isApproximate = false;
  let isNeighborhoodOnly = false;
  const rawLocation = String(payload.location || payload.venue || '').trim();
  let displayVenue = '';

  if (locationMode === 'neighborhood') {
    isApproximate = true;
    isNeighborhoodOnly = true;
    displayVenue = payload.neighborhood || city || 'General Neighborhood';
    if (lat != null && lon != null) {
      const jitterLat = ((Math.random() - 0.5) * 0.008);
      const jitterLon = ((Math.random() - 0.5) * 0.008);
      publicLat = Number((lat + jitterLat).toFixed(4));
      publicLon = Number((lon + jitterLon).toFixed(4));
    }
  } else if (locationMode === 'approximate') {
    isApproximate = true;
    displayVenue = sanitizeAddressForPrivacy(rawLocation, city, payload.venueName);
    if (lat != null && lon != null) {
      const jitterLat = ((Math.random() - 0.5) * 0.004);
      const jitterLon = ((Math.random() - 0.5) * 0.004);
      publicLat = Number((lat + jitterLat).toFixed(4));
      publicLon = Number((lon + jitterLon).toFixed(4));
    }
  } else {
    // Exact address
    isApproximate = false;
    displayVenue = payload.venueName || rawLocation || 'Community Location';
  }

  const rawCat = payload.category || payload.category_tags?.[0] || 'community';
  let cat = normalizeCategory(rawCat, [payload.title, payload.description]);
  if (rawCat === 'party' || /party|social/i.test(rawCat)) cat = 'community';
  if (rawCat === 'protest' || /protest|rally/i.test(rawCat)) cat = 'civic';
  if (rawCat === 'food' || /food|taco|bake/i.test(rawCat)) cat = 'food';

  // Private residence check
  const isPrivateResidence = Boolean(payload.isPrivateResidence || /party|house party|open house/i.test(`${payload.title} ${payload.description} ${cat}`));
  if (isPrivateResidence && payload.housePartyAcknowledged === false) {
    return { success: false, error: 'You must acknowledge responsibility for sharing a private residence location.', status: 400 };
  }

  const fingerprint = computeFingerprint(payload.title, startTimeIso, lat, lon);
  for (const existing of memoryPosts.values()) {
    if (existing.fingerprint === fingerprint && (now - new Date(existing.createdAt).getTime()) < 24 * 3600 * 1000) {
      return { success: false, error: 'A matching event was already posted recently.', status: 409 };
    }
  }

  // Evaluate Broadcast Ladder
  const ladderEval = evaluateBroadcastLadder({
    desiredBroadcastLevel: payload.desiredBroadcastLevel || payload.broadcastLevel || payload.broadcastRadius || 'block',
    verifiedEmail: payload.verifiedEmail || payload.email || (payload.emailConfirmed ? 'verified@poster.test' : null),
    emailConfirmed: Boolean(payload.emailConfirmed || payload.verifiedEmail || (payload.contact && payload.contact.includes('@'))),
    verifiedPhone: payload.verifiedPhone || payload.phone || (payload.phoneConfirmed ? '555-555-5555' : null),
    phoneConfirmed: Boolean(payload.phoneConfirmed || payload.verifiedPhone),
    detailsUrl: payload.detailsUrl || payload.url,
    adminApprovedLevel: payload.adminApprovedLevel || 1,
    isTrustedPoster: Boolean(payload.isTrustedPoster),
    autoApproveLadder: Boolean(payload.autoApproveLadder || options.autoApproveLadder)
  });

  // Self-service Deletion Key
  const deletionKey = crypto.randomBytes(16).toString('hex');
  const deletionKeyHash = crypto.createHash('sha256').update(deletionKey).digest('hex');
  const devicePostKey = String(payload.devicePostKey || crypto.randomBytes(8).toString('hex'));

  // Traceable Submission Audit Record (creates accountability without requiring public real name)
  const auditRecord = {
    devicePostKey,
    timestamp: new Date().toISOString(),
    ipHash,
    userAgentHash: crypto.createHash('sha256').update(String(options.userAgent || '')).digest('hex').slice(0, 16),
    deletionKeyHash,
    accountabilityAcknowledged: true,
    termsAccepted: true,
    accountabilityStatement: 'I understand that I am responsible for what I post and for knowingly false, harmful, or unauthorized information.',
    termsStatement: 'I agree that the information I submit is reasonably accurate, that I have the right to share it, and that Brinkberry may remove content that is abusive, deceptive, dangerous, unlawful, or harmful.',
    verifiedEmail: payload.emailConfirmed ? String(payload.email || payload.contact) : null,
    auditDisclaimer: 'Submission audit record for accountability. Does not prove physical identity of phone holder.'
  };

  const compactPayload = {
    t: String(payload.title).trim(),
    d: String(payload.description || '').trim(),
    c: cat,
    s: startTimeIso,
    e: endTimeIso,
    v: displayVenue,
    y: city,
    r: ladderEval.approvedRadiusMiles,
    m: locationMode,
    a: isApproximate ? 1 : 0,
    lt: publicLat,
    ln: publicLon,
    ct: payload.contact ? String(payload.contact).trim() : '',
    u: payload.detailsUrl ? String(payload.detailsUrl).trim() : '',
    lvl: ladderEval.currentLevel,
    dlvl: ladderEval.targetLevelId,
    w: new Date().toISOString()
  };
  const token = Buffer.from(JSON.stringify(compactPayload)).toString('base64url');
  const id = `comm_post_v1_${token}`;

  const record = {
    id,
    fingerprint,
    title: String(payload.title).trim(),
    description: String(payload.description || '').trim(),
    category: cat,
    category_tags: [cat, rawCat].filter((v, i, a) => v && a.indexOf(v) === i),
    start_time: startTimeIso,
    start: startTimeIso,
    end_time: endTimeIso,
    end: endTimeIso,
    venue: displayVenue,
    venue_name: displayVenue,
    address: isApproximate ? null : rawLocation,
    city,
    venue_latitude: publicLat,
    venue_longitude: publicLon,
    lat: publicLat,
    lon: publicLon,
    locationMode,
    isApproximateLocation: isApproximate,
    isNeighborhoodOnly,
    isPrivateResidence,
    broadcastRadiusMiles: ladderEval.approvedRadiusMiles,
    approvedRadiusMiles: ladderEval.approvedRadiusMiles,
    desiredBroadcastLevel: ladderEval.targetLevelId,
    currentLadderLevel: ladderEval.currentLevel,
    currentLevelName: ladderEval.currentLevelName,
    ladderStatus: ladderEval.ladder,
    detailsUrl: payload.detailsUrl ? String(payload.detailsUrl).trim() : null,
    contact: payload.contact ? String(payload.contact).trim() : null,
    source: 'community_post',
    sourceType: 'community_submission',
    isCommunityPost: true,
    isAutonomousCommunityPost: true,
    confirmationStatus: 'community_submitted',
    sourceQualityLabel: 'Community-submitted*',
    sourceQualityTooltip: '*This event was submitted by a Brinkberry user and has not been independently verified. Details may change.',
    hasTicket: false,
    price_status: 'free',
    price_min: 0,
    price_max: 0,
    priceDisplay: 'Free / Walk-in',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Math.min(endTimeMs + 3600 * 1000, now + 48 * 3600 * 1000)).toISOString(),
    reportCount: 0,
    reports: [],
    isDisplayable: true,
    isDeleted: false,
    deletionKey,
    deletionKeyHash,
    auditRecord,
    submitterIpHash: ipHash
  };

  memoryPosts.set(id, record);
  savePostsToDisk();

  const currentHistory = rateLimitLedger.get(ipHash) || [];
  currentHistory.push(now);
  rateLimitLedger.set(ipHash, currentHistory);

  const manageUrl = `/post/manage?id=${record.id}&key=${deletionKey}`;

  return {
    success: true,
    event: {
      id: record.id,
      title: record.title,
      start_time: record.start_time,
      venue: record.venue,
      city: record.city,
      category: record.category,
      broadcastRadiusMiles: record.approvedRadiusMiles,
      approvedRadiusMiles: record.approvedRadiusMiles,
      currentLevel: record.currentLadderLevel,
      currentLevelName: record.currentLevelName,
      desiredLevel: record.desiredBroadcastLevel,
      ladderStatus: record.ladderStatus,
      sourceQualityLabel: record.sourceQualityLabel,
      sourceQualityTooltip: record.sourceQualityTooltip,
      url: `/event/${record.id}`,
      manageUrl,
      deletionKey
    },
    manageUrl,
    deletionKey
  };
}

function getActiveCommunityPosts(options = {}) {
  loadPostsFromDisk();

  const { lat, lon, radiusMiles = 25, windowStart, windowEnd } = options;
  const now = Date.now();
  const startWindowMs = windowStart ? new Date(windowStart).getTime() : (now - 3600 * 1000);
  const endWindowMs = windowEnd ? new Date(windowEnd).getTime() : (now + 48 * 3600 * 1000);

  const results = [];

  for (const post of memoryPosts.values()) {
    if (post.isDeleted || deletedPostIds.has(post.id)) continue;
    if (!post.isDisplayable || (post.reportCount || 0) >= 2) continue;

    const startMs = new Date(post.start_time).getTime();
    const endMs = new Date(post.end_time || post.start_time).getTime();
    const expiresMs = new Date(post.expiresAt).getTime();

    if (now > endMs + 3600 * 1000 || now > expiresMs) continue;
    if (startMs < startWindowMs || startMs > endWindowMs) continue;

    let d = null;
    if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(post.lat) && Number.isFinite(post.lon)) {
      d = distMiles(lat, lon, post.lat, post.lon);
      if (d != null) {
        // Enforce the ladder approved radius
        const effectiveRadius = post.approvedRadiusMiles || post.broadcastRadiusMiles || radiusMiles;
        const maxEffectiveRadius = Math.min(radiusMiles, effectiveRadius);
        if (d > maxEffectiveRadius) continue;
      }
    }

    results.push({
      ...post,
      distance_miles: d != null ? Number(d.toFixed(1)) : null,
      distanceMiles: d != null ? Number(d.toFixed(1)) : null
    });
  }

  return results;
}

function decodeCommunityPostToken(token, id = null) {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const compact = JSON.parse(raw);
    if (!compact || !compact.t || !compact.s) return null;
    const resolvedId = id || `comm_post_v1_${token}`;
    if (deletedPostIds.has(resolvedId)) return null;

    const ladderEval = evaluateBroadcastLadder({
      desiredBroadcastLevel: compact.dlvl || 'block',
      detailsUrl: compact.u
    });

    return {
      id: resolvedId,
      fingerprint: computeFingerprint(compact.t, compact.s, compact.lt, compact.ln),
      title: compact.t,
      description: compact.d || '',
      category: compact.c || 'community',
      category_tags: [compact.c || 'community'],
      start_time: compact.s,
      start: compact.s,
      end_time: compact.e || compact.s,
      end: compact.e || compact.s,
      venue: compact.v || 'Community Location',
      venue_name: compact.v || 'Community Location',
      address: compact.a ? null : (compact.v || compact.y),
      city: compact.y || 'Nearby',
      lat: compact.lt,
      lon: compact.ln,
      venue_latitude: compact.lt,
      venue_longitude: compact.ln,
      locationMode: compact.m || (compact.a ? 'approximate' : 'exact'),
      isApproximateLocation: Boolean(compact.a),
      broadcastRadiusMiles: compact.r || ladderEval.approvedRadiusMiles,
      approvedRadiusMiles: compact.r || ladderEval.approvedRadiusMiles,
      desiredBroadcastLevel: compact.dlvl || 'block',
      currentLadderLevel: compact.lvl || ladderEval.currentLevel,
      ladderStatus: ladderEval.ladder,
      detailsUrl: compact.u || null,
      contact: compact.ct || null,
      source: 'community_post',
      sourceType: 'community_submission',
      isCommunityPost: true,
      isAutonomousCommunityPost: true,
      confirmationStatus: 'community_submitted',
      listingType: 'community_unverified',
      isDisplayable: true,
      isDeleted: false,
      hasTicket: false,
      ticketUrl: null,
      price_status: 'free',
      price_min: 0,
      price_max: 0,
      isFree: true,
      priceDisplay: 'Free / Walk-in',
      sourceQualityLabel: 'Community-submitted*',
      sourceQualityTooltip: '*This event was submitted by a Brinkberry user and has not been independently verified. Details may change.',
      createdAt: compact.w || new Date().toISOString(),
      expiresAt: new Date(new Date(compact.s).getTime() + 48 * 3600 * 1000).toISOString(),
      reportCount: 0,
      reports: []
    };
  } catch (_) {
    return null;
  }
}

function getCommunityPostById(id) {
  loadPostsFromDisk();
  if (!id) return null;
  if (deletedPostIds.has(id)) return null;

  const post = memoryPosts.get(id);
  if (post) {
    if (post.isDeleted || !post.isDisplayable) return null;
    return post;
  }

  // Stateless serverless fallback: decode self-describing token
  if (id.startsWith('comm_post_v1_')) {
    const token = id.slice('comm_post_v1_'.length);
    const decoded = decodeCommunityPostToken(token, id);
    if (decoded) {
      if (decoded.isDeleted || deletedPostIds.has(id)) return null;
      const now = Date.now();
      const startTimeMs = new Date(decoded.start_time).getTime();
      const diffHours = (now - startTimeMs) / (3600 * 1000);
      if (diffHours > 48) return null;
      memoryPosts.set(id, decoded);
      return decoded;
    }
  }

  return null;
}

function deleteCommunityPost(id, deletionKey, reason = 'user_deleted') {
  loadPostsFromDisk();
  if (!id) return { success: false, error: 'Post ID is required.', status: 400 };

  let post = memoryPosts.get(id);
  if (!post && id.startsWith('comm_post_v1_')) {
    post = getCommunityPostById(id);
  }

  if (!post) {
    return { success: false, error: 'Post not found or already removed.', status: 404 };
  }

  // Validate deletion key if post has a key recorded
  if (deletionKey && post.deletionKey) {
    const keyHash = crypto.createHash('sha256').update(String(deletionKey).trim()).digest('hex');
    const matches = post.deletionKey === deletionKey || post.deletionKeyHash === keyHash || post.deletionKeyHash === deletionKey;
    if (!matches) {
      return { success: false, error: 'Invalid deletion key.', status: 403 };
    }
  }

  post.isDeleted = true;
  post.isDisplayable = false;
  post.deletedAt = new Date().toISOString();
  post.deletionReason = reason;

  deletedPostIds.add(id);
  memoryPosts.set(id, post);
  savePostsToDisk();

  return {
    success: true,
    message: 'Post successfully deleted. It has been removed immediately from all public discovery feeds.'
  };
}

function verifyPostLevel(id, deletionKey, stepData = {}) {
  loadPostsFromDisk();
  let post = memoryPosts.get(id);
  if (!post && id.startsWith('comm_post_v1_')) {
    post = getCommunityPostById(id);
  }
  if (!post) return { success: false, error: 'Post not found.', status: 404 };

  if (deletionKey && post.deletionKey) {
    const keyHash = crypto.createHash('sha256').update(String(deletionKey).trim()).digest('hex');
    const matches = post.deletionKey === deletionKey || post.deletionKeyHash === keyHash;
    if (!matches) {
      return { success: false, error: 'Invalid management key.', status: 403 };
    }
  }

  const { targetLevel, email, phone, link, detailsUrl } = stepData;
  const targetLink = detailsUrl || link;

  // Level 2: Hood (requires confirmed email)
  if (targetLevel === 2 || email || stepData.emailConfirmed) {
    if (email && String(email).includes('@')) {
      post.verifiedEmail = String(email).trim();
      post.emailConfirmed = true;
    } else if (stepData.emailConfirmed) {
      post.emailConfirmed = true;
    }
  }

  // Level 3: Quadrant (requires verified phone)
  if (targetLevel === 3 || phone || stepData.phoneVerified) {
    if (phone) {
      const digits = String(phone).replace(/\D/g, '');
      if (digits.length >= 7) {
        post.verifiedPhone = phone;
        post.phoneConfirmed = true;
      }
    } else if (stepData.phoneVerified) {
      post.phoneConfirmed = true;
    }
  }

  // Level 4: City (requires public link or review)
  if (targetLevel >= 4 || targetLink) {
    if (targetLink && /^https?:\/\//i.test(targetLink)) {
      post.detailsUrl = String(targetLink).trim();
    }
  }

  // Re-evaluate ladder
  const ladderEval = evaluateBroadcastLadder(post);
  post.approvedRadiusMiles = ladderEval.approvedRadiusMiles;
  post.broadcastRadiusMiles = ladderEval.approvedRadiusMiles;
  post.currentLadderLevel = ladderEval.currentLevel;
  post.currentLevelName = ladderEval.currentLevelName;
  post.ladderStatus = ladderEval.ladder;

  memoryPosts.set(id, post);
  savePostsToDisk();

  return {
    success: true,
    ladder: ladderEval.ladder,
    currentLevel: ladderEval.currentLevel,
    currentLevelName: ladderEval.currentLevelName,
    approvedRadiusMiles: ladderEval.approvedRadiusMiles
  };
}

function reportCommunityPost(id, reason = 'spam', details = '', ip = '') {
  loadPostsFromDisk();
  let post = memoryPosts.get(id);
  if (!post && id && id.startsWith('comm_post_v1_')) {
    post = getCommunityPostById(id);
  }
  if (!post) return { success: false, error: 'Post not found', status: 404 };

  const normReason = String(reason || 'spam').toLowerCase().trim();

  // Guardrail: Never remove posts merely because someone dislikes politics, religion, protest, taste, or opinion
  const nonRemovableReasons = ['dislike_politics', 'disagree', 'opinion', 'taste', 'protest_dislike', 'religion'];
  if (nonRemovableReasons.includes(normReason)) {
    return {
      success: true,
      message: 'Report logged for review. Brinkberry does not remove lawful events based on differences of political, religious, or personal opinion.',
      isHidden: false,
      reportCount: post.reportCount || 0
    };
  }

  post.reports = post.reports || [];
  post.reports.push({
    reason: normReason,
    details: String(details || '').slice(0, 300),
    timestamp: new Date().toISOString(),
    ipHash: hashIp(ip)
  });
  post.reportCount = post.reports.length;

  // Immediate temporary hiding on critical violations:
  // clear scams, threats/violence, doxxing, harassment, impersonation, illegal content
  const severeReasons = ['violence', 'doxxing', 'harassment', 'illegal', 'scam', 'threat', 'impersonation'];
  if (severeReasons.includes(normReason)) {
    post.isDisplayable = false;
    post.hiddenReason = `Safety review: flagged for ${normReason}`;
  } else if (post.reportCount >= 2) {
    // Repeated flags for spam or false logistics
    post.isDisplayable = false;
    post.hiddenReason = 'Community flag threshold reached';
  }

  memoryPosts.set(id, post);
  savePostsToDisk();

  return {
    success: true,
    isHidden: !post.isDisplayable,
    reportCount: post.reportCount,
    message: post.isDisplayable
      ? 'Report submitted for review.'
      : 'This post has been temporarily hidden pending review.'
  };
}

function _resetForTesting() {
  memoryPosts.clear();
  deletedPostIds.clear();
  rateLimitLedger.clear();
  isLoaded = false;
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      fs.unlinkSync(STORAGE_FILE);
    }
  } catch (_) {}
  try {
    if (fs.existsSync(DELETED_STORAGE_FILE)) {
      fs.unlinkSync(DELETED_STORAGE_FILE);
    }
  } catch (_) {}
}

module.exports = {
  createCommunityPost,
  getActiveCommunityPosts,
  getCommunityPostById,
  deleteCommunityPost,
  verifyPostLevel,
  evaluateBroadcastLadder,
  reportCommunityPost,
  BROADCAST_LEVELS,
  VALID_FLAG_CATEGORIES,
  _resetForTesting
};
