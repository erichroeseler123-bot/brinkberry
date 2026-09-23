/**
 * SeatGeek Platform API Adapter
 *
 * Fetches and normalizes live music, sports, theater, and comedy events
 * within a geographic radius and time window.
 * Returns structured status metadata (configured, status, count, latencyMs, reason).
 */

const { fetchProviderWithRetry } = require('../fetchWithRetry');
const { normalizeEvent } = require('./normalizer');
const { defaultGeoCache } = require('./geo-cache');
const { defaultQuotaTracker } = require('./quota-tracker');

const SG_BASE_URL = 'https://api.seatgeek.com/2/events';

// Map Brinkberry mode or category to SeatGeek type/taxonomies
function mapSeatGeekType(mode) {
  switch (mode) {
    case 'music': return 'concert';
    case 'sports': return 'sports';
    case 'theater': return 'theater';
    case 'comedy': return 'comedy';
    default: return '';
  }
}

function applySeatGeekFilters(query, mode, category) {
  const target = category || mode || '';
  if (target === 'comedy') {
    query.searchParams.set('taxonomies.name', 'comedy');
  } else if (target === 'racing') {
    query.searchParams.set('taxonomies.name', 'auto_racing');
  } else if (target === 'music') {
    query.searchParams.set('type', 'concert');
  } else if (target === 'sports') {
    query.searchParams.set('type', 'sports');
  } else if (target === 'theater' || target === 'arts') {
    query.searchParams.set('type', 'theater');
  } else {
    const sgType = mapSeatGeekType(mode);
    if (sgType) query.searchParams.set('type', sgType);
  }
}

async function fetchSeatGeekEvents(options = {}) {
  const startTime = Date.now();
  const {
    lat,
    lon,
    radiusMiles = 25,
    windowStart,
    windowEnd,
    mode = '',
    category = '',
    cache = defaultGeoCache,
    quotaTracker = defaultQuotaTracker,
    fetchFn = fetch
  } = options;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      events: [],
      status: 'error',
      configured: false,
      count: 0,
      latencyMs: 0,
      reason: 'Invalid coordinates'
    };
  }

  const clientId = options.clientId || process.env.SEATGEEK_CLIENT_ID || (fetchFn !== fetch ? 'test_sg_client_id' : null);
  const clientSecret = options.clientSecret || process.env.SEATGEEK_CLIENT_SECRET;
  const isConfigured = Boolean(clientId && clientId !== 'mock_sg_client_id');

  // 1. Check cache (incorporating category to prevent cache starvation)
  const cached = cache.get('seatgeek', lat, lon, radiusMiles, `${windowStart}_${windowEnd}`, mode, category);
  if (cached) {
    return {
      events: cached,
      status: 'cached',
      configured: isConfigured,
      count: cached.length,
      latencyMs: Date.now() - startTime,
      reason: null
    };
  }

  // 2. If API key is not configured
  if (!isConfigured) {
    if (options.useTestMock) {
      const now = Date.now();
      const mockStart = new Date(now + 6 * 3600e3).toISOString();
      const mockEnd = new Date(now + 9 * 3600e3).toISOString();
      const events = [
        {
          id: 'sg_mock_02',
          title: 'Eau Claire Jazz & Blues Collective',
          start_time: mockStart,
          end_time: mockEnd,
          venue_name: 'The Plus',
          city: 'Eau Claire, WI',
          neighborhood: 'Downtown',
          venue_latitude: 44.8125,
          venue_longitude: -91.5002,
          category_tags: ['music'],
          vibe_labels: ['music', 'jazz', 'nightlife'],
          price_status: 'cheap',
          price_min: 15,
          price_max: 25,
          price_display: 'From $15',
          description: 'Live evening jazz and local craft drinks.',
          canonical_url: 'https://seatgeek.com/the-plus-events/eau-claire-jazz/112233',
          canonical_image_url: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629',
          source: 'seatgeek',
          indoor_outdoor: 'indoor',
          provenance: { provider: 'seatgeek', externalId: '112233', fetchedAt: new Date().toISOString() }
        }
      ];
      return {
        events,
        status: 'mock',
        configured: true,
        count: events.length,
        latencyMs: Date.now() - startTime,
        reason: null
      };
    }

    return {
      events: [],
      status: 'unconfigured',
      configured: false,
      count: 0,
      latencyMs: Date.now() - startTime,
      reason: 'SEATGEEK_CLIENT_ID environment variable is not configured'
    };
  }

  // 3. Check instance quota
  if (!quotaTracker.canMakeRequest('seatgeek')) {
    return {
      events: [],
      status: 'rate_limited',
      configured: true,
      count: 0,
      latencyMs: Date.now() - startTime,
      reason: 'Instance rate limit or quota exceeded'
    };
  }

  // 4. Build query URL
  const query = new URL(SG_BASE_URL);
  query.searchParams.set('client_id', clientId);
  if (clientSecret) query.searchParams.set('client_secret', clientSecret);
  query.searchParams.set('lat', lat.toFixed(4));
  query.searchParams.set('lon', lon.toFixed(4));
  query.searchParams.set('range', `${Math.round(radiusMiles)}mi`);
  query.searchParams.set('per_page', '50');
  query.searchParams.set('sort', 'datetime_utc.asc');

  if (windowStart) query.searchParams.set('datetime_utc.gte', new Date(windowStart).toISOString().slice(0, 19));
  if (windowEnd) query.searchParams.set('datetime_utc.lte', new Date(windowEnd).toISOString().slice(0, 19));

  applySeatGeekFilters(query, mode, category);

  try {
    quotaTracker.recordRequest('seatgeek');

    const rawData = await fetchProviderWithRetry(
      'seatgeek',
      query.toString(),
      {},
      {
        timeoutMs: 1500,
        maxRetries: 1,
        initialDelayMs: 100,
        fetchFn
      }
    );

    const rawEvents = rawData?.events || [];
    const normalized = rawEvents
      .map(e => normalizeEvent(e, 'seatgeek'))
      .filter(Boolean);

    cache.set('seatgeek', lat, lon, radiusMiles, `${windowStart}_${windowEnd}`, mode, normalized, category);

    return {
      events: normalized,
      status: 'ok',
      configured: true,
      count: normalized.length,
      rawCount: rawEvents.length,
      latencyMs: Date.now() - startTime,
      reason: null
    };
  } catch (err) {
    const isTimeout = /timed out|abort/i.test(err.message);
    return {
      events: [],
      status: isTimeout ? 'timeout' : 'error',
      configured: true,
      count: 0,
      latencyMs: Date.now() - startTime,
      reason: err.message
    };
  }
}

module.exports = {
  fetchSeatGeekEvents,
  mapSeatGeekType
};
