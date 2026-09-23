import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createCommunityPost,
  getActiveCommunityPosts,
  getCommunityPostById,
  reportCommunityPost,
  _resetForTesting
} = require('../lib/community-posts/community-posts.js');
const { resolveSourceQualityLabel, normalizeCategory } = require('../lib/providers/normalizer.js');
const { evaluateEventFreshness } = require('../lib/freshness.js');
const { executeHybridFeed } = require('../lib/providers/engine.js');
const { getComedyClubs, getNearbyVerifiedComedyShows } = require('../lib/comedy/registry.js');
const { getAllScheduledRaces } = require('../lib/racing/registry.js');

describe('Brinkberry Autonomous Community Post System', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  describe('1. Anonymous Event Submission & Category Normalization', () => {
    it('allows posting without accounts, tokens, or venue verification', () => {
      const now = Date.now();
      const startTime = new Date(now + 4 * 3600 * 1000).toISOString();

      const result = createCommunityPost({
        title: 'Friday Backyard Jam & Acoustic Circle',
        description: 'Bring an instrument or just come hang out in the backyard!',
        category: 'party',
        startTime,
        city: 'Denver',
        venue: 'Private Backyard',
        location: '1240 Marion St, Denver, CO',
        isApproximateLocation: true,
        broadcastRadius: 'neighborhood'
      }, { ip: '192.168.1.100' });

      assert.equal(result.success, true);
      assert.ok(result.event.id.startsWith('comm_post_'));
      assert.equal(result.event.title, 'Friday Backyard Jam & Acoustic Circle');
      assert.equal(result.event.broadcastRadiusMiles, 2);
      assert.equal(result.event.sourceQualityLabel, 'Community submitted — not independently verified');

      // Verify stored record
      const post = getCommunityPostById(result.event.id);
      assert.ok(post);
      assert.equal(post.source, 'community_post');
      assert.equal(post.confirmationStatus, 'community_submitted');
      assert.equal(post.hasTicket, false);
      assert.equal(post.priceDisplay, 'Free / Walk-in');
    });

    it('accurately normalizes categories for party, protest, library, comedy, and sports', () => {
      const now = Date.now();
      const startTime = new Date(now + 6 * 3600 * 1000).toISOString();

      const cases = [
        { cat: 'party', title: 'Rooftop House Party', expected: 'community' },
        { cat: 'protest', title: 'Clean Air Now Rally & March', expected: 'civic' },
        { cat: 'community', title: 'Library Book & Seed Exchange', expected: 'community' },
        { cat: 'comedy', title: 'Open Mic Night Showcase', expected: 'comedy' },
        { cat: 'sports', title: '3v3 Pickup Basketball at the Park', expected: 'sports' },
        { cat: 'food', title: 'Friday Night Taco Truck Pop-up', expected: 'food' },
        { cat: 'festival', title: 'Artisan Makers Fair', expected: 'festival' }
      ];

      for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        const res = createCommunityPost({
          title: c.title,
          category: c.cat,
          startTime,
          city: 'Denver',
          lat: 39.7392 + (i * 0.001),
          lon: -104.9903 + (i * 0.001)
        }, { ip: `10.0.0.${i + 1}` });

        assert.equal(res.success, true, `Failed on ${c.cat}`);
        assert.equal(res.event.category, c.expected, `Category mismatch for ${c.cat}`);
      }
    });
  });

  describe('2. Broadcast Radius Scoping & Feed Visibility', () => {
    it('scopes neighborhood posts to 1-2 miles and does not show at 5 miles', () => {
      const now = Date.now();
      const startTime = new Date(now + 3 * 3600 * 1000).toISOString();

      // Post in downtown Denver with 2-mile neighborhood broadcast radius
      const postRes = createCommunityPost({
        title: 'Capitol Hill Porch Acoustic Gathering',
        category: 'party',
        startTime,
        city: 'Denver',
        lat: 39.7392,
        lon: -104.9903,
        broadcastRadius: 'neighborhood' // 2 miles
      }, { ip: '1.2.3.4' });
      assert.equal(postRes.success, true);

      // Query from 0.8 miles away (should be visible)
      const nearPosts = getActiveCommunityPosts({
        lat: 39.7450,
        lon: -104.9850,
        radiusMiles: 25,
        windowStart: new Date(now).toISOString(),
        windowEnd: new Date(now + 24 * 3600 * 1000).toISOString()
      });
      assert.equal(nearPosts.some(p => p.id === postRes.event.id), true, 'Expected neighborhood post to be visible at 0.8 miles');

      // Query from 6 miles away (should be filtered out because broadcastRadius is 2 miles)
      const farPosts = getActiveCommunityPosts({
        lat: 39.6500, // ~6.2 miles south
        lon: -104.9900,
        radiusMiles: 25,
        windowStart: new Date(now).toISOString(),
        windowEnd: new Date(now + 24 * 3600 * 1000).toISOString()
      });
      assert.equal(farPosts.some(p => p.id === postRes.event.id), false, 'Expected neighborhood post to be hidden at 6 miles');
    });

    it('allows broad local posts (25-50 miles) to broadcast across the metro area', () => {
      const now = Date.now();
      const startTime = new Date(now + 5 * 3600 * 1000).toISOString();

      const broadRes = createCommunityPost({
        title: 'Front Range Renaissance & Fantasy Faire',
        category: 'festival',
        startTime,
        city: 'Denver',
        lat: 39.7392,
        lon: -104.9903,
        broadcastRadius: 'broad' // 35 miles
      }, { ip: '1.2.3.5' });
      assert.equal(broadRes.success, true);

      // Query from Boulder (~24 miles away) with 30 mile search radius
      const metroPosts = getActiveCommunityPosts({
        lat: 40.0150,
        lon: -105.2705,
        radiusMiles: 30,
        windowStart: new Date(now).toISOString(),
        windowEnd: new Date(now + 24 * 3600 * 1000).toISOString()
      });
      assert.equal(metroPosts.some(p => p.id === broadRes.event.id), true, 'Expected broad post to be visible across metro');
    });
  });

  describe('3. Private Location Handling & Address Masking', () => {
    it('obscures exact street numbers when approximate location is selected', () => {
      const now = Date.now();
      const startTime = new Date(now + 2 * 3600 * 1000).toISOString();

      const res = createCommunityPost({
        title: 'Board Games & Homebrew Pizza',
        category: 'party',
        startTime,
        city: 'Denver',
        venue: 'Private Residence',
        location: '1845 N Pennsylvania St, Denver, CO 80203',
        isApproximateLocation: true,
        lat: 39.7456,
        lon: -104.9812
      }, { ip: '1.2.3.6' });

      assert.equal(res.success, true);
      const post = getCommunityPostById(res.event.id);
      assert.equal(post.isApproximateLocation, true);
      // Raw street address is nullified for privacy
      assert.equal(post.address, null);
      // Public display does not include "1845"
      assert.ok(!post.venue.includes('1845'));
    });
  });

  describe('4. Rolling 48-Hour Window & Ephemerality', () => {
    it('rejects events scheduled beyond the 48-hour discovery window', () => {
      const now = Date.now();
      const tooFarTime = new Date(now + 52 * 3600 * 1000).toISOString(); // 52 hours out

      const res = createCommunityPost({
        title: 'Next Week Party',
        startTime: tooFarTime,
        city: 'Denver'
      }, { ip: '1.2.3.7' });

      assert.equal(res.success, false);
      assert.equal(res.status, 400);
      assert.ok(res.error.includes('48 hours'));
    });

    it('rejects events whose start date has already passed', () => {
      const now = Date.now();
      const pastTime = new Date(now - 6 * 3600 * 1000).toISOString();

      const res = createCommunityPost({
        title: 'Yesterday Show',
        startTime: pastTime,
        city: 'Denver'
      }, { ip: '1.2.3.8' });

      assert.equal(res.success, false);
      assert.equal(res.status, 400);
      assert.ok(res.error.includes('passed'));
    });
  });

  describe('5. Lightweight Anti-Abuse & Reporting Protections', () => {
    it('detects and rejects duplicate submissions within 24 hours', () => {
      const now = Date.now();
      const startTime = new Date(now + 4 * 3600 * 1000).toISOString();

      const postData = {
        title: 'Duplicate Check Community Gathering',
        startTime,
        city: 'Denver',
        lat: 39.7392,
        lon: -104.9903
      };

      const res1 = createCommunityPost(postData, { ip: '1.2.3.9' });
      assert.equal(res1.success, true);

      const res2 = createCommunityPost(postData, { ip: '1.2.3.9' });
      assert.equal(res2.success, false);
      assert.equal(res2.status, 409);
      assert.ok(res2.error.includes('already posted recently'));
    });

    it('enforces IP rate limits on rapid submissions', () => {
      const now = Date.now();
      const ip = '198.51.100.42';

      for (let i = 0; i < 5; i++) {
        const res = createCommunityPost({
          title: `Rapid Event Post #${i + 1}`,
          startTime: new Date(now + (i + 2) * 3600 * 1000).toISOString(),
          city: 'Denver'
        }, { ip });
        assert.equal(res.success, true, `Post ${i + 1} should succeed`);
      }

      // 6th post from same IP should be throttled
      const resThrottled = createCommunityPost({
        title: 'Spam 6th Event Post',
        startTime: new Date(now + 8 * 3600 * 1000).toISOString(),
        city: 'Denver'
      }, { ip });

      assert.equal(resThrottled.success, false);
      assert.equal(resThrottled.status, 429);
      assert.ok(resThrottled.error.includes('Rate limit reached'));
    });

    it('rejects suspicious malicious spam schemes', () => {
      const now = Date.now();
      const res = createCommunityPost({
        title: 'Free Gift Cards No Scam Wire Transfer',
        description: 'Send BTC for guaranteed profit and crypto double',
        startTime: new Date(now + 3 * 3600 * 1000).toISOString(),
        city: 'Denver'
      }, { ip: '1.2.3.10' });

      assert.equal(res.success, false);
      assert.equal(res.status, 400);
      assert.ok(res.error.includes('promotional spam'));
    });

    it('allows reporting an event and hides it upon reaching threshold', () => {
      const now = Date.now();
      const res = createCommunityPost({
        title: 'Questionable Gathering',
        startTime: new Date(now + 4 * 3600 * 1000).toISOString(),
        city: 'Denver',
        lat: 39.7392,
        lon: -104.9903
      }, { ip: '1.2.3.11' });

      const id = res.event.id;
      assert.equal(getActiveCommunityPosts({ lat: 39.7392, lon: -104.9903 }).length, 1);

      // Report for threat -> immediately hides
      const rep = reportCommunityPost(id, 'threat');
      assert.equal(rep.success, true);
      assert.equal(rep.isHidden, true);

      // Should no longer appear in active discovery feed
      assert.equal(getActiveCommunityPosts({ lat: 39.7392, lon: -104.9903 }).length, 0);
    });
  });

  describe('6. Labeling & Freshness Validation', () => {
    it('labels community posts with "Community submitted — not independently verified"', () => {
      const post = {
        source: 'community_post',
        sourceType: 'community_submission',
        isCommunityPost: true,
        confirmationStatus: 'community_submitted'
      };

      const label = resolveSourceQualityLabel(post);
      assert.equal(label, 'Community submitted — not independently verified');
    });

    it('marks autonomous community post as displayable in freshness engine without admin review', () => {
      const post = {
        source: 'community_post',
        isAutonomousCommunityPost: true,
        start_time: new Date(Date.now() + 5 * 3600 * 1000).toISOString()
      };

      const freshness = evaluateEventFreshness(post);
      assert.equal(freshness.isDisplayable, true);
      assert.equal(freshness.status, 'verified_current');
    });
  });

  describe('7. Feed Engine Integration & Direct Event Link', () => {
    it('integrates community posts directly into executeHybridFeed with honest labels', async () => {
      const now = Date.now();
      const startTime = new Date(now + 3 * 3600 * 1000).toISOString();

      createCommunityPost({
        title: 'Autonomous Library Chess & Puzzle Jam',
        category: 'community',
        startTime,
        city: 'Denver',
        venue: 'Denver Central Library',
        lat: 39.7392,
        lon: -104.9903,
        broadcastRadius: 'nearby'
      }, { ip: '1.2.3.12' });

      const feed = await executeHybridFeed({
        lat: 39.7392,
        lon: -104.9903,
        radiusMiles: 15,
        window: '48h',
        windowStart: new Date(now).toISOString(),
        windowEnd: new Date(now + 48 * 3600 * 1000).toISOString(),
        enableDynamic: false
      });

      const matched = feed.events.find(e => e.title === 'Autonomous Library Chess & Puzzle Jam');
      assert.ok(matched, 'Expected community post to be included in hybrid feed');
      assert.equal(matched.sourceQualityLabel, 'Community submitted — not independently verified');
      assert.equal(matched.hasTicket, false);
      assert.equal(matched.category, 'community');
    });

    it('retrieves community post directly by ID for direct visits', () => {
      const now = Date.now();
      const res = createCommunityPost({
        title: 'Direct Link Accessible Social',
        startTime: new Date(now + 5 * 3600 * 1000).toISOString(),
        city: 'Denver'
      }, { ip: '1.2.3.13' });

      const found = getCommunityPostById(res.event.id);
      assert.ok(found);
      assert.equal(found.title, 'Direct Link Accessible Social');
    });
  });

  describe('8. Preservation of Existing 25 Baseline Clubs & Motorsports', () => {
    it('strictly preserves the 25 baseline live comedy clubs untouched', () => {
      const { BASELINE_25_LIVE_SLUGS } = require('../lib/crawling/venue-classification.js');
      assert.ok(BASELINE_25_LIVE_SLUGS.size >= 25, 'Baseline live clubs must remain strictly preserved');
    });

    it('strictly preserves the grassroots motorsports schedule untouched', () => {
      const races = getAllScheduledRaces();
      assert.ok(races.length > 0, 'Motorsports schedule must be populated');
    });

    it('preserves official source quality labels on government and venue calendars', () => {
      const govEvent = {
        category: 'civic',
        sourceType: 'government',
        confirmationStatus: 'official_government_calendar'
      };
      assert.equal(resolveSourceQualityLabel(govEvent), 'Official government calendar');

      const venueEvent = {
        confirmationStatus: 'confirmed_by_official_calendar',
        source: 'comedy_works_downtown'
      };
      assert.equal(resolveSourceQualityLabel(venueEvent), 'Official venue schedule');
    });
  });

  describe('9. HTTP Endpoint Routing & Page Rendering', () => {
    it('renders the public /post form page via postHandler', async () => {
      const postHandler = require('../api/post.js');
      let html = '';
      let statusCode = 200;
      const res = {
        setHeader() {},
        status(code) { statusCode = code; return this; },
        send(content) { html = content; return this; },
        json(obj) { return this; }
      };

      await postHandler({ method: 'GET', url: '/post', headers: {} }, res);
      assert.equal(statusCode, 200);
      assert.match(html, /Post an Event/);
      assert.match(html, /Publishes immediately to the local discovery radar/);
      assert.match(html, /Broadcast Radius/);
      assert.match(html, /Approximate Location \/ Private Gathering/);
      assert.match(html, /Community submitted — not independently verified/);
    });

    it('submits a post via POST /api/post', async () => {
      const postHandler = require('../api/post.js');
      let responseData = null;
      let statusCode = 200;
      const res = {
        setHeader() {},
        status(code) { statusCode = code; return this; },
        send(content) { return this; },
        json(obj) { responseData = obj; return this; }
      };

      const now = Date.now();
      const req = {
        method: 'POST',
        url: '/api/post',
        headers: { 'x-forwarded-for': '12.34.56.78' },
        body: {
          title: 'Highlands Garden Plant Swap',
          category: 'community',
          startTime: new Date(now + 4 * 3600 * 1000).toISOString(),
          city: 'Denver',
          broadcastRadius: 'nearby'
        }
      };

      await postHandler(req, res);
      assert.equal(statusCode, 200);
      assert.equal(responseData?.success, true);
      assert.ok(responseData?.event?.id.startsWith('comm_post_'));
    });

    it('renders the homepage with + Post an Event and not-interested styling', () => {
      const homeHandler = require('../api/home.js');
      let html = '';
      const res = {
        setHeader() {},
        end(data) { html = data; }
      };
      homeHandler({ url: '/', headers: {} }, res);

      assert.match(html, /\+ Post an Event/);
      assert.match(html, /href="\/post"/);
      assert.match(html, /\.btn-not-interested/);
      assert.match(html, /hideEventFor48Hours/);
      assert.match(html, /bb_hidden_events/);
    });

    it('renders event detail page for community post with noindex and report button', async () => {
      const now = Date.now();
      const resPost = createCommunityPost({
        title: 'Detail Page Verification Social',
        category: 'party',
        startTime: new Date(now + 4 * 3600 * 1000).toISOString(),
        city: 'Denver',
        isApproximateLocation: true
      }, { ip: '1.2.3.99' });

      const eventHandler = require('../api/event.js');
      let html = '';
      let statusCode = 200;
      const res = {
        setHeader() {},
        status(code) { statusCode = code; return this; },
        send(data) { html = data; return this; },
        end(data) { html = data; return this; }
      };

      await eventHandler({ url: `/event/${resPost.event.id}`, query: { id: resPost.event.id }, headers: {} }, res);
      assert.equal(statusCode, 200);
      assert.match(html, /Detail Page Verification Social/);
      assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
      assert.match(html, /Community submitted — not independently verified/);
      assert.match(html, /Private \/ Approximate Location/);
      assert.match(html, /Report Post/);
    });
  });
});
