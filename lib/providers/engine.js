/**
 * Hybrid Dynamic Event Engine
 *
 * Coordinates curated Supabase database records and live nationwide provider adapters
 * (Ticketmaster, SeatGeek) into a single, deduplicated, ranked feed strictly clamped
 * to the rolling 48-hour window.
 */

const { buildSafeAffiliateUrl } = require('../affiliate');
const { deduplicateEvents } = require('./deduplicator');
const { defaultGeoCache } = require('./geo-cache');
const { defaultQuotaTracker } = require('./quota-tracker');
const { fetchTicketmasterEvents } = require('./ticketmaster');
const { fetchSeatGeekEvents } = require('./seatgeek');

const ORIGIN = process.env.BRINKBERRY_ORIGIN || 'https://brinkberry.com';

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

function scoreEvent(e, mode) {
  const mins = Math.max(0, (new Date(e.start_time) - Date.now()) / 60000);
  const d = Number(e.distance_miles);
  let s = 0;
  s += mins <= 60 ? 30 : mins <= 180 ? 24 : mins <= 360 ? 16 : 8;
  s += Number.isFinite(d) ? Math.max(0, 25 - (d * 2)) : 0;
  if (e.price_status === 'free') s += 15;
  else if (e.price_status === 'cheap') s += 12;
  else if (e.price_min != null && e.price_min <= 30) s += 8;
  else s += 3;

  if (mode === 'cheap' && ['free', 'cheap'].includes(e.price_status)) s += 15;
  if (mode === 'outside' && ['outdoor', 'mixed'].includes(e.indoor_outdoor)) s += 15;
  if (mode === 'kids' && (e.category_tags || []).some(x => ['kids', 'family'].includes(x))) s += 15;
  if (mode === 'date' && (e.category_tags || []).some(x => ['music', 'arts', 'food', 'comedy'].includes(x))) s += 12;
  return s;
}

function diversifyFeed(rows) {
  const out = [];
  const counts = {};
  for (const e of rows) {
    const c = e.category_tags?.[0] || 'other';
    const pen = (counts[c] || 0) * 8;
    e._rank = e._score - pen;
    let i = out.findIndex(x => x._rank < e._rank);
    if (i < 0) out.push(e);
    else out.splice(i, 0, e);
    counts[c] = (counts[c] || 0) + 1;
  }
  return out;
}

function timeCue(start, window, mins) {
  if (mins >= 0 && mins <= 240) {
    return mins < 60 ? `Starts in ${mins} min` : `Starts in ${Math.round(mins / 60)} hr`;
  }
  const t = new Date(start).toLocaleTimeString('en-US', {
    timeZone: 'America/Denver',
    hour: 'numeric',
    minute: '2-digit'
  });
  if (window === 'tonight') return `Tonight at ${t}`;
  if (window === 'tomorrow') return `Tomorrow at ${t}`;
  if (window === 'weekend' || window === '48h' || window === 'next-48h') {
    return `Next 48h · ${new Date(start).toLocaleDateString('en-US', { timeZone: 'America/Denver', weekday: 'short' })} ${t}`;
  }
  return t;
}

