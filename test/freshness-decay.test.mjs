import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  TTL_CONFIG,
  resolveTtlProfile,
  evaluateEventFreshness
} from '../lib/freshness.js';

describe('Time-Based Freshness Decay & Evidence Verification Suite', () => {

  describe('1. Category-Specific TTL Profile Resolution', () => {
    test('resolves comedy open mics to weekly cycle (7d/14d)', () => {
      const event = {
        title: 'Sunday Open Mic',
        category: 'comedy',
        comedy: { showType: 'open_mic' }
      };
      const profile = resolveTtlProfile(event);
      assert.equal(profile.freshDays, 7);
      assert.equal(profile.agingDays, 14);
    });

    test('resolves comedy headliners to weekly cycle (7d/14d)', () => {
      const event = {
        title: 'Nate Bargatze Live',
        category: 'comedy',
        comedy: { showType: 'headliner' }
      };
      const profile = resolveTtlProfile(event);
      assert.equal(profile.freshDays, 7);
      assert.equal(profile.agingDays, 14);
    });

    test('resolves single-event races to high-urgency 3-day cycle (3d/7d)', () => {
      const event = {
        title: 'World 100 Dirt Late Model Championship',
        category: 'racing',
        racing: { sanction: 'World of Outlaws' }
      };
      const profile = resolveTtlProfile(event);
      assert.equal(profile.freshDays, 3);
      assert.equal(profile.agingDays, 7);
    });

    test('resolves bi-weekly recurring grassroots short track races to 14d/30d', () => {
      const event = {
        title: 'Weekly Points Racing',
        category: 'racing',
        recurring: true,
        racing: { trackType: 'dirt_oval' }
      };
      const profile = resolveTtlProfile(event);
      assert.equal(profile.freshDays, 14);
      assert.equal(profile.agingDays, 30);
    });
  });

  describe('2. Dynamic Freshness Decay Transitions', () => {
    test('classifies recent verification as verified_current', () => {
      const now = new Date('2026-09-20T12:00:00.000Z').getTime();
      const event = {
        id: 'ev_01',
        title: 'Comedy Night',
        category: 'comedy',
        lastVerifiedAt: new Date(now - 2 * 86400 * 1000).toISOString() // 2 days ago
      };

      const result = evaluateEventFreshness(event, { nowMs: now });
      assert.equal(result.status, 'verified_current');
      assert.equal(result.isDisplayable, true);
      assert.equal(result.ageDays, 2);
    });

    test('transitions to aging when past fresh TTL but within aging limit', () => {
      const now = new Date('2026-09-20T12:00:00.000Z').getTime();
      const event = {
        id: 'ev_02',
        title: 'Comedy Headliner Showcase',
        category: 'comedy',
        lastVerifiedAt: new Date(now - 10 * 86400 * 1000).toISOString() // 10 days ago (fresh is 7, aging is 14)
      };

      const result = evaluateEventFreshness(event, { nowMs: now });
      assert.equal(result.status, 'aging');
      assert.equal(result.isDisplayable, true);
      assert.equal(result.ageDays, 10);
    });

    test('transitions to stale and non-displayable when exceeding aging limit', () => {
      const now = new Date('2026-09-20T12:00:00.000Z').getTime();
      const event = {
        id: 'ev_03',
        title: 'Sprint Car Nationals',
        category: 'racing',
        lastVerifiedAt: new Date(now - 9 * 86400 * 1000).toISOString() // 9 days ago (race limit is 7)
      };

      const result = evaluateEventFreshness(event, { nowMs: now });
      assert.equal(result.status, 'stale');
      assert.equal(result.isDisplayable, false);
      assert.equal(result.ageDays, 9);
    });

    test('flags broken source URL as unlinked', () => {
      const now = Date.now();
      const event = {
        id: 'ev_04',
        title: 'Some Event',
        lastVerifiedAt: new Date(now - 86400 * 1000).toISOString()
      };

      const result = evaluateEventFreshness(event, {
        nowMs: now,
        linkStatus: { valid: false, reason: 'http_404' }
      });
      assert.equal(result.status, 'unlinked');
      assert.equal(result.isDisplayable, false);
    });

    test('flags cancelled events as cancelled', () => {
      const event = {
        id: 'ev_05',
        title: 'Rainout Race',
        isCancelled: true,
        lastVerifiedAt: new Date().toISOString()
      };

      const result = evaluateEventFreshness(event);
      assert.equal(result.status, 'cancelled');
      assert.equal(result.isDisplayable, false);
    });

    test('marks unverified seed events without timestamp as unknown', () => {
      const event = {
        id: 'ev_06',
        title: 'Unverified Roster Listing'
      };

      const result = evaluateEventFreshness(event);
      assert.equal(result.status, 'unknown');
      assert.equal(result.isDisplayable, false);
    });
  });

  describe('3. Venue Homepage HTTP 200 Rejection', () => {
    test('proves that a live homepage HTTP 200 does not renew an event date without calendar proof', () => {
      const now = new Date('2026-09-20T12:00:00.000Z').getTime();
      const event = {
        id: 'ev_07',
        title: 'Aged Comedy Show',
        category: 'comedy',
        lastVerifiedAt: new Date(now - 20 * 86400 * 1000).toISOString(), // 20 days old (stale)
        official_source_url: 'https://examplevenue.com' // homepage only
      };

      // Simulating a live 200 response on the homepage
      const homepageCheckResult = { valid: true, status: 200, reason: 'ok', isHomepageOnly: true };

      const freshness = evaluateEventFreshness(event, {
        nowMs: now,
        linkStatus: homepageCheckResult
      });

      // Homepage 200 MUST NOT reset age or renew status to verified_current
      assert.equal(freshness.status, 'stale', 'Event must remain stale despite live homepage');
      assert.equal(freshness.isDisplayable, false, 'Expired event date must not be displayed');
    });
  });
});
