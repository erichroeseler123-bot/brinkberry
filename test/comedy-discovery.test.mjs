import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { executeHybridFeed } = require('../lib/providers/engine.js');
const {
  addSubmission,
  updateSubmission,
  findDuplicateSubmission,
  getSubmissionById,
  getAllSubmissions
} = require('../lib/comedy/registry.js');
const {
  transitionState,
  SHOW_LIFECYCLE
} = require('../lib/comedy/verification.js');
const landingHandler = require('../api/landing.js');
const submitHandler = require('../api/comedy-submit.js');
const checkoutHandler = require('../api/comedy-checkout.js');
const homeHandler = require('../api/home.js');
const {
  trackCitySearch,
  trackFilterChange,
  trackTicketClick,
  trackEventView,
  trackProviderHealth,
  getTelemetrySummary
} = require('../lib/telemetry.js');

describe('Brinkberry Comedy Discovery & Community Promotion Suite', () => {

  describe('1. Homepage & Hero Discovery Redesign', () => {
    test('homepage renders "What should I do tonight?" and comedy discovery console', async () => {
      let outputHtml = '';
      homeHandler({ url: '/' }, {
        setHeader() {},
        end(data) { outputHtml = data; }
      });

      assert.match(outputHtml, /What should I do tonight\?/i);
      assert.match(outputHtml, /Find what’s happening near you/i);
      assert.match(outputHtml, /id="categoryRow"/);
      assert.match(outputHtml, /id="comedySubFilterConsole"/);
      assert.match(outputHtml, /id="comedyTypeFilters"/);
      assert.match(outputHtml, /id="comedyAgeFilters"/);
      assert.match(outputHtml, /id="comedyPriceFilters"/);
      assert.match(outputHtml, /id="comedyUrgencyFilters"/);
      assert.match(outputHtml, /Independent Live Discovery/i);
      assert.match(outputHtml, /We do not mark up ticket prices/i);
      assert.match(outputHtml, /\/submit-comedy/);
    });
  });

  describe('2. Feed Engine Comedy Sub-Filtering', () => {
    const denverCoords = { lat: 39.7392, lon: -104.9903, radius: 25 };

    test('filters comedy events specifically when category=comedy', async () => {
      const feed = await executeHybridFeed({
        lat: denverCoords.lat,
        lon: denverCoords.lon,
        radiusMiles: denverCoords.radius,
        category: 'comedy',
        window: '48h'
      });

      assert.ok(Array.isArray(feed.events));
      for (const e of feed.events) {
        assert.equal(e.category, 'comedy');
      }
    });

    test('filters by comedy showType (open_mic, showcase, headliner)', async () => {
      const openMicsFeed = await executeHybridFeed({
        lat: denverCoords.lat,
        lon: denverCoords.lon,
        radiusMiles: denverCoords.radius,
        category: 'comedy',
        showType: 'open_mic',
        window: '48h'
      });

      for (const e of openMicsFeed.events) {
        assert.equal(e.comedy?.showType, 'open_mic');
      }
    });

    test('filters by comedy ageLimit (21+, 18+, all_ages)', async () => {
      const feed21 = await executeHybridFeed({
        lat: denverCoords.lat,
        lon: denverCoords.lon,
        radiusMiles: denverCoords.radius,
        category: 'comedy',
        ageLimit: '21+',
        window: '48h'
      });

      for (const e of feed21.events) {
        assert.equal(e.comedy?.ageLimit, '21+');
      }
    });

    test('filters by comedy priceFilter (free)', async () => {
      const freeFeed = await executeHybridFeed({
        lat: denverCoords.lat,
        lon: denverCoords.lon,
        radiusMiles: denverCoords.radius,
        category: 'comedy',
        priceFilter: 'free',
        window: '48h'
      });

      for (const e of freeFeed.events) {
        const isFree = e.isFree || e.price === 0 || (e.priceDisplay && /free|no cover/i.test(e.priceDisplay));
        assert.ok(isFree, `Expected free event, got ${e.priceDisplay}`);
      }
    });

    test('filters by startingSoon (< 4 hours)', async () => {
      const soonFeed = await executeHybridFeed({
        lat: denverCoords.lat,
        lon: denverCoords.lon,
        radiusMiles: denverCoords.radius,
        category: 'comedy',
        startingSoon: true,
        window: '48h'
      });

      const now = Date.now();
      for (const e of soonFeed.events) {
        const start = new Date(e.start).getTime();
        const diffHours = (start - now) / 3600000;
        assert.ok(diffHours >= -1 && diffHours <= 4, `Event start was outside 4h window: ${diffHours}h`);
      }
    });
  });

  describe('3. Community Submission Lifecycle & Duplicate Prevention', () => {
    test('submitting a show returns an editKey and initializes in pending_review', async () => {
      const showData = {
        title: 'Denver Underground Comedy Showcase ' + Date.now(),
        venue: 'The Gilded Lily Lounge',
        city: 'Denver',
        lat: 39.7400,
        lon: -104.9900,
        start_time: new Date(Date.now() + 86400000).toISOString(),
        showType: 'showcase',
        ageLimit: '21+',
        price: '$10 Door',
        submitterRole: 'comic'
      };

      const result = addSubmission(showData);
      assert.ok(result.id, 'Submission should have an ID');
      assert.ok(result.verification?.editKey, 'Submission should provide an editKey');
      assert.equal(result.verification?.status, 'submitted');
    });

    test('detects and rejects duplicate show submissions at same venue within 2 hours', async () => {
      const venue = 'The Meadowlark Bar ' + Date.now();
      const startTime = new Date(Date.now() + 100000000).toISOString();

      addSubmission({
        title: 'Original Meadowlark Open Mic',
        venue,
        city: 'Denver',
        lat: 39.7580,
        lon: -104.9850,
        start_time: startTime,
        showType: 'open_mic'
      });

      // Attempt to submit duplicate within 1 hour
      const dupTime = new Date(new Date(startTime).getTime() + 3600000).toISOString();
      const duplicate = findDuplicateSubmission({
        venue,
        start_time: dupTime
      });

      assert.ok(duplicate, 'Should detect duplicate show within 2h window');
      assert.equal(duplicate.venue_name.toLowerCase(), venue.toLowerCase());
    });

    test('allows editing an existing show using the correct editKey', async () => {
      const show = addSubmission({
        title: 'Early Draft Comedy Night',
        venue: 'Mercury Cafe ' + Date.now(),
        city: 'Denver',
        lat: 39.7565,
        lon: -104.9877,
        start_time: new Date(Date.now() + 50000000).toISOString(),
        showType: 'showcase'
      });

      const updated = updateSubmission(show.id, show.verification.editKey, {
        title: 'Polished Draft Comedy Night',
        price: 'Free'
      });

      assert.ok(updated, 'Update should succeed with correct editKey');
      assert.equal(updated.title, 'Polished Draft Comedy Night');
      assert.equal(updated.price_display, 'Free');
    });

    test('rejects show update if editKey is invalid or missing', async () => {
      const show = addSubmission({
        title: 'Locked Show',
        venue: 'Lions Lair ' + Date.now(),
        city: 'Denver',
        lat: 39.7402,
        lon: -104.9540,
        start_time: new Date(Date.now() + 70000000).toISOString()
      });

      assert.throws(() => {
        updateSubmission(show.id, 'wrong_key', { title: 'Hacked Title' });
      }, /Unauthorized: Valid venue token or edit key required/);

      assert.throws(() => {
        updateSubmission(show.id, null, { title: 'Hacked Title' });
      }, /Unauthorized: Valid venue token or edit key required/);
    });

    test('community submit API endpoint handles new submissions and edit actions', async () => {
      // 1. Submit new via API
      let newResult = null;
      let statusCode = null;
      await submitHandler({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          title: 'API Test Comedy Show ' + Date.now(),
          venue: 'Cervantes Otherside ' + Date.now(),
          city: 'Denver',
          start_time: new Date(Date.now() + 80000000).toISOString(),
          lat: 39.7547,
          lon: -104.9782,
          showType: 'standup'
        }
      }, {
        setHeader() {},
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          newResult = data;
        }
      });

      assert.equal(statusCode, 200);
      assert.ok(newResult.editKey);

      // 2. Edit existing via API
      let editResult = null;
      let editStatusCode = null;
      await submitHandler({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          action: 'edit',
          id: newResult.id,
          editKey: newResult.editKey,
          title: 'Renamed API Test Comedy Show'
        }
      }, {
        setHeader() {},
        status(code) {
          editStatusCode = code;
          return this;
        },
        json(data) {
          editResult = data;
        }
      });

      assert.equal(editStatusCode, 200);
      assert.ok(editResult.success);
      assert.equal(editResult.show.title, 'Renamed API Test Comedy Show');
    });
  });

  describe('4. High-Intent SEO Comedy Routes', () => {
    test('renders indexable guide for /denver/open-mics', async () => {
      let outputHtml = '';
      let statusCode = 200;
      await landingHandler({
        url: '/denver/open-mics',
        headers: { host: 'brinkberry.com' }
      }, {
        setHeader() {},
        status(code) { statusCode = code; return this; },
        send(data) { outputHtml = data; },
        end(data) { outputHtml = data; }
      });

      assert.equal(statusCode, 200);
      assert.match(outputHtml, /Open Mic/i);
      assert.match(outputHtml, /canonical.*\/denver\/open-mics/);
      assert.match(outputHtml, /schema\.org/);
    });

    test('renders indexable guide for /denver/comedy-clubs', async () => {
      let outputHtml = '';
      let statusCode = 200;
      await landingHandler({
        url: '/denver/comedy-clubs',
        headers: { host: 'brinkberry.com' }
      }, {
        setHeader() {},
        status(code) { statusCode = code; return this; },
        send(data) { outputHtml = data; },
        end(data) { outputHtml = data; }
      });

      assert.equal(statusCode, 200);
      assert.match(outputHtml, /Comedy Clubs/i);
      assert.match(outputHtml, /canonical.*\/denver\/comedy-clubs/);
    });

    test('renders indexable guide for /denver/cheap-comedy', async () => {
      let outputHtml = '';
      let statusCode = 200;
      await landingHandler({
        url: '/denver/cheap-comedy',
        headers: { host: 'brinkberry.com' }
      }, {
        setHeader() {},
        status(code) { statusCode = code; return this; },
        send(data) { outputHtml = data; },
        end(data) { outputHtml = data; }
      });

      assert.equal(statusCode, 200);
      assert.match(outputHtml, /Free &amp; Cheap Comedy/i);
      assert.match(outputHtml, /canonical.*\/denver\/cheap-comedy/);
    });
  });

  describe('5. Privacy-First Telemetry Module', () => {
    test('tracks search, filter, ticket click, and event views without throwing', () => {
      assert.doesNotThrow(() => {
        trackCitySearch('Denver', 39.7392, -104.9903, 5);
        trackFilterChange('showType', 'open_mic');
        trackTicketClick('https://seatgeek.com', 'evt_123', 'feed_card');
        trackEventView('evt_123', 'event_page');
        trackProviderHealth('seatgeek', true, 120);
      });

      const summary = getTelemetrySummary();
      assert.ok(summary.aggregates.ticketClicks >= 1);
      assert.ok(summary.aggregates.eventViews >= 1);
    });
  });

  describe('6. Ticketing Lockdown Verification', () => {
    test('checkout endpoint returns 403 prototype_disabled on production', async () => {
      const origEnv = process.env.NODE_ENV;
      const origProto = process.env.COMEDY_PROTOTYPE_MODE;

      try {
        process.env.NODE_ENV = 'production';
        delete process.env.COMEDY_PROTOTYPE_MODE;

        let statusCode = null;
        let jsonResponse = null;

        await checkoutHandler({
          method: 'POST',
          url: '/api/comedy-checkout',
          headers: { 'content-type': 'application/json' },
          body: { eventId: 'test_show' }
        }, {
          setHeader() {},
          status(code) { statusCode = code; return this; },
          json(data) { jsonResponse = data; }
        });

        assert.equal(statusCode, 403);
        assert.equal(jsonResponse.status, 'prototype_disabled');
        assert.match(jsonResponse.error, /prototype and disabled/);
      } finally {
        process.env.NODE_ENV = origEnv;
        if (origProto) process.env.COMEDY_PROTOTYPE_MODE = origProto;
      }
    });
  });

});
