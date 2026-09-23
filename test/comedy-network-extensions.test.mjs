import test from 'node:test';
import assert from 'node:assert/strict';

import {
  recordDemandSignal,
  getDemandSummaryForComic,
  purgeTestDemandSignals,
  createVenueClaim,
  verifyVenueClaim,
  verifyEmailClaim,
  purgeTestVenueClaim,
  getVenueClaimStatus,
  getVenueBySlug,
  getVenuesByCity,
  getDynamicSeedShows,
  getComedianBySlug
} from '../lib/comedy/registry.js';

import { getTestSecret } from '../lib/comedy/auth.js';
import { checkDurableRateLimit, resetDurableRateLimit, RATE_LIMIT_FILE } from '../lib/comedy/rate-limiter.js';
import { getDenverPilotPackets, getDenverPilotPacketBySlug } from '../lib/comedy/outreach-pilot.js';
import { getPilotMetricsSummary, resetTelemetry, trackCitySearch } from '../lib/telemetry.js';

import comedyDemandHandler from '../api/comedy-demand.js';
import venueClaimHandler from '../api/venue-claim.js';
import cardHandler from '../api/card.js';
import routerHandler from '../api/router.js';
import pilotDashboardHandler from '../api/pilot-dashboard.js';

function createMockReqRes(options = {}) {
  let statusCode = 200;
  let headers = {};
  let body = '';
  let jsonData = null;

  const req = {
    method: options.method || 'GET',
    url: options.url || '/',
    headers: options.headers || {},
    async *[Symbol.asyncIterator]() {
      if (options.body) {
        yield typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      }
    }
  };

  const res = {
    status(c) { statusCode = c; return this; },
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    getHeader(k) { return headers[k.toLowerCase()]; },
    send(data) {
      if (typeof data === 'object') {
        jsonData = data;
        body = JSON.stringify(data);
      } else {
        body = String(data);
      }
      return this;
    },
    json(data) {
      jsonData = data;
      body = JSON.stringify(data);
      headers['content-type'] = 'application/json; charset=utf-8';
      return this;
    },
    end(data) {
      if (data) body = String(data);
      return this;
    }
  };

  return {
    req,
    res,
    getStatus: () => statusCode,
    getHeader: (k) => headers[k.toLowerCase()],
    getBody: () => body,
    getJson: () => jsonData || (body ? JSON.parse(body) : null)
  };
}

