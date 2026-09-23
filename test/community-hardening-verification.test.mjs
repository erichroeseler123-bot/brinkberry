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
  _resetForTesting
} from '../lib/community-posts/community-posts.js';
import {
  CommunityPostDurableStore
} from '../lib/community-posts/community-posts-store.js';

describe('Brinkberry Community Post Production-Hardening Pass', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  describe('1. Honest Email Confirmation (email_provided)', () => {
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

    it('unlocks Hood reach (~6 mi) only when real confirmation code is provided', () => {
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

      // Submit incorrect code -> does not unlock
      const badAttempt = verifyPostLevel(postId, key, { emailCode: '000000' });
      assert.equal(badAttempt.currentLevel, 1);

      // Submit valid confirmation code -> unlocks Level 2 (Hood ~6 mi)
      const goodAttempt = verifyPostLevel(postId, key, { emailCode: code });
      assert.equal(goodAttempt.success, true);
      assert.equal(goodAttempt.currentLevel, 2);
      assert.equal(goodAttempt.approvedRadiusMiles, 6);

      const updatedPost = getCommunityPostById(postId);
      assert.equal(updatedPost.emailConfirmed, true);
      assert.equal(updatedPost.emailStatus, 'confirmed');
    });
  });

  describe('2. Honest Phone Verification (phone_provided)', () => {
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

      // 1. Confirm email first
      verifyPostLevel(postId, key, { emailCode: res.emailVerificationCode });

      // After email is confirmed, level is 2 (Hood), NOT 3
      const postAfterEmail = getCommunityPostById(postId);
      assert.equal(postAfterEmail.currentLadderLevel, 2);
      assert.equal(postAfterEmail.approvedRadiusMiles, 6);
      assert.equal(postAfterEmail.phoneStatus, 'phone_provided');
      assert.equal(postAfterEmail.phoneConfirmed, false);

      const level3Status = postAfterEmail.ladderStatus.find(l => l.level === 3);
      assert.equal(level3Status.status, 'pending');
      assert.match(level3Status.statusReason, /SMS verification code/i);
    });

    it('unlocks Quadrant reach (~15 mi) when SMS verification code is verified', () => {
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
      assert.equal(vPhone.currentLevel, 3);
      assert.equal(vPhone.approvedRadiusMiles, 15);

      const updated = getCommunityPostById(postId);
      assert.equal(updated.phoneConfirmed, true);
      assert.equal(updated.phoneStatus, 'verified');
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
