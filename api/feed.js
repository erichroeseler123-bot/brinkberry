const { buildSafeAffiliateUrl } = require('../lib/affiliate');
const { executeHybridFeed, distMiles } = require('../lib/providers/engine');
const { defaultCanonicalStorage } = require('../lib/storage/canonical-event-storage');
const { resolveIanaTimezone, calculateIanaBounds } = require('../lib/timezone');
const { trackCitySearch, trackFilterChange } = require('../lib/telemetry');

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

const SUPPORTED_MARKETS = [
  { name: 'Denver', slug: 'denver', state: 'CO', country: 'US', lat: 39.7392, lon: -104.9903, maxRadiusMiles: 60 },
  { name: 'Boulder', slug: 'boulder', state: 'CO', country: 'US', lat: 40.0150, lon: -105.2705, maxRadiusMiles: 60 },
  { name: 'Golden', slug: 'golden', state: 'CO', country: 'US', lat: 39.7555, lon: -105.2211, maxRadiusMiles: 60 },
  { name: 'Aurora', slug: 'aurora', state: 'CO', country: 'US', lat: 39.7294, lon: -104.8319, maxRadiusMiles: 60 },
  { name: 'Minneapolis', slug: 'minneapolis', state: 'MN', country: 'US', lat: 44.9877, lon: -93.2721, maxRadiusMiles: 60 },
  { name: 'Austin', slug: 'austin', state: 'TX', country: 'US', lat: 30.3957, lon: -97.7289, maxRadiusMiles: 60 },
  { name: 'Philadelphia', slug: 'philadelphia', state: 'PA', country: 'US', lat: 39.9515, lon: -75.1748, maxRadiusMiles: 60 },
  { name: 'Cleveland', slug: 'cleveland', state: 'OH', country: 'US', lat: 41.4988, lon: -81.6888, maxRadiusMiles: 60 },
  { name: 'Portland', slug: 'portland', state: 'OR', country: 'US', lat: 45.5134, lon: -122.6508, maxRadiusMiles: 60 },
  { name: 'St. Louis', slug: 'st-louis', state: 'MO', country: 'US', lat: 38.6341, lon: -90.3152, maxRadiusMiles: 60 },
  { name: 'Birmingham', slug: 'birmingham', state: 'AL', country: 'US', lat: 33.3752, lon: -86.8122, maxRadiusMiles: 60 },
  { name: 'Charlotte', slug: 'charlotte', state: 'NC', country: 'US', lat: 35.2407, lon: -80.8491, maxRadiusMiles: 60 },
  { name: 'Atlanta', slug: 'atlanta', state: 'GA', country: 'US', lat: 33.7490, lon: -84.3880, maxRadiusMiles: 60 },
  { name: 'Indianapolis', slug: 'indianapolis', state: 'IN', country: 'US', lat: 39.7684, lon: -86.1581, maxRadiusMiles: 60 },
  { name: 'Baltimore', slug: 'baltimore', state: 'MD', country: 'US', lat: 39.2904, lon: -76.6122, maxRadiusMiles: 60 },
  { name: 'Kansas City', slug: 'kansas-city', state: 'MO', country: 'US', lat: 39.0997, lon: -94.5786, maxRadiusMiles: 60 },
  { name: 'Phoenix', slug: 'phoenix', state: 'AZ', country: 'US', lat: 33.4484, lon: -112.0740, maxRadiusMiles: 60 },
  { name: 'Tempe', slug: 'tempe', state: 'AZ', country: 'US', lat: 33.4255, lon: -111.9400, maxRadiusMiles: 60 },
  { name: 'London', slug: 'london', state: '', country: 'UK', lat: 51.5074, lon: -0.1278, maxRadiusMiles: 60 },
  { name: 'New York', slug: 'new-york', state: 'NY', country: 'US', lat: 40.7128, lon: -74.0060, maxRadiusMiles: 60 },
  { name: 'Buffalo', slug: 'buffalo', state: 'NY', country: 'US', lat: 42.8864, lon: -78.8784, maxRadiusMiles: 60 },
  { name: 'Raleigh', slug: 'raleigh', state: 'NC', country: 'US', lat: 35.7796, lon: -78.6382, maxRadiusMiles: 60 },
  { name: 'Boston', slug: 'boston', state: 'MA', country: 'US', lat: 42.3601, lon: -71.0589, maxRadiusMiles: 60 },
  { name: 'Bridgeport', slug: 'bridgeport', state: 'CT', country: 'US', lat: 41.1792, lon: -73.1894, maxRadiusMiles: 60 },
  { name: 'Tokyo', slug: 'tokyo', state: '', country: 'JP', lat: 35.6762, lon: 139.6503, maxRadiusMiles: 60 },
  { name: 'Paris', slug: 'paris', state: '', country: 'FR', lat: 48.8566, lon: 2.3522, maxRadiusMiles: 60 },
  { name: 'Reykjavik', slug: 'reykjavik', state: '', country: 'IS', lat: 64.1466, lon: -21.9426, maxRadiusMiles: 60 }
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
  const isMarketArea = nearest.distanceMiles <= 60;
  const isCuratedMarket = nearest.distanceMiles <= 60 && [
    'Denver', 'Boulder', 'Golden', 'Aurora',
    'Minneapolis', 'Austin', 'Philadelphia', 'Cleveland', 'Portland', 'St. Louis',
    'Birmingham', 'Charlotte', 'Atlanta',
    'Indianapolis', 'Baltimore', 'Kansas City', 'Phoenix', 'Tempe',
    'New York', 'Buffalo', 'Raleigh', 'Boston', 'Bridgeport'
  ].includes(nearest.market.name);


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
    const category = u.searchParams.get('category') || '';
    const showType = u.searchParams.get('showType') || '';
    const ageLimit = u.searchParams.get('ageLimit') || '';
    const priceFilter = u.searchParams.get('priceFilter') || '';
    const startingSoon = u.searchParams.get('startingSoon') === 'true';
    const recurring = u.searchParams.get('recurring') === 'true';
    const clean = u.searchParams.get('clean') === 'true';
    const sourceFilter = u.searchParams.get('sourceFilter') || u.searchParams.get('source') || 'all';
    const radiusParam = Number(u.searchParams.get('radius')) || 25;
    const radiusMiles = Math.min(100, Math.max(1, radiusParam));
    const dynamicParam = u.searchParams.get('dynamic');
    const enableDynamic = dynamicParam !== 'false' && dynamicParam !== '0';
    const useTestMock = u.searchParams.get('mock') === 'true';

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'Location required' });
    }

    const timeZone = resolveIanaTimezone(lat, lng);
    const [a, b] = calculateIanaBounds(window, timeZone);

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

    // Security Guard: Ordinary public requests in production must NEVER be able to toggle includePreview.
    // Preview records are ONLY accessible if:
    // 1. In preview environment (VERCEL_ENV === 'preview' or ENABLE_EXPANSION_PILOT === 'true')
    // 2. Or explicit admin authentication is provided (Bearer token or x-admin-key)
    const isPreviewEnv = process.env.VERCEL_ENV === 'preview' || process.env.ENABLE_EXPANSION_PILOT === 'true';
    const authHeader = req.headers?.['authorization'] || '';
    const adminKeyHeader = req.headers?.['x-admin-key'] || '';
    const adminToken = (authHeader.match(/^Bearer\s+(.+)$/i)?.[1] || adminKeyHeader || '').trim();
    const validAdminSecrets = [
      process.env.ADMIN_TOKEN,
      process.env.ADMIN_AUDIT_TOKEN,
      process.env.BRINKBERRY_ADMIN_KEY
    ].filter(Boolean);
    const isAdmin = Boolean(adminToken && validAdminSecrets.includes(adminToken));
    const requestedPreview = u.searchParams.get('includePreview') === 'true' || u.searchParams.get('preview') === 'true';
    const allowPreview = isPreviewEnv || (isAdmin && requestedPreview);

    // Query verified canonical submissions from storage
    try {
      const storedSubmissions = await defaultCanonicalStorage.queryEvents({
        lat,
        lon: lng,
        radiusMiles,
        category: (category && category !== 'all') ? category : null,
        windowStart: a.toISOString(),
        windowEnd: b.toISOString(),
        includePreview: allowPreview
      });
      if (Array.isArray(storedSubmissions)) {
        for (const s of storedSubmissions) {
          if ([
            'admin_verified',
            'verified_community',
            'community_submitted',
            'confirmed_by_official_calendar',
            'confirmed_by_dual_official_sources'
          ].includes(s.confirmationStatus)) {
            rawCurated.push(s);
          }
        }
      }
    } catch (_) {}

    // Expansion & Preview Serverless SWR Hydration:
    // If running on a fresh serverless instance where local storage has not
    // been populated yet, hydrate expansion venues on-demand.
    const isExpansionPilotActive = process.env.ENABLE_EXPANSION_PILOT === 'true' || allowPreview;
    if (isExpansionPilotActive && (mode === 'comedy' || category === 'comedy' || !category || category === 'all')) {
      const distBhm = distMiles(lat, lng, 33.3752, -86.8122);
      const distClt = distMiles(lat, lng, 35.2407, -80.8491);
      const hasBhmInFeed = rawCurated.some(e => (e.venue_name || e.venue) === 'Stardome Comedy Club');
      const hasCltInFeed = rawCurated.some(e => (e.venue_name || e.venue) === 'The Comedy Zone Charlotte');

      const targetEnv = (allowPreview && process.env.ENABLE_EXPANSION_PILOT !== 'true') ? 'preview' : 'production';
      const targetNamespace = (allowPreview && process.env.ENABLE_EXPANSION_PILOT !== 'true') ? 'preview_expansion' : 'production';

      if (distBhm != null && distBhm <= radiusMiles && !hasBhmInFeed) {
        try {
          const { ingestStardome } = require('../lib/comedy/expansion-ingestion');
          const rep = await ingestStardome({ persist: true, environment: targetEnv, namespace: targetNamespace });
          if (Array.isArray(rep.events)) rawCurated.push(...rep.events);
        } catch (_) {}
      }
      if (distClt != null && distClt <= radiusMiles && !hasCltInFeed) {
        try {
          const { ingestComedyZone } = require('../lib/comedy/expansion-ingestion');
          const rep = await ingestComedyZone({ persist: true, environment: targetEnv, namespace: targetNamespace });
          if (Array.isArray(rep.events)) rawCurated.push(...rep.events);
        } catch (_) {}
      }
      const distAcme = distMiles(lat, lng, 44.9877, -93.2721);
      const hasAcmeInFeed = rawCurated.some(e => (e.venue_name || e.venue) === 'Acme Comedy Company');
      if (distAcme != null && distAcme <= radiusMiles && !hasAcmeInFeed) {
        try {
          const { ingestAcme } = require('../lib/comedy/expansion-ingestion');
          const rep = await ingestAcme({ persist: true, environment: targetEnv, namespace: targetNamespace });
          if (Array.isArray(rep.events)) rawCurated.push(...rep.events);
        } catch (_) {}
      }

      const distAtl = distMiles(lat, lng, 33.7490, -84.3880);
      const hasAtlInFeed = rawCurated.some(e => (e.venue_name || e.venue)?.includes('Punchline') || (e.venue_name || e.venue)?.includes('Laughing Skull'));
      if (distAtl != null && distAtl <= radiusMiles && !hasAtlInFeed) {
        try {
          const { ingestAtlantaComedy } = require('../lib/comedy/atlanta-ingestion');
          const rep = await ingestAtlantaComedy({ persist: true, environment: targetEnv, namespace: targetNamespace });
          if (Array.isArray(rep.events)) rawCurated.push(...rep.events);
        } catch (_) {}
      }

      // Promoted SeatEngine Verified Venues Hydration
      const { PROMOTED_SEATENGINE_VENUES, getPromotedComedyVenues } = require('../lib/comedy/national-registry');
      const verifiedBatches = PROMOTED_SEATENGINE_VENUES || getPromotedComedyVenues().filter(v => v.ticketingEngine === 'seatengine');
      for (const bv of verifiedBatches) {
        const dist = distMiles(lat, lng, bv.lat, bv.lon);
        const hasVenueInFeed = rawCurated.some(e =>
          (e.venue_slug || e.venueSlug) === bv.slug ||
          (e.venue_name || e.venue || '').toLowerCase().includes(bv.name.toLowerCase())
        );
        if (dist != null && dist <= radiusMiles && !hasVenueInFeed) {
          try {
            const { ingestSeatEngineVenue } = require('../lib/ingestion/adapters/seatengine');
            const { evaluateAutoPromotionCriteria } = require('../lib/ingestion/discovery-pipeline');
            const rep = await ingestSeatEngineVenue(bv, { persist: true, environment: targetEnv, namespace: targetNamespace });
            if (Array.isArray(rep.events)) {
              const promotable = rep.events.filter(e => evaluateAutoPromotionCriteria(e).isPromotable);
              rawCurated.push(...promotable);
            }
          } catch (_) {}
        }
      }
    }



    // 2. Execute Hybrid Dynamic Engine (Curated + Ticketmaster + SeatGeek + Paris Open Data + Community Feeds)
    const hybridResult = await executeHybridFeed({
      lat,
      lon: lng,
      radiusMiles,
      window,
      windowStart: a.toISOString(),
      windowEnd: b.toISOString(),
      timeZone,
      mode,
      category,
      showType,
      ageLimit,
      priceFilter,
      startingSoon,
      recurring,
      clean,
      sourceFilter,
      curatedEvents: (rawCurated || []).map(e => ({
        ...e,
        source: e.source || 'curated',
        confirmationStatus: e.confirmationStatus || 'confirmed_by_official_calendar',
        sourceEvidence: {
          ...(e.sourceEvidence || {
            sourceId: 'curated_supabase',
            sourceUrl: e.canonical_url,
            fetchedAt: e.last_verified_at || e.lastVerifiedAt || new Date().toISOString()
          }),
          exactConfirmationFields: e.sourceEvidence?.exactConfirmationFields || {
            title: true,
            date: true,
            venue: true
          }
        },
        lastVerifiedAt: e.last_verified_at || e.lastVerifiedAt || new Date().toISOString()
      })),
      enableDynamic,
      useTestMock
    });

    const locationParam = u.searchParams.get('city') || u.searchParams.get('locationName') || '';
    const coverage = checkCoverage(lat, lng, hybridResult);
    const resolvedLocationName = await resolveLocationName(lat, lng, locationParam);
    coverage.locationName = resolvedLocationName;
    coverage.timezone = timeZone;

    // Record Telemetry
    trackCitySearch(resolvedLocationName || locationParam || 'Coordinates', lat, lng, hybridResult.events.length);
    if (category) trackFilterChange('category', category);
    if (mode) trackFilterChange('mode', mode);
    if (showType) trackFilterChange('showType', showType);
    if (ageLimit) trackFilterChange('ageLimit', ageLimit);
    if (priceFilter) trackFilterChange('priceFilter', priceFilter);

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
          international: hybridResult.hybrid.internationalCount || 0,
          community: hybridResult.hybrid.communityCount || 0,
          civic: hybridResult.hybrid.civicCount || 0,
          official: hybridResult.hybrid.officialCount || 0,
          comedy: hybridResult.hybrid.comedyCount || 0,
          racing: hybridResult.hybrid.racingCount || 0
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
