import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { defaultGeoCache } from '../lib/providers/geo-cache.js';
import { normalizeCategory, normalizeEvent } from '../lib/providers/normalizer.js';
import { calculateIanaBounds } from '../lib/timezone.js';
import { getNearbyVerifiedComedyShows, getDynamicSeedShows, KNOWN_VENUES } from '../lib/comedy/registry.js';
import { getNearbyVerifiedRaces, getAllScheduledRaces, KNOWN_TRACKS } from '../lib/racing/registry.js';
import { executeHybridFeed } from '../lib/providers/engine.js';

describe('Nationwide Comedy & Motorsports Discovery Suite', () => {

  describe('1. Category Normalization & Metadata Extraction', () => {
    test('normalizes racing keywords to racing category and extracts metadata', () => {
      assert.equal(normalizeCategory('auto_racing'), 'racing');
      assert.equal(normalizeCategory('dirt track racing'), 'racing');
      assert.equal(normalizeCategory('NASCAR Cup Series'), 'racing');
      assert.equal(normalizeCategory('World of Outlaws Sprint Cars'), 'racing');
      assert.equal(normalizeCategory('NHRA Drag Racing'), 'racing');

      const rawSgRacing = {
        id: 998877,
        title: 'Saturday Night Dirt Nationals',
        datetime_utc: new Date(Date.now() + 6 * 3600e3).toISOString(),
        venue: {
          name: 'Knoxville Raceway',
          city: 'Knoxville',
          state: 'IA',
          location: { lat: 41.3197, lon: -93.0998 }
        },
        taxonomies: [{ name: 'auto_racing' }]
      };

      const normalized = normalizeEvent(rawSgRacing, 'seatgeek');
      assert.ok(normalized);
      assert.ok(normalized.category_tags.includes('racing'));
      assert.ok(normalized.category_tags.includes('sports'));
      assert.ok(normalized.racing);
      assert.equal(normalized.racing.discipline, 'dirt_oval');
      assert.equal(normalized.indoor_outdoor, 'outdoor');
    });

    test('normalizes comedy category and extracts comedy metadata', () => {
      assert.equal(normalizeCategory('comedy'), 'comedy');
      assert.equal(normalizeCategory('standup'), 'comedy');

      const rawSgComedy = {
        id: 887766,
        title: 'John Mulaney Live',
        datetime_utc: new Date(Date.now() + 5 * 3600e3).toISOString(),
        venue: {
          name: 'The Comedy Store',
          city: 'West Hollywood',
          state: 'CA',
          location: { lat: 34.0953, lon: -118.3744 }
        },
        type: 'theater',
        taxonomies: [{ name: 'comedy' }],
        performers: [{ name: 'John Mulaney', primary: true }]
      };

      const normalized = normalizeEvent(rawSgComedy, 'seatgeek');
      assert.ok(normalized);
      assert.equal(normalized.category_tags[0], 'comedy');
      assert.ok(normalized.comedy);
      assert.equal(normalized.comedy.showType, 'standup');
    });
  });

  describe('2. GeoCache Category Differentiation', () => {
    test('produces distinct cache keys for all, comedy, and racing', () => {
      const kAll = defaultGeoCache.getCacheKey('seatgeek', 40.71, -74.00, 25, 'tonight', '', '');
      const kComedy = defaultGeoCache.getCacheKey('seatgeek', 40.71, -74.00, 25, 'tonight', '', 'comedy');
      const kRacing = defaultGeoCache.getCacheKey('seatgeek', 40.71, -74.00, 25, 'tonight', '', 'racing');

      assert.notEqual(kAll, kComedy);
      assert.notEqual(kAll, kRacing);
      assert.notEqual(kComedy, kRacing);
    });
  });

  describe('3. Multi-Day Window Calculation', () => {
    test('calculates bounds beyond 48 hours for multi-day planning windows without strict clamp', () => {
      const now = new Date('2026-09-21T14:00:00Z'); // Monday
      const [startWknd, endWknd] = calculateIanaBounds('this_weekend', 'America/New_York', now);
      const diffHours = (endWknd.getTime() - now.getTime()) / 3600e3;

      // Monday to Sunday night is ~150 hours, definitely > 48h
      assert.ok(diffHours > 48, `Expected diffHours > 48, got ${diffHours}`);

      const [start30d, end30d] = calculateIanaBounds('30d', 'America/New_York', now);
      const diffDays30 = (end30d.getTime() - now.getTime()) / 86400e3;
      assert.ok(diffDays30 >= 29 && diffDays30 <= 31);
    });
  });

  describe('4. Nationwide Grassroots Registry Hubs', () => {
    test('resolves comedy venues in major US hubs while strictly maintaining venue_presence_only status', () => {
      // NYC venues
      const nycVenues = KNOWN_VENUES.filter(v => v.city === 'New York');
      assert.ok(nycVenues.length > 0, 'Expected comedy venues in NYC');
      assert.ok(nycVenues.some(v => v.name.includes('Comedy Cellar') || v.name.includes('Gotham')));

      // LA venues
      const laVenues = KNOWN_VENUES.filter(v => v.city.includes('Los Angeles') || v.city.includes('West Hollywood'));
      assert.ok(laVenues.length > 0, 'Expected comedy venues in LA');
      assert.ok(laVenues.some(v => v.name.includes('Comedy Store') || v.name.includes('Laugh Factory')));

      // Chicago venues
      const chiVenues = KNOWN_VENUES.filter(v => v.city === 'Chicago');
      assert.ok(chiVenues.length > 0, 'Expected comedy venues in Chicago');
      assert.ok(chiVenues.some(v => v.name.includes('Second City') || v.name.includes('Zanies')));

      // Austin venues
      const atxVenues = KNOWN_VENUES.filter(v => v.city === 'Austin');
      assert.ok(atxVenues.length > 0, 'Expected comedy venues in Austin');
      assert.ok(atxVenues.some(v => v.name.includes('Comedy Mothership')));

      // Nashville venues
      const bnaVenues = KNOWN_VENUES.filter(v => v.city === 'Nashville');
      assert.ok(bnaVenues.length > 0, 'Expected comedy venues in Nashville');
      assert.ok(bnaVenues.some(v => v.name.includes('Zanies')));

      // Master scheduled definitions must be venue_presence_only with null start_time
      const scheduled = getDynamicSeedShows();
      for (const show of scheduled) {
        assert.equal(show.start_time, null);
        assert.equal(show.confirmationStatus, 'venue_presence_only');
        assert.equal(show.isDisplayable, false);
      }

      // Unconfirmed seeds must never appear in verified nearby shows
      const nycLive = getNearbyVerifiedComedyShows(40.7300, -74.0006, 25);
      assert.equal(nycLive.length, 0, 'Unconfirmed comedy seeds must not appear in verified live results');
    });

    test('resolves grassroots short tracks in major US hubs while strictly maintaining venue_presence_only status', () => {
      // Charlotte / Winston-Salem, NC
      const ncTracks = KNOWN_TRACKS.filter(t => t.state === 'NC');
      assert.ok(ncTracks.length > 0, 'Expected tracks in North Carolina');
      assert.ok(ncTracks.some(t => t.name.includes('Bowman Gray') || t.name.includes('Millbridge')));

      // Knoxville, IA
      const iaTracks = KNOWN_TRACKS.filter(t => t.state === 'IA');
      assert.ok(iaTracks.length > 0, 'Expected tracks in Iowa');
      assert.ok(iaTracks.some(t => t.name.includes('Knoxville Raceway')));

      // Mechanicsburg, PA
      const paTracks = KNOWN_TRACKS.filter(t => t.state === 'PA');
      assert.ok(paTracks.length > 0, 'Expected tracks in Pennsylvania');
      assert.ok(paTracks.some(t => t.name.includes('Williams Grove')));

      // Los Angeles / Perris, CA
      const caTracks = KNOWN_TRACKS.filter(t => t.state === 'CA');
      assert.ok(caTracks.length > 0, 'Expected tracks in Southern California');
      assert.ok(caTracks.some(t => t.name.includes('Irwindale') || t.name.includes('Perris')));

      // Chicago exurbs (Sycamore, IL)
      const ilTracks = KNOWN_TRACKS.filter(t => t.state === 'IL');
      assert.ok(ilTracks.length > 0, 'Expected tracks near Chicago');
      assert.ok(ilTracks.some(t => t.name.includes('Sycamore')));

      // Dallas exurbs (Kennedale Speedway Park, TX)
      const txTracks = KNOWN_TRACKS.filter(t => t.state === 'TX');
      assert.ok(txTracks.length > 0, 'Expected tracks near Dallas');
      assert.ok(txTracks.some(t => t.name.includes('Kennedale')));

      // Master scheduled definitions must be venue_presence_only with null start_time
      const scheduled = getAllScheduledRaces();
      for (const race of scheduled) {
        assert.equal(race.start_time, null);
        assert.equal(race.confirmationStatus, 'venue_presence_only');
        assert.equal(race.isDisplayable, false);
      }

      // Unconfirmed seeds must never appear in verified nearby races
      const ncLive = getNearbyVerifiedRaces(35.7796, -80.4, 75);
      assert.equal(ncLive.length, 0, 'Unconfirmed race seeds must not appear in verified live results');
    });
  });

  describe('5. Hybrid Feed Strict Guardrails Against Unconfirmed National Seeds', () => {
    test('strictly excludes unconfirmed seeds from live feeds when querying New York, Los Angeles, and Chicago without dynamic providers', async () => {
      const nyFeed = await executeHybridFeed({
        lat: 40.7128,
        lon: -74.0060,
        category: 'comedy',
        radiusMiles: 25,
        enableDynamic: false
      });
      assert.equal(nyFeed.events.length, 0, 'NYC comedy feed must not return unconfirmed seeds');
      assert.equal(nyFeed.hybrid.deduplicatedCount, 0);

      const laFeed = await executeHybridFeed({
        lat: 34.0522,
        lon: -118.2437,
        category: 'comedy',
        radiusMiles: 25,
        enableDynamic: false
      });
      assert.equal(laFeed.events.length, 0, 'LA comedy feed must not return unconfirmed seeds');
      assert.equal(laFeed.hybrid.deduplicatedCount, 0);
    });

    test('strictly excludes unconfirmed seeds from live feeds when querying Charlotte and Dallas without dynamic providers', async () => {
      const ncFeed = await executeHybridFeed({
        lat: 35.2271,
        lon: -80.8431,
        category: 'racing',
        radiusMiles: 50,
        enableDynamic: false
      });
      assert.equal(ncFeed.events.length, 0, 'NC motorsports feed must not return unconfirmed seeds');
      assert.equal(ncFeed.hybrid.deduplicatedCount, 0);

      const txFeed = await executeHybridFeed({
        lat: 32.7767,
        lon: -96.7970,
        category: 'racing',
        radiusMiles: 50,
        enableDynamic: false
      });
      assert.equal(txFeed.events.length, 0, 'TX motorsports feed must not return unconfirmed seeds');
      assert.equal(txFeed.hybrid.deduplicatedCount, 0);
    });
  });

});
