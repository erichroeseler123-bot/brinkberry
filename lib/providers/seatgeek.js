/**
 * SeatGeek Platform API Adapter
 *
 * Fetches and normalizes live music, sports, theater, and comedy events
 * within a geographic radius and time window.
 */

const { fetchProviderWithRetry } = require('../fetchWithRetry');
const { normalizeEvent } = require('./normalizer');
const { defaultGeoCache } = require('./geo-cache');
const { defaultQuotaTracker } = require('./quota-tracker');

const SG_BASE_URL = 'https://api.seatgeek.com/2/events';

// Map Brinkberry mode to SeatGeek type/taxonomies
function mapSeatGeekType(mode) {
  switch (mode) {
    case 'music': return 'concert';
    case 'sports': return 'sports';
    case 'theater': return 'theater';
    case 'comedy': return 'comedy';
    default: return '';
  }
}

async function fetchSeatGeekEvents(options = {}) {
  const {
    lat,
    lon,
    radiusMiles = 25,
    windowStart,
    windowEnd,
    mode = '',
    cache = defaultGeoCache,
    quotaTracker = defaultQuotaTracker,
    fetchFn = fetch
  } = options;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return [];
  }

  // 1. Check cache
  const cached = cache.get('seatgeek', lat, lon, radiusMiles, `${windowStart}_${windowEnd}`, mode);
  if (cached) {
    return cached;
  }

  // 2. Check quota
  if (!quotaTracker.canMakeRequest('seatgeek')) {
    console.warn('[SeatGeek] Quota exceeded or rate limited, skipping provider.');
    return [];
  }

  const clientId = process.env.SEATGEEK_CLIENT_ID;
  const clientSecret = process.env.SEATGEEK_CLIENT_SECRET;

  // 3. Fallback mock for testing or when credentials are unconfigured
  if (!clientId || clientId === 'mock_sg_client_id') {
    const now = Date.now();
    const mockStart = new Date(now + 6 * 3600e3).toISOString();
    const mockEnd = new Date(now + 9 * 3600e3).toISOString();

    const isEauClaire = Math.abs(lat - 44.8113) < 1.0;
    const isDenver = Math.abs(lat - 39.7392) < 1.0;

      if (isEauClaire) {
        const events = [
          {
            id: 'sg_ec_live_02',
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
            description: 'Live evening jazz improvisation and local craft drinks.',
            canonical_url: 'https://seatgeek.com/the-plus-events/eau-claire-jazz/112233',
            canonical_image_url: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629',
            source: 'seatgeek',
            indoor_outdoor: 'indoor',
            provenance: { provider: 'seatgeek', externalId: '112233', fetchedAt: new Date().toISOString() }
          }
        ];
        cache.set('seatgeek', lat, lon, radiusMiles, `${windowStart}_${windowEnd}`, mode, events);
        return events;
      }

      if (isDenver) {
        const events = [
          {
            id: 'sg_den_02',
            title: 'Denver Nuggets vs Minnesota Timberwolves',
            start_time: mockStart,
            end_time: mockEnd,
            venue_name: 'Ball Arena',
            city: 'Denver, CO',
            neighborhood: 'Downtown',
            venue_latitude: 39.7487,
            venue_longitude: -105.0076,
            category_tags: ['sports'],
            vibe_labels: ['sports', 'basketball', 'nba'],
            price_status: 'paid',
            price_min: 49,
            price_max: 280,
            price_display: 'From $49',
            description: 'NBA Western Conference live basketball matchup.',
            canonical_url: 'https://seatgeek.com/denver-nuggets-tickets/ball-arena/554433',
            canonical_image_url: 'https://images.unsplash.com/photo-1546519638-68e109498ffc',
            source: 'seatgeek',
            indoor_outdoor: 'indoor',
            provenance: { provider: 'seatgeek', externalId: '554433', fetchedAt: new Date().toISOString() }
          }
        ];
        cache.set('seatgeek', lat, lon, radiusMiles, `${windowStart}_${windowEnd}`, mode, events);
        return events;
      }
    return [];
  }

  // 4. Build live query URL
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

  const sgType = mapSeatGeekType(mode);
  if (sgType) query.searchParams.set('type', sgType);

  try {
    quotaTracker.recordRequest('seatgeek');

    const rawData = await fetchProviderWithRetry(
      'seatgeek',
      query.toString(),
      {},
      {
        timeoutMs: 1500, // 1500ms budget
        maxRetries: 1,
        initialDelayMs: 100,
        fetchFn
      }
    );

    const rawEvents = rawData?.events || [];
    const normalized = rawEvents
      .map(e => normalizeEvent(e, 'seatgeek'))
      .filter(Boolean);

    cache.set('seatgeek', lat, lon, radiusMiles, `${windowStart}_${windowEnd}`, mode, normalized);
    return normalized;
  } catch (err) {
    console.warn('[SeatGeek] Adapter fetch error:', err.message);
    return [];
  }
}

module.exports = {
  fetchSeatGeekEvents,
  mapSeatGeekType
};
