import test from 'node:test';
import assert from 'node:assert/strict';

import { getDynamicSeedShows, getNearbyVerifiedComedyShows } from '../lib/comedy/registry.js';
import { getAllScheduledRaces, getDynamicSeedRaces, getNearbyVerifiedRaces } from '../lib/racing/registry.js';
import { evaluateEventFreshness } from '../lib/freshness.js';
import { computeEventFingerprint, areEventsDuplicate, mergeEvents } from '../lib/identity.js';
import { executeHybridFeed } from '../lib/providers/engine.js';
import { GeoCache } from '../lib/providers/geo-cache.js';

test('Live Feed Audit, Seed Elimination & Strict Identity Resolution Suite', async (t) => {

  // Test 1: No seed event receives a generated date (start_time === null, end_time === null)
  await t.test('1. comedy and racing seeds never generate request-time dates', () => {
    const comedySeeds = getDynamicSeedShows();
    assert.ok(comedySeeds.length > 0, 'Seed records exist for venue presence');
    for (const show of comedySeeds) {
      assert.equal(show.start_time, null, `Comedy seed "${show.title}" must have null start_time`);
      assert.equal(show.end_time, null, `Comedy seed "${show.title}" must have null end_time`);
      assert.equal(show.confirmationStatus, 'venue_presence_only');
      assert.equal(show.isDisplayable, false);
    }

    const scheduledRaces = getAllScheduledRaces();
    assert.ok(scheduledRaces.length > 0, 'Racing schedule definitions exist');
    for (const race of scheduledRaces) {
      assert.equal(race.start_time, null, `Racing seed "${race.title}" must have null start_time`);
      assert.equal(race.end_time, null, `Racing seed "${race.title}" must have null end_time`);
      assert.equal(race.confirmationStatus, 'venue_presence_only');
      assert.equal(race.isDisplayable, false);
    }

    const dynamicRaces = getDynamicSeedRaces();
    assert.equal(dynamicRaces.length, 0, 'Dynamic seed races must be completely empty');
  });

  // Test 2: Unconfirmed seeds and venue_presence_only are absent from events[] in live feed
  await t.test('2. unconfirmed seeds and venue_presence_only are absent from feed events[]', async () => {
    // Calling getNearbyVerifiedComedyShows or getNearbyVerifiedRaces directly produces 0 dated events
    const nearbyComedy = getNearbyVerifiedComedyShows(39.7392, -104.9903, 25);
    assert.equal(nearbyComedy.length, 0, 'Seed comedy shows must never appear in nearby verified shows');

    const nearbyRaces = getNearbyVerifiedRaces(39.7392, -104.9903, 100);
    assert.equal(nearbyRaces.length, 0, 'Seed races must never appear in nearby verified races');

    // Executing hybrid feed with empty dynamic mocks produces 0 events
    const feed = await executeHybridFeed({
      lat: 39.7392,
      lon: -104.9903,
      radiusMiles: 25,
      window: '48h',
      curatedEvents: [],
      cache: new GeoCache(),
      enableDynamic: true,
      fetchFn: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ events: [] }),
        text: async () => ''
      })
    });

    assert.equal(feed.events.length, 0, 'Feed events[] must have 0 events when no confirmed upstream events exist');
    assert.equal(feed.hybrid.curatedCount, 0);
    assert.equal(feed.hybrid.commercialCount, 0);
    assert.equal(feed.hybrid.comedyCount, 0);
    assert.equal(feed.hybrid.racingCount, 0);
    assert.equal(feed.hybrid.deduplicatedCount, 0);
  });

  // Test 3: Evidence-free records asserting confirmed status are rejected (isDisplayable: false)
  await t.test('3. evidence-free records asserting confirmed status are rejected', () => {
    // Official calendar claim without sourceEvidence
    const bogusOfficial = {
      id: 'bogus_official_01',
      title: 'Fabricated Headliner Show',
      venue_name: 'The Stand NYC',
      start_time: '2026-09-25T20:00:00.000Z',
      confirmationStatus: 'confirmed_by_official_calendar'
      // Missing sourceEvidence!
    };
    const evalOfficial = evaluateEventFreshness(bogusOfficial);
    assert.equal(evalOfficial.status, 'unconfirmed');
    assert.equal(evalOfficial.isDisplayable, false);

    // Aggregator claim without provider evidence
    const bogusAggregator = {
      id: 'bogus_aggregator_01',
      title: 'Untracked Commercial Show',
      venue_name: 'Paramount Theatre',
      start_time: '2026-09-25T20:00:00.000Z',
      source: 'untrusted_partner',
      confirmationStatus: 'confirmed_by_aggregator'
      // Missing provider evidence!
    };
    const evalAggregator = evaluateEventFreshness(bogusAggregator);
    assert.equal(evalAggregator.status, 'unconfirmed');
    assert.equal(evalAggregator.isDisplayable, false);

    // Seed presence only
    const presenceOnly = {
      id: 'seed_presence_01',
      title: 'Weekly Open Mic',
      venue_name: 'Wide Right',
      confirmationStatus: 'venue_presence_only'
    };
    const evalPresence = evaluateEventFreshness(presenceOnly);
    assert.equal(evalPresence.status, 'unconfirmed');
    assert.equal(evalPresence.isDisplayable, false);
  });

  // Test 4: Two performances at 6:30 PM and 9:00 PM at the same venue produce two separate events
  await t.test('4. distinct same-venue showtimes (6:30 PM vs 9:00 PM) never merge and have distinct fingerprints', () => {
    const earlyShow = {
      id: 'show_early',
      title: 'Taylor Tomlinson: Have It All Tour',
      venue_name: 'Comedy Works Downtown',
      venueSlug: 'comedy-works-downtown',
      city: 'Denver',
      start_time: '2026-09-25T18:30:00.000Z', // 6:30 PM
      source: 'seatgeek',
      confirmationStatus: 'confirmed_by_aggregator'
    };

    const lateShow = {
      id: 'show_late',
      title: 'Taylor Tomlinson: Have It All Tour',
      venue_name: 'Comedy Works Downtown',
      venueSlug: 'comedy-works-downtown',
      city: 'Denver',
      start_time: '2026-09-25T21:00:00.000Z', // 9:00 PM (150 mins difference)
      source: 'seatgeek',
      confirmationStatus: 'confirmed_by_aggregator'
    };

    const fpEarly = computeEventFingerprint({
      venueId: earlyShow.venueSlug,
      startTime: earlyShow.start_time,
      title: earlyShow.title
    });

    const fpLate = computeEventFingerprint({
      venueId: lateShow.venueSlug,
      startTime: lateShow.start_time,
      title: lateShow.title
    });

    assert.notEqual(fpEarly, fpLate, 'Fingerprints must be distinct for 6:30 PM and 9:00 PM');

    const areDups = areEventsDuplicate(earlyShow, lateShow);
    assert.equal(areDups, false, '6:30 PM and 9:00 PM shows must never be marked as duplicates');

    const merged = mergeEvents([earlyShow, lateShow]);
    assert.equal(merged.length, 2, 'Merge must preserve two separate showtime events');
  });

  // Test 5: verifiedInventory breakdown counts sum to and reconcile only confirmed displayable events
  await t.test('5. verifiedInventory breakdown and totals reconcile only confirmed displayable events', async () => {
    const mockEvents = [
      {
        id: 'sg_1',
        title: 'Comedian Live 1',
        start_time: new Date(Date.now() + 4 * 3600e3).toISOString(),
        venue_name: 'Comedy Club A',
        city: 'Denver, CO',
        category_tags: ['comedy'],
        source: 'seatgeek',
        confirmationStatus: 'confirmed_by_aggregator',
        price_status: 'paid',
        price_min: 25
      },
      {
        id: 'sg_2',
        title: 'Comedian Live 2',
        start_time: new Date(Date.now() + 8 * 3600e3).toISOString(),
        venue_name: 'Comedy Club B',
        city: 'Denver, CO',
        category_tags: ['comedy'],
        source: 'seatgeek',
        confirmationStatus: 'confirmed_by_aggregator',
        price_status: 'paid',
        price_min: 30
      }
    ];

    const feed = await executeHybridFeed({
      lat: 39.7392,
      lon: -104.9903,
      radiusMiles: 25,
      window: '48h',
      curatedEvents: [],
      cache: new GeoCache(),
      enableDynamic: true,
      fetchFn: async (url) => {
        if (String(url).includes('seatgeek')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              events: [
                {
                  id: 101,
                  title: 'Comedian Live 1',
                  datetime_utc: new Date(Date.now() + 4 * 3600e3).toISOString(),
                  venue: { name: 'Comedy Club A', city: 'Denver', state: 'CO', location: { lat: 39.74, lon: -104.99 } },
                  url: 'https://seatgeek.com/show1',
                  type: 'comedy'
                },
                {
                  id: 102,
                  title: 'Comedian Live 2',
                  datetime_utc: new Date(Date.now() + 8 * 3600e3).toISOString(),
                  venue: { name: 'Comedy Club B', city: 'Denver', state: 'CO', location: { lat: 39.74, lon: -104.99 } },
                  url: 'https://seatgeek.com/show2',
                  type: 'comedy'
                }
              ]
            })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ events: [] }),
          text: async () => ''
        };
      }
    });

    assert.equal(feed.events.length, 2, 'Feed contains exactly 2 confirmed events');
    assert.equal(feed.hybrid.commercialCount, 2);
    assert.equal(feed.hybrid.comedyCount, 2);
    assert.equal(feed.hybrid.curatedCount, 0);
    assert.equal(feed.hybrid.communityCount, 0);
    assert.equal(feed.hybrid.officialCount, 0);
    assert.equal(feed.hybrid.deduplicatedCount, 2);
    assert.equal(feed.hybrid.deduplicatedCount, feed.events.length);
  });

  // Test 6: Denver comedy output contains real SeatGeek events while official ingestion remains honestly 0
  await t.test('6. Denver comedy output isolates real aggregator events while official ingestion is 0', async () => {
    const feed = await executeHybridFeed({
      lat: 39.7392,
      lon: -104.9903,
      radiusMiles: 25,
      window: '48h',
      category: 'comedy',
      curatedEvents: [],
      cache: new GeoCache(),
      enableDynamic: true,
      fetchFn: async (url) => {
        const u = String(url);
        // Simulate real SeatGeek response with comedy headliner
        if (u.includes('seatgeek')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              events: [
                {
                  id: 991,
                  title: 'Dan and Phil: Terrible Influence',
                  datetime_utc: new Date(Date.now() + 6 * 3600e3).toISOString(),
                  venue: { name: 'Paramount Theatre', city: 'Denver', state: 'CO', location: { lat: 39.7441, lon: -104.9897 } },
                  url: 'https://seatgeek.com/dan-phil',
                  type: 'comedy'
                }
              ]
            })
          };
        }
        // Rise Comedy & The Stand (official ingestion) return 401 / 403 or unavailable
        return {
          ok: false,
          status: 401,
          text: async () => '{"error":"NO_AUTH"}'
        };
      }
    });

    assert.equal(feed.events.length, 1);
    assert.equal(feed.events[0].title, 'Dan and Phil: Terrible Influence');
    assert.equal(feed.events[0].confirmationStatus, 'confirmed_by_aggregator');
    assert.equal(feed.providers.official_ingestion.count, 0, 'Official ingestion must honestly report 0 count');
    assert.equal(feed.hybrid.comedyCount, 1);
  });

});
