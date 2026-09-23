// test/crawl-ledger.test.mjs
// Comprehensive test suite for Durable Crawl Ledger

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  CrawlLedger,
  DomainBudgetController,
  CRAWL_STATES,
  SOURCE_KINDS,
  MAX_TRAVERSAL_DEPTH,
  normalizeCanonicalUrl,
  computeLedgerKey
} = require('../lib/crawling/crawl-ledger.js');

describe('Durable Crawl Ledger Control Plane Suite', () => {
  let tmpStorageFile;
  let ledger;

  beforeEach(() => {
    tmpStorageFile = path.join(os.tmpdir(), `test_crawl_ledger_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    ledger = new CrawlLedger(tmpStorageFile, { rateLimitMs: 50, perDomainBudget: 3 });
  });

  // -------------------------------------------------------------------------
  // 1. URL Normalization & Deterministic Keying
  // -------------------------------------------------------------------------
  describe('1. URL Normalization & Deterministic Keying', () => {
    it('normalizes URLs by stripping trailing slashes, fragments, and tracking parameters', () => {
      const u1 = 'https://comedyworks.com/shows/calendar/';
      const u2 = 'https://comedyworks.com/shows/calendar#month-view';
      const u3 = 'https://comedyworks.com/shows/calendar?utm_source=fb&utm_medium=cpc&ref=twitter';

      const norm1 = normalizeCanonicalUrl(u1);
      const norm2 = normalizeCanonicalUrl(u2);
      const norm3 = normalizeCanonicalUrl(u3);

      assert.equal(norm1, 'https://comedyworks.com/shows/calendar');
      assert.equal(norm2, 'https://comedyworks.com/shows/calendar');
      assert.equal(norm3, 'https://comedyworks.com/shows/calendar');
    });

    it('generates unique deterministic IDs on normalized URL + sourceKind', () => {
      const url = 'https://comedyworks.com/shows/calendar';
      const keyVenue = computeLedgerKey(url, SOURCE_KINDS.VENUE);
      const keyArtist = computeLedgerKey(url, SOURCE_KINDS.ARTIST);

      assert.ok(keyVenue.startsWith('cl_'));
      assert.ok(keyArtist.startsWith('cl_'));
      assert.notEqual(keyVenue, keyArtist, 'Different source kinds on same URL must have distinct ledger IDs');

      const keyVenueRepeat = computeLedgerKey('https://comedyworks.com/shows/calendar/?utm_source=mail', SOURCE_KINDS.VENUE);
      assert.equal(keyVenue, keyVenueRepeat, 'Equivalent normalized URLs must produce identical ledger IDs');
    });

    it('deduplicates existing URLs when registered multiple times', () => {
      const r1 = ledger.registerUrl({
        canonicalUrl: 'https://thecomedystore.com/calendar/',
        sourceKind: SOURCE_KINDS.VENUE,
        depth: 0
      });

      const r2 = ledger.registerUrl({
        canonicalUrl: 'https://thecomedystore.com/calendar?utm_campaign=summer',
        sourceKind: SOURCE_KINDS.VENUE,
        depth: 1
      });

      assert.equal(r1.id, r2.id);
      assert.equal(ledger.records.size, 1);
      assert.equal(ledger.getEntry(r1.id).depth, 0, 'Shallower depth must be preserved');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Cooldown Enforcement (nextEligibleAt)
  // -------------------------------------------------------------------------
  describe('2. Cooldown Enforcement (nextEligibleAt)', () => {
    it('registers new URLs as immediately eligible', () => {
      const entry = ledger.registerUrl({
        canonicalUrl: 'https://punchline.com/events',
        sourceKind: SOURCE_KINDS.VENUE
      });

      assert.equal(entry.status, CRAWL_STATES.QUEUED);
      assert.ok(ledger.isEligible(entry, Date.now()));
    });

    it('enforces cooldown after successful crawl (24h default)', () => {
      const entry = ledger.registerUrl({
        canonicalUrl: 'https://punchline.com/events',
        sourceKind: SOURCE_KINDS.VENUE
      });

      ledger.markFetching(entry.id);
      ledger.recordAttempt(entry.id, {
        status: CRAWL_STATES.PARSED,
        httpStatus: 200,
        contentHash: 'abc123hash',
        exactEventCount: 9
      });

      const updated = ledger.getEntry(entry.id);
      assert.equal(updated.status, CRAWL_STATES.PARSED);
      assert.equal(updated.exactEventCount, 9);

      // Immediately after parse, must NOT be eligible
      assert.equal(ledger.isEligible(updated, Date.now()), false);

      // After 24h + 1ms, must become eligible
      const futureMs = Date.parse(updated.nextEligibleAt) + 1000;
      assert.equal(ledger.isEligible(updated, futureMs), true);
    });

    it('applies exponential backoff on failed_retryable', () => {
      const entry = ledger.registerUrl({
        canonicalUrl: 'https://flakey-club.com/events',
        sourceKind: SOURCE_KINDS.VENUE
      });

      // Attempt 1: 15 min cooldown
      ledger.recordAttempt(entry.id, {
        status: CRAWL_STATES.FAILED_RETRYABLE,
        httpStatus: 503,
        failureReason: 'Service Unavailable'
      });
      let rec = ledger.getEntry(entry.id);
      assert.equal(rec.retryCount, 1);
      const diffMs1 = Date.parse(rec.nextEligibleAt) - Date.parse(rec.lastAttemptedAt);
      assert.ok(diffMs1 >= 14 * 60 * 1000 && diffMs1 <= 16 * 60 * 1000);

      // Attempt 2: 30 min cooldown (2^1 * 15m)
      ledger.recordAttempt(entry.id, {
        status: CRAWL_STATES.FAILED_RETRYABLE,
        httpStatus: 504,
        failureReason: 'Gateway Timeout'
      });
      rec = ledger.getEntry(entry.id);
      assert.equal(rec.retryCount, 2);
      const diffMs2 = Date.parse(rec.nextEligibleAt) - Date.parse(rec.lastAttemptedAt);
      assert.ok(diffMs2 >= 29 * 60 * 1000 && diffMs2 <= 31 * 60 * 1000);
    });

    it('acquireNextEligibleBatch skips records currently in cooldown', () => {
      const e1 = ledger.registerUrl({ canonicalUrl: 'https://venue1.com/cal', depth: 0 });
      const e2 = ledger.registerUrl({ canonicalUrl: 'https://venue2.com/cal', depth: 0 });

      // Put e1 in cooldown
      ledger.recordAttempt(e1.id, {
        status: CRAWL_STATES.PARSED,
        httpStatus: 200,
        exactEventCount: 15
      });

      const batch = ledger.acquireNextEligibleBatch({ limit: 10 });
      assert.equal(batch.length, 1);
      assert.equal(batch[0].id, e2.id);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Strict Traversal Depth Bound (Max Depth 2)
  // -------------------------------------------------------------------------
  describe('3. Strict Traversal Depth Bound (Max Depth 2)', () => {
    it('accepts depth 0, 1, and 2', () => {
      const d0 = ledger.registerUrl({ canonicalUrl: 'https://seed-club.com/cal', depth: 0 });
      const d1 = ledger.registerUrl({ canonicalUrl: 'https://marknormandcomedy.com/tour', sourceKind: SOURCE_KINDS.ARTIST, depth: 1 });
      const d2 = ledger.registerUrl({ canonicalUrl: 'https://discovered-club.com/cal', depth: 2 });

      assert.equal(d0.depth, 0);
      assert.equal(d1.depth, 1);
      assert.equal(d2.depth, 2);
    });

    it('rejects attempts to register URLs with depth > 2', () => {
      assert.throws(() => {
        ledger.registerUrl({ canonicalUrl: 'https://too-deep.com/cal', depth: 3 });
      }, /Max traversal depth is 2/);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Per-Domain Request Budget & Delay
  // -------------------------------------------------------------------------
  describe('4. Per-Domain Request Budget & Delay', () => {
    it('enforces per-domain budget limit', () => {
      const budget = new DomainBudgetController({ perDomainBudget: 2 });
      const u1 = 'https://comedyworks.com/shows/calendar?month=9';
      const u2 = 'https://comedyworks.com/shows/calendar?month=10';
      const u3 = 'https://comedyworks.com/shows/calendar?month=11';

      assert.equal(budget.canRequest(u1), true);
      budget.acquireDelay(u1);
      assert.equal(budget.canRequest(u2), true);
      budget.acquireDelay(u2);
      assert.equal(budget.canRequest(u3), false, 'Exceeded per-domain budget of 2');
    });

    it('enforces delay throttling between successive requests to same domain', async () => {
      const budget = new DomainBudgetController({ rateLimitMs: 60, perDomainBudget: 5 });
      const u = 'https://acmecomedycompany.com/events';

      const t0 = Date.now();
      await budget.acquireDelay(u);
      await budget.acquireDelay(u);
      const elapsed = Date.now() - t0;

      assert.ok(elapsed >= 50, `Expected delay >= 50ms, elapsed was ${elapsed}ms`);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Complete 9 Lifecycle States & Non-Destructive Update
  // -------------------------------------------------------------------------
  describe('5. Complete 9 Lifecycle States & Non-Destructive History', () => {
    it('supports all 9 lifecycle states with accurate metadata', () => {
      const allStates = [
        CRAWL_STATES.QUEUED,
        CRAWL_STATES.FETCHING,
        CRAWL_STATES.PARSED,
        CRAWL_STATES.NO_EXACT_EVENTS,
        CRAWL_STATES.BLOCKED_ROBOTS,
        CRAWL_STATES.BLOCKED_WAF,
        CRAWL_STATES.UNSUPPORTED,
        CRAWL_STATES.FAILED_RETRYABLE,
        CRAWL_STATES.STALE
      ];

      for (let i = 0; i < allStates.length; i++) {
        const state = allStates[i];
        const entry = ledger.registerUrl({
          canonicalUrl: `https://test-club-${i}.com/cal`,
          sourceKind: SOURCE_KINDS.VENUE
        });

        ledger.recordAttempt(entry.id, {
          status: state,
          httpStatus: state === CRAWL_STATES.BLOCKED_WAF ? 403 : 200,
          wafStatus: state === CRAWL_STATES.BLOCKED_WAF ? 'challenge' : 'clear',
          robotsAllowed: state !== CRAWL_STATES.BLOCKED_ROBOTS,
          contentHash: 'hash_' + state,
          exactEventCount: state === CRAWL_STATES.PARSED ? 10 : 0
        });

        const rec = ledger.getEntry(entry.id);
        assert.equal(rec.status, state);
      }
    });

    it('non-destructively preserves attempt history across multiple crawls', () => {
      const entry = ledger.registerUrl({ canonicalUrl: 'https://history-venue.com/cal' });

      // Crawl 1: Parsed 5 events
      ledger.recordAttempt(entry.id, {
        status: CRAWL_STATES.PARSED,
        httpStatus: 200,
        contentHash: 'content_v1',
        exactEventCount: 5
      });

      // Crawl 2: Transient 503
      ledger.recordAttempt(entry.id, {
        status: CRAWL_STATES.FAILED_RETRYABLE,
        httpStatus: 503,
        failureReason: 'Server Error'
      });

      const rec = ledger.getEntry(entry.id);
      assert.equal(rec.attempts.length, 2);
      assert.equal(rec.attempts[0].status, CRAWL_STATES.PARSED);
      assert.equal(rec.attempts[0].contentHash, 'content_v1');
      assert.equal(rec.attempts[1].status, CRAWL_STATES.FAILED_RETRYABLE);
      assert.equal(rec.attempts[1].httpStatus, 503);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Durable Disk Persistence
  // -------------------------------------------------------------------------
  describe('6. Durable Disk Persistence', () => {
    it('persists and restores ledger entries from disk', () => {
      ledger.registerUrl({
        canonicalUrl: 'https://durability-club.com/cal',
        sourceKind: SOURCE_KINDS.VENUE,
        depth: 1
      });

      // Reload into fresh ledger instance
      const restored = new CrawlLedger(tmpStorageFile);
      assert.equal(restored.records.size, 1);
      const entry = Array.from(restored.records.values())[0];
      assert.equal(entry.canonicalUrl, 'https://durability-club.com/cal');
      assert.equal(entry.depth, 1);
    });
  });
});
