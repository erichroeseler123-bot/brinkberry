import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  KNOWN_TRACKS,
  TOURING_SERIES,
  getTrackBySlug,
  getAllTracks,
  getTracksByState,
  getTracksByCity,
  getTouringSeriesBySlug,
  getAllTouringSeries,
  getDynamicSeedRaces,
  getAllScheduledRaces,
  getTrackSchedule,
  calculatePlanningWindowBounds,
  verifyScheduleFreshness,
  getNearbyVerifiedRaces,
  createTrackClaim,
  verifyTrackEmailClaim,
  purgeTestTrackClaim,
  recordRacingDemandSignal,
  getRacingDemandSummary,
  purgeTestRacingDemand
} from '../lib/racing/registry.js';

import {
  TRACK_SURFACES,
  RACE_CLASSES,
  WEATHER_STATUSES,
  ADMISSION_MODELS,
  PLANNING_WINDOWS,
  normalizeTrackMetadata,
  normalizeRaceEvent,
  formatSurfaceName
} from '../lib/racing/schema.js';

import {
  RACING_PILOT_PACKETS,
  getRacingPilotPackets,
  getRacingPilotPacketBySlug
} from '../lib/racing/outreach-pilot.js';

import {
  getRacingPilotMetricsSummary,
  trackRacingGuideView,
  trackTrackView,
  trackRacingTicketClick,
  trackRacingDemand,
  trackRacingCardVisit,
  trackTrackClaimRequest,
  resetTelemetry
} from '../lib/telemetry.js';

import router from '../api/router.js';
import racingCardHandler from '../api/racing-card.js';
import racingEntityHandler from '../api/racing-entity.js';
import racingClaimHandler from '../api/racing-claim.js';
import racingDemandHandler from '../api/racing-demand.js';
import racingPilotDashboardHandler from '../api/racing-pilot-dashboard.js';
import comedyCheckoutHandler from '../api/comedy-checkout.js';

// Helper to simulate request/response
function createMockReqRes(options = {}) {
  const req = {
    method: options.method || 'GET',
    url: options.url || '/',
    headers: options.headers || {},
    query: options.query || {},
    body: options.body || null,
    [Symbol.asyncIterator]: async function* () {
      if (options.rawBody) yield options.rawBody;
      else if (options.body && typeof options.body === 'object') yield JSON.stringify(options.body);
    }
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, val) {
      this.headers[key.toLowerCase()] = val;
      return this;
    },
    json(data) {
      this.setHeader('content-type', 'application/json; charset=utf-8');
      this.body = JSON.stringify(data);
      this.jsonData = data;
      return this;
    },
    send(content) {
      this.body = content;
      return this;
    },
    end(data) {
      if (data) this.body = data;
      return this;
    }
  };

  return { req, res };
}

import { resetDurableRateLimit } from '../lib/comedy/rate-limiter.js';