async function executeHybridFeed(options = {}) {
  const {
    lat,
    lon,
    radiusMiles = 25,
    window = 'tonight',
    windowStart,
    windowEnd,
    mode = '',
    curatedEvents = [],
    enableDynamic = true,
    cache = defaultGeoCache,
    quotaTracker = defaultQuotaTracker,
    fetchFn = fetch
  } = options;

  const startTime = Date.now();
  let dynamicMs = 0;
  let dynamicRawCount = 0;
  const providerResults = [];

  if (enableDynamic && Number.isFinite(lat) && Number.isFinite(lon)) {
    const dynamicStart = Date.now();

    const providerPromises = [
      fetchTicketmasterEvents({
        lat,
        lon,
        radiusMiles,
        windowStart,
        windowEnd,
        mode,
        cache,
        quotaTracker,
        fetchFn
      }),
      fetchSeatGeekEvents({
        lat,
        lon,
        radiusMiles,
        windowStart,
        windowEnd,
        mode,
        cache,
        quotaTracker,
        fetchFn
      })
    ];

    const settled = await Promise.allSettled(providerPromises);
    dynamicMs = Date.now() - dynamicStart;

    for (const res of settled) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        providerResults.push(...res.value);
        dynamicRawCount += res.value.length;
      }
    }
  }

  // 1. Deduplicate dynamic results against curated results (curated always wins)
  const combined = deduplicateEvents(curatedEvents, providerResults);

  // 2. Strict 48-hour rolling boundary filter
  const nowMs = Date.now();
  const max48Ms = nowMs + 48 * 3600e3;

  const filtered = combined.filter(e => {
    const t = new Date(e.start_time || e.start).getTime();
    if (t < nowMs || t > max48Ms) return false;

    // Filter by mode if applicable
    if (mode === 'cheap' && !['free', 'cheap'].includes(e.price_status) && (e.price_min == null || e.price_min > 20)) {
      return false;
    }
    if (mode === 'outside' && !['outdoor', 'mixed'].includes(e.indoor_outdoor)) {
      return false;
    }
    if (mode === 'kids' && !(e.category_tags || []).some(x => ['kids', 'family'].includes(x))) {
      return false;
    }
    if (mode === 'date' && !(e.category_tags || []).some(x => ['music', 'arts', 'food', 'comedy'].includes(x))) {
      return false;
    }
    return true;
  });

  // 3. Compute distance for all events
  const withDistance = filtered.map(e => {
    let d = e.distance_miles != null ? Number(e.distance_miles) : null;
    if (d == null && Number.isFinite(lat) && Number.isFinite(lon)) {
      const eLat = Number(e.venue_latitude || e.lat);
      const eLon = Number(e.venue_longitude || e.lon);
      d = distMiles(lat, lon, eLat, eLon);
    }
    return {
      ...e,
      distance_miles: d != null ? Number(d.toFixed(1)) : null,
      distanceMiles: d != null ? Number(d.toFixed(1)) : null
    };
  });

  // 4. Distance filter
  const withinRadius = withDistance.filter(e => {
    if (e.distance_miles != null && e.distance_miles > radiusMiles) return false;
    return true;
  });

  // 5. Score and rank
  const scored = withinRadius
    .map(e => ({ ...e, _score: scoreEvent(e, mode) }))
    .sort((a, b) => b._score - a._score || new Date(a.start_time) - new Date(b.start_time));

  const ranked = diversifyFeed(scored);

  // 6. Shape output into canonical feed objects
  const finalEvents = ranked.map(e => {
    const d = e.distance_miles != null ? Number(e.distance_miles) : null;
    const mins = Math.round((new Date(e.start_time) - Date.now()) / 60000);
    const why = [timeCue(e.start_time, window, mins)];

    if (e.price_status === 'free') why.push('Free');
    else if (e.price_status === 'cheap' || (e.price_min != null && e.price_min <= 20)) {
      why.push(e.price_min != null ? `From $${e.price_min}` : 'Cheap');
    }
    if (d != null) why.push(`${d.toFixed(1)} mi`);
    if (why.length < 3 && e.indoor_outdoor === 'outdoor') why.push('Outside');

    const safeTicketUrl = buildSafeAffiliateUrl(e.source || 'custom', e.canonical_url || e.ticket_url, e.id);

    return {
      id: e.id,
      title: e.title,
      start: e.start_time,
      end: e.end_time,
      venue: e.venue_name || e.venue,
      city: e.city,
      neighborhood: e.neighborhood || null,
      category: e.category_tags?.[0] || 'other',
      categories: e.category_tags || [],
      vibeLabels: e.vibe_labels || [],
      ageRestriction: e.age_restriction || null,
      indoorOutdoor: e.indoor_outdoor || 'unknown',
      priceStatus: e.price_status,
      priceLow: e.price_min,
      priceHigh: e.price_max,
      priceDisplay: e.price_status === 'free' ? 'Free' : (e.price_display || 'Details →'),
      desc: e.description || '',
      ticketUrl: safeTicketUrl,
      image: e.canonical_image_url || e.image,
      distance_miles: d,
      distanceMiles: d,
      lat: e.venue_latitude || e.lat,
      lon: e.venue_longitude || e.lon,
      shareUrl: `${ORIGIN}/event/${e.id}`,
      whyThis: why.slice(0, 3),
      onTheBrink: mins >= 0 && mins <= 60,
      routeEligible: mins >= 0 && mins <= 120,
      source: e.source || 'curated',
      sourceCount: Number(e.source_count || 1),
      provenance: e.provenance || { source: 'curated' }
    };
  });

  const totalMs = Date.now() - startTime;

  return {
    events: finalEvents,
    hybrid: {
      curatedCount: curatedEvents.length,
      dynamicCount: dynamicRawCount,
      deduplicatedCount: finalEvents.length,
      providers: ['ticketmaster', 'seatgeek']
    },
    latency: {
      totalMs,
      dynamicMs
    }
  };
}

module.exports = {
  executeHybridFeed,
  distMiles,
  scoreEvent,
  diversifyFeed
};
