import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  createCommunityPost,
  getCommunityPostById,
  deleteCommunityPost,
  verifyPostLevel,
  getAdminReviewQueue,
  adminApprovePostLevel,
  adminDenyPostLevel,
  reportCommunityPost,
  getActiveCommunityPosts,
  BROADCAST_LEVELS,
  evaluateBroadcastLadder,
  _resetForTesting
} from '../lib/community-posts/community-posts.js';

import { executeHybridFeed } from '../lib/providers/engine.js';
import { resolveSourceQualityLabel } from '../lib/providers/normalizer.js';
import { BASELINE_25_LIVE_SLUGS } from '../lib/crawling/venue-classification.js';
import racingPkg from '../lib/racing/registry.js';
const { getAllScheduledRaces, getAllTracks } = racingPkg;

describe('Brinkberry Community Event Layer: Broadcast Ladder & User Controls', () => {

  beforeEach(() => {
    _resetForTesting();
  });

  describe('1. Public Posting & Location Privacy Modes', () => {
    it('allows anyone to post an event without creating an account or login', () => {
      const now = Date.now();
      const res = createCommunityPost({
        title: 'Neighborhood Potluck & Board Games ' + now,
        category: 'party',
        startTime: new Date(now + 3 * 3600 * 1000).toISOString(),
        city: 'Denver',
        venue: 'Cheesman Park Pavilion',
        location: '1200 Franklin St, Denver, CO',
        locationMode: 'exact',
        desiredBroadcastLevel: 'block',
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.20.1.1' });

      assert.equal(res.success, true);
      assert.ok(res.event.id.startsWith('comm_post_'));
      assert.equal(res.event.currentLevel, 1);
      assert.equal(res.event.approvedRadiusMiles, 2);
      assert.ok(res.deletionKey);
      assert.ok(res.manageUrl.includes(res.deletionKey));
    });

    it('supports private residence approximate location and neighborhood-only masking', () => {
      const now = Date.now();
      // Approximate mode (strips street number)
      const resApprox = createCommunityPost({
        title: 'House Party & Backyard Acoustic Jam ' + now,
        category: 'party',
        startTime: new Date(now + 4 * 3600 * 1000).toISOString(),
        city: 'Denver',
        location: '1428 Lafayette St, Denver, CO',
        locationMode: 'approximate',
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.20.1.2' });

      assert.equal(resApprox.success, true);
      const postApprox = getCommunityPostById(resApprox.event.id);
      assert.equal(postApprox.isApproximateLocation, true);
      assert.equal(postApprox.address, null); // exact street number hidden

      // Neighborhood-only mode
      const resNeigh = createCommunityPost({
        title: 'Secret Courtyard Book Exchange ' + now,
        category: 'community',
        startTime: new Date(now + 5 * 3600 * 1000).toISOString(),
        city: 'Denver',
        location: 'Capitol Hill, Denver',
        locationMode: 'neighborhood',
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.20.1.3' });

      assert.equal(resNeigh.success, true);
      const postNeigh = getCommunityPostById(resNeigh.event.id);
      assert.equal(postNeigh.locationMode, 'neighborhood');
      assert.equal(postNeigh.isNeighborhoodOnly, true);
    });

    it('decouples broadcast center from poster GPS (can post about house while away)', () => {
      const now = Date.now();
      // Poster is physically at Eau Claire, WI coordinates (44.8113, -91.4985)
      // but post is about Denver (39.7392, -104.9903)
      const res = createCommunityPost({
        title: 'Party at My House Tonight ' + now,
        category: 'party',
        startTime: new Date(now + 2 * 3600 * 1000).toISOString(),
        city: 'Denver',
        location: 'Baker Neighborhood, Denver, CO',
        lat: 39.7180,
        lon: -104.9950,
        locationMode: 'approximate',
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.20.1.4' });

      assert.equal(res.success, true);
      const post = getCommunityPostById(res.event.id);
      // Coordinates must reflect the Denver event location, NOT poster's device GPS
      assert.ok(Math.abs(post.lat - 39.7180) < 0.05);
      assert.ok(Math.abs(post.lon - (-104.9950)) < 0.05);
    });
  });

  describe('2. Accountability Acknowledgment & Private Audit Record', () => {
    it('rejects post if accountability acknowledgment is explicitly false', () => {
      const now = Date.now();
      const res = createCommunityPost({
        title: 'Unauthorized House Rave ' + now,
        category: 'party',
        startTime: new Date(now + 3 * 3600 * 1000).toISOString(),
        city: 'Denver',
        accountabilityAcknowledged: false
      }, { ip: '10.20.2.1' });

      assert.equal(res.success, false);
      assert.match(res.error, /acknowledge responsibility/i);
    });

    it('rejects post if terms agreement is explicitly false', () => {
      const now = Date.now();
      const res = createCommunityPost({
        title: 'Unauthorized Gathering ' + now,
        category: 'party',
        startTime: new Date(now + 3 * 3600 * 1000).toISOString(),
        city: 'Denver',
        accountabilityAcknowledged: true,
        termsAccepted: false
      }, { ip: '10.20.2.2' });

      assert.equal(res.success, false);
      assert.match(res.error, /Community Terms and Guidelines/i);
    });

    it('records a private traceable audit record without demanding a public name or signature', () => {
      const now = Date.now();
      const res = createCommunityPost({
        title: 'Open Source Saturday Meetup ' + now,
        category: 'community',
        startTime: new Date(now + 6 * 3600 * 1000).toISOString(),
        city: 'Denver',
        contact: 'organizer@denvercode.org',
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.20.2.3', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });

      assert.equal(res.success, true);
      const post = getCommunityPostById(res.event.id);
      assert.ok(post.auditRecord);
      assert.equal(post.auditRecord.accountabilityAcknowledged, true);
      assert.equal(post.auditRecord.termsAccepted, true);
      assert.ok(post.auditRecord.devicePostKey);
      assert.ok(post.auditRecord.ipHash);
      assert.ok(post.auditRecord.deletionKeyHash);
      assert.ok(post.auditRecord.timestamp);
      // No public signature or legal name field forced
      assert.equal(post.submitterName, undefined);
    });
  });

  describe('3. Sequential Broadcast Ladder Progression & Non-Blocking Degradation', () => {
    it('defines 7 sequential ladder levels from Block to Country', () => {
      assert.equal(BROADCAST_LEVELS.length, 7);
      assert.equal(BROADCAST_LEVELS[0].id, 'block');
      assert.equal(BROADCAST_LEVELS[0].radiusMiles, 2);
      assert.equal(BROADCAST_LEVELS[1].id, 'hood');
      assert.equal(BROADCAST_LEVELS[1].radiusMiles, 6);
      assert.equal(BROADCAST_LEVELS[2].id, 'quadrant');
      assert.equal(BROADCAST_LEVELS[2].radiusMiles, 15);
      assert.equal(BROADCAST_LEVELS[3].id, 'city');
      assert.equal(BROADCAST_LEVELS[3].radiusMiles, 30);
      assert.equal(BROADCAST_LEVELS[4].id, 'county');
      assert.equal(BROADCAST_LEVELS[4].radiusMiles, 60);
      assert.equal(BROADCAST_LEVELS[5].id, 'state');
      assert.equal(BROADCAST_LEVELS[5].radiusMiles, 150);
      assert.equal(BROADCAST_LEVELS[6].id, 'country');
    });

    it('approves Level 1 (Block) immediately upon publication', () => {
      const now = Date.now();
      const res = createCommunityPost({
        title: 'Yard Sale - Records and Vintage Books ' + now,
        category: 'food',
        startTime: new Date(now + 4 * 3600 * 1000).toISOString(),
        city: 'Denver',
        desiredBroadcastLevel: 'block',
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.20.3.1' });

      assert.equal(res.success, true);
      assert.equal(res.event.currentLevel, 1);
      assert.equal(res.event.approvedRadiusMiles, 2);
      assert.equal(res.event.ladderStatus[0].status, 'approved');
    });

    it('maintains non-blocking degradation if unverified higher level is requested', () => {
      const now = Date.now();
      // Poster requests Level 4 (City ~30 mi) without providing verified credentials
      const res = createCommunityPost({
        title: 'Pop-Up Vegan Bakery at Common Grounds ' + now,
        category: 'food',
        startTime: new Date(now + 5 * 3600 * 1000).toISOString(),
        city: 'Denver',
        desiredBroadcastLevel: 'city', // Requests Level 4
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.20.3.2' });

      assert.equal(res.success, true);
      // Non-blocking: post is NOT rejected or withheld! It is live at Level 1 (Block)
      assert.equal(res.event.currentLevel, 1);
      assert.equal(res.event.approvedRadiusMiles, 2);
      assert.equal(res.event.desiredLevel, 'city');

      // Check ladder breakdown: Level 1 is approved, Level 2 is pending
      const ladder = res.event.ladderStatus;
      assert.equal(ladder[0].status, 'approved');
      assert.equal(ladder[1].status, 'pending');
      assert.equal(ladder[3].status, 'pending_prerequisite');
    });

    it('allows sequential step-up verification via verifyPostLevel with explicit admin approval', async () => {
      const now = Date.now();
      const res = await createCommunityPost({
        title: 'Grassroots Acoustic Folk Circle ' + now,
        category: 'music',
        startTime: new Date(now + 6 * 3600 * 1000).toISOString(),
        city: 'Denver',
        desiredBroadcastLevel: 'city', // Level 4
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.20.3.3' });

      const postId = res.event.id;
      const key = res.deletionKey;

      // Initial state: Level 1 Block (2 mi) is approved immediately
      assert.equal(res.event.currentLevel, 1);
      assert.equal(res.event.approvedRadiusMiles, 2);

      // 1. Confirm email -> records evidence, enters admin review queue (does NOT auto-unlock Level 2)
      const vEmail = await verifyPostLevel(postId, key, { email: 'folk@example.com', emailConfirmed: true });
      assert.equal(vEmail.success, true);
      assert.equal(vEmail.currentLevel, 1, 'Email alone must NOT auto-unlock Level 2');
      assert.equal(vEmail.approvedRadiusMiles, 2);

      // 2. Add verified phone -> records evidence in review queue
      const vPhone = await verifyPostLevel(postId, key, { phone: '303-555-0144', phoneVerified: true });
      assert.equal(vPhone.success, true);
      assert.equal(vPhone.currentLevel, 1, 'Phone alone must NOT auto-unlock Level 3');
      assert.equal(vPhone.approvedRadiusMiles, 2);

      // 3. Add public details URL -> records evidence in review queue
      const vUrl = await verifyPostLevel(postId, key, { detailsUrl: 'https://folkmusicdenver.org/meetup' });
      assert.equal(vUrl.success, true);
      assert.equal(vUrl.currentLevel, 1, 'URL alone must NOT auto-unlock Level 4');
      assert.equal(vUrl.approvedRadiusMiles, 2);

      // 4. Verify review queue contains all collected evidence
      const queue = getAdminReviewQueue();
      const item = queue.find(q => q.id === postId);
      assert.ok(item, 'Event must appear in admin review queue');
      assert.equal(item.evidence.emailConfirmed, true);
      assert.equal(item.evidence.phoneConfirmed, true);
      assert.equal(item.evidence.detailsUrl, 'https://folkmusicdenver.org/meetup');
      assert.equal(item.targetLevel, 4);

      // 5. Admin explicitly approves Level 2 -> unlocks Hood (~6 mi)
      const app2 = await adminApprovePostLevel(postId, 2, 'Email verified');
      assert.equal(app2.success, true);
      assert.equal(app2.currentLevel, 2);
      assert.equal(app2.approvedRadiusMiles, 6);

      // 6. Admin explicitly approves Level 3 -> unlocks Quadrant (~15 mi)
      const app3 = await adminApprovePostLevel(postId, 3, 'Phone verified');
      assert.equal(app3.success, true);
      assert.equal(app3.currentLevel, 3);
      assert.equal(app3.approvedRadiusMiles, 15);

      // 7. Admin explicitly approves Level 4 -> unlocks City (~30 mi)
      const app4 = await adminApprovePostLevel(postId, 4, 'Public link verified');
      assert.equal(app4.success, true);
      assert.equal(app4.currentLevel, 4);
      assert.equal(app4.approvedRadiusMiles, 30);
    });
  });

  describe('4. Self-Service Deletion & Post Management', () => {
    it('deletes post immediately using valid deletion key and removes from feeds', () => {
      const now = Date.now();
      const res = createCommunityPost({
        title: 'Temporary Flash Sale ' + now,
        category: 'community',
        startTime: new Date(now + 2 * 3600 * 1000).toISOString(),
        city: 'Denver',
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.20.4.1' });

      const id = res.event.id;
      const key = res.deletionKey;

      // Before deletion, post is visible
      assert.ok(getCommunityPostById(id));

      // User performs self-service deletion
      const delRes = deleteCommunityPost(id, key, 'event_concluded');
      assert.equal(delRes.success, true);

      // Immediately after deletion, post returns null (404)
      assert.equal(getCommunityPostById(id), null);

      // Does not appear in active query
      const active = getActiveCommunityPosts({ lat: 39.7392, lon: -104.9903, radiusMiles: 25 });
      assert.equal(active.some(e => e.id === id), false);
    });

    it('rejects deletion with invalid key', () => {
      const now = Date.now();
      const res = createCommunityPost({
        title: 'Protected Gathering ' + now,
        category: 'community',
        startTime: new Date(now + 2 * 3600 * 1000).toISOString(),
        city: 'Denver',
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.20.4.2' });

      const delRes = deleteCommunityPost(res.event.id, 'wrong_key_12345');
      assert.equal(delRes.success, false);
      assert.equal(delRes.status, 403);
    });
  });

  describe('5. Source Labeling & Tooltip Requirements', () => {
    it('labels every user post with exact Community-submitted* and neutral tooltip', () => {
      const normalizerLabel = resolveSourceQualityLabel({
        source: 'community_post',
        isCommunityPost: true
      });
      assert.equal(normalizerLabel, 'Community-submitted*');

      const now = Date.now();
      const res = createCommunityPost({
        title: 'Open Poetry Jam ' + now,
        category: 'community',
        startTime: new Date(now + 3 * 3600 * 1000).toISOString(),
        city: 'Denver',
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.20.5.1' });

      assert.equal(res.event.sourceQualityLabel, 'Community-submitted*');
      assert.equal(
        res.event.sourceQualityTooltip,
        '*This event was submitted by a Brinkberry user and has not been independently verified. Details may change.'
      );
    });
  });

  describe('6. Feed Source Filters (All, Official Only, Community Only)', () => {
    it('filters feed by sourceFilter parameter', async () => {
      const now = Date.now();
      // Create a test community post
      const commRes = createCommunityPost({
        title: 'Feed Filter Test Gathering ' + now,
        category: 'community',
        startTime: new Date(now + 3 * 3600 * 1000).toISOString(),
        city: 'Denver',
        lat: 39.7392,
        lon: -104.9903,
        desiredBroadcastLevel: 'city',
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.20.6.1' });

      // 1. sourceFilter: 'all' -> includes both
      const feedAll = await executeHybridFeed({
        lat: 39.7392,
        lon: -104.9903,
        city: 'Denver',
        radiusMiles: 25,
        window: '48h',
        sourceFilter: 'all'
      });
      assert.ok(feedAll.events.some(e => e.id === commRes.event.id));

      // 2. sourceFilter: 'official' -> excludes community posts
      const feedOfficial = await executeHybridFeed({
        lat: 39.7392,
        lon: -104.9903,
        city: 'Denver',
        radiusMiles: 25,
        window: '48h',
        sourceFilter: 'official'
      });
      assert.equal(feedOfficial.events.some(e => e.id === commRes.event.id), false);

      // 3. sourceFilter: 'community' -> only community posts
      const feedCommunity = await executeHybridFeed({
        lat: 39.7392,
        lon: -104.9903,
        city: 'Denver',
        radiusMiles: 25,
        window: '48h',
        sourceFilter: 'community'
      });
      assert.ok(feedCommunity.events.some(e => e.id === commRes.event.id));
      assert.ok(feedCommunity.events.every(e => e.isCommunityPost || e.source === 'community_post'));

      // Clean up test post
      deleteCommunityPost(commRes.event.id, commRes.deletionKey);
    });
  });

  describe('7. Granular Flag Taxonomy & Safety Without Viewpoint Censorship', () => {
    it('immediately hides post with critical safety violation (violence, doxxing, harassment, scam)', () => {
      const now = Date.now();
      const res = createCommunityPost({
        title: 'Suspicious Aggressive Meetup ' + now,
        category: 'community',
        startTime: new Date(now + 2 * 3600 * 1000).toISOString(),
        city: 'Denver',
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.20.7.1' });

      const id = res.event.id;
      assert.ok(getCommunityPostById(id));

      // Reporting for severe violence / threat
      const rep = reportCommunityPost(id, 'violence', '', '1.1.1.1');
      assert.equal(rep.success, true);
      assert.equal(rep.isHidden, true);

      // Post is hidden immediately
      assert.equal(getCommunityPostById(id), null);
    });

    it('does not remove post for simple difference of opinion or political disagreement', () => {
      const now = Date.now();
      const res = createCommunityPost({
        title: 'Peaceful Climate Policy Discussion ' + now,
        category: 'civic',
        startTime: new Date(now + 4 * 3600 * 1000).toISOString(),
        city: 'Denver',
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.20.7.2' });

      const id = res.event.id;
      // Single benign report does not hide the post
      const rep = reportCommunityPost(id, 'dislike_politics', '', '2.2.2.2');
      assert.equal(rep.success, true);
      assert.equal(rep.isHidden, false);

      // Post remains live and displayable
      assert.ok(getCommunityPostById(id));
      deleteCommunityPost(id, res.deletionKey);
    });
  });

  describe('8. Preservation of Baseline 25 Comedy Clubs & Motorsports', () => {
    it('strictly maintains 25 baseline comedy clubs and motorsports schedules with zero regressions', () => {
      assert.ok(BASELINE_25_LIVE_SLUGS.size >= 25, `Expected at least 25 comedy clubs, got ${BASELINE_25_LIVE_SLUGS.size}`);

      const tracks = getAllTracks();
      assert.ok(tracks.length >= 9, `Expected at least 9 benchmark tracks, got ${tracks.length}`);

      const races = getAllScheduledRaces();
      assert.ok(races.length > 0, 'Expected populated scheduled races');
    });
  });
});
