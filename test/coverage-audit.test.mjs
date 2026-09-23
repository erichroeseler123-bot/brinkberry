import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  auditMarket,
  auditMultiHorizonMarket,
  runNationalAudit,
  checkOfficialUrl,
  sanitizeAuditReport,
  AUDIT_MILESTONE,
  NATIONAL_AUDIT_GRID
} from '../lib/audit/coverage-auditor.js';
import coverageAuditHandler from '../api/coverage-audit.js';

describe('Brinkberry Verification-Quality Coverage & Horizon Audit Suite', () => {

  describe('1. National Grid & Milestone Invariant', () => {
    test('asserts exact milestone wording and grid balance', () => {
      assert.equal(
        AUDIT_MILESTONE,
        'Dynamic official-source ingestion pilot deployed; verified inventory expansion in progress.'
      );
      assert.ok(NATIONAL_AUDIT_GRID.length >= 16);
      const comedyCount = NATIONAL_AUDIT_GRID.filter(p => p.vertical === 'comedy').length;
      const racingCount = NATIONAL_AUDIT_GRID.filter(p => p.vertical === 'racing').length;
      assert.ok(comedyCount >= 8);
      assert.ok(racingCount >= 8);
    });
  });

  describe('2. Verification-Quality Classification Tiers', () => {
    const createMockSgEvent = (id, url) => ({
      id,
      title: 'Denver Stand-up Showcase',
      datetime_utc: new Date(Date.now() + 24 * 3600e3).toISOString(),
      venue: { name: 'Comedy Works Downtown', location: { lat: 39.75, lon: -104.99 } },
      url,
      type: 'comedy',
      taxonomies: [{ name: 'comedy' }],
      performers: [{ type: 'comedy' }]
    });

    test('classifies market with 100% responsive links as verified_inventory', async () => {
      const probe = {
        city: 'Denver',
        state: 'CO',
        vertical: 'comedy',
        lat: 39.7392,
        lon: -104.9903,
        radiusMiles: 25,
        type: 'pilot_market'
      };

      const mockFetch = async (url) => {
        const u = String(url || '');
        if (u.includes('seatgeek')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              events: [createMockSgEvent('sg_denver_1', 'https://seatgeek.com/denver-show-1')]
            })
          };
        }
        return { status: 200, ok: true };
      };
      const result = await auditMarket(probe, { fetchFn: mockFetch, checkLinks: true });

      assert.equal(result.classification, 'verified_inventory');
      assert.ok(result.inventory.totalEvents > 0);
      assert.equal(result.linkIntegrity.validCount, result.linkIntegrity.totalChecked);
      assert.ok(result.linkIntegrity.totalChecked > 0);
    });

    test('classifies market with partial link failures as partial_verification', async () => {
      const probe = {
        city: 'Denver',
        state: 'CO',
        vertical: 'comedy',
        lat: 39.7392,
        lon: -104.9903,
        radiusMiles: 25,
        type: 'pilot_market'
      };

      // Differentiates feed requests from official link checks
      const mockMixedFetch = async (url) => {
        const u = String(url || '');
        if (u.includes('api.seatgeek.com')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              events: [
                createMockSgEvent('sg_denver_1', 'https://seatgeek.com/denver-show-valid'),
                createMockSgEvent('sg_denver_2', 'https://seatgeek.com/denver-show-broken')
              ]
            })
          };
        }
        if (u.includes('ticketmaster')) {
          return { status: 200, ok: true, json: async () => ({ _embedded: { events: [] }, events: [] }) };
        }
        if (u.includes('valid')) {
          return { status: 200, ok: true };
        }
        return { status: 404, ok: false };
      };

      const result = await auditMarket(probe, { fetchFn: mockMixedFetch, checkLinks: true });
      assert.equal(result.classification, 'partial_verification');
      assert.ok(result.linkIntegrity.brokenCount > 0);
      assert.ok(result.linkIntegrity.validCount > 0);
    });

    test('classifies market with all broken links as stale_or_unlinked', async () => {
      const probe = {
        city: 'Denver',
        state: 'CO',
        vertical: 'comedy',
        lat: 39.7392,
        lon: -104.9903,
        radiusMiles: 25,
        type: 'pilot_market'
      };

      const mockFailingFetch = async (url) => {
        const u = String(url || '');
        if (u.includes('api.seatgeek.com')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              events: [createMockSgEvent('sg_denver_1', 'https://seatgeek.com/denver-show-broken')]
            })
          };
        }
        if (u.includes('ticketmaster')) {
          return { status: 200, ok: true, json: async () => ({ _embedded: { events: [] }, events: [] }) };
        }
        return { status: 404, ok: false };
      };
      const result = await auditMarket(probe, { fetchFn: mockFailingFetch, checkLinks: true });
      assert.equal(result.classification, 'stale_or_unlinked');
      assert.equal(result.linkIntegrity.validCount, 0);
      assert.ok(result.linkIntegrity.totalChecked > 0);
    });

    test('classifies unseeded rural market as honest_empty_state without leakage', async () => {
      const probe = {
        city: 'Scottsbluff',
        state: 'NE',
        vertical: 'comedy',
        lat: 41.8666,
        lon: -103.6672,
        radiusMiles: 25,
        type: 'rural_gap'
      };

      const result = await auditMarket(probe, { checkLinks: false });
      assert.equal(result.classification, 'honest_empty_state');
      assert.equal(result.inventory.totalEvents, 0);
      assert.equal(result.inventory.seededVenuesInRadius, 0);
    });
  });

  describe('3. Granular Per-Event Audit Attributes', () => {
    test('extracts exact date/time, source URL, last source check, link status, confirmation status, and listing type', async () => {
      const probe = {
        city: 'New York City',
        state: 'NY',
        vertical: 'comedy',
        lat: 40.7128,
        lon: -74.0060,
        radiusMiles: 25,
        type: 'tier1_metro'
      };

      const mockFetch = async (url) => {
        const u = String(url || '');
        if (u.includes('seatgeek')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              events: [
                {
                  id: 'sg_nyc_1',
                  title: 'Village Underground Comedy',
                  datetime_utc: new Date(Date.now() + 12 * 3600e3).toISOString(),
                  venue: { name: 'Comedy Cellar', location: { lat: 40.73, lon: -74.0 } },
                  url: 'https://seatgeek.com/nyc-comedy',
                  type: 'comedy',
                  taxonomies: [{ name: 'comedy' }],
                  performers: [{ type: 'comedy' }]
                }
              ]
            })
          };
        }
        return { status: 200, ok: true };
      };
      const result = await auditMarket(probe, { fetchFn: mockFetch, checkLinks: true });

      assert.ok(result.events.length > 0, 'Should have granular event items');
      const first = result.events[0];

      assert.ok(first.id, 'Event must have ID');
      assert.ok(first.title, 'Event must have Title');
      assert.ok(first.venue, 'Event must have Venue');
      assert.ok(first.eventDateTime.start, 'Event must have start datetime');
      assert.ok(first.sourceUrl, 'Event must have sourceUrl');
      assert.ok(first.lastSourceCheck, 'Event must have lastSourceCheck');
      assert.ok(typeof first.lastSourceCheckAgeDays === 'number');
      assert.ok(first.linkStatus, 'Event must have linkStatus');
      assert.ok([
        'confirmed_exact_event',
        'confirmed_by_official_calendar',
        'confirmed_by_aggregator',
        'community_submitted',
        'venue_presence_only',
        'unconfirmed_seed'
      ].includes(first.confirmationStatus));
      assert.ok(['commercial', 'curated', 'community'].includes(first.listingType));
    });
  });

  describe('4. Multi-Horizon Motorsports Auditing', () => {
    test('probes across planning windows: tonight, this_weekend, next_weekend, 30d, season', async () => {
      const probe = {
        city: 'Charlotte / Piedmont',
        state: 'NC',
        vertical: 'racing',
        lat: 35.2271,
        lon: -80.8431,
        radiusMiles: 75,
        type: 'short_track_capital'
      };

      const mockRacingFetch = async (url) => {
        const u = String(url || '');
        if (u.includes('seatgeek')) {
          const now = Date.now();
          return {
            status: 200,
            ok: true,
            json: async () => ({
              events: [
                {
                  id: 'sg_race_30d',
                  title: 'Carolina 200 Super Late Models',
                  datetime_utc: new Date(now + 20 * 86400e3).toISOString(),
                  venue: { name: 'Millbridge Speedway', location: { lat: 35.6, lon: -80.7 } },
                  url: 'https://seatgeek.com/carolina-200',
                  taxonomies: [{ name: 'auto_racing' }]
                }
              ]
            })
          };
        }
        return { status: 200, ok: true };
      };

      const mh = await auditMultiHorizonMarket(probe, { checkLinks: false, fetchFn: mockRacingFetch });

      assert.ok(mh.horizons.tonight);
      assert.ok(mh.horizons.this_weekend);
      assert.ok(mh.horizons.next_weekend);
      assert.ok(mh.horizons['30d']);
      assert.ok(mh.horizons.season);

      // Verify that multi-day horizons discover events beyond tonight
      assert.ok(mh.horizons.this_weekend.totalEvents >= mh.horizons.tonight.totalEvents);
      assert.ok(mh.horizons['30d'].totalEvents > 0);
    });
  });

  describe('5. Authorization & Public Sanitization', () => {
    test('sanitizes internal diagnostic details for unauthenticated consumers', async () => {
      const rawReport = await runNationalAudit({ checkLinks: false });
      const sanitized = sanitizeAuditReport(rawReport);

      assert.ok(sanitized.totals);
      assert.ok(sanitized.results.length > 0);

      // Verify internal link integrity and raw source URLs are scrubbed from public events
      for (const res of sanitized.results) {
        assert.equal(res.linkIntegrity, undefined, 'Public result must not expose internal linkIntegrity diagnostics');
        for (const ev of res.events) {
          assert.equal(ev.sourceUrl, undefined, 'Public event must not expose raw internal sourceUrl');
          assert.equal(ev.linkStatus, undefined, 'Public event must not expose linkStatus');
        }
      }
    });

    test('HTTP endpoint serves sanitized data to public and full data to authorized admin', async () => {
      // 1. Unauthenticated public request
      let publicData = null;
      let publicStatus = null;
      await coverageAuditHandler({
        url: '/api/coverage-audit?format=json&checkLinks=false',
        headers: {}
      }, {
        status(c) { publicStatus = c; return this; },
        setHeader() {},
        json(d) { publicData = d; }
      });

      assert.equal(publicStatus, 200);
      assert.equal(publicData.results[0].linkIntegrity, undefined, 'Public API must be sanitized');

      // 2. Authenticated admin request
      const oldToken = process.env.ADMIN_TOKEN;
      process.env.ADMIN_TOKEN = 'test_suite_isolated_admin_token';
      let adminData = null;
      let adminStatus = null;
      try {
        await coverageAuditHandler({
          url: '/api/coverage-audit?format=json&checkLinks=false',
          headers: { authorization: 'Bearer test_suite_isolated_admin_token' }
        }, {
          status(c) { adminStatus = c; return this; },
          setHeader() {},
          json(d) { adminData = d; }
        });

        assert.equal(adminStatus, 200);
        assert.ok(adminData.results[0].linkIntegrity, 'Admin API must include full linkIntegrity diagnostics');
      } finally {
        if (oldToken !== undefined) {
          process.env.ADMIN_TOKEN = oldToken;
        } else {
          delete process.env.ADMIN_TOKEN;
        }
      }
    });
  });

});
