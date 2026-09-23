import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeEventFingerprint,
  detectEventConflicts,
  mergeEvents,
  CONFIRMATION_PRIORITY
} from '../lib/identity.js';

describe('Event Identity & Deterministic Multi-Source Deduplication Suite', () => {

  describe('1. Deterministic Fingerprint Generation', () => {
    test('computes identical fingerprint for identical canonical event inputs', () => {
      const inputA = {
        venue: 'Comedy Works Downtown',
        venueId: 'comedy-works-downtown',
        city: 'Denver',
        startTime: '2026-09-22T20:00:00.000Z',
        title: 'Taylor Tomlinson: Have It All Tour',
        performerOrSeries: 'Taylor Tomlinson'
      };

      const inputB = {
        venue: 'comedy works downtown',
        venueId: 'comedy-works-downtown',
        city: 'Denver',
        startTime: '2026-09-22T20:00:00.000Z',
        title: 'taylor tomlinson: have it all tour',
        performerOrSeries: 'taylor tomlinson'
      };

      const fpA = computeEventFingerprint(inputA);
      const fpB = computeEventFingerprint(inputB);

      assert.ok(fpA.startsWith('evt_'));
      assert.equal(fpA, fpB, 'Fingerprints must match across case and whitespace discrepancies with identical civil time');
    });

    test('generates distinct fingerprints for different events at same venue', () => {
      const show1 = {
        venueId: 'comedy-works-downtown',
        startTime: '2026-09-22T20:00:00.000Z',
        title: 'Early Showcase',
        performerOrSeries: 'John Mulaney'
      };

      const show2 = {
        venueId: 'comedy-works-downtown',
        startTime: '2026-09-23T22:30:00.000Z',
        title: 'Late Showcase',
        performerOrSeries: 'Dave Chappelle'
      };

      const fp1 = computeEventFingerprint(show1);
      const fp2 = computeEventFingerprint(show2);

      assert.notEqual(fp1, fp2);
    });
  });

  describe('2. Cross-Provider Deduplication & Provenance Preservation', () => {
    test('merges commercial aggregator and curated box office records into single canonical event', () => {
      const curatedRecord = {
        id: 'curated_cw_01',
        title: 'Taylor Tomlinson Live',
        venue_name: 'Comedy Works Downtown',
        venueSlug: 'comedy-works-downtown',
        city: 'Denver, CO',
        start_time: '2026-09-22T20:00:00.000Z',
        price_display: '$35',
        source: 'curated',
        sourceType: 'official_box_office',
        confirmationStatus: 'confirmed_by_official_calendar',
        ticket_url: 'https://comedyworks.com/shows/taylor-tomlinson'
      };

      const seatGeekRecord = {
        id: 'sg_987654',
        title: 'Taylor Tomlinson (18+)',
        venue: 'Comedy Works Downtown',
        city: 'Denver',
        start: '2026-09-22T20:00:00.000Z',
        price_display: '$55',
        source: 'seatgeek',
        confirmationStatus: 'confirmed_by_aggregator',
        ticketUrl: 'https://seatgeek.com/taylor-tomlinson-tickets',
        image: 'https://seatgeek.com/images/taylor.jpg'
      };

      const merged = mergeEvents([curatedRecord, seatGeekRecord]);

      assert.equal(merged.length, 1, 'Should merge 2 records for the same physical event');
      const canonical = merged[0];

      // Provenance and sources
      assert.ok(canonical.fingerprint);
      assert.equal(canonical.sourceCount, 2);
      assert.equal(canonical.sources.length, 2);
      assert.equal(canonical.sources[0].source, 'curated');
      assert.equal(canonical.sources[1].source, 'seatgeek');
      assert.equal(canonical.provenance.primarySource, 'curated');
      assert.deepEqual(canonical.provenance.contributingSources, ['curated', 'seatgeek']);

      // Official box office URL wins
      assert.equal(canonical.ticketUrl, 'https://comedyworks.com/shows/taylor-tomlinson');

      // Best metadata merged (image from seatgeek)
      assert.equal(canonical.canonical_image_url, 'https://seatgeek.com/images/taylor.jpg');

      // Confirmation status retains strongest tier
      assert.equal(canonical.confirmationStatus, 'confirmed_by_official_calendar');
    });

    test('detects and exposes conflicts between data sources', () => {
      const primary = {
        id: 'c1',
        title: 'Late Night Stand-Up',
        venue_name: 'The Comedy Store',
        venueSlug: 'comedy-store',
        city: 'Los Angeles',
        start_time: '2026-09-23T22:00:00.000Z',
        price_display: '$25',
        ageRestriction: '21+',
        source: 'curated',
        confirmationStatus: 'confirmed_exact_event'
      };

      const candidate = {
        id: 'sg1',
        title: 'Late Night Stand-Up',
        venue: 'The Comedy Store',
        venueSlug: 'comedy-store',
        city: 'Los Angeles',
        start: '2026-09-23T22:15:00.000Z', // 15 mins discrepancy (within <= 15m tolerance)
        price_display: '$40',            // Price discrepancy
        ageRestriction: '18+',           // Age discrepancy
        source: 'seatgeek',
        confirmationStatus: 'confirmed_by_aggregator'
      };

      const conflicts = detectEventConflicts(primary, candidate);

      assert.equal(conflicts.length, 3);
      const fields = conflicts.map(c => c.field);
      assert.ok(fields.includes('start_time'));
      assert.ok(fields.includes('price'));
      assert.ok(fields.includes('age_limit'));

      const merged = mergeEvents([primary, candidate]);
      assert.equal(merged.length, 1);
      assert.ok(merged[0].conflicts.length >= 3);
    });

    test('merges grassroots motorsports listings without loss of racing classes', () => {
      const scheduleListing = {
        id: 'race_cns_01',
        title: 'Saturday Night Super Late Models & Pro Trucks',
        trackSlug: 'colorado-national-speedway',
        venue_name: 'Colorado National Speedway',
        city: 'Dacono, CO',
        start_time: '2026-09-26T22:30:00.000Z',
        official_source_url: 'https://coloradonational.com/schedule',
        sourceType: 'official_box_office',
        confirmationStatus: 'confirmed_by_official_calendar',
        racing: {
          surface: 'Asphalt Oval',
          divisions: ['Super Late Models', 'Pro Trucks']
        }
      };

      const communityListing = {
        id: 'comm_cns_01',
        title: 'Colorado National Speedway Saturday Racing',
        trackSlug: 'colorado-national-speedway',
        venue: 'Colorado National Speedway',
        city: 'Dacono, CO',
        start: '2026-09-26T22:30:00.000Z',
        ticket_url: 'https://coloradonational.com',
        source: 'verified_community',
        confirmationStatus: 'community_submitted'
      };

      const merged = mergeEvents([scheduleListing, communityListing]);
      assert.equal(merged.length, 1);
      assert.equal(merged[0].racing.divisions.length, 2);
      assert.equal(merged[0].confirmationStatus, 'confirmed_by_official_calendar');
      assert.equal(merged[0].sources.length, 2);
    });

    test('same performer, same venue, same date with two distinct showtimes and distinct provider IDs remain separate canonical events', () => {
      // Performer: Nate Bargatze
      // Venue: Comedy Works Downtown (Denver, CO)
      // Date: 2026-10-17
      // Showtime 1: 19:00 (7:00 PM) - External ID: eb_show_early_700
      // Showtime 2: 21:30 (9:30 PM) - External ID: eb_show_late_930

      const earlyPerformance = {
        id: 'eb_show_early_700',
        title: 'Nate Bargatze: The Be Funny Tour',
        venue_name: 'Comedy Works Downtown',
        venueSlug: 'comedy-works-downtown',
        city: 'Denver',
        state: 'CO',
        start_time: '2026-10-17T19:00:00.000Z',
        end_time: '2026-10-17T20:30:00.000Z',
        source: 'eventbrite',
        sourceType: 'official_box_office',
        confirmationStatus: 'confirmed_by_official_calendar',
        sourceEvidence: {
          sourceId: 'src_rise_comedy_denver',
          externalEventId: 'eb_show_early_700',
          fetchedAt: '2026-09-21T12:00:00.000Z',
          exactConfirmationFields: { title: true, date: true }
        },
        comedy: {
          comedians: ['Nate Bargatze'],
          showType: 'headliner'
        }
      };

      const latePerformance = {
        id: 'eb_show_late_930',
        title: 'Nate Bargatze: The Be Funny Tour',
        venue_name: 'Comedy Works Downtown',
        venueSlug: 'comedy-works-downtown',
        city: 'Denver',
        state: 'CO',
        start_time: '2026-10-17T21:30:00.000Z',
        end_time: '2026-10-17T23:00:00.000Z',
        source: 'eventbrite',
        sourceType: 'official_box_office',
        confirmationStatus: 'confirmed_by_official_calendar',
        sourceEvidence: {
          sourceId: 'src_rise_comedy_denver',
          externalEventId: 'eb_show_late_930',
          fetchedAt: '2026-09-21T12:00:00.000Z',
          exactConfirmationFields: { title: true, date: true }
        },
        comedy: {
          comedians: ['Nate Bargatze'],
          showType: 'headliner'
        }
      };

      // 1. Prove distinct fingerprints are computed for each showtime
      const fpEarly = computeEventFingerprint({
        venueId: earlyPerformance.venueSlug,
        startTime: earlyPerformance.start_time,
        title: earlyPerformance.title,
        performerOrSeries: 'Nate Bargatze'
      });
      const fpLate = computeEventFingerprint({
        venueId: latePerformance.venueSlug,
        startTime: latePerformance.start_time,
        title: latePerformance.title,
        performerOrSeries: 'Nate Bargatze'
      });
      assert.notEqual(fpEarly, fpLate, 'Different showtimes must yield distinct fingerprints');

      // 2. Merge candidate events through multi-source deduplication
      const canonicalEvents = mergeEvents([earlyPerformance, latePerformance]);

      // 3. Prove both canonical events remain separate
      assert.equal(canonicalEvents.length, 2, 'Both showtimes must remain separate canonical events without merging');
      assert.equal(canonicalEvents[0].id, 'eb_show_early_700');
      assert.equal(canonicalEvents[1].id, 'eb_show_late_930');
      assert.equal(canonicalEvents[0].start_time, '2026-10-17T19:00:00.000Z');
      assert.equal(canonicalEvents[1].start_time, '2026-10-17T21:30:00.000Z');
      assert.equal(canonicalEvents[0].confirmationStatus, 'confirmed_by_official_calendar');
      assert.equal(canonicalEvents[1].confirmationStatus, 'confirmed_by_official_calendar');
    });
  });
});
