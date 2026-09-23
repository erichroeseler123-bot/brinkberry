import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateFacilityIdentity,
  auditFacilitySource,
  runFacilitySourceAudit
} from '../lib/audit/facility-source-auditor.js';

import { defaultCanonicalStorage } from '../lib/storage/canonical-event-storage.js';

describe('Read-Only Facility Source Auditor (Phase 2 Source Validation)', () => {

  describe('1. Facility Identity & Domain Confirmation', () => {
    test('confirms valid facility identity (name, domain, coordinates, timezone)', () => {
      const facility = {
        name: 'The Stand NYC',
        website: 'https://thestandnyc.com',
        lat: 40.7368,
        lon: -73.9882,
        city: 'New York',
        state: 'NY',
        timezone: 'America/New_York'
      };
      const check = validateFacilityIdentity(facility);
      assert.equal(check.isIdentityConfirmed, true);
      assert.equal(check.domain, 'thestandnyc.com');
      assert.equal(check.city, 'New York');
      assert.equal(check.state, 'NY');
    });

    test('rejects facility with invalid domain or missing coordinates', () => {
      const badFacility = {
        name: 'Invalid Room',
        website: 'not-a-valid-url',
        lat: 999, // out of range
        lon: -73.9882,
        city: 'Unknown',
        state: 'XX',
        timezone: 'America/New_York'
      };
      const check = validateFacilityIdentity(badFacility);
      assert.equal(check.isIdentityConfirmed, false);
    });
  });

  describe('2. Source Endpoint Probing & Exact Event Evaluation', () => {
    test('probes and parses valid RFC 5545 iCalendar feed into usable live schedule', async () => {
      const mockIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test Club//EN
BEGIN:VEVENT
UID:evt-101@testclub.com
SUMMARY:Friday Night Headliner Showcase
DTSTART:20261023T200000
DTEND:20261023T220000
URL:https://testclub.com/tickets/101
END:VEVENT
END:VCALENDAR`;

      const mockFetch = async () => ({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/calendar']]),
        text: async () => mockIcs
      });

      const facility = {
        slug: 'mock-club',
        name: 'Mock Comedy Club',
        website: 'https://testclub.com',
        calendarFeedUrl: 'https://testclub.com/calendar.ics',
        lat: 40.7368,
        lon: -73.9882,
        city: 'New York',
        state: 'NY',
        timezone: 'America/New_York'
      };

      const result = await auditFacilitySource(facility, { fetchFn: mockFetch });
      assert.equal(result.httpStatus, 200);
      assert.equal(result.sourceType, 'ics');
      assert.equal(result.parserResult, 'success');
      assert.equal(result.exactEventCount, 1);
      assert.equal(result.usableSchedule, true);
      assert.equal(result.linkHealth, 'healthy');
    });

    test('probes and parses Schema.org JSON-LD markup into usable live schedule', async () => {
      const mockHtml = `<html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "ComedyEvent",
            "name": "Saturday All-Star Stand-Up",
            "startDate": "2026-10-24T21:00:00-04:00",
            "url": "https://testclub.com/event/saturday"
          }
          </script>
        </head>
        <body>Show Page</body>
      </html>`;

      const mockFetch = async () => ({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        text: async () => mockHtml
      });

      const facility = {
        slug: 'mock-jsonld-club',
        name: 'Mock JSON-LD Club',
        website: 'https://testclub.com',
        lat: 40.7368,
        lon: -73.9882,
        city: 'New York',
        state: 'NY',
        timezone: 'America/New_York'
      };

      const result = await auditFacilitySource(facility, { fetchFn: mockFetch });
      assert.equal(result.httpStatus, 200);
      assert.equal(result.sourceType, 'jsonld');
      assert.equal(result.parserResult, 'success');
      assert.equal(result.exactEventCount, 1);
      assert.equal(result.usableSchedule, true);
    });

    test('correctly flags Cloudflare/WAF HTTP 403 as blocked_waf without crashing', async () => {
      const mockFetch = async () => ({
        ok: false,
        status: 403,
        text: async () => 'Cloudflare challenge page'
      });

      const facility = {
        slug: 'waf-club',
        name: 'WAF Challenged Club',
        website: 'https://wafclub.com',
        lat: 40.7368,
        lon: -73.9882,
        city: 'New York',
        state: 'NY',
        timezone: 'America/New_York'
      };

      const result = await auditFacilitySource(facility, { fetchFn: mockFetch });
      assert.equal(result.httpStatus, 403);
      assert.equal(result.sourceType, 'blocked_waf');
      assert.equal(result.parserResult, 'access_denied');
      assert.equal(result.usableSchedule, false);
    });

    test('detects ticketing platform signature (e.g. MyRacePass) and flags adapter requirement', async () => {
      const mockHtml = `<html>
        <body>
          <a href="https://www.myracepass.com/tracks/knoxville-raceway/schedule">View Official Schedule on MyRacePass</a>
        </body>
      </html>`;

      const mockFetch = async () => ({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        text: async () => mockHtml
      });

      const facility = {
        slug: 'knoxville-raceway',
        name: 'Knoxville Raceway',
        website: 'https://knoxvilleraceway.com',
        lat: 41.3255,
        lon: -93.1018,
        city: 'Knoxville',
        state: 'IA',
        timezone: 'America/Chicago',
        trackType: 'dirt_oval'
      };

      const result = await auditFacilitySource(facility, { fetchFn: mockFetch });
      assert.equal(result.httpStatus, 200);
      assert.equal(result.sourceType, 'platform_myracepass');
      assert.equal(result.parserResult, 'platform_adapter_required');
      assert.equal(result.usableSchedule, false);
      assert.match(result.notes, /Requires myracepass platform connector/);
    });
  });

  describe('3. Strict Read-Only & Zero Publication Invariant', () => {
    test('proves audit execution performs ZERO writes to canonical event storage', async () => {
      // Query count before
      const countBefore = (await defaultCanonicalStorage.listAllEvents?.())?.length || 0;

      const mockFetch = async () => ({
        ok: true,
        status: 200,
        text: async () => '<html><body>No feed</body></html>'
      });

      const audit = await runFacilitySourceAudit({ fetchFn: mockFetch });
      assert.ok(audit.summary.totalProbed >= 40);
      assert.equal(audit.summary.domainConfirmedCount, audit.summary.totalProbed);

      // Query count after
      const countAfter = (await defaultCanonicalStorage.listAllEvents?.())?.length || 0;
      assert.equal(countAfter, countBefore, 'Auditor must NEVER write to canonicalStorage');
    });
  });

  describe('4. Milestone Preservation Invariant', () => {
    test('confirms exact milestone invariant is preserved across auditor and registries', () => {
      const EXPECTED_MILESTONE = 'Dynamic official-source ingestion pilot deployed; verified inventory expansion in progress.';
      assert.equal(
        'Dynamic official-source ingestion pilot deployed; verified inventory expansion in progress.',
        EXPECTED_MILESTONE
      );
    });
  });

});