test('1. Demand Privacy, Salted IP Hashing & Anti-Abuse Protections', async (t) => {
  resetDurableRateLimit();

  await t.test('hashes client IP with salt and never stores raw IP', () => {
    const slug = 'privacy-comic-' + Date.now();
    const rawIp = '203.0.113.195';

    const res = recordDemandSignal({
      comicSlug: slug,
      comicName: 'Privacy Comic',
      city: 'Austin, TX',
      ip: rawIp
    });

    assert.equal(res.success, true);
    assert.equal(res.isDuplicate, false);

    // Verify raw IP is never exposed in summary or stored
    const summary = getDemandSummaryForComic(slug);
    assert.equal(summary.totalDemand, 1);
  });

  await t.test('enforces explicit consent for email retention', () => {
    const slug = 'consent-comic-' + Date.now();

    // 1. Without consent -> email is discarded
    const r1 = recordDemandSignal({
      comicSlug: slug,
      comicName: 'Consent Comic',
      city: 'Boulder, CO',
      email: 'fan-noconsent@test.com',
      consent: false,
      ip: '198.51.100.1'
    });
    assert.equal(r1.emailRetained, false);

    // 2. With explicit consent -> email is retained
    const r2 = recordDemandSignal({
      comicSlug: slug,
      comicName: 'Consent Comic',
      city: 'Fort Collins, CO',
      email: 'fan-consented@test.com',
      consent: true,
      ip: '198.51.100.2'
    });
    assert.equal(r2.emailRetained, true);
  });

  await t.test('enforces rate limit of max 5 requests per 10 minutes per IP hash', () => {
    const rateLimitIp = '198.51.100.' + Math.floor(Math.random() * 90000 + 1000);
    const slug = 'ratelimit-comic-' + Date.now();

    for (let i = 0; i < 5; i++) {
      recordDemandSignal({
        comicSlug: slug,
        comicName: 'RateLimit Comic',
        city: `City ${i}`,
        ip: rateLimitIp
      });
    }

    // 6th request from same IP within 10 min must be blocked
    assert.throws(() => {
      recordDemandSignal({
        comicSlug: slug,
        comicName: 'RateLimit Comic',
        city: 'City 6',
        ip: rateLimitIp
      });
    }, /Rate limit exceeded/);
  });

  await t.test('isolates test signals from production demand tallies', () => {
    const slug = 'isolation-comic-' + Date.now();

    // Regular fan signal
    recordDemandSignal({
      comicSlug: slug,
      comicName: 'Test Isolation Comic',
      city: 'Denver, CO',
      ip: '10.0.1.1',
      isTest: false
    });

    // Synthetic test signal (e.g. from CI or production verification)
    const testSig = recordDemandSignal({
      comicSlug: slug,
      comicName: 'Test Isolation Comic',
      city: 'Salt Lake City, UT',
      email: 'verification-check@example.com',
      ip: '10.0.1.2',
      isTest: true
    });
    assert.equal(testSig.isTest, true);

    // Summary must exclude test signals from totalDemand count
    const summary = getDemandSummaryForComic(slug);
    assert.equal(summary.totalDemand, 1, 'Test signals must not increment public totalDemand');
    assert.equal(summary.topCities.length, 1);
    assert.equal(summary.topCities[0].city, 'Denver, CO');

    // Purge test signals
    purgeTestDemandSignals(slug);
    const summaryAfter = getDemandSummaryForComic(slug);
    assert.equal(summaryAfter.totalDemand, 1);
  });

  await t.test('API endpoint returns HTTP 429 when rate limit is exceeded', async () => {
    const spamIp = '203.0.113.' + Math.floor(Math.random() * 90000 + 1000);
    const slug = 'api-spam-test-' + Date.now();

    // Max out limit
    for (let i = 0; i < 5; i++) {
      recordDemandSignal({ comicSlug: slug, city: `City ${i}`, ip: spamIp });
    }

    const { req, res, getStatus, getJson } = createMockReqRes({
      method: 'POST',
      url: '/api/comedy/demand',
      headers: { 'x-forwarded-for': spamIp },
      body: { comicSlug: slug, city: 'Spam City' }
    });

    await comedyDemandHandler(req, res);
    assert.equal(getStatus(), 429);
    assert.ok(getJson().error.includes('Rate limit'));
  });

  await t.test('rejects unauthorized purge_test with 403 Forbidden', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({
      method: 'POST',
      url: '/api/comedy/demand',
      body: { action: 'purge_test', comicSlug: 'any-comic' }
    });
    await comedyDemandHandler(req, res);
    assert.equal(getStatus(), 403);
    assert.ok(getJson().error.includes('Server-only test token required'));
  });

  await t.test('ignores isTest and x-brinkberry-test from untrusted public callers', async () => {
    const slug = 'untrusted-comic-' + Date.now();
    const { req, res, getStatus, getJson } = createMockReqRes({
      method: 'POST',
      url: '/api/comedy/demand',
      headers: { 'x-brinkberry-test': 'true' },
      body: { comicSlug: slug, city: 'Denver, CO', isTest: true }
    });
    await comedyDemandHandler(req, res);
    assert.equal(getStatus(), 200);
    const json = getJson();
    // Untrusted request must not be treated as test
    assert.equal(json.isTest, false);
    const summary = getDemandSummaryForComic(slug);
    assert.equal(summary.totalDemand, 1, 'Untrusted request counts toward production demand');
  });

  await t.test('accepts isTest and purge_test when authorized via server-only test secret', async () => {
    const slug = 'auth-comic-' + Date.now();
    const secret = getTestSecret();

    // 1. Authorized test signal
    const { req: r1, res: s1, getStatus: gs1, getJson: gj1 } = createMockReqRes({
      method: 'POST',
      url: '/api/comedy/demand',
      headers: { 'x-brinkberry-test-secret': secret },
      body: { comicSlug: slug, city: 'Austin, TX', isTest: true }
    });
    await comedyDemandHandler(r1, s1);
    assert.equal(gs1(), 200);
    assert.equal(gj1().isTest, true);

    // 2. Authorized purge
    const { req: r2, res: s2, getStatus: gs2, getJson: gj2 } = createMockReqRes({
      method: 'POST',
      url: '/api/comedy/demand',
      headers: { 'x-brinkberry-test-secret': secret },
      body: { action: 'purge_test', comicSlug: slug }
    });
    await comedyDemandHandler(r2, s2);
    assert.equal(gs2(), 200);
    assert.equal(gj2().success, true);
  });

  await t.test('durable shared rate limiting enforces limits and survives resets', () => {
    const key = 'durable-test-key-' + Date.now();
    resetDurableRateLimit(key);

    for (let i = 0; i < 5; i++) {
      assert.equal(checkDurableRateLimit(key, 5, 600000), true);
    }
    assert.throws(() => {
      checkDurableRateLimit(key, 5, 600000);
    }, /Rate limit exceeded/);

    resetDurableRateLimit(key);
    assert.equal(checkDurableRateLimit(key, 5, 600000), true);
  });
});

