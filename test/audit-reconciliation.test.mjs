import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  runNationalAudit,
  sanitizeAuditReport,
  AUDIT_MILESTONE,
  NATIONAL_AUDIT_GRID
} from '../lib/audit/coverage-auditor.js';
import coverageAuditHandler from '../api/coverage-audit.js';

describe('Audit Reconciliation & Surface Protection Suite', () => {

  describe('1. Mathematical Exactness of Coverage Audit', () => {
    test('strictly reconciles event totals, listing types, market classifications, and link counts', async () => {
      // Mock fetch to test in-process audit rapidly
      const mockFetch = async (url) => {
        const u = String(url || '');
        if (u.includes('ticketmaster') || u.includes('seatgeek')) {
          return { status: 200, ok: true, json: async () => ({ _embedded: { events: [] }, events: [] }) };
        }
        return { status: 200, ok: true };
      };

      const audit = await runNationalAudit({
        fetchFn: mockFetch,
        checkLinks: true
      });

      const { totals, results } = audit;

      // 1. Probed markets reconciliation
      const sumClassifiedMarkets =
        totals.verifiedInventoryMarkets +
        totals.partialVerificationMarkets +
        totals.staleOrUnlinkedMarkets +
        totals.seededPresenceOnlyMarkets +
        totals.honestEmptyStateMarkets;

      assert.equal(
        totals.probedMarkets,
        sumClassifiedMarkets,
        `Probed markets (${totals.probedMarkets}) must equal sum of 5 classification tiers (${sumClassifiedMarkets})`
      );
      assert.equal(totals.probedMarkets, results.length);

      // 2. Global event count reconciliation
      const sumGlobalEventsByType =
        totals.totalCommercialEvents +
        totals.totalCuratedEvents +
        totals.totalCommunityEvents;

      assert.equal(
        totals.totalEventsDiscovered,
        sumGlobalEventsByType,
        `Total events (${totals.totalEventsDiscovered}) must equal sum of commercial (${totals.totalCommercialEvents}) + curated (${totals.totalCuratedEvents}) + community (${totals.totalCommunityEvents})`
      );

      // 3. Per-market event and link reconciliation
      let accumulatedEvents = 0;
      let accumulatedCommercial = 0;
      let accumulatedCurated = 0;
      let accumulatedCommunity = 0;
      let accumulatedLinksChecked = 0;
      let accumulatedLinksValid = 0;
      let accumulatedLinksBroken = 0;

      for (const r of results) {
        const marketSum =
          r.inventory.commercialEvents +
          r.inventory.curatedEvents +
          r.inventory.communityEvents;

        assert.equal(
          r.inventory.totalEvents,
          marketSum,
          `Market ${r.market} total events (${r.inventory.totalEvents}) must equal sum of its listing types (${marketSum})`
        );

        if (r.linkIntegrity) {
          const linkSum = r.linkIntegrity.validCount + r.linkIntegrity.brokenCount;
          assert.equal(
            r.linkIntegrity.totalChecked,
            linkSum,
            `Market ${r.market} checked links (${r.linkIntegrity.totalChecked}) must equal valid + broken (${linkSum})`
          );
          accumulatedLinksChecked += r.linkIntegrity.totalChecked;
          accumulatedLinksValid += r.linkIntegrity.validCount;
          accumulatedLinksBroken += r.linkIntegrity.brokenCount;
        }

        accumulatedEvents += r.inventory.totalEvents;
        accumulatedCommercial += r.inventory.commercialEvents;
        accumulatedCurated += r.inventory.curatedEvents;
        accumulatedCommunity += r.inventory.communityEvents;
      }

      assert.equal(totals.totalEventsDiscovered, accumulatedEvents);
      assert.equal(totals.totalCommercialEvents, accumulatedCommercial);
      assert.equal(totals.totalCuratedEvents, accumulatedCurated);
      assert.equal(totals.totalCommunityEvents, accumulatedCommunity);
      assert.equal(totals.totalLinksChecked, accumulatedLinksChecked);
      assert.equal(totals.totalValidLinks, accumulatedLinksValid);
      assert.equal(totals.totalBrokenLinks, accumulatedLinksBroken);
    });
  });

  describe('2. Surface Protection & Report Sanitization', () => {
    test('public sanitized report hides internal URLs and diagnostic latencies', () => {
      const internalReport = {
        milestone: AUDIT_MILESTONE,
        timestamp: new Date().toISOString(),
        totals: { probedMarkets: 1 },
        results: [
          {
            market: 'Denver, CO',
            city: 'Denver',
            state: 'CO',
            vertical: 'comedy',
            type: 'pilot',
            classification: 'verified_inventory',
            inventory: { totalEvents: 1, commercialEvents: 0, curatedEvents: 1, communityEvents: 0, seededVenuesInRadius: 1 },
            freshness: { status: 'verified_current', avgAgeDays: 2.0 },
            eventHorizon: { horizon: 'tonight' },
            auditDurationMs: 45,
            linkIntegrity: {
              totalChecked: 1,
              validCount: 1,
              brokenCount: 0,
              details: [{ url: 'https://private-source-api.com/internal?key=secret', valid: true, status: 200 }]
            },
            events: [
              {
                id: 'ev_internal_123',
                title: 'Headline Show',
                venue: 'Comedy Works',
                city: 'Denver',
                eventDateTime: { start: '2026-09-22T20:00:00Z' },
                sourceUrl: 'https://internal-partner-token.example.com',
                lastSourceCheck: '2026-09-20T12:00:00Z',
                linkStatus: { valid: true },
                confirmationStatus: 'confirmed_by_official_calendar',
                listingType: 'curated'
              }
            ]
          }
        ]
      };

      const sanitized = sanitizeAuditReport(internalReport);

      // Public output assertions
      assert.ok(sanitized.results[0]);
      assert.equal(sanitized.results[0].linkIntegrity, undefined, 'Private link details must be hidden');
      assert.equal(sanitized.results[0].auditDurationMs, undefined, 'Internal duration must be hidden');
      assert.equal(sanitized.results[0].events[0].sourceUrl, undefined, 'Raw private source URLs must not leak to public');
      assert.equal(sanitized.results[0].events[0].title, 'Headline Show');
      assert.equal(sanitized.results[0].events[0].confirmationStatus, 'confirmed_by_official_calendar');
    });

    test('endpoint delivers sanitized report to unauthenticated callers and full diagnostics to admins', async () => {
      process.env.ADMIN_AUDIT_TOKEN = 'secret_admin_audit_key_123';

      let unauthStatus = 0;
      let unauthBody = null;
      const unauthReq = {
        url: '/api/coverage-audit?format=json&checkLinks=false',
        headers: {}
      };
      const unauthRes = {
        setHeader: () => {},
        writeHead: (code) => { unauthStatus = code; },
        end: (payload) => { unauthBody = JSON.parse(payload); }
      };

      await coverageAuditHandler(unauthReq, unauthRes);
      assert.equal(unauthStatus, 200);
      assert.equal(unauthBody.authenticated, false);
      assert.ok(unauthBody.results[0]);
      assert.equal(unauthBody.results[0].linkIntegrity, undefined);

      let authStatus = 0;
      let authBody = null;
      const authReq = {
        url: '/api/coverage-audit?format=json&checkLinks=false',
        headers: { authorization: 'Bearer secret_admin_audit_key_123' }
      };
      const authRes = {
        setHeader: () => {},
        writeHead: (code) => { authStatus = code; },
        end: (payload) => { authBody = JSON.parse(payload); }
      };

      await coverageAuditHandler(authReq, authRes);
      assert.equal(authStatus, 200);
      assert.equal(authBody.authenticated, true);
      assert.ok(authBody.results[0].linkIntegrity);
    });
  });
});
