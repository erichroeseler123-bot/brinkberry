const { buildSafeAffiliateUrl } = require('../lib/affiliate');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2ygc158CkPm28E9j6zNdmA_Cvvj5kGr';
const ORIGIN = process.env.BRINKBERRY_ORIGIN || 'https://brinkberry.com';

async function rpc(name, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  const t = await r.text();
  let d = null;
  if (t) {
    try {
      d = JSON.parse(t);
    } catch {
      d = t;
    }
  }
  if (!r.ok) {
    throw new Error(`Supabase ${r.status}: ${typeof d === 'string' ? d : JSON.stringify(d)}`);
  }
  return d;
}

function addDays(s, n) {
  const d = new Date(s + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function parts() {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Denver',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date()).map(x => [x.type, x.value])
  );
}

function zoned(s, h) {
  const g = new Date(`${s}T${String(h).padStart(2, '0')}:00:00Z`);
  const z = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    timeZoneName: 'longOffset',
    hour: '2-digit'
  }).formatToParts(g);
  const o = (z.find(x => x.type === 'timeZoneName')?.value || 'GMT-06:00').replace('GMT', '');
  return new Date(`${s}T${String(h).padStart(2, '0')}:00:00${o}`);
}

function bounds(w) {
  const now = new Date();
  const max48 = new Date(now.getTime() + 48 * 3600e3);
  const p = parts();
  const d = `${p.year}-${p.month}-${p.day}`;
  const h = Number(p.hour);

  let start = now;
  let end = max48;

  if (w === 'now') {
    end = new Date(now.getTime() + 4 * 3600e3);
  } else if (w === 'tomorrow') {
    const x = addDays(d, 1);
    start = zoned(x, 0);
    end = zoned(addDays(x, 1), 0);
  } else if (w === 'tonight') {
    if (h < 2) {
      start = zoned(addDays(d, -1), 17);
      end = zoned(d, 4);
    } else {
      start = zoned(d, 17);
      end = zoned(addDays(d, 1), 4);
    }
  } else if (w === 'weekend' || w === '48h' || w === 'next-48h') {
    start = now;
    end = max48;
  }

  // Strict 48-hour rolling window clamping: never before now, never beyond now + 48 hours
  const clampedStart = new Date(Math.max(start.getTime(), now.getTime()));
  const clampedEnd = new Date(Math.min(end.getTime(), max48.getTime()));
  return [clampedStart, clampedEnd];
}

const SUPPORTED_MARKETS = [
  { name: 'Denver', slug: 'denver', state: 'CO', lat: 39.7392, lon: -104.9903, maxRadiusMiles: 60 },
  { name: 'Boulder', slug: 'boulder', state: 'CO', lat: 40.0150, lon: -105.2705, maxRadiusMiles: 60 },
  { name: 'Golden', slug: 'golden', state: 'CO', lat: 39.7555, lon: -105.2211, maxRadiusMiles: 60 },
  { name: 'Aurora', slug: 'aurora', state: 'CO', lat: 39.7294, lon: -104.8319, maxRadiusMiles: 60 }
];

function distMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function checkCoverage(lat, lng) {
  const distances = SUPPORTED_MARKETS.map(m => ({
    market: m,
    distanceMiles: distMiles(lat, lng, m.lat, m.lon)
  })).sort((a, b) => a.distanceMiles - b.distanceMiles);

  const nearest = distances[0];
  const isSupported = nearest.distanceMiles <= 60;

  return {
    isSupported,
    nearestMarket: nearest.market.name,
    distanceToNearestMarketMiles: Math.round(nearest.distanceMiles),
    supportedMarkets: SUPPORTED_MARKETS.map(m => ({ name: m.name, slug: m.slug, state: m.state, lat: m.lat, lon: m.lon }))
  };
}

async function resolveLocationName(lat, lng, fallbackName) {
  if (fallbackName && fallbackName !== 'Your Location' && fallbackName !== 'Nearby' && fallbackName !== 'Denver') {
    return fallbackName;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const p = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`, {
      headers: { 'User-Agent': 'Brinkberry/1.0 (https://brinkberry.com)' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (p.ok) {
      const data = await p.json();
      const city = data.properties?.relativeLocation?.properties?.city;
      const state = data.properties?.relativeLocation?.properties?.state;
      if (city && state) return `${city}, ${state}`;
      if (city) return city;
    }
  } catch (_) {}
  return fallbackName || 'Your Location';
}

function score(e, mode) {
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

function diversify(rows) {
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

module.exports = async (req, res) => {
  try {
    const u = new URL(req.url, 'https://brinkberry.local');
    const lat = Number(u.searchParams.get('lat'));
    const lng = Number(u.searchParams.get('lng') ?? u.searchParams.get('lon'));
    const window = u.searchParams.get('window') || 'tonight';
    const mode = u.searchParams.get('mode') || '';
    const radiusParam = Number(u.searchParams.get('radius')) || 25;
    const radiusMiles = Math.min(100, Math.max(1, radiusParam));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'Location required' });
    }

    const [a, b] = bounds(window);
    const raw = await rpc('bb_get_feed_events_v2', {
      p_user_lat: lat,
      p_user_lng: lng,
      p_radius_miles: radiusMiles,
      p_window_start: a.toISOString(),
      p_window_end: b.toISOString(),
      p_mode: mode || null
    });

    const nowMs = Date.now();
    const max48Ms = nowMs + 48 * 3600e3;
    const filtered = (raw || []).filter(e => {
      const t = new Date(e.start_time).getTime();
      return t >= nowMs && t <= max48Ms;
    });

    const rows = filtered
      .map(e => ({ ...e, _score: score(e, mode) }))
      .sort((a, b) => b._score - a._score || new Date(a.start_time) - new Date(b.start_time));
    const ranked = diversify(rows);

    const events = ranked.map(e => {
      const d = e.distance_miles == null ? null : Number(e.distance_miles);
      const mins = Math.round((new Date(e.start_time) - Date.now()) / 60000);
      const why = [timeCue(e.start_time, window, mins)];

      if (e.price_status === 'free') why.push('Free');
      else if (e.price_status === 'cheap' || (e.price_min != null && e.price_min <= 20)) {
        why.push(e.price_min != null ? `From $${e.price_min}` : 'Cheap');
      }
      if (d != null) why.push(`${d.toFixed(1)} mi`);
      if (why.length < 3 && e.indoor_outdoor === 'outdoor') why.push('Outside');

      const safeTicketUrl = buildSafeAffiliateUrl(e.source || 'custom', e.canonical_url, e.id);

      return {
        id: e.id,
        title: e.title,
        start: e.start_time,
        end: e.end_time,
        venue: e.venue_name,
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
        image: e.canonical_image_url,
        distance_miles: d,
        distanceMiles: d,
        lat: e.venue_latitude,
        lon: e.venue_longitude,
        shareUrl: `${ORIGIN}/event/${e.id}`,
        whyThis: why.slice(0, 3),
        onTheBrink: mins >= 0 && mins <= 60,
        routeEligible: mins >= 0 && mins <= 120,
        sourceCount: Number(e.source_count || 0)
      };
    });

    const locationParam = u.searchParams.get('city') || u.searchParams.get('locationName') || '';
    const coverage = checkCoverage(lat, lng);
    const resolvedLocationName = await resolveLocationName(lat, lng, locationParam);
    coverage.locationName = resolvedLocationName;

    res.status(200).json({
      events,
      meta: {
        count: events.length,
        window,
        mode: mode || 'all',
        radiusMiles,
        coverage
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
};