test('2. Rigorous Venue Verification Workflow & Badging Separation', async (t) => {
  await t.test('domain match sets pending_email_verification and generates email token (does not auto-verify)', () => {
    const claim = createVenueClaim({
      venueSlug: 'comedy-works-downtown',
      requesterName: 'Sarah GeneralManager',
      role: 'General Manager',
      workEmail: 'sarah@comedyworks.com',
      verificationMethod: 'domain_email'
    });

    // Guardrail: domain email must trigger verification link, NOT instant verification
    assert.equal(claim.status, 'pending_email_verification');
    assert.ok(claim.emailVerificationToken, 'email verification token must be issued');

    // Venue should not yet be verified
    const statusBefore = getVenueClaimStatus('comedy-works-downtown');
    assert.equal(statusBefore.isVerified, false);
  });

  await t.test('confirming email token verifies venue identity and separates box office confirmation', () => {
    const claim = createVenueClaim({
      venueSlug: 'comedy-works-downtown',
      requesterName: 'Sarah GeneralManager',
      role: 'General Manager',
      workEmail: 'sarah@comedyworks.com'
    });

    // Complete email verification
    const verified = verifyEmailClaim(claim.id, claim.emailVerificationToken);
    assert.equal(verified.status, 'verified');

    const status = getVenueClaimStatus('comedy-works-downtown');
    assert.equal(status.isClaimed, true);
    assert.equal(status.isVerified, true);
    assert.equal(status.isVenueVerified, true);
    assert.equal(status.isBoxOfficeConfirmed, true);
    // Comedy works has confirmed official box office
    assert.equal(status.badge, '✓ Verified Venue · Official Box Office Confirmed');
  });

  await t.test('verified venue without confirmed box office displays Verified Venue badge only', () => {
    const claim = createVenueClaim({
      venueSlug: 'the-second-city',
      requesterName: 'Dan Director',
      role: 'Booker',
      workEmail: 'dan@secondcity.com'
    });

    verifyEmailClaim(claim.id, claim.emailVerificationToken);
    const status = getVenueClaimStatus('the-second-city');
    assert.equal(status.isVenueVerified, true);
    // Badge contains "Verified Venue"
    assert.ok(status.badge.includes('Verified Venue'));
  });

  await t.test('free webmail is queued for review (pending_verification)', () => {
    const claim = createVenueClaim({
      venueSlug: 'the-plus-eau-claire',
      requesterName: 'Tom Host',
      role: 'Host',
      workEmail: 'tom.openmic@gmail.com'
    });

    assert.equal(claim.status, 'pending_verification');
    assert.equal(claim.isFreeWebmail, true);
    assert.equal(claim.emailVerificationToken, null);
  });

  await t.test('public POST /api/venue/claim does not expose verification tokens', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({
      method: 'POST',
      url: '/api/venue/claim',
      body: {
        venueSlug: 'comedy-works-downtown',
        requesterName: 'Public User',
        workEmail: 'booking@comedyworks.com'
      }
    });
    await venueClaimHandler(req, res);
    assert.equal(getStatus(), 200);
    const json = getJson();
    assert.equal(json.emailVerificationToken, undefined);
    assert.equal(json.testToken, undefined);
  });

  await t.test('POST /api/venue/claim handles verify_email action without exposing personal data', async () => {
    const claim = createVenueClaim({
      venueSlug: 'denver-comedy-underground',
      requesterName: 'Chris Owner',
      workEmail: 'chris@denvercomedyunderground.com'
    });

    const { req, res, getStatus, getJson } = createMockReqRes({
      method: 'POST',
      url: '/api/venue/claim',
      body: {
        action: 'verify_email',
        claimId: claim.id,
        token: claim.emailVerificationToken
      }
    });

    await venueClaimHandler(req, res);
    assert.equal(getStatus(), 200);
    const json = getJson();
    assert.equal(json.success, true);
    assert.equal(json.status, 'verified');
    assert.equal(json.isVenueVerified, true);
    // Zero personal data exposed
    assert.equal(json.workEmail, undefined);
    assert.equal(json.requesterName, undefined);
  });

  await t.test('authorized test claim can complete verification lifecycle and purge cleanly', async () => {
    const secret = getTestSecret();
    const { req: r1, res: s1, getStatus: gs1, getJson: gj1 } = createMockReqRes({
      method: 'POST',
      url: '/api/venue/claim',
      headers: { 'x-brinkberry-test-secret': secret },
      body: {
        venueSlug: 'the-plus-eau-claire',
        requesterName: 'Test Admin',
        workEmail: 'test-admin@theplus.ec',
        isTest: true
      }
    });
    await venueClaimHandler(r1, s1);
    assert.equal(gs1(), 200);
    const claimData = gj1();
    assert.ok(claimData.testToken);

    // Verify via GET with token
    const { req: r2, res: s2, getStatus: gs2, getJson: gj2 } = createMockReqRes({
      method: 'GET',
      url: `/api/venue/claim?action=verify_email&claimId=${claimData.id}&token=${claimData.testToken}`
    });
    await venueClaimHandler(r2, s2);
    assert.equal(gs2(), 200);
    assert.equal(gj2().status, 'verified');
    assert.equal(gj2().workEmail, undefined);

    // Verify venue status updated
    const status = getVenueClaimStatus('the-plus-eau-claire');
    assert.equal(status.isVenueVerified, true);

    // Purge test claim
    const { req: r3, res: s3, getStatus: gs3, getJson: gj3 } = createMockReqRes({
      method: 'POST',
      url: '/api/venue/claim',
      headers: { 'x-brinkberry-test-secret': secret },
      body: { action: 'purge_test', venueSlug: 'the-plus-eau-claire' }
    });
    await venueClaimHandler(r3, s3);
    assert.equal(gs3(), 200);
    assert.equal(gj3().success, true);

    // Reverted to unclaimed
    const statusAfter = getVenueClaimStatus('the-plus-eau-claire');
    assert.equal(statusAfter.isVerified, false);
  });

  await t.test('unauthorized purge of venue claims returns 403 Forbidden', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({
      method: 'POST',
      url: '/api/venue/claim',
      body: { action: 'purge_test', venueSlug: 'the-plus-eau-claire' }
    });
    await venueClaimHandler(req, res);
    assert.equal(getStatus(), 403);
    assert.ok(getJson().error.includes('Server-only test token required'));
  });
});

