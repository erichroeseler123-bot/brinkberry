import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeCategory, resolveSourceQualityLabel } = require('../lib/providers/normalizer.js');
const { evaluateEventFreshness } = require('../lib/freshness.js');
const { executeHybridFeed, scoreEvent, distMiles } = require('../lib/providers/engine.js');
const { COMMUNITY_FEEDS, getNearbyCommunityFeeds } = require('../lib/providers/community-registry.js');
const { parseIcsFeed } = require('../lib/providers/community-ics.js');
const homeHandler = require('../api/home.js');

describe('Broad Local Discovery & Non-Monolithic Experience Suite', () => {

  describe('1. Universal Category Classification & Neutral Civic Recognition', () => {
    test('accurately classifies civic & politics events neutrally', () => {
      assert.equal(normalizeCategory('other', ['Denver City Council Regular Meeting', 'Public comment on city budget']), 'civic');
      assert.equal(normalizeCategory('other', ['School Board District Hearing', 'Curriculum policy debate']), 'civic');
      assert.equal(normalizeCategory('other', ['County Board of Commissioners Meeting', 'Zoning and planning variances']), 'civic');
      assert.equal(normalizeCategory('other', ['Planning and Zoning Commission', 'Public hearing on downtown development']), 'civic');
      assert.equal(normalizeCategory('other', ['State Legislature Committee Hearing', 'Transportation committee']), 'civic');
      assert.equal(normalizeCategory('other', ['Bipartisan Candidate Forum & Town Hall', 'Questions from residents']), 'civic');
    });

    test('accurately classifies public library, maker, and community gatherings', () => {
      assert.equal(normalizeCategory('other', ['Hennepin County Library Book Club', 'Monthly fiction discussion']), 'community');
      assert.equal(normalizeCategory('other', ['Community Repair Clinic & Workshop', 'Fix broken electronics']), 'community');
      assert.equal(normalizeCategory('other', ['Neighborhood Volunteer Tree Planting', 'Parks meetup']), 'community');
      assert.equal(normalizeCategory('other', ['Retro Arcade Tournament Night', 'Pinball and classic arcade']), 'community');
      assert.equal(normalizeCategory('other', ['Friday Night Cosmic Bowling League', 'Spare time lanes']), 'community');
    });

    test('accurately classifies seasonal, fair, and festival events', () => {
      assert.equal(normalizeCategory('other', ['Colorado Renaissance Festival', 'Jousting and artisan village']), 'festival');
      assert.equal(normalizeCategory('other', ['County Fair & 4-H Exhibition', 'Livestock and carnival midway']), 'festival');
      assert.equal(normalizeCategory('other', ['RiNo Holiday Craft Fair & Flea Market', 'Local makers and food trucks']), 'festival');
    });
  });

  describe('2. Source Quality & Verification Labeling Hierarchy', () => {
    test('resolves "Official government calendar" for civic and municipal sources', () => {
      const civicEvent = {
        category: 'civic',
        venue: 'Denver City Hall',
        title: 'City Council Meeting',
        sourceType: 'government',
        confirmationStatus: 'official_government_calendar'
      };
      assert.equal(resolveSourceQualityLabel(civicEvent), 'Official government calendar');
    });

    test('resolves "Verified ticket link" for commercial ticketing platforms with pricing', () => {
      const ticketedEvent = {
        source: 'seatgeek',
        price_status: 'paid',
        priceDisplay: '$25–$45',
        ticketUrl: 'https://seatgeek.com/show/12345'
      };
      assert.equal(resolveSourceQualityLabel(ticketedEvent), 'Verified ticket link');
    });

    test('resolves "Official venue schedule" for primary venue sites and curated comedy clubs', () => {
      const venueEvent = {
        source: 'comedy_works_downtown',
        confirmationStatus: 'confirmed_by_official_calendar',
        ticketUrl: 'https://comedyworks.com/shows/123'
      };
      assert.equal(resolveSourceQualityLabel(venueEvent), 'Official venue schedule');
    });

    test('resolves "Public community listing" for community feeds and library programs', () => {
      const commEvent = {
        source: 'community_hennepin_library',
        confirmationStatus: 'public_community_listing',
        category: 'community'
      };
      assert.equal(resolveSourceQualityLabel(commEvent), 'Public community listing');
    });

    test('resolves "Free event" for verified zero-cost activities lacking external ticketing', () => {
      const freeEvent = {
        category: 'arts',
        price_status: 'free',
        priceDisplay: 'Free',
        price_min: 0,
        hasTicket: false
      };
      assert.equal(resolveSourceQualityLabel(freeEvent), 'Free event');
    });

    test('resolves "Source needs review" when provenance evidence is missing or unverified', () => {
      const unverifiedEvent = {
        confirmationStatus: 'unverified',
        hasTicket: false
      };
      assert.equal(resolveSourceQualityLabel(unverifiedEvent), 'Source needs review');
    });
  });

  describe('3. Freshness Engine Acceptance for Public Community & Civic Records', () => {
    test('allows community listings with public_community_listing confirmation', () => {
      const now = new Date().toISOString();
      const event = {
        id: 'comm_test_01',
        title: 'Library Story Hour',
        start_time: new Date(Date.now() + 4 * 3600e3).toISOString(),
        venue_name: 'Downtown Library',
        confirmationStatus: 'public_community_listing',
        lastVerifiedAt: now,
        sourceEvidence: {
          fetchedAt: now,
          exactConfirmationFields: { title: true, date: true, venue: true }
        }
      };
      const result = evaluateEventFreshness(event);
      assert.equal(result.isDisplayable, true);
      assert.equal(result.status, 'verified_current');
    });

    test('allows civic meetings with official_government_calendar confirmation', () => {
      const now = new Date().toISOString();
      const event = {
        id: 'civic_council_01',
        title: 'City Council Hearing',
        start_time: new Date(Date.now() + 6 * 3600e3).toISOString(),
        venue_name: 'City Council Chambers',
        confirmationStatus: 'official_government_calendar',
        category_tags: ['civic'],
        lastVerifiedAt: now,
        sourceEvidence: {
          fetchedAt: now,
          exactConfirmationFields: { title: true, date: true, venue: true }
        }
      };
      const result = evaluateEventFreshness(event);
      assert.equal(result.isDisplayable, true);
      assert.equal(result.status, 'verified_current');
    });
  });

  describe('4. Multi-Factor Ranking (Rarity, Limited-Run, Seasonal, & Urgency)', () => {
    test('boosts rare one-off events over standard recurring shows', () => {
      const recurringEvent = {
        id: 'rec_1',
        title: 'Weekly Open Mic',
        start_time: new Date(Date.now() + 5 * 3600e3).toISOString(),
        category_tags: ['comedy'],
        vibe_labels: ['recurring'],
        recurring: true,
        price_status: 'free',
        price_min: 0,
        confirmationStatus: 'confirmed_by_official_calendar'
      };

      const oneOffEvent = {
        id: 'one_1',
        title: 'Annual Colorado Heritage Book Fair & Exhibition',
        start_time: new Date(Date.now() + 5 * 3600e3).toISOString(),
        category_tags: ['festival'],
        vibe_labels: ['festival', 'rare'],
        price_status: 'free',
        price_min: 0,
        confirmationStatus: 'confirmed_by_official_calendar'
      };

      const scoreRec = scoreEvent(recurringEvent, 5, 300);
      const scoreOne = scoreEvent(oneOffEvent, 5, 300);
      assert.ok(scoreOne > scoreRec, `Rare one-off event score (${scoreOne}) should exceed recurring score (${scoreRec})`);
    });

    test('boosts seasonal and limited-run events', () => {
      const seasonalEvent = {
        id: 'seas_1',
        title: 'Fall Harvest Pumpkin Festival & Hayride',
        start_time: new Date(Date.now() + 8 * 3600e3).toISOString(),
        category_tags: ['festival'],
        vibe_labels: ['seasonal', 'limited_run'],
        confirmationStatus: 'confirmed_by_official_calendar'
      };

      const standardEvent = {
        id: 'std_1',
        title: 'Standard Weekend Showcase',
        start_time: new Date(Date.now() + 8 * 3600e3).toISOString(),
        category_tags: ['music'],
        vibe_labels: [],
        confirmationStatus: 'confirmed_by_official_calendar'
      };

      const scoreSeas = scoreEvent(seasonalEvent, 5, 480);
      const scoreStd = scoreEvent(standardEvent, 5, 480);
      assert.ok(scoreSeas > scoreStd, `Seasonal event (${scoreSeas}) should be boosted above standard event (${scoreStd})`);
    });
  });

  describe('5. Community Feed Engine with Real ICS Data & Mock Network', () => {
    test('parses and enriches community feed events with optional ticketing attributes', () => {
      const sampleIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:dpl_civic_hearing_01
SUMMARY:Denver City Council: Comprehensive Land Use Committee
DESCRIPTION:Official public hearing on urban tree canopy zoning.
LOCATION:City and County Building Room 391
DTSTART:${new Date(Date.now() + 10 * 3600e3).toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTEND:${new Date(Date.now() + 12 * 3600e3).toISOString().replace(/[-:]/g, '').split('.')[0]}Z
URL:https://denvergov.org/citycouncil
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

      const feedConfig = {
        id: 'denver_civic_test',
        name: 'Denver City Council Hearings',
        city: 'Denver',
        state: 'CO',
        lat: 39.7392,
        lon: -104.9903,
        timezone: 'America/Denver',
        defaultCategory: 'civic'
      };

      const events = parseIcsFeed(sampleIcs, feedConfig);
      assert.equal(events.length, 1);
      const e = events[0];
      assert.equal(e.title, 'Denver City Council: Comprehensive Land Use Committee');
      assert.equal(e.hasTicket, false);
      assert.equal(e.sourceQualityLabel, 'Official government calendar');
      assert.equal(e.price_status, 'free');
      assert.equal(e.confirmationStatus, 'official_government_calendar');
      assert.ok(e.lastVerifiedAt);
    });

    test('executeHybridFeed correctly handles community events with ticketing optionality', async () => {
      const mockCommunityFetch = async (url) => {
        if (url.includes('denvergov.org') || url.includes('council')) {
          const startIso = new Date(Date.now() + 12 * 3600e3).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
          const endIso = new Date(Date.now() + 14 * 3600e3).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
          return {
            ok: true,
            status: 200,
            text: async () => `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:denver_test_hearing
SUMMARY:Denver City Council Budget Hearing
LOCATION:Denver City Hall
DTSTART:${startIso}
DTEND:${endIso}
URL:https://denvergov.org/hearings
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`
          };
        }
        return { ok: false, status: 404 };
      };

      const result = await executeHybridFeed({
        lat: 39.7392,
        lon: -104.9903,
        radiusMiles: 25,
        window: '48h',
        curatedEvents: [],
        enableDynamic: true,
        fetchFn: mockCommunityFetch
      });

      const civic = result.events.find(e => e.title.includes('Budget Hearing'));
      assert.ok(civic, 'Should discover civic hearing from community feed');
      assert.equal(civic.hasTicket, false);
      assert.equal(civic.sourceQualityLabel, 'Official government calendar');
      assert.equal(civic.category, 'civic');
    });
  });

  describe('6. Homepage UI Integrity & Neutral Civic Experience', () => {
    test('renders Homepage with Civic & Politics and Community category options', () => {
      let html = '';
      const res = {
        setHeader() {},
        end(data) { html = data; }
      };
      homeHandler({ url: '/', headers: {} }, res);

      // Verify category navigation buttons
      assert.match(html, /Civic & Politics/);
      assert.match(html, /Community & Libraries/);
      assert.match(html, /Seasonal & Fairs/);

      // Verify style rules for civic and community buttons
      assert.match(html, /\.cat-btn\.civic-btn/);
      assert.match(html, /\.cat-btn\.community-btn/);
      assert.match(html, /\.source-quality-tag/);
      assert.match(html, /\.btn-civic-sm/);
      assert.match(html, /\.btn-free-sm/);

      // Verify neutral non-partisan civic notice in detail dialog
      assert.match(html, /Official Civic &amp; Public Process/);
      assert.match(html, /Brinkberry provides neutral public scheduling information and does not endorse any candidate/);
    });

    test('preserves baseline hero discovery with compact category filter bubbles', () => {
      let html = '';
      const res = {
        setHeader() {},
        end(data) { html = data; }
      };
      homeHandler({ url: '/', headers: {} }, res);

      // Verify oversized feature cards are removed
      assert.doesNotMatch(html, /id="entryPathAll"/);
      assert.doesNotMatch(html, /id="entryPathComedy"/);
      assert.doesNotMatch(html, /id="entryPathRacing"/);

      // Verify compact category bubbles and disclosure consoles are present
      assert.match(html, /id="categoryRow"/);
      assert.match(html, /All Events/);
      assert.match(html, /Comedy Radar/);
      assert.match(html, /Motorsports/);
      assert.match(html, /id="comedySubFilterConsole"/);
      assert.match(html, /id="racingSubFilterConsole"/);
    });
  });

});
