import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseIcsDate, parseIcsFeed, fetchCommunityFeedEvents } = require('../lib/providers/community-ics.js');
const { COMMUNITY_FEEDS, getNearbyCommunityFeeds } = require('../lib/providers/community-registry.js');
const { distMiles } = require('../lib/providers/engine.js');

describe('Community Calendar & ICS Adapter Suite', () => {

  describe('iCalendar Date Parsing', () => {
    test('parses UTC iCal date format (YYYYMMDDTHHMMSSZ)', () => {
      const parsed = parseIcsDate('20260918T193000Z', 'America/Chicago');
      assert.equal(parsed, '2026-09-18T19:30:00.000Z');
    });

    test('parses local timezone date format with Central offset', () => {
      const parsed = parseIcsDate('20260918T193000', 'America/Chicago');
      assert.ok(parsed);
      const d = new Date(parsed);
      assert.equal(d.getUTCFullYear(), 2026);
      assert.equal(d.getUTCMonth(), 8); // September (0-indexed)
      assert.equal(d.getUTCDate(), 19); // 19:30 + 5h CDT = 00:30 next UTC day
    });

    test('parses all-day date format (YYYYMMDD)', () => {
      const parsed = parseIcsDate('20260918', 'America/Chicago');
      assert.ok(parsed);
      assert.equal(parsed, '2026-09-18T17:00:00.000Z');
    });
  });

  describe('iCalendar VEVENT Component Parsing', () => {
    const sampleIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//UW-Eau Claire//Events Calendar//EN
BEGIN:VEVENT
UID:uwec_2026_jazz_festival_01
SUMMARY:UWEC Jazz Ensemble I Concert
DESCRIPTION:Live fall semester jazz performance featuring guest artists.\\nAdmission is free.
LOCATION:Gantner Concert Hall\\, Haas Fine Arts Center
DTSTART:20260918T193000Z
DTEND:20260918T213000Z
URL:https://calendar.uwec.edu/event/jazz-ensemble-1
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:uwec_cancelled_event_02
SUMMARY:Cancelled Chemistry Seminar
DTSTART:20260918T140000Z
STATUS:CANCELLED
END:VEVENT
BEGIN:VEVENT
UID:uwec_no_end_time_03
SUMMARY:Pablo Center Student Art Showcase
LOCATION:Foster Gallery
DTSTART:20260918T180000Z
END:VEVENT
END:VCALENDAR`;

    const feedMeta = {
      id: 'uwec_events',
      name: 'UW–Eau Claire Campus & Arts Events',
      city: 'Eau Claire',
      state: 'WI',
      lat: 44.7986,
      lon: -91.4989,
      timezone: 'America/Chicago',
      defaultCategory: 'arts',
      provenance: {
        source: 'University of Wisconsin–Eau Claire',
        url: 'https://calendar.uwec.edu/'
      }
    };

    test('extracts and normalizes valid VEVENTs', () => {
      const events = parseIcsFeed(sampleIcs, feedMeta);
      assert.equal(events.length, 2, 'Should parse 2 valid events and skip 1 cancelled event');

      const jazz = events[0];
      assert.equal(jazz.title, 'UWEC Jazz Ensemble I Concert');
      assert.equal(jazz.venue_name, 'Gantner Concert Hall, Haas Fine Arts Center');
      assert.equal(jazz.city, 'Eau Claire, WI');
      assert.equal(jazz.category_tags[0], 'music');
      assert.equal(jazz.price_status, 'free');
      assert.equal(jazz.price_display, 'Free');
      assert.equal(jazz.canonical_url, 'https://calendar.uwec.edu/event/jazz-ensemble-1');
      assert.equal(jazz.provenance.sourceId, 'uwec_events');
      assert.equal(jazz.provenance.provider, 'community_ics');
    });

    test('ignores events with STATUS:CANCELLED', () => {
      const events = parseIcsFeed(sampleIcs, feedMeta);
      const cancelled = events.find(e => e.title.includes('Chemistry'));
      assert.equal(cancelled, undefined, 'Cancelled event must be excluded');
    });

    test('provides realistic default end time (start + 2h) when DTEND is missing', () => {
      const events = parseIcsFeed(sampleIcs, feedMeta);
      const showcase = events.find(e => e.title.includes('Student Art Showcase'));
      assert.ok(showcase);
      const startMs = new Date(showcase.start_time).getTime();
      const endMs = new Date(showcase.end_time).getTime();
      assert.equal(endMs - startMs, 2 * 3600 * 1000, 'End time should default to start + 2 hours');
    });
  });

  describe('Community Registry Spatial Lookup', () => {
    test('finds registered community feeds for Eau Claire coordinates', () => {
      const feeds = getNearbyCommunityFeeds(44.8113, -91.4985, 25, distMiles);
      assert.ok(feeds.length > 0);
      assert.ok(feeds.some(f => f.id === 'uwec_events'));
    });

    test('returns empty community feeds list for distant markets', () => {
      const feeds = getNearbyCommunityFeeds(39.7392, -104.9903, 25, distMiles);
      assert.equal(feeds.length, 0, 'Denver should not match Eau Claire community feeds');
    });
  });

});