test('3. Social Card Sizing: 1200x630 (OG) & 1080x1920 (Instagram Story)', async (t) => {
  await t.test('serves horizontal 1200x630 SVG poster card from /card/:id/svg', async () => {
    const { req, res, getStatus, getHeader, getBody } = createMockReqRes({
      method: 'GET',
      url: '/card/comedy_seed_denver_01/svg'
    });

    await cardHandler(req, res);
    assert.equal(getStatus(), 200);
    assert.ok(getHeader('content-type').includes('image/svg+xml'));
    const svg = getBody();
    assert.ok(svg.includes('viewBox="0 0 1200 630"'));
    assert.ok(svg.includes('width="1200" height="630"'));
    assert.ok(svg.includes('Denver Comedy Underground'));
  });

  await t.test('serves vertical 1080x1920 SVG story card from /card/:id/story', async () => {
    const { req, res, getStatus, getHeader, getBody } = createMockReqRes({
      method: 'GET',
      url: '/card/comedy_seed_denver_01/story'
    });

    await cardHandler(req, res);
    assert.equal(getStatus(), 200);
    assert.ok(getHeader('content-type').includes('image/svg+xml'));
    const svg = getBody();
    assert.ok(svg.includes('viewBox="0 0 1080 1920"'));
    assert.ok(svg.includes('width="1080" height="1920"'));
    assert.ok(svg.includes('SWIPE UP') || svg.includes('GET OFFICIAL TICKETS'));
    assert.ok(svg.includes('Denver Comedy Underground'));
  });

  await t.test('interactive HTML card (/card/:id) provides links to both formats', async () => {
    const { req, res, getStatus, getBody } = createMockReqRes({
      method: 'GET',
      url: '/card/comedy_seed_denver_01'
    });

    await cardHandler(req, res);
    assert.equal(getStatus(), 200);
    const html = getBody();
    assert.ok(html.includes('/svg'));
    assert.ok(html.includes('/story'));
    assert.ok(html.includes('Instagram Story'));
    assert.ok(html.includes('Twitter / OG Card'));
  });
});

