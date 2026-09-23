import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  resolveIanaTimezone,
  getLocalCivilParts,
  calculateIanaBounds,
  formatLocalTimeCue
} = require('../lib/timezone.js');
const {
  fetchParisOpenDataEvents,
  normalizeParisEvent
} = require('../lib/providers/paris-opendata.js');
const feedHandler = require('../api/feed.js');

describe('Worldwide Event Discovery & IANA Timezone Suite', () => {

  describe('1. IANA Timezone Resolution & Civil Calculations', () => {
    test('resolves correct IANA timezones for international and domestic hubs', () => {
      assert.equal(resolveIanaTimezone(51.5074, -0.1278), 'Europe/London');
      assert.equal(resolveIanaTimezone(35.6762, 139.6503), 'Asia/Tokyo');
      assert.equal(resolveIanaTimezone(48.8566, 2.3522), 'Europe/Paris');
      assert.equal(resolveIanaTimezone(64.1466, -21.9426), 'Atlantic/Reykjavik');
      assert.equal(resolveIanaTimezone(39.7392, -104.9903), 'America/Denver');
      assert.equal(resolveIanaTimezone(41.8781, -87.6298), 'America/Chicago');
    });

    test('getLocalCivilParts extracts accurate civil date components', () => {
      const fixedDate = new Date('2026-09-20T20:00:00Z');
      const tokyo = getLocalCivilParts(fixedDate, 'Asia/Tokyo');
      // UTC 20:00 + 9h = 05:00 next day
      assert.equal(tokyo.hour, 5);
      assert.equal(tokyo.day, '21');

      const denver = getLocalCivilParts(fixedDate, 'America/Denver');
      // UTC 20:00 - 6h (MDT) = 14:00 same day
      assert.equal(denver.hour, 14);
      assert.equal(denver.day, '20');
    });

    test('calculateIanaBounds computes valid rolling 48-hour bounds in IANA timezone', () => {
      const now = new Date('2026-09-20T12:00:00Z');
      const [startTonight, endTonight] = calculateIanaBounds('tonight', 'Europe/Paris', now);
      assert.ok(startTonight instanceof Date);
      assert.ok(endTonight instanceof Date);
      assert.ok(startTonight.getTime() >= now.getTime(), 'Start must not be before now');
      assert.ok(endTonight.getTime() <= now.getTime() + 48 * 3600e3, 'End must not exceed 48h limit');

      const [start48h, end48h] = calculateIanaBounds('48h', 'Asia/Tokyo', now);
      assert.equal(start48h.getTime(), now.getTime());
      assert.equal(end48h.getTime(), now.getTime() + 48 * 3600e3);
    });

    test('formatLocalTimeCue formats timestamps in target city timeZone', () => {
      const startTime = '2026-09-20T19:30:00Z';
      const tokyoCue = formatLocalTimeCue(startTime, '48h', 'Asia/Tokyo', 300);
      assert.match(tokyoCue, /Next 48h/);
      assert.match(tokyoCue, /Mon|Sun/);

      const londonCue = formatLocalTimeCue(startTime, 'tonight', 'Europe/London', 500);
      assert.match(londonCue, /Tonight at \d{1,2}:\d{2}\s?(AM|PM)/);
    });
  });

  describe('2. Paris Open Data International Provider', () => {
    test('normalizes Paris Open Data record with accurate fields and provenance', () => {
      const sampleRecord = {
        id: '998877',
        title: 'Festival Jazz à la Villette',
        lead_text: 'Concert exceptionnel au cœur du parc de la Villette.',
        date_start: new Date(Date.now() + 4 * 3600e3).toISOString(),
        date_end: new Date(Date.now() + 7 * 3600e3).toISOString(),
        address_name: 'Grande Halle de la Villette',
        address_city: 'Paris',
        address_zipcode: '75019',
        price_type: 'payant',
        price_detail: '25€ plein tarif',
        tags: ['musique', 'jazz', 'concert'],
        lat_lon: { lat: 48.8912, lon: 2.3915 },
        url: 'https://www.paris.fr/evenements/jazz-villette-998877'
      };

      const event = normalizeParisEvent(sampleRecord);
      assert.ok(event);
      assert.equal(event.id, 'pod_998877');
      assert.equal(event.title, 'Festival Jazz à la Villette');
      assert.equal(event.city, 'Paris');
      assert.equal(event.venue_name, 'Grande Halle de la Villette');
      assert.ok(event.category_tags.includes('music'));
      assert.equal(event.price_status, 'paid');
      assert.equal(event.source, 'paris_opendata');
      assert.equal(event.provenance.provider, 'paris_opendata');
      assert.equal(event.provenance.dataset, 'que-faire-a-paris-');
    });

    test('rejects coordinates far from Paris with none_in_radius', async () => {
      // London coordinates passed to Paris Open Data adapter
      const res = await fetchParisOpenDataEvents({ lat: 51.5074, lon: -0.1278 });
      assert.equal(res.status, 'none_in_radius');
      assert.equal(res.count, 0);
      assert.deepEqual(res.events, []);
    });

    test('fetches live Paris events from official Paris Open Data catalog', async () => {
      const now = new Date();
      const res = await fetchParisOpenDataEvents({
        lat: 48.8566,
        lon: 2.3522,
        radiusMiles: 25,
        windowStart: now.toISOString(),
        windowEnd: new Date(now.getTime() + 48 * 3600e3).toISOString()
      });

      assert.equal(res.status, 'ok');
      assert.ok(Array.isArray(res.events));
      assert.ok(res.events.length > 0, 'Paris Open Data should return live events in 48h window');
      assert.equal(res.events[0].city, 'Paris');
      assert.equal(res.events[0].source, 'paris_opendata');
    });
  });

  describe('3. Dynamic Feed Endpoint Worldwide Discovery & Honest Sparse State', () => {
    test('Paris feed returns live international events with IANA Europe/Paris timezone', async () => {
      let feedData = null;
      let statusCode = 200;
      await feedHandler({ url: '/api/feed?lat=48.8566&lng=2.3522&window=48h' }, {
        status(c) { statusCode = c; return this; },
        json(d) { feedData = d; }
      });

      assert.equal(statusCode, 200);
      assert.ok(feedData);
      assert.ok(Array.isArray(feedData.events));
      assert.ok(feedData.events.length > 0, 'Paris should have active live event inventory');
      assert.equal(feedData.meta.coverage.timezone, 'Europe/Paris');
      assert.equal(feedData.meta.coverage.isSupported, true);
      assert.ok(feedData.meta.verifiedInventory.international > 0);

      // Verify all events are actually in Paris metro, not Denver fallback
      for (const ev of feedData.events) {
        assert.equal(ev.city, 'Paris');
        assert.ok(ev.distanceMiles <= 50);
      }
    });

    test('London feed honestly returns 0 events without falling back to Denver data', async () => {
      let feedData = null;
      let statusCode = 200;
      await feedHandler({ url: '/api/feed?lat=51.5074&lng=-0.1278&window=48h' }, {
        status(c) { statusCode = c; return this; },
        json(d) { feedData = d; }
      });

      assert.equal(statusCode, 200);
      assert.ok(feedData);
      assert.equal(feedData.meta.coverage.timezone, 'Europe/London');
      assert.equal(typeof feedData.meta.coverage.isSupported, 'boolean');
      assert.equal(feedData.events.length, 0, 'London should honestly report 0 listings');
      assert.equal(feedData.meta.verifiedInventory.total, 0);
      assert.equal(feedData.meta.verifiedInventory.curated, 0);
    });

    test('Tokyo feed honestly returns 0 events with Asia/Tokyo timezone', async () => {
      let feedData = null;
      let statusCode = 200;
      await feedHandler({ url: '/api/feed?lat=35.6762&lng=139.6503&window=48h' }, {
        status(c) { statusCode = c; return this; },
        json(d) { feedData = d; }
      });

      assert.equal(statusCode, 200);
      assert.ok(feedData);
      assert.equal(feedData.meta.coverage.timezone, 'Asia/Tokyo');
      assert.equal(feedData.events.length, 0);
    });

    test('Reykjavik feed honestly returns 0 events with Atlantic/Reykjavik timezone', async () => {
      let feedData = null;
      let statusCode = 200;
      await feedHandler({ url: '/api/feed?lat=64.1466&lng=-21.9426&window=48h' }, {
        status(c) { statusCode = c; return this; },
        json(d) { feedData = d; }
      });

      assert.equal(statusCode, 200);
      assert.ok(feedData);
      assert.equal(feedData.meta.coverage.timezone, 'Atlantic/Reykjavik');
      assert.equal(feedData.events.length, 0);
    });

    test('Denver feed retains robust curated inventory with America/Denver timezone', async () => {
      let feedData = null;
      let statusCode = 200;
      await feedHandler({ url: '/api/feed?lat=39.7392&lng=-104.9903&window=48h' }, {
        status(c) { statusCode = c; return this; },
        json(d) { feedData = d; }
      });

      assert.equal(statusCode, 200);
      assert.ok(feedData);
      assert.equal(feedData.meta.coverage.timezone, 'America/Denver');
      assert.ok(feedData.events.length > 0);
      assert.equal(feedData.meta.coverage.isCuratedMarket, true);
    });
  });

});
