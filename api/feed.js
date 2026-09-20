const { buildSafeAffiliateUrl } = require('../lib/affiliate');
const { executeHybridFeed, distMiles } = require('../lib/providers/engine');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2ygc158CkPm28E9j6zNdmA_Cvvj5kGr';

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

function localSolarHours(lng) {
  if (!Number.isFinite(lng)) return -7;
  return Math.max(-12, Math.min(14, Math.round(lng / 15)));
}

function parts(lng) {
  const offHours = localSolarHours(lng);
  const offMs = offHours * 3600e3;
  const d = new Date(Date.now() + offMs);
  return {
    year: d.getUTCFullYear(),
    month: String(d.getUTCMonth() + 1).padStart(2, '0'),
    day: String(d.getUTCDate()).padStart(2, '0'),
    hour: d.getUTCHours(),
    offHours
  };
}

function zoned(s, h, offHours = -7) {
  const dateParts = s.split('-').map(Number);
  const utcMillis = Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], h) - (offHours * 3600e3);
  return new Date(utcMillis);
}

function bounds(w, lng) {
  const now = new Date();
  const max48 = new Date(now.getTime() + 48 * 3600e3);
  const p = parts(lng);
  const d = `${p.year}-${p.month}-${p.day}`;
  const h = Number(p.hour);

  let start = now;
  let end = max48;

  if (w === 'now') {
    end = new Date(now.getTime() + 4 * 3600e3);
  } else if (w === 'tomorrow') {
    const x = addDays(d, 1);
    start = zoned(x, 0, p.offHours);
    end = zoned(addDays(x, 1), 0, p.offHours);
  } else if (w === 'tonight') {
    if (h < 2) {
      start = zoned(addDays(d, -1), 17, p.offHours);
      end = zoned(d, 4, p.offHours);
    } else {
      start = zoned(d, 17, p.offHours);
      end = zoned(addDays(d, 1), 4, p.offHours);
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
  { name: 'Denver', slug: 'denver', state: 'CO', country: 'US', lat: 39.7392, lon: -104.9903, maxRadiusMiles: 60 },
  { name: 'Boulder', slug: 'boulder', state: 'CO', country: 'US', lat: 40.0150, lon: -105.2705, maxRadiusMiles: 60 },
  { name: 'Golden', slug: 'golden', state: 'CO', country: 'US', lat: 39.7555, lon: -105.2211, maxRadiusMiles: 60 },
  { name: 'Aurora', slug: 'aurora', state: 'CO', country: 'US', lat: 39.7294, lon: -104.8319, maxRadiusMiles: 60 },
  { name: 'London', slug: 'london', state: '', country: 'UK', lat: 51.5074, lon: -0.1278, maxRadiusMiles: 60 },
  { name: 'New York', slug: 'new-york', state: 'NY', country: 'US', lat: 40.7128, lon: -74.0060, maxRadiusMiles: 60 },
  { name: 'Tokyo', slug: 'tokyo', state: '', country: 'JP', lat: 35.6762, lon: 139.6503, maxRadiusMiles: 60 },
  { name: 'Paris', slug: 'paris', state: '', country: 'FR', lat: 48.8566, lon: 2.3522, maxRadiusMiles: 60 }
];

function checkCoverage(lat, lng, hybridResult) {
  const distances = SUPPORTED_MARKETS.map(m => {
    const d = distMiles(lat, lng, m.lat, m.lon);
    return {
      market: m,
      distanceMiles: d != null ? d : 9999
    };
  }).sort((a, b) => a.distanceMiles - b.distanceMiles);

  const nearest = distances[0] || { market: { name: 'Denver' }, distanceMiles: 0 };
  const isCuratedMarket = nearest.distanceMiles <= 60 && ['Denver', 'Boulder', 'Golden', 'Aurora'].includes(nearest.market.name);
  const isCommunityActive = Boolean(hybridResult?.providers?.community?.count > 0 || hybridResult?.providers?.community?.feedsConfigured > 0);
  const isDynamicActive = Boolean(hybridResult?.hybrid?.dynamicActive);
  const isDynamicConfigured = Boolean(hybridResult?.hybrid?.dynamicConfigured);

  let geographicCoverage = 'dynamic_aggregators_only';
  if (isCuratedMarket) {
    geographicCoverage = 'dense_curated';
  } else if (isCommunityActive) {
    geographicCoverage = 'community_connected';
  }

  // A location is supported if it is within curated market OR if dynamic providers or community feeds are active
  const isSupported = isCuratedMarket || isDynamicActive || isCommunityActive;

  return {
    isSupported,
    coordinateSupport: true,
    geographicCoverage,
    isCuratedMarket,
    dynamicProvidersConfigured: isDynamicConfigured,
    dynamicProvidersActive: isDynamicActive,
    nearestMarket: nearest.market.name,
    distanceToNearestMarketMiles: Math.round(nearest.distanceMiles),
    supportedMarkets: SUPPORTED_MARKETS.map(m => ({ name: m.name, slug: m.slug, state: m.state, lat: m.lat, lon: m.lon }))
  };
}

async function resolveLocationName(lat, lng, fallbackName) {
  if (fallbackName && fallbackName !== 'Your Location' && fallbackName !== 'Nearby') {
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

module.exports = async (req, res) => {
  const overallStart = Date.now();
  try {
    const u = new URL(req.url, 'https://brinkberry.local');
    const lat = Number(u.searchParams.get('lat'));
    const lng = Number(u.searchParams.get('lng') ?? u.searchParams.get('lon'));
    const window = u.searchParams.get('window') || 'tonight';
    const mode = u.searchParams.get('mode') || '';
    const radiusParam = Number(u.searchParams.get('radius')) || 25;
    const radiusMiles = Math.min(100, Math.max(1, radiusParam));
    const dynamicParam = u.searchParams.get('dynamic');
    const enableDynamic = dynamicParam !== 'false' && dynamicParam !== '0';
    const useTestMock = u.searchParams.get('mock') === 'true';

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'Location required' });
    }

    const [a, b] = bounds(window, lng);

    // 1. Fetch curated database events from Supabase RPC
    let rawCurated = [];
    let curatedMs = 0;
    const curatedStart = Date.now();
    try {
      rawCurated = await rpc('bb_get_feed_events_v2', {
        p_user_lat: lat,
        p_user_lng: lng,
        p_radius_miles: radiusMiles,
        p_window_start: a.toISOString(),
        p_window_end: b.toISOString(),
        p_mode: mode || null
      });
      curatedMs = Date.now() - curatedStart;
    } catch (dbErr) {
      console.warn('[Feed] Curated Supabase query failed:', dbErr.message);
      curatedMs = Date.now() - curatedStart;
    }

    // 2. Execute Hybrid Dynamic Engine (Curated + Ticketmaster + SeatGeek + Community Feeds)
    const hybridResult = await executeHybridFeed({
      lat,
      lon: lng,
      radiusMiles,
      window,
      windowStart: a.toISOString(),
      windowEnd: b.toISOString(),
      mode,
      curatedEvents: rawCurated || [],
      enableDynamic,
      useTestMock
    });

    const locationParam = u.searchParams.get('city') || u.searchParams.get('locationName') || '';
    const coverage = checkCoverage(lat, lng, hybridResult);
    const resolvedLocationName = await resolveLocationName(lat, lng, locationParam);
    coverage.locationName = resolvedLocationName;

    const totalMs = Date.now() - overallStart;

    res.status(200).json({
      events: hybridResult.events,
      meta: {
        count: hybridResult.events.length,
        window,
        mode: mode || 'all',
        radiusMiles,
        coverage,
        verifiedInventory: {
          total: hybridResult.events.length,
          curated: hybridResult.hybrid.curatedCount,
          commercial: hybridResult.hybrid.commercialCount || 0,
          community: hybridResult.hybrid.communityCount || 0
        },
        providerHealth: hybridResult.providers,
        providers: hybridResult.providers,
        hybrid: hybridResult.hybrid,
        latency: {
          totalMs,
          curatedMs,
          dynamicMs: hybridResult.latency.dynamicMs
        }
      }
    });
  } catch (e) {
    console.error('[Feed Handler Error]:', e);
    res.status(500).json({ error: String(e.message || e) });
  }
};