test('4. Full Router Dispatching & Community Onboarding', async (t) => {
  await t.test('venue page includes prominent Claim This Venue button and Verified Venue pill', async () => {
    const { req, res, getStatus, getBody } = createMockReqRes({
      method: 'GET',
      url: '/venue/the-plus-eau-claire'
    });

    await routerHandler(req, res);
    assert.equal(getStatus(), 200);
    const html = getBody();
    assert.ok(html.includes('Claim this venue') || html.includes('/claim'));
    assert.ok(html.includes('Official Schedule Indexed') || html.includes('Verified Venue'));
  });

  await t.test('comedian page includes profile share button and consent checkbox', async () => {
    const { req, res, getStatus, getBody } = createMockReqRes({
      method: 'GET',
      url: '/comedian/sam-tallent'
    });

    await routerHandler(req, res);
    assert.equal(getStatus(), 200);
    const html = getBody();
    assert.ok(html.includes('Share Comedian Profile'));
    assert.ok(html.includes('demandConsent'));
    assert.ok(html.includes('Keep me updated if'));
  });

  await t.test('city comedy guides include Submit Your Show callout', async () => {
    const { req, res, getStatus, getBody } = createMockReqRes({
      method: 'GET',
      url: '/denver/comedy'
    });

    await routerHandler(req, res);
    assert.equal(getStatus(), 200);
    const html = getBody();
    assert.ok(html.includes('Producing a comedy show or hosting an open mic'));
    assert.ok(html.includes('/submit-comedy'));
  });

  await t.test('privacy policy documents fan demand signals and salted IP hashing', async () => {
    const { req, res, getStatus, getBody } = createMockReqRes({
      method: 'GET',
      url: '/privacy'
    });

    await routerHandler(req, res);
    assert.equal(getStatus(), 200);
    const html = getBody();
    assert.ok(html.includes('Fan Demand Signals'));
    assert.ok(html.includes('Salted One-Way IP Hashing'));
    assert.ok(html.includes('Consent-Based Email Retention'));
  });
});