describe('Grassroots Motorsports & Short Track Discovery Engine', () => {

  beforeEach(() => {
    resetTelemetry();
    resetDurableRateLimit();
  });

  describe('1. Motorsports Schema & Normalization', () => {
    it('defines supported track surfaces, race classes, and weather statuses', () => {
      assert.ok(TRACK_SURFACES.includes('dirt_oval'));
      assert.ok(TRACK_SURFACES.includes('asphalt_oval'));
      assert.ok(TRACK_SURFACES.includes('drag_strip'));
      assert.ok(TRACK_SURFACES.includes('road_course'));

      assert.ok(WEATHER_STATUSES.includes('green_flag'));
      assert.ok(WEATHER_STATUSES.includes('weather_watch'));
      assert.ok(WEATHER_STATUSES.includes('rained_out'));

      assert.ok(ADMISSION_MODELS.includes('paid_ticket'));
      assert.ok(ADMISSION_MODELS.includes('cash_at_gate'));
    });

    it('normalizes track metadata with surface display and policies', () => {
      const meta = normalizeTrackMetadata({
        trackType: 'dirt_oval',
        length: '1/4-mile',
        banking: 'Semi-banked clay',
        sanctioningBodies: ['IMCA Racing'],
        coolersAllowed: true
      });

      assert.equal(meta.trackType, 'dirt_oval');
      assert.equal(meta.surfaceDisplay, 'Dirt Oval');
      assert.equal(meta.coolersAllowed, true);
      assert.deepEqual(meta.sanctioningBodies, ['IMCA Racing']);
    });

    it('normalizes race event with timeline, admission, and weather', () => {
      const eventMeta = normalizeRaceEvent({
        classes: ['Super Late Models', 'Pro Trucks'],
        weatherStatus: 'weather_watch',
        admissionModel: 'cash_at_gate',
        gateTime: '4:00 PM',
        greenFlagTime: '6:30 PM',
        generalAdmissionPrice: '$15'
      });

      assert.equal(eventMeta.weatherStatus, 'weather_watch');
      assert.equal(eventMeta.admissionModel, 'cash_at_gate');
      assert.equal(eventMeta.greenFlagTime, '6:30 PM');
      assert.equal(eventMeta.generalAdmissionPrice, '$15');
      assert.equal(eventMeta.isCancelled, false);
    });

    it('marks race as cancelled when weatherStatus is rained_out', () => {
      const eventMeta = normalizeRaceEvent({
        weatherStatus: 'rained_out'
      });
      assert.equal(eventMeta.isCancelled, true);
    });
  });

  describe('2. Track & Touring Series Registry', () => {
    it('contains all 9 benchmark seed tracks across disciplines including Eau Claire comparison', () => {
      const tracks = getAllTracks();
      assert.ok(tracks.length >= 9);

      const cns = getTrackBySlug('colorado-national-speedway');
      assert.ok(cns);
      assert.equal(cns.trackType, 'asphalt_oval');
      assert.equal(cns.officialBoxOfficeConfirmed, true);

      const i76 = getTrackBySlug('i-76-speedway');
      assert.ok(i76);
      assert.equal(i76.trackType, 'dirt_oval');

      const pueblo = getTrackBySlug('pueblo-motorsports-park');
      assert.ok(pueblo);
      assert.equal(pueblo.trackType, 'drag_strip');

      const eldora = getTrackBySlug('eldora-speedway');
      assert.ok(eldora);
      assert.equal(eldora.state, 'OH');

      // Eau Claire pilot comparison tracks
      const redCedar = getTrackBySlug('red-cedar-speedway');
      assert.ok(redCedar);
      assert.equal(redCedar.city, 'Eau Claire');
      assert.equal(redCedar.state, 'WI');
      assert.equal(redCedar.trackType, 'dirt_oval');

      const rockFalls = getTrackBySlug('rock-falls-raceway');
      assert.ok(rockFalls);
      assert.equal(rockFalls.city, 'Eau Claire');
      assert.equal(rockFalls.state, 'WI');
      assert.equal(rockFalls.trackType, 'drag_strip');
    });

    it('computes planning window bounds accurately for all supported windows', () => {
      const w48h = calculatePlanningWindowBounds('48h');
      assert.equal(w48h.norm, '48h');
      assert.ok(w48h.endMs - w48h.startMs <= 48 * 3600e3 + 1000);

      const wThis = calculatePlanningWindowBounds('this_weekend');
      assert.equal(wThis.norm, 'this_weekend');
      assert.ok(wThis.startMs <= wThis.endMs);

      const wNext = calculatePlanningWindowBounds('next_weekend');
      assert.equal(wNext.norm, 'next_weekend');
      assert.ok(wNext.startMs >= Date.now());
      assert.ok(wNext.endMs > wNext.startMs);

      const w30d = calculatePlanningWindowBounds('30d');
      assert.equal(w30d.norm, '30d');
      assert.ok(w30d.endMs - w30d.startMs >= 29 * 86400e3);

      const wSeason = calculatePlanningWindowBounds('season');
      assert.equal(wSeason.norm, 'season');
      assert.ok(wSeason.endMs - wSeason.startMs >= 179 * 86400e3);
    });

    it('retrieves multi-week schedules with provenance and freshness verification', () => {
      // 48h schedule vs 30d schedule vs full season
      const cns48h = getTrackSchedule('colorado-national-speedway', '48h');
      const cns30d = getTrackSchedule('colorado-national-speedway', '30d');
      const cnsSeason = getTrackSchedule('colorado-national-speedway', 'season');

      assert.ok(cns48h.length >= 2, 'CNS should have at least 2 races in 48h window');
      assert.ok(cns30d.length >= cns48h.length, '30d window should include 48h races plus multi-week');
      assert.ok(cnsSeason.length >= cns30d.length, 'Season should include full annual slate');

      // Eau Claire schedules
      const rcsSeason = getTrackSchedule('red-cedar-speedway', 'season');
      assert.ok(rcsSeason.length >= 3);
      assert.ok(rcsSeason.some(r => r.classes.includes('WISSOTA Late Models')));

      const rfrSeason = getTrackSchedule('rock-falls-raceway', 'season');
      assert.ok(rfrSeason.length >= 3);
      assert.ok(rfrSeason.some(r => r.classes.includes('Super Pro')));

      // Freshness check
      const freshness = verifyScheduleFreshness('race_seed_cns_01');
      assert.equal(freshness.found, true);
      assert.equal(freshness.isFresh, true);
      assert.equal(freshness.isStale, false);
      assert.ok(freshness.officialSourceUrl.startsWith('https://'));
    });

    it('contains touring series with fan-demand metadata', () => {
      const seriesList = getAllTouringSeries();
      assert.ok(seriesList.length >= 5);

      const outlaws = getTouringSeriesBySlug('world-of-outlaws');
      assert.ok(outlaws);
      assert.ok(outlaws.disciplines.includes('Sprint Cars'));
      assert.equal(outlaws.sanction, 'World Racing Group');

      const cars = getTouringSeriesBySlug('cars-tour');
      assert.ok(cars);
      assert.ok(cars.sanction.includes('CARS Tour'));
    });

    it('never generates synthetic now+offset dates for seed races (venue_presence_only master records)', () => {
      const races = getDynamicSeedRaces();
      assert.equal(races.length, 0, 'Unconfirmed dynamic seed races must not be generated with synthetic timestamps');

      const scheduled = getAllScheduledRaces();
      assert.ok(scheduled.length >= 8, 'Scheduled master race definitions exist as venue_presence_only metadata');

      for (const race of scheduled) {
        assert.equal(race.start_time, null, `Race ${race.id} must have null start_time`);
        assert.equal(race.end_time, null, `Race ${race.id} must have null end_time`);
        assert.equal(race.confirmationStatus, 'venue_presence_only');
        assert.equal(race.isDisplayable, false);

        // Provenance & trust fields
        assert.ok(race.official_source_url.startsWith('https://'), `Race ${race.id} must have official HTTPS source`);
        assert.equal(race.sourceType, 'venue_presence');
        assert.ok(race.lastVerifiedAt);
        assert.ok(race.venue_name);
        assert.ok(Number.isFinite(race.venue_latitude));
        assert.ok(Number.isFinite(race.venue_longitude));
        assert.ok(race.racing);
      }
    });

    it('retrieves nearby verified races by geographic coordinates excluding unconfirmed seeds', () => {
      // Unconfirmed venue_presence_only records must not appear in verified live event searches
      const denverRaces = getNearbyVerifiedRaces(39.7392, -104.9903, 100);
      assert.equal(denverRaces.length, 0, 'Denver has no unconfirmed synthetic seed races in verified radar');

      // Eau Claire coords: lat 44.8113, lon -91.4985
      const ecRaces = getNearbyVerifiedRaces(44.8113, -91.4985, 50);
      assert.equal(ecRaces.length, 0, 'Eau Claire has no unconfirmed synthetic seed races in verified radar');
    });
  });

  describe('3. Track Promoter Outreach Packets (Drafts Only)', () => {
    it('generates reviewable draft packets for Colorado pilot and Eau Claire comparison tracks', () => {
      const packets = getRacingPilotPackets();
      assert.equal(packets.length, 7);

      const cnsPacket = getRacingPilotPacketBySlug('colorado-national-speedway');
      assert.ok(cnsPacket);
      assert.equal(cnsPacket.trackName, 'Colorado National Speedway');
      assert.ok(cnsPacket.claimUrl.includes('/track/colorado-national-speedway/claim'));
      assert.ok(cnsPacket.emailSubject.includes('Colorado National Speedway'));
      assert.ok(cnsPacket.emailBody.includes('100% Free'));
      assert.ok(cnsPacket.emailBody.includes('zero middleman markups'));

      // Eau Claire comparison draft packets
      const rcsPacket = getRacingPilotPacketBySlug('red-cedar-speedway');
      assert.ok(rcsPacket);
      assert.equal(rcsPacket.trackName, 'Red Cedar Speedway');
      assert.ok(rcsPacket.claimUrl.includes('/track/red-cedar-speedway/claim'));
      assert.ok(rcsPacket.emailSubject.includes('Red Cedar Speedway'));

      const rfrPacket = getRacingPilotPacketBySlug('rock-falls-raceway');
      assert.ok(rfrPacket);
      assert.equal(rfrPacket.trackName, 'Rock Falls Raceway');
      assert.ok(rfrPacket.claimUrl.includes('/track/rock-falls-raceway/claim'));
      assert.ok(rfrPacket.emailSubject.includes('Rock Falls Raceway'));
    });
  });

  describe('4. Track Claiming & Verification API & UI', () => {
    it('serves claim HTML page on GET /track/:slug/claim', async () => {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/track/colorado-national-speedway/claim'
      });

      await racingClaimHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes('Claim &amp; Verify Colorado National Speedway'));
      assert.ok(res.body.includes('Official Work Email'));
      assert.ok(res.body.includes('Free Guarantee for Track Promoters'));
    });

    it('creates pending_email_verification claim on official domain match', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/racing/claim',
        headers: {
          authorization: 'Bearer bb_internal_test_secret_2026',
          'content-type': 'application/json'
        },
        body: {
          trackSlug: 'colorado-national-speedway',
          workEmail: 'promoter@coloradospeedway.com',
          requesterName: 'Track Operator',
          requesterRole: 'General Manager'
        }
      });

      await racingClaimHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.jsonData.success, true);
      assert.equal(res.jsonData.status, 'pending_email_verification');
      assert.ok(res.jsonData.testToken);

      // Verify email claim using test token
      const { req: vReq, res: vRes } = createMockReqRes({
        method: 'POST',
        url: '/api/racing/claim',
        body: {
          action: 'verify_email',
          claimId: res.jsonData.id,
          token: res.jsonData.testToken
        }
      });

      await racingClaimHandler(vReq, vRes);
      assert.equal(vRes.statusCode, 200);
      assert.equal(vRes.jsonData.status, 'verified');
      assert.equal(vRes.jsonData.isVenueVerified, true);
    });

    it('rejects unauthorized purge request with 403', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/racing/claim',
        body: {
          action: 'purge_test',
          claimId: 'claim_test_123'
        }
      });

      await racingClaimHandler(req, res);
      assert.equal(res.statusCode, 403);
    });
  });

  describe('5. Touring Series Fan Demand Engine', () => {
    it('records fan demand with salted IP hash and anti-abuse throttling', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/racing/demand',
        headers: {
          authorization: 'Bearer bb_internal_test_secret_2026',
          'x-forwarded-for': '73.181.12.99',
          'content-type': 'application/json'
        },
        body: {
          entitySlug: 'world-of-outlaws',
          trackSlug: 'i-76-speedway',
          consent: true,
          email: 'sprint_fan@example.com'
        }
      });

      await racingDemandHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.jsonData.success, true);
      assert.equal(res.jsonData.entitySlug, 'world-of-outlaws');
      assert.equal(res.jsonData.trackSlug, 'i-76-speedway');

      // Duplicate submission from same IP within 30-day window is deduplicated
      const { req: dupReq, res: dupRes } = createMockReqRes({
        method: 'POST',
        url: '/api/racing/demand',
        headers: {
          authorization: 'Bearer bb_internal_test_secret_2026',
          'x-forwarded-for': '73.181.12.99',
          'content-type': 'application/json'
        },
        body: {
          entitySlug: 'world-of-outlaws',
          trackSlug: 'i-76-speedway'
        }
      });

      await racingDemandHandler(dupReq, dupRes);
      assert.equal(dupRes.statusCode, 200);
      assert.equal(dupRes.jsonData.deduplicated, true);

      // Inspect summary
      const summary = getRacingDemandSummary('world-of-outlaws');
      assert.equal(summary.entitySlug, 'world-of-outlaws');
      assert.ok(summary.totalDemand >= 1);
    });

    it('blocks unauthorized demand purge with 403', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/racing/demand',
        body: {
          action: 'purge_test',
          entitySlug: 'world-of-outlaws'
        }
      });

      await racingDemandHandler(req, res);
      assert.equal(res.statusCode, 403);
    });
  });

  describe('6. Shareable Social Race Cards', () => {
    it('serves 1200x630 Open Graph SVG card for /card/race/:id/svg', async () => {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/card/race/race_seed_cns_01/svg'
      });

      await racingCardHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'image/svg+xml; charset=utf-8');
      assert.ok(res.body.includes('viewBox="0 0 1200 630"'));
      assert.ok(res.body.includes('Colorado National Speedway'));
      assert.ok(res.body.includes('GREEN FLAG'));
    });

    it('serves 1080x1920 Instagram Story vertical SVG card for /card/race/:id/story', async () => {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/card/race/race_seed_i76_01/story'
      });

      await racingCardHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'image/svg+xml; charset=utf-8');
      assert.ok(res.body.includes('viewBox="0 0 1080 1920"'));
      assert.ok(res.body.includes('I-76 Speedway'));
      assert.ok(res.body.includes('RACE DAY RADAR'));
    });

    it('serves responsive HTML preview card for /card/race/:id', async () => {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/card/race/race_seed_cns_01'
      });

      await racingCardHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes('<!doctype html>'));
      assert.ok(res.body.includes('Colorado National Speedway'));
      assert.ok(res.body.includes('Story Card'));
    });
  });

  describe('7. Canonical Track & Touring Series Profile Pages', () => {
    it('renders rich track profile on /track/:slug with timeline and claim badge', async () => {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/track/colorado-national-speedway'
      });

      await racingEntityHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes('Colorado National Speedway'));
      assert.ok(res.body.includes('Paved Short Track'));
      assert.ok(res.body.includes('Green Flag'));
      assert.ok(res.body.includes('Claim Track Page'));
    });

    it('renders track profile with planning window tabs and multi-week schedule on /track/:slug?window=30d', async () => {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/track/colorado-national-speedway?window=30d'
      });

      await racingEntityHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes('Colorado National Speedway'));
      assert.ok(res.body.includes('Next 30 Days Racing Outlook'));
      assert.ok(res.body.includes('48h Radar'));
      assert.ok(res.body.includes('Full Season'));
      assert.ok(res.body.includes('tab-btn active'));
    });

    it('renders Eau Claire track profile on /track/red-cedar-speedway with WISSOTA racing', async () => {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/track/red-cedar-speedway'
      });

      await racingEntityHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes('Red Cedar Speedway'));
      assert.ok(res.body.includes('Eau Claire, WI'));
      assert.ok(res.body.includes('Dirt Oval'));
      assert.ok(res.body.includes('WISSOTA'));
    });

    it('renders touring series profile on /series/:slug with fan demand console', async () => {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/series/world-of-outlaws'
      });

      await racingEntityHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes('World of Outlaws'));
      assert.ok(res.body.includes('Bring World of Outlaws') && res.body.includes('to Your Home Track'));
      assert.ok(res.body.includes('Select Target Race Track'));
    });

    it('returns 404 for non-existent track', async () => {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/track/non-existent-speedway'
      });

      await racingEntityHandler(req, res);
      assert.equal(res.statusCode, 404);
      assert.ok(res.body.includes('Track Not Found'));
    });
  });

  describe('8. Operations Dashboard & Telemetry API', () => {
    it('serves operations dashboard on /admin/pilot-racing', async () => {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/admin/pilot-racing'
      });

      await racingPilotDashboardHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes('Motorsports &amp; Short Track Pilot Operations'));
      assert.ok(res.body.includes('Verified Living Race Calendar'));
      assert.ok(res.body.includes('Track Promoter Claim Packets'));
      assert.ok(res.body.includes('Ticketing Lockdown Active'));
    });

    it('returns JSON telemetry summary on GET /api/racing/pilot-metrics', async () => {
      trackRacingGuideView('colorado', 'dirt');
      trackTrackView('i-76-speedway');
      trackRacingTicketClick('i-76-speedway', 'race_seed_i76_01');
      trackRacingDemand('world-of-outlaws', 'series', 'i-76-speedway');
      trackRacingCardVisit('race_seed_i76_01', 'story');
      trackTrackClaimRequest('i-76-speedway');

      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/api/racing/pilot-metrics'
      });

      await racingPilotDashboardHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.jsonData.success, true);
      assert.ok(res.jsonData.inventory.tracksCount >= 7);
      assert.ok(res.jsonData.inventory.racesCount >= 8);
      assert.ok(res.jsonData.inventory.outreachPacketsCount === 7);

      const m = res.jsonData.summary.metrics;
      assert.equal(m.guideViews.dirtOvals, 1);
      assert.equal(m.trackViews['i-76-speedway'], 1);
      assert.equal(m.officialTicketClicks.total, 1);
      assert.equal(m.fanDemandSignals.total, 1);
      assert.equal(m.socialCardVisits.story, 1);
      assert.equal(m.claimRequests.total, 1);
    });
  });

  describe('9. Central Router & Security Guardrails', () => {
    it('router correctly dispatches /admin/pilot-racing', async () => {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/admin/pilot-racing'
      });

      await router(req, res);
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes('Motorsports &amp; Short Track Pilot Operations'));
    });

    it('router dispatches /track/colorado-national-speedway to racing entity handler', async () => {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/track/colorado-national-speedway'
      });

      await router(req, res);
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes('Colorado National Speedway'));
    });

    it('router dispatches /event/race_seed_cns_01 and renders living race details', async () => {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/event/race_seed_cns_01'
      });

      await router(req, res);
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes('Colorado National Speedway'));
      assert.ok(res.body.includes('Saturday Night Thunder') || res.body.includes('Super Late Models'));
    });

    it('router dispatches /denver/racing to landing handler with verified races', async () => {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/denver/racing'
      });

      await router(req, res);
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes('Live Grassroots Motorsports') || res.body.includes('Short Track Racing'));
      assert.ok(res.body.includes('verified listings in Denver area') || res.body.includes('No live grassroots motorsports'));
    });

    it('guardrail: direct ticket checkout remains strictly locked down with 403 prototype_disabled', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/comedy/checkout',
        body: {
          showId: 'race_seed_cns_01',
          quantity: 2
        }
      });

      await comedyCheckoutHandler(req, res);
      assert.equal(res.statusCode, 403);
      assert.equal(res.jsonData.status, 'prototype_disabled');
      assert.ok(res.jsonData.error.includes('Direct ticketing checkout is an internal prototype'));
    });
  });

  describe('10. Uncluttered Homepage Vertical Entry Paths', () => {
    it('homepage includes clear entry paths for Everything, Comedy, and Motorsports', async () => {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/'
      });

      await router(req, res);
      assert.ok(!res.body.includes('id="entryPathRacing"'), 'Large feature card entryPathRacing must be removed');
      assert.ok(res.body.includes('id="categoryRow"'), 'Compact category filter bubbles must be present');
      assert.ok(res.body.includes('Motorsports'));
      assert.ok(res.body.includes('id="racingSubFilterConsole"'));
    });
  });

});
