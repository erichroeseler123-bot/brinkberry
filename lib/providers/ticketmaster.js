/**
 * Ticketmaster Discovery API Adapter
 *
 * Fetches and normalizes live events within a geographic radius and time window.
 * Strictly respects rate limits, exponential backoff, and 1500ms timeout budget.
 * Returns structured status metadata (configured, status, count, latencyMs, reason).
 */

const { fetchProviderWithRetry } = require('../fetchWithRetry');
const { normalizeEvent } = require('./normalizer');
const { defaultGeoCache } = require('./geo-cache');
const { defaultQuotaTracker } = require('./quota-tracker');

const TM_BASE_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

// Category mapping for Ticketmaster classification
function mapClassification(mode) {
  switch (mode) {
    case 'music': return 'KZFzniwnSyZfZ7v7nJ'; // Music segment ID
    case 'sports': return 'KZFzniwnSyZfZ7v7nE'; // Sports segment ID
    case 'arts':
    case 'theater': return 'KZFzniwnSyZfZ7v7na'; // Arts & Theatre
    default: return '';
  }
}

async function fetchTicketmasterEvents(options = {}) {
  const startTime = Date.now();
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
    return {
      events: [],
      status: 'error',
      configured: false,
      count: 0,
      latencyMs: 0,
      reason: 'Invalid coordinates'
    };
  }

  const apiKey = process.env.TICKETMASTER_API_KEY;
  const isConfigured = Boolean(apiKey && apiKey !== 'mock_tm_key');

  // 1. Check cache
  const cached = cache.get('ticketmaster', lat, lon, radiusMiles, `${windowStart}_${windowEnd}`, mode);
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
    // In automated unit tests, allow explicit synthetic fixture when requested
    if (options.useTestMock) {
      const now = Date.now();
      const mockStart = new Date(now + 4 * 3600e3).toISOString();
      const mockEnd = new Date(now + 7 * 3600e3).toISOString();
      const events = [
        {
          id: 'tm_mock_01',
          title: 'Live Acoustic at Pablo Center',
          start_time: mockStart,
          end_time: mockEnd,
          venue_name: 'Pablo Center at the Confluence',
          city: 'Eau Claire, WI',
          neighborhood: 'Downtown',
          venue_latitude: 44.8140,
          venue_longitude: -91.5030,
          category_tags: ['music'],
          vibe_labels: ['music', 'indie', 'concert'],
          price_status: 'paid',
          price_min: 35,
          price_max: 65,
          price_display: 'From $35',
          description: 'Live performance in Eau Claire.',
          canonical_url: 'https://www.ticketmaster.com/event/ec12345',
          canonical_image_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819',
          source: 'ticketmaster',
          indoor_outdoor: 'indoor',
          provenance: { provider: 'ticketmaster', externalId: 'ec12345', fetchedAt: new Date().toISOString() }
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
      reason: 'TICKETMASTER_API_KEY environment variable is not configured'
    };
  }

  // 3. Check instance quota
  if (!quotaTracker.canMakeRequest('ticketmaster')) {
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
  const query = new URL(TM_BASE_URL);
  query.searchParams.set('apikey', apiKey);
  query.searchParams.set('latlong', `${lat.toFixed(4)},${lon.toFixed(4)}`);
  query.searchParams.set('radius', String(Math.round(radiusMiles)));
  query.searchParams.set('unit', 'miles');
  query.searchParams.set('size', '50');
  query.searchParams.set('sort', 'date,asc');

  if (windowStart) query.searchParams.set('startDateTime', new Date(windowStart).toISOString().replace(/\.\d{3}Z$/, 'Z'));
  if (windowEnd) query.searchParams.set('endDateTime', new Date(windowEnd).toISOString().replace(/\.\d{3}Z$/, 'Z'));

  const segmentId = mapClassification(mode);
  if (segmentId) query.searchParams.set('segmentId', segmentId);

  try {
    quotaTracker.recordRequest('ticketmaster');

    const rawData = await fetchProviderWithRetry(
      'ticketmaster',
      query.toString(),
      {},
      {
        timeoutMs: 1500,
        maxRetries: 1,
        initialDelayMs: 100,
        fetchFn
      }
    );

    const rawEvents = rawData?._embedded?.events || [];
    const normalized = rawEvents
      .map(e => normalizeEvent(e, 'ticketmaster'))
      .filter(Boolean);

    cache.set('ticketmaster', lat, lon, radiusMiles, `${windowStart}_${windowEnd}`, mode, normalized);

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
  fetchTicketmasterEvents,
  mapClassification
};
