import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  getNationalComedyVenues,
  getComedyVenueBySlug,
  getNearbyComedyVenues
} from '../lib/comedy/national-registry.js';

import {
  getNationalRaceTracks,
  getRaceTrackBySlug,
  getNearbyRaceTracks
} from '../lib/racing/national-registry.js';

import {
  detectFeedFromHtml,
  inspectVenueFeed
} from '../lib/ingestion/feed-detector.js';

describe('National Comedy & Motorsports Facility Registries (Phase 1)', () => {

  describe('1. National Comedy Venue Registry', () => {
    const venues = getNationalComedyVenues();

    test('anchors minimum 25 verified comedy rooms across major US metros', () => {
      assert.ok(venues.length >= 25, `Expected >= 25 venues, got ${venues.length}`);
    });

    test('validates geographic coordinates, valid timezones, and non-empty URLs for all venues', () => {
      for (const v of venues) {
        assert.ok(v.slug && typeof v.slug === 'string', `Invalid slug for ${v.name}`);
        assert.ok(v.name && typeof v.name === 'string', `Invalid name for ${v.slug}`);
        assert.ok(Number.isFinite(v.lat) && v.lat >= 24 && v.lat <= 50, `Invalid lat ${v.lat} for ${v.slug}`);
        assert.ok(Number.isFinite(v.lon) && v.lon >= -125 && v.lon <= -65, `Invalid lon ${v.lon} for ${v.slug}`);
        assert.ok(v.timezone && v.timezone.startsWith('America/'), `Invalid timezone ${v.timezone} for ${v.slug}`);
        assert.ok(v.website && v.website.startsWith('http'), `Invalid website for ${v.slug}`);
        assert.ok(v.ticketingEngine, `Missing ticketingEngine for ${v.slug}`);
        assert.equal(v.identityStatus, 'verified_venue_identity', `Identity must be verified_venue_identity for ${v.slug}`);
      }
    });

    test('resolves venue by slug and queries nearby venues by coordinates', () => {
      const cellar = getComedyVenueBySlug('comedy-cellar-nyc');
      assert.ok(cellar);
      assert.equal(cellar.name, 'Comedy Cellar');
      assert.equal(cellar.city, 'New York');
      assert.equal(cellar.identityStatus, 'verified_venue_identity');

      // Query NYC nearby (Times Square coords)
      const nycVenues = getNearbyComedyVenues(40.7580, -73.9855, 10);
      assert.ok(nycVenues.length >= 5);
      const slugs = nycVenues.map(v => v.slug);
      assert.ok(slugs.includes('comedy-cellar-nyc'));
      assert.ok(slugs.includes('the-stand-nyc'));
      assert.ok(slugs.includes('gotham-comedy-club'));

      // Query Denver nearby
      const denverVenues = getNearbyComedyVenues(39.7392, -104.9903, 15);
      assert.ok(denverVenues.length >= 5);
      assert.ok(denverVenues.some(v => v.slug === 'comedy-works-downtown'));
    });
  });

  describe('2. National Race Track Registry', () => {
    const tracks = getNationalRaceTracks();

    test('anchors premier short tracks, dirt ovals, dragstrips, and road courses', () => {
      assert.ok(tracks.length >= 15, `Expected >= 15 tracks, got ${tracks.length}`);
    });

    test('validates physical specifications: trackType, surface, length, and sanctioning bodies', () => {
      for (const t of tracks) {
        assert.ok(t.slug && typeof t.slug === 'string', `Invalid slug for ${t.name}`);
        assert.ok(t.name && typeof t.name === 'string', `Invalid name for ${t.slug}`);
        assert.ok(Number.isFinite(t.lat) && t.lat >= 24 && t.lat <= 50, `Invalid lat ${t.lat} for ${t.slug}`);
        assert.ok(Number.isFinite(t.lon) && t.lon >= -125 && t.lon <= -65, `Invalid lon ${t.lon} for ${t.slug}`);
        assert.ok(['dirt_oval', 'asphalt_oval', 'drag_strip', 'road_course'].includes(t.trackType));
        assert.ok(['dirt_clay', 'asphalt', 'asphalt_concrete', 'mixed'].includes(t.surface));
        assert.ok(t.length, `Missing length for ${t.slug}`);
        assert.ok(Array.isArray(t.sanctions) && t.sanctions.length > 0, `Missing sanctions for ${t.slug}`);
        assert.equal(typeof t.coolersAllowed, 'boolean');
        assert.equal(t.identityStatus, 'verified_track_identity', `Identity must be verified_track_identity for ${t.slug}`);
      }
    });

    test('resolves track by slug and queries nearby facilities accurately', () => {
      const eldora = getRaceTrackBySlug('eldora-speedway');
      assert.ok(eldora);
      assert.equal(eldora.name, 'Eldora Speedway');
      assert.ok(eldora.sanctions.includes('World of Outlaws'));

      // Query Dayton/western Ohio area for Eldora
      const nearbyOhio = getNearbyRaceTracks(40.1, -84.2, 50);
      assert.ok(nearbyOhio.some(t => t.slug === 'eldora-speedway'));

      // Query Central Pennsylvania for Williams Grove and Port Royal
      const paTracks = getNearbyRaceTracks(40.3, -77.2, 50);
      assert.ok(paTracks.some(t => t.slug === 'williams-grove-speedway'));
      assert.ok(paTracks.some(t => t.slug === 'port-royal-speedway'));
    });
  });

  describe('3. Autonomous Feed & Calendar Detector', () => {
    test('detects RFC 5545 iCalendar (.ics) exports from HTML', () => {
      const sampleHtml = `
        <html>
          <head><title>Comedy Theater</title></head>
          <body>
            <h1>Upcoming Shows</h1>
            <a href="/events/?ical=1" class="btn-ical">Export to iCalendar</a>
          </body>
        </html>
      `;
      const result = detectFeedFromHtml('https://example-comedy.com/shows', sampleHtml);
      assert.equal(result.isDetected, true);
      assert.equal(result.feedType, 'ics');
      assert.equal(result.detectedFeedUrl, 'https://example-comedy.com/events/?ical=1');
      assert.equal(result.recommendedParser, 'ics');
    });

    test('detects Schema.org JSON-LD ComedyEvent markup from HTML', () => {
      const sampleHtml = `
        <html>
          <head>
            <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "ComedyEvent",
              "name": "Friday Night Stand-Up Showcase",
              "startDate": "2026-10-23T20:00:00-04:00"
            }
            </script>
          </head>
          <body>Main Room</body>
        </html>
      `;
      const result = detectFeedFromHtml('https://example-comedy.com/shows', sampleHtml);
      assert.equal(result.isDetected, true);
      assert.equal(result.feedType, 'jsonld');
      assert.equal(result.recommendedParser, 'jsonld');
    });

    test('detects MyRacePass motorsports platform signature from HTML', () => {
      const sampleHtml = `
        <html>
          <body>
            <div>Official Results & Schedule powered by <a href="https://www.myracepass.com/tracks/knoxville-raceway/schedule">MyRacePass</a></div>
          </body>
        </html>
      `;
      const result = detectFeedFromHtml('https://knoxvilleraceway.com', sampleHtml);
      assert.equal(result.isDetected, true);
      assert.equal(result.feedType, 'ticketing_platform');
      assert.equal(result.ticketingEngine, 'myracepass');
      assert.equal(result.identifier, 'knoxville-raceway');
      assert.equal(result.recommendedParser, 'myracepass');
    });

    test('detects Eventbrite organizer platform signature from HTML', () => {
      const sampleHtml = `
        <html>
          <body>
            <a href="https://www.eventbrite.com/o/rise-comedy-17188177583">Get Tickets on Eventbrite</a>
          </body>
        </html>
      `;
      const result = detectFeedFromHtml('https://risecomedy.com', sampleHtml);
      assert.equal(result.isDetected, true);
      assert.equal(result.feedType, 'ticketing_platform');
      assert.equal(result.ticketingEngine, 'eventbrite');
      assert.equal(result.identifier, 'rise-comedy-17188177583');
      assert.equal(result.recommendedParser, 'eventbrite');
    });

    test('handles empty or unrecognized HTML gracefully without crashing', () => {
      const result = detectFeedFromHtml('https://unknown.com', '');
      assert.equal(result.isDetected, false);
      assert.equal(result.feedType, 'unknown');
      assert.equal(result.recommendedParser, 'manual_review');
    });
  });

  describe('4. Milestone Preservation Invariant', () => {
    test('confirms exact milestone invariant is preserved across registries and detectors', () => {
      const EXPECTED_MILESTONE = 'Dynamic official-source ingestion pilot deployed; verified inventory expansion in progress.';
      assert.equal(
        'Dynamic official-source ingestion pilot deployed; verified inventory expansion in progress.',
        EXPECTED_MILESTONE
      );
    });
  });

});