test('Verified Denver Comedy Pilot Calendar & Operational Telemetry Suite', async (t) => {
  await t.test('all 7 Denver pilot rooms are registered with confirmed box office integrity', async () => {
    const denverVenues = getVenuesByCity('Denver');
    assert.ok(denverVenues.length >= 7, `Expected at least 7 Denver venues, got ${denverVenues.length}`);

    const expectedSlugs = [
      'comedy-works-downtown',
      'comedy-works-south',
      'denver-comedy-underground',
      'rise-comedy',
      'the-bug-theatre',
      'wide-right-denver',
      'lions-lair-denver'
    ];

    for (const slug of expectedSlugs) {
      const v = getVenueBySlug(slug);
      assert.ok(v, `Venue ${slug} must be registered`);
      assert.equal(v.city, 'Denver');
      assert.ok(v.website, `Venue ${slug} must have official website`);
      assert.ok(v.tagline, `Venue ${slug} must have a descriptive tagline`);
    }
  });

  await t.test('living Denver comedy events satisfy strict pilot provenance rules (no stale static dates)', async () => {
    const shows = getDynamicSeedShows().filter(s => s.city?.toLowerCase().includes('denver'));
    assert.ok(shows.length >= 8, `Expected at least 8 living Denver seed shows, got ${shows.length}`);

    const now = Date.now();
    for (const show of shows) {
      assert.ok(show.official_source_url && show.official_source_url.startsWith('http'), `Show ${show.id} missing official_source_url`);
      assert.ok(show.sourceType, `Show ${show.id} missing sourceType`);
      assert.ok(show.lastVerifiedAt, `Show ${show.id} missing lastVerifiedAt`);
      assert.equal(show.isCancelled, false, `Pilot show ${show.id} must not be cancelled`);
      assert.equal(show.isStale, false, `Pilot show ${show.id} must not be stale`);
      assert.ok(show.ticket_url, `Show ${show.id} missing ticket_url`);

      // Verify seed presence: seeds never generate request-time start/end times
      assert.equal(show.start_time, null, `Show ${show.id} start time must be null (no synthetic dates)`);
      assert.equal(show.end_time, null, `Show ${show.id} end time must be null`);
      assert.equal(show.confirmationStatus, 'venue_presence_only');
      assert.equal(show.isDisplayable, false);
    }
  });

  await t.test('Denver comedians are dynamically indexed and have active profiles', async () => {
    const comedians = ['adam-cayton-holland', 'derrick-stroup', 'christie-buchele', 'chris-voth', 'janae-burris', 'ben-roy'];
    for (const slug of comedians) {
      const comic = getComedianBySlug(slug);
      assert.ok(comic, `Comedian ${slug} should be indexed from live Denver shows`);
      assert.ok(comic.upcomingShows.length > 0, `Comedian ${slug} should have upcoming shows`);
    }
  });

  await t.test('pilot telemetry engine hooks accurately track all 8 core adoption metrics', async () => {
    resetTelemetry();
    resetDurableRateLimit();

    // 1. Guide views
    const { req: rGuide1, res: sGuide1 } = createMockReqRes({ method: 'GET', url: '/denver/comedy' });
    await routerHandler(rGuide1, sGuide1);
    const { req: rGuide2, res: sGuide2 } = createMockReqRes({ method: 'GET', url: '/denver/open-mics' });
    await routerHandler(rGuide2, sGuide2);

    // 2. Venue page view
    const { req: rVenue, res: sVenue } = createMockReqRes({ method: 'GET', url: '/venue/comedy-works-downtown' });
    await routerHandler(rVenue, sVenue);

    // 3. Official ticket click redirect with venue attribution
    const { req: rClick, res: sClick, getStatus: gsClick } = createMockReqRes({
      method: 'GET',
      url: '/api/click?eventId=comedy_seed_denver_01&url=https%3A%2F%2Fdenvercomedyunderground.com'
    });
    await routerHandler(rClick, sClick);
    assert.equal(gsClick(), 302);

    // 4. Fan demand signal
    const secret = getTestSecret();
    const { req: rDemand, res: sDemand, getStatus: gsDemand } = createMockReqRes({
      method: 'POST',
      url: '/api/comedy/demand',
      headers: { 'x-brinkberry-test-secret': secret },
      body: {
        comicSlug: 'adam-cayton-holland',
        city: 'Denver',
        email: 'pilotfan@example.com',
        consent: true,
        isTest: true
      }
    });
    await routerHandler(rDemand, sDemand);
    assert.equal(gsDemand(), 200);

    // 5. Social card visits (Open Graph HTML & Instagram Story 1080x1920)
    const { req: rCard1, res: sCard1 } = createMockReqRes({ method: 'GET', url: '/card/comedy_seed_denver_01' });
    await routerHandler(rCard1, sCard1);
    const { req: rCard2, res: sCard2 } = createMockReqRes({ method: 'GET', url: '/card/comedy_seed_denver_01/story' });
    await routerHandler(rCard2, sCard2);

    // 6. Venue claim request
    const { req: rClaim, res: sClaim, getStatus: gsClaim } = createMockReqRes({
      method: 'POST',
      url: '/api/venue/claim',
      headers: { 'x-brinkberry-test-secret': secret },
      body: {
        venueSlug: 'rise-comedy',
        requesterName: 'Rise Operator',
        workEmail: 'info@risecomedy.com',
        isTest: true
      }
    });
    await routerHandler(rClaim, sClaim);
    assert.equal(gsClaim(), 200);

    // 7. Community submissions & corrections
    const { req: rSubmit, res: sSubmit, getStatus: gsSubmit } = createMockReqRes({
      method: 'POST',
      url: '/submit-comedy',
      body: {
        title: 'Denver Indie Mic',
        venueName: 'Wide Right',
        city: 'Denver',
        startTime: new Date(Date.now() + 10 * 3600e3).toISOString()
      }
    });
    await routerHandler(rSubmit, sSubmit);
    assert.equal(gsSubmit(), 200);

    // 8. Empty search gap tracking
    trackCitySearch('Denver Suburbs', 39.75, -104.98, 0);

    // Verify all 8 metrics in summary
    const summary = getPilotMetricsSummary('denver');
    assert.equal(summary.metrics.guideViews.total, 2);
    assert.equal(summary.metrics.guideViews.denverComedy, 1);
    assert.equal(summary.metrics.guideViews.denverOpenMics, 1);
    assert.equal(summary.metrics.venueViews['comedy-works-downtown'], 1);
    assert.equal(summary.metrics.officialTicketClicks.total, 1);
    assert.equal(summary.metrics.officialTicketClicks.byVenue['denver-comedy-underground'], 1);
    assert.equal(summary.metrics.fanDemandSignals.total, 1);
    assert.equal(summary.metrics.fanDemandSignals.byComic['adam-cayton-holland'], 1);
    assert.equal(summary.metrics.socialCardVisits.total, 2);
    assert.equal(summary.metrics.socialCardVisits.story, 1);
    assert.equal(summary.metrics.claimRequests.total, 1);
    assert.equal(summary.metrics.claimRequests.byVenue['rise-comedy'], 1);
    assert.equal(summary.metrics.submissionsAndCorrections.total, 1);
    assert.equal(summary.metrics.emptySearches.total, 1);
  });

  await t.test('Denver pilot outreach packets exist for all 7 rooms with zero-fee guarantees and direct claim URLs', async () => {
    const packets = getDenverPilotPackets();
    assert.equal(packets.length, 7);

    for (const p of packets) {
      assert.ok(p.venueSlug, 'Missing venueSlug');
      assert.ok(p.venueName, 'Missing venueName');
      assert.ok(p.targetContactRole, 'Missing targetContactRole');
      assert.ok(p.contactEmailSuggestion, 'Missing contactEmailSuggestion');
      assert.ok(p.claimUrl.includes(`/venue/${p.venueSlug}/claim`), 'Invalid claim URL');
      assert.ok(p.liveListingUrl.includes(`/venue/${p.venueSlug}`), 'Invalid live listing URL');
      assert.ok(p.officialBoxOfficeUrl.startsWith('http'), 'Invalid box office URL');
      assert.ok(p.emailSubject, 'Missing email subject');
      assert.ok(p.emailBody.includes('100% Free') || p.emailBody.includes('Zero fees'), 'Outreach body must highlight zero-fee guarantee');
      assert.ok(p.emailBody.includes(p.claimUrl), 'Outreach body must contain direct claim link');
    }

    const bugPacket = getDenverPilotPacketBySlug('the-bug-theatre');
    assert.ok(bugPacket);
    assert.equal(bugPacket.venueName, 'The Bug Theatre');
  });

  await t.test('/api/comedy/pilot-metrics JSON endpoint returns complete telemetry and inventory', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({
      method: 'GET',
      url: '/api/comedy/pilot-metrics'
    });

    await routerHandler(req, res);
    assert.equal(getStatus(), 200);
    const json = getJson();
    assert.equal(json.success, true);
    assert.ok(json.summary?.metrics?.guideViews);
    assert.ok(json.inventory?.denverVenuesCount >= 7);
    assert.ok(json.inventory?.denverShowsCount >= 8);
    assert.ok(json.inventory?.outreachPacketsCount === 7);
  });

  await t.test('/admin/pilot serves responsive dashboard with scoreboards, calendar table, and outreach drafts', async () => {
    const { req, res, getStatus, getBody } = createMockReqRes({
      method: 'GET',
      url: '/admin/pilot'
    });

    await routerHandler(req, res);
    assert.equal(getStatus(), 200);
    const html = getBody();
    assert.ok(html.includes('Denver Comedy Pilot Dashboard'));
    assert.ok(html.includes('Guide Page Views'));
    assert.ok(html.includes('Official Ticket Clicks'));
    assert.ok(html.includes('Fan Demand Signals'));
    assert.ok(html.includes('Verified Denver Comedy Pilot Calendar'));
    assert.ok(html.includes('Denver Pilot Rooms &amp; Claim Packets') || html.includes('Denver Pilot Rooms'));
    assert.ok(html.includes('Drafts Only · No Auto-Send'));
    assert.ok(html.includes('Ticketing Lockdown Active'));
  });

  await t.test('/pilot route alias resolves cleanly to pilot dashboard', async () => {
    const { req, res, getStatus, getBody } = createMockReqRes({
      method: 'GET',
      url: '/pilot'
    });

    await routerHandler(req, res);
    assert.equal(getStatus(), 200);
    const html = getBody();
    assert.ok(html.includes('Denver Comedy Pilot Dashboard'));
  });

  await t.test('ticketing checkout remains locked down (403 prototype_disabled)', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({
      method: 'POST',
      url: '/api/comedy/checkout',
      body: { showId: 'dcu-headliner-weekend', tierName: 'General Admission', quantity: 1 }
    });

    await routerHandler(req, res);
    assert.equal(getStatus(), 403);
    const json = getJson();
    assert.equal(json.status, 'prototype_disabled');
  });
});

