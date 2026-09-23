/**
 * Brinkberry Autonomous Community Post System
 *
 * Lightweight, zero-bureaucracy public posting engine for local discovery:
 * - Anyone can post an event without accounts, venue claims, or admin approval.
 * - Publishes immediately with "Community submitted — not independently verified".
 * - Scoped by broadcast radius (Neighborhood 1–2 mi, Nearby 5–10 mi, Broad 25–50 mi).
 * - Rolling 48-hour discovery window & automatic post expiration.
 * - Approximate location masking for private gatherings and house parties.
 * - Lightweight abuse protection (rate limiting, duplicate fingerprinting, content checks, reports).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { normalizeCategory } = require('../providers/normalizer');

const STORAGE_FILE = path.join(os.tmpdir(), 'brinkberry_community_posts.json');

// Memory cache for active process
let memoryPosts = new Map();
let rateLimitLedger = new Map(); // ipHash -> [timestamps]
let isLoaded = false;

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

function validateContent(payload) {
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

  const contentCheck = validateContent(payload);
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

  const isApproximate = Boolean(payload.isApproximateLocation || payload.isPrivateLocation);

  let publicLat = lat;
  let publicLon = lon;
  if (isApproximate && lat != null && lon != null) {
    const jitterLat = ((Math.random() - 0.5) * 0.004);
    const jitterLon = ((Math.random() - 0.5) * 0.004);
    publicLat = Number((lat + jitterLat).toFixed(4));
    publicLon = Number((lon + jitterLon).toFixed(4));
  }

  const rawLocation = String(payload.location || payload.venue || '').trim();
  const displayVenue = isApproximate
    ? (payload.venueName || sanitizeAddressForPrivacy(rawLocation, city, payload.venueName) || 'Private / Community Gathering')
    : (payload.venueName || rawLocation || 'Community Location');

  let broadcastRadiusMiles = 10;
  const radiusChoice = String(payload.broadcastRadius || '').toLowerCase();
  if (radiusChoice === 'neighborhood' || radiusChoice === '1' || radiusChoice === '2' || radiusChoice === '1-2') {
    broadcastRadiusMiles = 2;
  } else if (radiusChoice === 'broad' || radiusChoice === 'broad_local' || radiusChoice === '25' || radiusChoice === '50' || radiusChoice === '25-50') {
    broadcastRadiusMiles = 35;
  } else {
    broadcastRadiusMiles = 10;
  }

  const fingerprint = computeFingerprint(payload.title, startTimeIso, lat, lon);
  for (const existing of memoryPosts.values()) {
    if (existing.fingerprint === fingerprint && (now - new Date(existing.createdAt).getTime()) < 24 * 3600 * 1000) {
      return { success: false, error: 'A matching event was already posted recently.', status: 409 };
    }
  }

  const rawCat = payload.category || payload.category_tags?.[0] || 'community';
  let cat = normalizeCategory(rawCat, [payload.title, payload.description]);
  if (rawCat === 'party' || /party|social/i.test(rawCat)) cat = 'community';
  if (rawCat === 'protest' || /protest|rally/i.test(rawCat)) cat = 'civic';
  if (rawCat === 'food' || /food|taco|bake/i.test(rawCat)) cat = 'food';

  const compactPayload = {
    t: String(payload.title).trim(),
    d: String(payload.description || '').trim(),
    c: cat,
    s: startTimeIso,
    e: endTimeIso,
    v: displayVenue,
    y: city,
    r: broadcastRadiusMiles,
    a: isApproximate ? 1 : 0,
    lt: publicLat,
    ln: publicLon,
    ct: payload.contact ? String(payload.contact).trim() : '',
    u: payload.detailsUrl ? String(payload.detailsUrl).trim() : '',
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
    isApproximateLocation: isApproximate,
    broadcastRadiusMiles,
    detailsUrl: payload.detailsUrl ? String(payload.detailsUrl).trim() : null,
    contact: payload.contact ? String(payload.contact).trim() : null,
    source: 'community_post',
    sourceType: 'community_submission',
    isCommunityPost: true,
    isAutonomousCommunityPost: true,
    confirmationStatus: 'community_submitted',
    sourceQualityLabel: 'Community submitted — not independently verified',
    hasTicket: false,
    price_status: 'free',
    price_min: 0,
    price_max: 0,
    priceDisplay: 'Free / Walk-in',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Math.min(endTimeMs + 3600 * 1000, now + 48 * 3600 * 1000)).toISOString(),
    reportCount: 0,
    isDisplayable: true,
    submitterIpHash: ipHash
  };

  memoryPosts.set(id, record);
  savePostsToDisk();

  const currentHistory = rateLimitLedger.get(ipHash) || [];
  currentHistory.push(now);
  rateLimitLedger.set(ipHash, currentHistory);

  return {
    success: true,
    event: {
      id: record.id,
      title: record.title,
      start_time: record.start_time,
      venue: record.venue,
      city: record.city,
      category: record.category,
      broadcastRadiusMiles: record.broadcastRadiusMiles,
      sourceQualityLabel: record.sourceQualityLabel,
      url: `/event/${record.id}`
    }
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
        const maxEffectiveRadius = Math.min(radiusMiles, post.broadcastRadiusMiles || radiusMiles);
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
      isApproximateLocation: Boolean(compact.a),
      broadcastRadiusMiles: compact.r || 10,
      detailsUrl: compact.u || null,
      contact: compact.ct || null,
      source: 'community_post',
      sourceType: 'community_submission',
      isCommunityPost: true,
      isAutonomousCommunityPost: true,
      confirmationStatus: 'community_submitted',
      listingType: 'community_unverified',
      isDisplayable: true,
      hasTicket: false,
      ticketUrl: null,
      price_status: 'free',
      price_min: 0,
      price_max: 0,
      isFree: true,
      priceDisplay: 'Free / Walk-in',
      sourceQualityLabel: 'Community submitted — not independently verified',
      createdAt: compact.w || new Date().toISOString(),
      expiresAt: new Date(new Date(compact.s).getTime() + 48 * 3600 * 1000).toISOString(),
      reportCount: 0
    };
  } catch (_) {
    return null;
  }
}

function getCommunityPostById(id) {
  loadPostsFromDisk();
  if (!id) return null;
  const post = memoryPosts.get(id);
  if (post) {
    if (!post.isDisplayable) return null;
    return post;
  }

  // Stateless serverless fallback: decode self-describing token
  if (id.startsWith('comm_post_v1_')) {
    const token = id.slice('comm_post_v1_'.length);
    const decoded = decodeCommunityPostToken(token, id);
    if (decoded) {
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

function reportCommunityPost(id, reason = 'spam', ip = '') {
  loadPostsFromDisk();
  let post = memoryPosts.get(id);
  if (!post && id && id.startsWith('comm_post_v1_')) {
    post = getCommunityPostById(id);
  }
  if (!post) return { success: false, error: 'Post not found' };

  post.reportCount = (post.reportCount || 0) + 1;
  const severe = ['threat', 'harassment', 'illegal'].includes(String(reason).toLowerCase());
  if (post.reportCount >= 2 || severe) {
    post.isDisplayable = false;
  }
  savePostsToDisk();
  return { success: true, isHidden: !post.isDisplayable, reportCount: post.reportCount };
}

function _resetForTesting() {
  memoryPosts.clear();
  rateLimitLedger.clear();
  isLoaded = false;
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      fs.unlinkSync(STORAGE_FILE);
    }
  } catch (_) {}
}

module.exports = {
  createCommunityPost,
  getActiveCommunityPosts,
  getCommunityPostById,
  reportCommunityPost,
  _resetForTesting
};
