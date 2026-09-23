import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {
  createCommunityPost,
  getActiveCommunityPosts,
  getCommunityPostById,
  deleteCommunityPost,
  verifyPostLevel,
  evaluateBroadcastLadder,
  getAdminReviewQueue,
  adminApprovePostLevel,
  adminDenyPostLevel,
  _resetForTesting
} from '../lib/community-posts/community-posts.js';
import {
  CommunityPostDurableStore
} from '../lib/community-posts/community-posts-store.js';

describe('Brinkberry Community Post Production-Hardening Pass', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  describe('1. Honest Email Confirmation & Admin Approval Requirement', () => {
    beforeEach(() => {
      _resetForTesting();
    });

    it('does not unlock Hood reach (~6 mi) merely because an email was typed', () => {
      const now = Date.now();
      const res = createCommunityPost({
        title: 'Block Gathering - Plant Swap ' + now,
        category: 'community',
        startTime: new Date(now + 3 * 3600 * 1000).toISOString(),
        city: 'Denver',
        email: 'organizer@plantswap.org',
        desiredBroadcastLevel: 'hood', // Desires Level 2
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.50.1.1' });

      assert.equal(res.success, true);
      // Must remain at Level 1 (Block 2 mi) - email is provided, NOT confirmed
      assert.equal(res.event.currentLevel, 1);
      assert.equal(res.event.approvedRadiusMiles, 2);
      assert.equal(res.event.desiredLevel, 'hood');

      // Check ladder status: Level 2 must be pending confirmation code
      const post = getCommunityPostById(res.event.id);
      assert.equal(post.emailStatus, 'email_provided');
      assert.equal(post.emailConfirmed, false);
      assert.ok(post.emailVerificationCode);
      assert.equal(post.emailVerificationCode.length, 6);

      const level2Status = post.ladderStatus.find(l => l.level === 2);
      assert.equal(level2Status.status, 'pending');
      assert.match(level2Status.statusReason, /confirmation code/i);
    });

    it('proves confirmed email alone does NOT unlock Hood reach (~6 mi) without explicit admin approval', () => {
      const now = Date.now();
      const res = createCommunityPost({
        title: 'Block Gathering - Plant Swap ' + now,
        category: 'community',
        startTime: new Date(now + 3 * 3600 * 1000).toISOString(),
        city: 'Denver',
        email: 'organizer@plantswap.org',
        desiredBroadcastLevel: 'hood',
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.50.1.2' });

      const postId = res.event.id;
      const key = res.deletionKey;
      const code = res.emailVerificationCode;
      assert.ok(code);

      // Submit incorrect code -> does not advance status
      const badAttempt = verifyPostLevel(postId, key, { emailCode: '000000' });
      assert.equal(badAttempt.currentLevel, 1);

      // Submit valid confirmation code -> records email confirmation as evidence, enters review queue
      const goodAttempt = verifyPostLevel(postId, key, { emailCode: code });
      assert.equal(goodAttempt.success, true);

      // MUST NOT automatically turn green / approved: remains at Level 1 (Block ~2 mi)
      assert.equal(goodAttempt.currentLevel, 1, 'Current level must remain 1 while awaiting admin approval');
      assert.equal(goodAttempt.approvedRadiusMiles, 2, 'Approved radius must remain 2 miles while awaiting admin approval');

      const updatedPost = getCommunityPostById(postId);
      assert.equal(updatedPost.emailConfirmed, true);
      assert.equal(updatedPost.emailStatus, 'confirmed');

      const l2 = updatedPost.ladderStatus.find(l => l.level === 2);
      assert.equal(l2.status, 'in_review');
      assert.match(l2.statusReason, /admin review queue/i);

      // Verify it appears in the admin review queue with evidence
      const queue = getAdminReviewQueue();
      const queueItem = queue.find(q => q.id === postId);
      assert.ok(queueItem, 'Post must be in admin review queue');
      assert.equal(queueItem.evidence.emailConfirmed, true);
      assert.equal(queueItem.targetLevel, 2);

      // Explicit Admin Approval is required to unlock Level 2
      const approval = adminApprovePostLevel(postId, 2, 'Verified local organizer');
      assert.equal(approval.success, true);
      assert.equal(approval.currentLevel, 2);
      assert.equal(approval.approvedRadiusMiles, 6);

      const postAfterApproval = getCommunityPostById(postId);
      assert.equal(postAfterApproval.currentLadderLevel, 2);
      assert.equal(postAfterApproval.approvedRadiusMiles, 6);
    });
  });

  describe('2. Phone Verification Evidence & Admin Approval Requirement', () => {
    beforeEach(() => {
      _resetForTesting();
    });

    it('does not unlock Quadrant reach (~15 mi) merely because a 10-digit phone was typed', () => {
      const now = Date.now();
      const res = createCommunityPost({
        title: 'Quadrant Level Garage Sale ' + now,
        category: 'community',
        startTime: new Date(now + 3 * 3600 * 1000).toISOString(),
        city: 'Denver',
        email: 'seller@example.com',
        phone: '303-555-0199',
        desiredBroadcastLevel: 'quadrant', // Desires Level 3
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.50.2.1' });

      const postId = res.event.id;
      const key = res.deletionKey;

      // Confirm email first
      verifyPostLevel(postId, key, { emailCode: res.emailVerificationCode });

      // After email is confirmed, level remains 1 (Block) awaiting admin approval
      const postAfterEmail = getCommunityPostById(postId);
      assert.equal(postAfterEmail.currentLadderLevel, 1);
      assert.equal(postAfterEmail.approvedRadiusMiles, 2);
      assert.equal(postAfterEmail.phoneStatus, 'phone_provided');
      assert.equal(postAfterEmail.phoneConfirmed, false);
    });

    it('proves confirmed email and verified phone alone do NOT unlock broader reach without explicit admin approval', () => {
      const now = Date.now();
      const res = createCommunityPost({
        title: 'Quadrant Level Garage Sale ' + now,
        category: 'community',
        startTime: new Date(now + 3 * 3600 * 1000).toISOString(),
        city: 'Denver',
        email: 'seller@example.com',
        phone: '303-555-0199',
        desiredBroadcastLevel: 'quadrant',
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.50.2.2' });

      const postId = res.event.id;
      const key = res.deletionKey;

      // Confirm email
      verifyPostLevel(postId, key, { emailCode: res.emailVerificationCode });

      // Verify phone with SMS code
      const vPhone = verifyPostLevel(postId, key, { phoneCode: res.phoneVerificationCode });
      assert.equal(vPhone.success, true);

      // CRITICAL: Must NOT automatically advance broadcast radius
      assert.equal(vPhone.currentLevel, 1, 'Current level must remain 1 despite verified phone');
      assert.equal(vPhone.approvedRadiusMiles, 2, 'Approved radius must remain 2 miles');

      const updated = getCommunityPostById(postId);
      assert.equal(updated.emailConfirmed, true);
      assert.equal(updated.phoneConfirmed, true);
      assert.equal(updated.phoneStatus, 'verified');

      // Review queue inspection shows both evidence items
      const queue = getAdminReviewQueue();
      const queueItem = queue.find(q => q.id === postId);
      assert.ok(queueItem, 'Post must appear in review queue');
      assert.equal(queueItem.evidence.emailConfirmed, true);
      assert.equal(queueItem.evidence.phoneConfirmed, true);

      // Explicit Admin Approval unlocks Level 3 (Quadrant ~15 mi)
      const approval = adminApprovePostLevel(postId, 3, 'Approved after phone check');
      assert.equal(approval.success, true);
      assert.equal(approval.currentLevel, 3);
      assert.equal(approval.approvedRadiusMiles, 15);
    });

    it('denying a larger radius never deletes or hides the event and keeps it live at approved radius', () => {
      const now = Date.now();
      const res = createCommunityPost({
        title: 'Neighborhood Board Game Night ' + now,
        category: 'community',
        startTime: new Date(now + 4 * 3600 * 1000).toISOString(),
        city: 'Denver',
        email: 'boardgames@example.com',
        desiredBroadcastLevel: 'hood',
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.50.2.3' });

      const postId = res.event.id;
      const key = res.deletionKey;

      verifyPostLevel(postId, key, { emailCode: res.emailVerificationCode });

      // Admin explicitly denies Hood expansion
      const denial = adminDenyPostLevel(postId, 2, 'Appropriate for neighborhood block only');
      assert.equal(denial.success, true);
      assert.equal(denial.currentLevel, 1);
      assert.equal(denial.approvedRadiusMiles, 2);
      assert.equal(denial.isDeleted, false, 'Event must NEVER be deleted when radius is denied');
      assert.equal(denial.isDisplayable, true, 'Event must NEVER be hidden when radius is denied');

      const post = getCommunityPostById(postId);
      assert.equal(post.isDeleted, false);
      assert.equal(post.isDisplayable, true);
      assert.equal(post.currentLadderLevel, 1);
      assert.equal(post.approvedRadiusMiles, 2);

      // Verify event is still actively returned in discovery feed
      const activePosts = getActiveCommunityPosts({ city: 'Denver', lat: 39.7392, lon: -104.9903, radiusMiles: 5 });
      const foundInFeed = activePosts.find(p => p.id === postId);
      assert.ok(foundInFeed, 'Denied expansion event must remain live and discoverable in feed');
    });
  });

  describe('3. Durable Production Storage Simulation Across Concurrent Instances', () => {
    it('simulates post creation on Instance A and visibility on Instance B', async () => {
      const sharedFile = path.join(os.tmpdir(), `test_brinkberry_shared_${Date.now()}.json`);
      const sharedDeleted = path.join(os.tmpdir(), `test_brinkberry_deleted_${Date.now()}.json`);

      const storeInstanceA = new CommunityPostDurableStore({
        filePath: sharedFile,
        deletedFilePath: sharedDeleted
      });

      const storeInstanceB = new CommunityPostDurableStore({
        filePath: sharedFile,
        deletedFilePath: sharedDeleted
      });

      const now = Date.now();
      const post = {
        id: 'comm_post_test_inst_1',
        title: 'Instance Sync Test Event',
        start_time: new Date(now + 4 * 3600 * 1000).toISOString(),
        venue: 'Capitol Hill Park',
        city: 'Denver',
        lat: 39.7392,
        lon: -104.9903,
        category: 'community',
        currentLadderLevel: 1,
        approvedRadiusMiles: 2,
        isDisplayable: true,
        isDeleted: false,
        deletionKey: 'test_del_key_123'
      };

      // Instance A saves post
      await storeInstanceA.persistPost(post);
      assert.ok(storeInstanceA.getPostById('comm_post_test_inst_1'));

      // Instance B reads from shared store
      const postOnB = storeInstanceB.getPostById('comm_post_test_inst_1');
      assert.ok(postOnB);
      assert.equal(postOnB.title, 'Instance Sync Test Event');

      // Instance A deletes post
      await storeInstanceA.deletePost('comm_post_test_inst_1', 'user_deleted');
      assert.equal(storeInstanceA.getPostById('comm_post_test_inst_1'), null);

      // Instance B sees post deleted and tombstoned
      assert.equal(storeInstanceB.getPostById('comm_post_test_inst_1'), null);
      assert.ok(storeInstanceB.deletedPostIds.has('comm_post_test_inst_1'));
    });
  });

  describe('4. Deletion Key Security & Secret Protection', () => {
    it('never exposes deletion key on public event payloads or feeds', () => {
      const now = Date.now();
      const res = createCommunityPost({
        title: 'Secret Key Isolation Test ' + now,
        category: 'community',
        startTime: new Date(now + 4 * 3600 * 1000).toISOString(),
        city: 'Denver',
        accountabilityAcknowledged: true,
        termsAccepted: true
      }, { ip: '10.50.4.1' });

      // The deletion key is returned to creator in res.deletionKey
      assert.ok(res.deletionKey);

      // But public event object MUST NEVER contain deletionKey
      assert.equal(res.event.deletionKey, undefined);

      // Feed items MUST NEVER expose deletionKey
      const active = getActiveCommunityPosts({ lat: 39.7392, lon: -104.9903 });
      const found = active.find(e => e.id === res.event.id);
      assert.ok(found);
      assert.equal(found.deletionKey, undefined);
    });
  });
});
