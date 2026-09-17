import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeEvent, normalizeCategory, normalizePrice } = require('../lib/providers/normalizer.js');
const { deduplicateEvents, isSameEvent, getFingerprint } = require('../lib/providers/deduplicator.js');
const { GeoCache } = require('../lib/providers/geo-cache.js');
const { QuotaTracker, PROVIDER_LIMITS } = require('../lib/providers/quota-tracker.js');
const { fetchTicketmasterEvents, resetTicketmasterState } = require('../lib/providers/ticketmaster.js');
const { fetchSeatGeekEvents } = require('../lib/providers/seatgeek.js');
const { executeHybridFeed, distMiles, scoreEvent } = require('../lib/providers/engine.js');
const feedHandler = require('../api/feed.js');

describe('Hybrid Dynamic Event Engine Suite', () => {

  describe('Canonical Normalizer', () => {
    test('normalizes categories accurately', () => {
      assert.equal(normalizeCategory('Music', ['Rock', 'Concert']), 'music');
      assert.equal(normalizeCategory('Comedy', ['Standup']), 'comedy');
      assert.equal(normalizeCategory('Arts & Theatre', ['Play', 'Broadway']), 'theater');
      assert.equal(normalizeCategory('Sports', ['Basketball', 'NBA']), 'sports');
      assert.equal(normalizeCategory('Family', ['Children']), 'family');
      assert.equal(normalizeCategory('Food & Drink', ['Beer Tasting']), 'food');
      assert.equal(normalizeCategory('Fitness', ['5k Run']), 'outdoor');
      assert.equal(normalizeCategory('Random Unknown', []), 'other');
    });

    test('normalizes price statuses and ranges', () => {
      assert.deepEqual(normalizePrice(0, 0, true), { status: 'free', min: 0, max: 0, display: 'Free' });
      assert.deepEqual(normalizePrice(15, 20, false), { status: 'cheap', min: 15, max: 20, display: '$15–$20' });
      assert.deepEqual(normalizePrice(45, 45, false), { status: 'paid', min: 45, max: 45, display: 'From $45' });
      assert.deepEqual(normalizePrice(null, null, false), { status: 'unknown', min: null, max: null, display: 'Get Tickets' });
    });

    test('normalizes raw Ticketmaster event payload', () => {
      const rawTm = {
        id: '1AvbZfCGkl8477A',
        name: 'The National & The War on Drugs',
        dates: {
          start: { dateTime: '2026-09-18T19:30:00Z' },
          end: { dateTime: '2026-09-18T23:00:00Z' }
        },
        _embedded: {
          venues: [{
            name: 'Red Rocks Amphitheatre',
            city: { name: 'Morrison' },
            state: { stateCode: 'CO' },
            location: { latitude: '39.6654', longitude: '-105.2057' }
          }]
        },
        classifications: [{
          segment: { name: 'Music' },
          genre: { name: 'Alternative Rock' }
        }],
        priceRanges: [{ min: 49.50, max: 129.50 }],
        images: [{ ratio: '16_9', width: 1024, url: 'https://images.ticketmaster.com/banner.jpg' }],
        url: 'https://www.ticketmaster.com/event/1AvbZfCGkl8477A'
      };

      const normalized = normalizeEvent(rawTm, 'ticketmaster');
      assert.ok(normalized);
      assert.equal(normalized.id, 'tm_1AvbZfCGkl8477A');
      assert.equal(normalized.title, 'The National & The War on Drugs');
      assert.equal(normalized.venue_name, 'Red Rocks Amphitheatre');
      assert.equal(normalized.city, 'Morrison, CO');
      assert.equal(normalized.category_tags[0], 'music');
      assert.equal(normalized.price_status, 'paid');
      assert.equal(normalized.price_min, 49.50);
      assert.equal(normalized.venue_latitude, 39.6654);
      assert.equal(normalized.venue_longitude, -105.2057);
      assert.equal(normalized.canonical_url, 'https://www.ticketmaster.com/event/1AvbZfCGkl8477A');
    });

    test('normalizes raw SeatGeek event payload', () => {
      const rawSg = {
        id: 6789012,
        title: 'Chicago Cubs at Milwaukee Brewers',
        datetime_utc: '2026-09-18T18:10:00',
        venue: {
          name: 'American Family Field',
          city: 'Milwaukee',
          state: 'WI',
          location: { lat: 43.0280, lon: -87.9712 }
        },
        type: 'sports',
        taxonomies: [{ name: 'baseball' }, { name: 'mlb' }],
        stats: { lowest_price: 22, highest_price: 180 },
        url: 'https://seatgeek.com/milwaukee-brewers-tickets/6789012'
      };

      const normalized = normalizeEvent(rawSg, 'seatgeek');
      assert.ok(normalized);
      assert.equal(normalized.id, 'sg_6789012');
      assert.equal(normalized.title, 'Chicago Cubs at Milwaukee Brewers');
      assert.equal(normalized.venue_name, 'American Family Field');
      assert.equal(normalized.city, 'Milwaukee, WI');
      assert.equal(normalized.category_tags[0], 'sports');
      assert.equal(normalized.price_status, 'paid');
      assert.equal(normalized.venue_latitude, 43.0280);
      assert.equal(normalized.venue_longitude, -87.9712);
    });

    test('rejects malformed or un-locatable event records', () => {
      const malformed = { id: 'missing_coords', name: 'Ghost Show' };
      assert.equal(normalizeEvent(malformed, 'ticketmaster'), null);
      assert.equal(normalizeEvent(null, 'ticketmaster'), null);
    });
  });

  describe('Multi-source Deduplicator', () => {
    test('detects duplicate events by normalized title, venue, and time window', () => {
      const e1 = {
        id: 'curated_01',
        title: 'Gregory Alan Isakov - Live in Concert',
        venue_name: 'Red Rocks Amphitheatre',
        start_time: '2026-09-18T20:00:00Z'
      };
      const e2 = {
        id: 'tm_9999',
        title: 'Gregory Alan Isakov',
        venue_name: 'Red Rocks Amphitheatre',
        start_time: '2026-09-18T20:30:00Z'
      };

      assert.equal(isSameEvent(e1, e2), true);
    });

    test('distinguishes distinct events at different venues or dates', () => {
      const e1 = {
        title: 'Bon Iver',
        venue_name: 'Pablo Center',
        start_time: '2026-09-18T19:00:00Z'
      };
      const e2 = {
        title: 'Bon Iver',
        venue_name: 'Red Rocks Amphitheatre',
        start_time: '2026-09-18T19:00:00Z'
      };
      const e3 = {
        title: 'Bon Iver',
        venue_name: 'Pablo Center',
        start_time: '2026-09-25T19:00:00Z'
      };

      assert.equal(isSameEvent(e1, e2), false);
      assert.equal(isSameEvent(e1, e3), false);
    });

    test('curated database events take precedence over matching dynamic events', () => {
      const curated = [
        {
          id: 'curated_red_rocks',
          title: 'Denver Jazz Festival',
          venue: 'Dazzle Denver',
          start: '2026-09-17T20:00:00Z',
          source: 'curated'
        }
      ];
      const dynamic = [
        {
          id: 'tm_dup',
          title: 'Denver Jazz Festival',
          venue: 'Dazzle Denver',
          start: '2026-09-17T20:00:00Z',
          source: 'ticketmaster'
        },
        {
          id: 'sg_unique',
          title: 'Colorado Symphony Strings',
          venue: 'Boettcher Concert Hall',
          start: '2026-09-17T19:00:00Z',
          source: 'seatgeek'
        }
      ];

      const deduplicated = deduplicateEvents(curated, dynamic);
      assert.equal(deduplicated.length, 2);
      assert.equal(deduplicated[0].id, 'curated_red_rocks');
      assert.equal(deduplicated[1].id, 'sg_unique');
    });
  });

  describe('Geospatial Cache & Quota Tracker', () => {
    test('quantizes coordinates and caches result by spatial tile', () => {
      const cache = new GeoCache({ ttlMs: 10000 });
      const lat = 44.8113;
      const lon = -91.4985;
      const data = [{ id: 'test_event', title: 'Cached Event' }];

      cache.set('ticketmaster', lat, lon, 25, 'tonight', 'music', data);

      // Same tile query hits cache
      const cached = cache.get('ticketmaster', 44.8120, -91.4990, 25, 'tonight', 'music');
      assert.deepEqual(cached, data);

      const metrics = cache.getMetrics();
      assert.equal(metrics.hits, 1);
      assert.equal(metrics.size, 1);
    });

    test('quota tracker enforces burst and daily request limits', () => {
      const tracker = new QuotaTracker();
      assert.equal(tracker.canMakeRequest('ticketmaster'), true);

      // Record up to limit
      for (let i = 0; i < 300; i++) {
        tracker.recordRequest('ticketmaster');
      }

      assert.equal(tracker.canMakeRequest('ticketmaster'), false);
      const usage = tracker.getUsage('ticketmaster');
      assert.equal(usage.minute.used, 300);

      tracker.reset();
      assert.equal(tracker.canMakeRequest('ticketmaster'), true);
    });
  });

  describe('Strict 48-Hour Boundary & Hybrid Orchestration', () => {
    test('strictly includes events at NOW + 47h and excludes events at NOW + 49h or past', async () => {
      const now = Date.now();
      const mockCurated = [
        {
          id: 'past_event',
          title: 'Past Event',
          venue_name: 'Ogden Theatre',
          start_time: new Date(now - 3600e3).toISOString(), // 1 hr in past
          source: 'curated'
        },
        {
          id: 'valid_47h_event',
          title: 'Valid 47 Hour Event',
          venue_name: 'Bluebird Theater',
          start_time: new Date(now + 47 * 3600e3).toISOString(), // 47 hr in future
          source: 'curated'
        },
        {
          id: 'out_of_bounds_49h_event',
          title: 'Invalid 49 Hour Event',
          venue_name: 'Mission Ballroom',
          start_time: new Date(now + 49 * 3600e3).toISOString(), // 49 hr in future
          source: 'curated'
        }
      ];

      const result = await executeHybridFeed({
        lat: 39.7392,
        lon: -104.9903,
        radiusMiles: 25,
        window: '48h',
        windowStart: new Date(now).toISOString(),
        windowEnd: new Date(now + 48 * 3600e3).toISOString(),
        curatedEvents: mockCurated,
        enableDynamic: false
      });

      const eventIds = result.events.map(e => e.id);
      assert.ok(eventIds.includes('valid_47h_event'), 'Event at +47h must be included');
      assert.ok(!eventIds.includes('past_event'), 'Event in past must be excluded');
      assert.ok(!eventIds.includes('out_of_bounds_49h_event'), 'Event at +49h must be excluded');
    });

    test('slow provider timeout falls back gracefully without breaking the feed', async () => {
      const slowFetch = async () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 200));

      const result = await executeHybridFeed({
        lat: 44.8113,
        lon: -91.4985,
        radiusMiles: 25,
        window: 'tonight',
        curatedEvents: [],
        enableDynamic: true,
        fetchFn: slowFetch
      });

      assert.ok(Array.isArray(result.events));
      assert.ok(result.latency.totalMs >= 0);
    });

    test('unconfigured dynamic providers return clear diagnostic reason and mark distant unconnected city unsupported', async () => {
      let feedData = null;
      let statusCode = 200;
      // Omaha, NE: lat 41.2565, lon -95.9345 (no curated and no local community feeds)
      const req = { url: '/api/feed?lat=41.2565&lng=-95.9345&radius=25&window=48h' };
      const res = {
        status(c) { statusCode = c; return this; },
        json(d) { feedData = d; }
      };

      await feedHandler(req, res);
      assert.equal(statusCode, 200);
      assert.ok(feedData.meta.coverage);
      assert.equal(feedData.meta.coverage.isSupported, false);
      assert.equal(feedData.meta.coverage.isCuratedMarket, false);
      assert.equal(feedData.meta.coverage.geographicCoverage, 'dynamic_aggregators_only');
      assert.equal(feedData.events.length, 0);
      assert.ok(feedData.meta.providerHealth);
      assert.equal(feedData.meta.providerHealth.ticketmaster.status, 'unconfigured');
      assert.equal(feedData.meta.providerHealth.seatgeek.status, 'unconfigured');
      assert.match(feedData.meta.providerHealth.ticketmaster.reason, /TICKETMASTER_API_KEY/);
      assert.match(feedData.meta.providerHealth.seatgeek.reason, /SEATGEEK_CLIENT_ID/);
    });

    test('Eau Claire market connects to official community feed registry', async () => {
      let feedData = null;
      let statusCode = 200;
      const req = { url: '/api/feed?lat=44.8113&lng=-91.4985&radius=25&window=48h' };
      const res = {
        status(c) { statusCode = c; return this; },
        json(d) { feedData = d; }
      };

      await feedHandler(req, res);
      assert.equal(statusCode, 200);
      assert.ok(feedData.meta.coverage);
      assert.equal(feedData.meta.coverage.isSupported, true);
      assert.equal(feedData.meta.coverage.geographicCoverage, 'community_connected');
      assert.match(feedData.meta.coverage.locationName, /Eau Claire/i);
    });

    test('mock/configured dynamic providers return regional events and activate coverage', async () => {
      let feedData = null;
      let statusCode = 200;
      const req = { url: '/api/feed?lat=44.8113&lng=-91.4985&radius=25&window=48h&mock=true' };
      const res = {
        status(c) { statusCode = c; return this; },
        json(d) { feedData = d; }
      };

      await feedHandler(req, res);
      assert.equal(statusCode, 200);
      assert.ok(feedData.meta.coverage);
      assert.equal(feedData.meta.coverage.isSupported, true);
      assert.ok(feedData.events.length > 0, 'Eau Claire should return dynamic events in mock mode');
      assert.match(feedData.meta.coverage.locationName, /Eau Claire/i);

      // Verify no Colorado events falsely leaked into Eau Claire
      for (const e of feedData.events) {
        assert.ok(
          !e.city.includes('Denver') && !e.city.includes('Boulder'),
          `Colorado event ${e.title} leaked into Eau Claire results`
        );
      }
    });

    test('Denver query returns curated feed and marks isCuratedMarket = true', async () => {
      let feedData = null;
      let statusCode = 200;
      const req = { url: '/api/feed?lat=39.7392&lng=-104.9903&radius=25&window=48h' };
      const res = {
        status(c) { statusCode = c; return this; },
        json(d) { feedData = d; }
      };

      await feedHandler(req, res);
      assert.equal(statusCode, 200);
      assert.equal(feedData.meta.coverage.isSupported, true);
      assert.equal(feedData.meta.coverage.isCuratedMarket, true);
      assert.ok(feedData.events.length > 0);
      assert.ok(feedData.meta.latency.curatedMs >= 0);
      assert.ok(feedData.meta.latency.dynamicMs >= 0);
    });

    test('SeatGeek results populate a city with no curated data', async () => {
      const mockSeatGeekFetch = async (url) => {
        if (url.includes('seatgeek')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              events: [
                {
                  id: 998877,
                  title: 'First Avenue Live Show',
                  datetime_utc: new Date(Date.now() + 8 * 3600e3).toISOString(),
                  venue: { name: 'First Avenue', city: 'Minneapolis', state: 'MN', location: { lat: 44.9778, lon: -93.2750 } },
                  type: 'concert',
                  taxonomies: [{ name: 'music' }],
                  stats: { lowest_price: 25, highest_price: 50 },
                  url: 'https://seatgeek.com/first-ave/998877'
                }
              ]
            })
          };
        }
        return { ok: false, status: 404 };
      };

      const result = await executeHybridFeed({
        lat: 44.9778,
        lon: -93.2650,
        radiusMiles: 25,
        window: '48h',
        curatedEvents: [], // No curated data in Minneapolis
        enableDynamic: true,
        fetchFn: mockSeatGeekFetch
      });

      assert.equal(result.events.length, 1);
      assert.equal(result.events[0].city, 'Minneapolis, MN');
      assert.equal(result.events[0].venue, 'First Avenue');
      assert.equal(result.hybrid.curatedCount, 0);
      assert.equal(result.hybrid.dynamicCount, 1);
    });

    test('zero results are distinguished from provider failure in telemetry', async () => {
      const mockEmptyFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ events: [] })
      });

      const result = await executeHybridFeed({
        lat: 44.8113,
        lon: -91.4985,
        radiusMiles: 25,
        window: '48h',
        curatedEvents: [],
        enableDynamic: true,
        fetchFn: mockEmptyFetch
      });

      assert.equal(result.events.length, 0);
      assert.equal(result.providers.seatgeek.status, 'ok');
      assert.equal(result.providers.seatgeek.count, 0);
      assert.equal(result.providers.seatgeek.reason, null);
    });

    test('invalid Ticketmaster credentials (401) do not break SeatGeek results', async () => {
      resetTicketmasterState();
      const mockMixedFetch = async (url) => {
        if (url.includes('ticketmaster')) {
          return {
            ok: false,
            status: 401,
            text: async () => '{"fault":{"faultstring":"Invalid ApiKey"}}'
          };
        }
        if (url.includes('seatgeek')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              events: [
                {
                  id: 112244,
                  title: 'Austin City Limits Nightly Showcase',
                  datetime_utc: new Date(Date.now() + 5 * 3600e3).toISOString(),
                  venue: { name: 'Moody Theater', city: 'Austin', state: 'TX', location: { lat: 30.2672, lon: -97.7431 } },
                  type: 'concert',
                  taxonomies: [{ name: 'music' }],
                  stats: { lowest_price: 30, highest_price: 75 },
                  url: 'https://seatgeek.com/austin/112244'
                }
              ]
            })
          };
        }
        return { ok: false, status: 500 };
      };

      const result = await executeHybridFeed({
        lat: 30.2672,
        lon: -97.7431,
        radiusMiles: 25,
        window: '48h',
        curatedEvents: [],
        enableDynamic: true,
        fetchFn: mockMixedFetch
      });

      assert.equal(result.events.length, 1);
      assert.equal(result.events[0].title, 'Austin City Limits Nightly Showcase');
      assert.equal(result.providers.ticketmaster.status, 'inactive');
      assert.equal(result.providers.seatgeek.status, 'ok');
      assert.equal(result.providers.seatgeek.count, 1);
    });

    test('remote zero-event coordinate returns clean empty list', async () => {
      let feedData = null;
      // Remote point in Atlantic Ocean
      const req = { url: '/api/feed?lat=25.0000&lng=-45.0000&radius=10&window=now' };
      const res = {
        status(c) { return this; },
        json(d) { feedData = d; }
      };

      await feedHandler(req, res);
      assert.equal(feedData.meta.coverage.isSupported, false);
      assert.equal(feedData.events.length, 0);
    });
  });

});
