import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectShowType,
  detectAgeLimit,
  normalizeComedyMetadata
} from '../lib/comedy/schema.js';

import {
  createSubmission,
  transitionState,
  isPubliclyVisible,
  REVIEWER_SECRET
} from '../lib/comedy/verification.js';

import {
  addSubmission,
  getSubmissionById,
  verifySubmission,
  rejectOrCancelSubmission,
  getNearbyVerifiedComedyShows,
  getVenueBySlug,
  getComedianBySlug,
  KNOWN_VENUES
} from '../lib/comedy/registry.js';

import { executeHybridFeed } from '../lib/providers/engine.js';
import feedHandler from '../api/feed.js';
import landingHandler from '../api/landing.js';
import entityHandler from '../api/entity.js';
import comedySubmitHandler from '../api/comedy-submit.js';
import comedyReviewHandler from '../api/comedy-review.js';
import routerHandler from '../api/router.js';

test('Stand-Up Comedy Vertical Data Extension Suite', async (t) => {

  await t.test('1. Normalized Schema & Detection Utilities', () => {
    // Show type detection
    assert.equal(detectShowType('Tuesday Night Open Mic at The Plus'), 'open_mic');
    assert.equal(detectShowType('The Second City Improv Revue'), 'improv');
    assert.equal(detectShowType('Saturday Stand-Up Showcase with Free Pizza'), 'showcase');
    assert.equal(detectShowType('John Mulaney: In Concert'), 'headliner');
    assert.equal(detectShowType('Underground Comedy Night'), 'standup');

    // Age limit detection
    assert.equal(detectAgeLimit('21 and over. Two drink minimum in the showroom.'), '21+');
    assert.equal(detectAgeLimit('Ages 18+ admitted with valid ID.'), '18+');
    assert.equal(detectAgeLimit('All ages welcome! Family friendly afternoon matinee.'), 'all_ages');
    assert.equal(detectAgeLimit('Doors open at 7pm.'), 'unknown');

    // Full normalization
    const meta = normalizeComedyMetadata({
      title: 'Maria Bamford at Comedy Works',
      description: '21+ only. Stand-up comedy headliner.',
      comedians: ['Maria Bamford', 'Jackie Kashian'],
      recurring: false,
      sourceType: 'verified_venue'
    });

    assert.equal(meta.showType, 'headliner');
    assert.equal(meta.ageLimit, '21+');
    assert.deepEqual(meta.comedians, ['Maria Bamford', 'Jackie Kashian']);
    assert.equal(meta.lineup.length, 2);
    assert.equal(meta.sourceType, 'verified_venue');
  });

  await t.test('2. Trust & Verification State Machine', () => {
    // Unverified visibility check
    assert.equal(isPubliclyVisible('submitted'), false);
    assert.equal(isPubliclyVisible('pending_review'), false);
    assert.equal(isPubliclyVisible('stale'), false);
    assert.equal(isPubliclyVisible('cancelled'), false);
    assert.equal(isPubliclyVisible('verified'), true);
    assert.equal(isPubliclyVisible('updated_by_venue'), true);

    // Initial submission creation
    const sub = createSubmission({
      title: 'RiNo Basement Open Mic',
      venue_name: 'Larimer Lounge',
      city: 'Denver, CO',
      start_time: new Date(Date.now() + 10 * 3600e3).toISOString(),
      lat: 39.7590,
      lng: -104.9840,
      comedians: ['Local Comics'],
      price: 'Free'
    });

    assert.equal(sub.verification.status, 'submitted');
    assert.ok(sub.verification.venueToken.startsWith('vt_'));
    assert.equal(sub.price_status, 'free');

    // Unauthorized transition fails
    assert.throws(() => {
      transitionState(sub, 'verified', { moderatorToken: 'wrong_secret' });
    }, /Unauthorized/);

    // Authorized transition succeeds
    const verified = transitionState(sub, 'verified', { moderatorToken: REVIEWER_SECRET, notes: 'Verified via club website' });
    assert.equal(verified.verification.status, 'verified');
    assert.equal(isPubliclyVisible(verified.verification.status), true);
    assert.equal(verified.verification.history.length, 2);
  });

  await t.test('3. Comedy Registry & In-Memory Store', () => {
    // Submit show via registry
    const added = addSubmission({
      title: 'Highlands Saturday Showcase',
      venue_name: 'Occidental Bar',
      city: 'Denver, CO',
      start_time: new Date(Date.now() + 4 * 3600e3).toISOString(),
      lat: 39.7610,
      lng: -105.0120,
      price: '$10'
    });

    assert.ok(added.id.startsWith('comedy_sub_'));
    assert.equal(added.verification.status, 'submitted');

    // Unverified show must NOT appear in public nearby query
    let nearby = getNearbyVerifiedComedyShows(39.7392, -104.9903, 25);
    const hasUnverified = nearby.some(s => s.id === added.id);
    assert.equal(hasUnverified, false, 'Unverified show must never leak to public query');

    // Verify submission
    verifySubmission(added.id, { moderatorToken: REVIEWER_SECRET });
    const updated = getSubmissionById(added.id);
    assert.equal(updated.verification.status, 'verified');

    // Now it appears in nearby verified shows
    nearby = getNearbyVerifiedComedyShows(39.7392, -104.9903, 25);
    const hasVerified = nearby.some(s => s.id === added.id);
    assert.equal(hasVerified, true, 'Verified show must appear in nearby query');
  });

  await t.test('4. Hybrid Dynamic Engine Comedy Ingestion & Filtering', async () => {
    // 1. Query Denver with mode=comedy
    const result = await executeHybridFeed({
      lat: 39.7392,
      lon: -104.9903,
      radiusMiles: 25,
      mode: 'comedy',
      enableDynamic: true
    });

    assert.ok(result.events.length > 0, 'Denver comedy feed should return events');
    assert.ok(result.events.every(e => e.categories.includes('comedy')), 'Every event must be categorized as comedy');
    assert.ok(result.hybrid.comedyCount > 0, 'Hybrid summary should include comedyCount');

    // Every comedy event should have comedy metadata
    const comedyEvents = result.events.filter(e => e.comedy);
    assert.ok(comedyEvents.length > 0, 'Should have events with comedy metadata schema');
    assert.ok(comedyEvents[0].comedy.showType, 'Comedy event should have showType');
  });

  await t.test('5. Dynamic Feed Endpoint (mode=comedy)', async () => {
    let statusCode = 0;
    let jsonBody = null;
    const req = {
      url: '/api/feed?lat=41.8781&lng=-87.6298&radius=25&mode=comedy&city=Chicago'
    };
    const res = {
      status(code) { statusCode = code; return this; },
      json(data) { jsonBody = data; return this; }
    };

    await feedHandler(req, res);
    assert.equal(statusCode, 200);
    assert.equal(jsonBody.meta.mode, 'comedy');
    assert.ok(Number.isInteger(jsonBody.meta.verifiedInventory.comedy));
    assert.ok(jsonBody.events.every(e => e.categories.includes('comedy')));
  });

  await t.test('6. Specialized City Comedy Guides (/:city/comedy)', async () => {
    const testCities = ['denver', 'chicago', 'eau-claire', 'paris'];

    for (const slug of testCities) {
      let output = '';
      let statusCode = 200;
      const req = { url: `/${slug}/comedy` };
      const res = {
        status(c) { statusCode = c; return this; },
        setHeader() {},
        send(html) { output = html; }
      };

      await landingHandler(req, res);
      assert.equal(statusCode, 200, `/${slug}/comedy should return 200`);
      assert.match(output, /Live Stand-Up Comedy &amp; Open Mics|Live Stand-Up Comedy/);
      assert.match(output, /Submit a Comedy Show/);
      assert.match(output, /ItemList/);
      assert.match(output, /subnav/);
    }
  });

  await t.test('7. Deep Entity Pages: Venues & Comedians', async () => {
    // 1. Existing verified venue
    let venueHtml = '';
    let venueStatus = 200;
    const vReq = { url: '/venue/comedy-works-downtown' };
    const vRes = {
      status(c) { venueStatus = c; return this; },
      setHeader() {},
      send(h) { venueHtml = h; }
    };
    await entityHandler(vReq, vRes);
    assert.equal(venueStatus, 200);
    assert.match(venueHtml, /Comedy Works Downtown/);
    assert.match(venueHtml, /Official Schedule Indexed/);
    assert.match(venueHtml, /ComedyClub/);

    // 2. Existing verified comedian
    let comicHtml = '';
    let comicStatus = 200;
    const cReq = { url: '/comedian/sam-tallent' };
    const cRes = {
      status(c) { comicStatus = c; return this; },
      setHeader() {},
      send(h) { comicHtml = h; }
    };
    await entityHandler(cReq, cRes);
    assert.equal(comicStatus, 200);
    assert.match(comicHtml, /Sam Tallent/);
    assert.match(comicHtml, /Stand-Up Comedian/);
    assert.match(comicHtml, /Person/);

    // 3. Non-existent venue returns 404 (radar freshness integrity)
    let notFoundStatus = 0;
    const nfReq = { url: '/venue/non-existent-room-xyz' };
    const nfRes = {
      status(c) { notFoundStatus = c; return this; },
      setHeader() {},
      send() {}
    };
    await entityHandler(nfReq, nfRes);
    assert.equal(notFoundStatus, 404);
  });

  await t.test('8. Comedy Submission & Moderation Endpoints', async () => {
    // 1. GET /submit-comedy renders submission portal
    let portalHtml = '';
    let portalStatus = 200;
    const pReq = { method: 'GET', url: '/submit-comedy' };
    const pRes = {
      status(c) { portalStatus = c; return this; },
      setHeader() {},
      send(h) { portalHtml = h; }
    };
    await comedySubmitHandler(pReq, pRes);
    assert.equal(portalStatus, 200);
    assert.match(portalHtml, /List Your Comedy Show or Open Mic/);
    assert.match(portalHtml, /comedyForm/);

    // 2. POST /api/comedy/submit creates submission
    let subJson = null;
    let subStatus = 0;
    const postReq = {
      method: 'POST',
      url: '/api/comedy/submit',
      async *[Symbol.asyncIterator]() {
        yield JSON.stringify({
          title: 'Denver Speakeasy Improv Night',
          venue_name: 'Clocktower Cabaret',
          city: 'Denver, CO',
          start_time: new Date(Date.now() + 8 * 3600e3).toISOString(),
          showType: 'improv',
          price: '$15'
        });
      }
    };
    const postRes = {
      status(c) { subStatus = c; return this; },
      setHeader() {},
      json(d) { subJson = d; }
    };
    await comedySubmitHandler(postReq, postRes);
    assert.equal(subStatus, 200);
    assert.equal(subJson.success, true);
    assert.equal(subJson.status, 'submitted');
    const createdId = subJson.id;

    // 3. GET /api/comedy/pending without token returns 401
    let authFailStatus = 0;
    const failReq = { method: 'GET', url: '/api/comedy/pending?token=invalid', headers: {} };
    const failRes = {
      status(c) { authFailStatus = c; return this; },
      setHeader() {},
      json() {}
    };
    await comedyReviewHandler(failReq, failRes);
    assert.equal(authFailStatus, 401);

    // 4. POST /api/comedy/verify with moderator token verifies show
    let verifyStatus = 0;
    let verifyJson = null;
    const vReq = {
      method: 'POST',
      url: `/api/comedy/verify?action=verify&token=${REVIEWER_SECRET}`,
      headers: {},
      async *[Symbol.asyncIterator]() {
        yield JSON.stringify({ id: createdId, notes: 'Approved by test runner' });
      }
    };
    const vRes = {
      status(c) { verifyStatus = c; return this; },
      setHeader() {},
      json(d) { verifyJson = d; }
    };
    await comedyReviewHandler(vReq, vRes);
    assert.equal(verifyStatus, 200);
    assert.equal(verifyJson.status, 'verified');
  });

  await t.test('9. Router Integration for All Vertical Routes', async () => {
    const checkRoute = async (url) => {
      let code = 200;
      let html = '';
      const req = { url, headers: {} };
      const res = {
        status(c) { code = c; return this; },
        setHeader() {},
        send(h) { html = h; },
        end(h) { if (h) html = h; }
      };
      await routerHandler(req, res);
      return { code, html };
    };

    const resGuide = await checkRoute('/denver/comedy');
    assert.equal(resGuide.code, 200);
    assert.match(resGuide.html, /Live Stand-Up Comedy/);

    const resSubmit = await checkRoute('/submit-comedy');
    assert.equal(resSubmit.code, 200);
    assert.match(resSubmit.html, /List Your Comedy Show/);

    const resVenue = await checkRoute('/venue/comedy-works-downtown');
    assert.equal(resVenue.code, 200);
    assert.match(resVenue.html, /Comedy Works Downtown/);
  });
});
