import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  OFFICIAL_SOURCES,
  ingestSource,
  getIngestedOfficialEvents,
  clearIngestionCache,
  distMiles
} from '../lib/ingestion/engine.js';
import { parseIcsSource, parseIcsDateTime } from '../lib/ingestion/adapters/ics.js';
import { parseHtmlScheduleSource } from '../lib/ingestion/adapters/html-schedule.js';
import { parseHtmlCardsSource } from '../lib/ingestion/adapters/html-cards.js';
import { extractJsonLdEvents } from '../lib/ingestion/adapters/jsonld.js';
import { mergeEvents, computeEventFingerprint } from '../lib/identity.js';
import { evaluateEventFreshness } from '../lib/freshness.js';
import { executeHybridFeed } from '../lib/providers/engine.js';
import { AUDIT_MILESTONE, runNationalAudit } from '../lib/audit/coverage-auditor.js';

describe('Dynamic Official-Source Ingestion Engine Suite', () => {

  beforeEach(() => {
    clearIngestionCache();
  });

  // Test 1: JSON-LD Event Extraction
  test('1. extractJsonLdEvents parses Schema.org JSON-LD events with title, date, venue, and status', () => {
    const jsonLdHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Event",
          "@id": "https://example.com/events/comedy-night-2026",
          "name": "Live Stand-Up Showcase with Special Guests",
          "startDate": "2026-09-25T19:30:00-06:00",
          "endDate": "2026-09-25T21:30:00-06:00",
          "eventStatus": "https://schema.org/EventScheduled",
          "location": {
            "@type": "Place",
            "name": "Downtown Comedy Club",
            "address": "100 Main St, Denver, CO"
          },
          "offers": {
            "@type": "Offer",
            "price": "20.00",
            "priceCurrency": "USD",
            "url": "https://example.com/tickets/123"
          }
        }
        </script>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Event",
          "name": "Cancelled Midnight Mic",
          "startDate": "2026-09-26T00:00:00-06:00",
          "eventStatus": "https://schema.org/EventCancelled"
        }
        </script>
      </head>
      <body><h1>Events</h1></body>
      </html>
    `;

    const events = extractJsonLdEvents(jsonLdHtml, { venueName: 'Downtown Comedy Club' });
    assert.equal(events.length, 2);

    const activeEvent = events[0];
    assert.equal(activeEvent.title, 'Live Stand-Up Showcase with Special Guests');
    assert.ok(activeEvent.start.includes('2026-09-26T01:30:00.000Z') || activeEvent.start.startsWith('2026-09-25'));
    assert.equal(activeEvent.venue, 'Downtown Comedy Club');
    assert.equal(activeEvent.priceDisplay, '$20.00');
    assert.equal(activeEvent.isCancelled, false);

    const cancelledEvent = events[1];
    assert.equal(cancelledEvent.title, 'Cancelled Midnight Mic');
    assert.equal(cancelledEvent.isCancelled, true);
  });

  // Test 2: ICS / iCalendar Extraction (Real Rise Comedy VEVENT format)
  test('2. parseIcsSource parses RFC 5545 iCalendar stream into standardized events', () => {
    const realRiseIcs = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Rise Comedy - ECP//NONSGML v1.0//EN',
      'BEGIN:VEVENT',
      'UID:rise_event_48921_20260920',
      'DTSTART:20260921T010000Z',
      'DTEND:20260921T023000Z',
      'SUMMARY:Rise Comedy Open Stage & Stand-Up Jam',
      'DESCRIPTION:Join local stand-ups and improvisers at Rise Comedy.',
      'LOCATION:Rise Comedy\\, 1260 22nd St\\, Denver\\, CO 80205',
      'URL:https://risecomedy.com/event/open-stage-jam/',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:rise_event_cancelled_2026',
      'DTSTART:20260922T020000Z',
      'SUMMARY:[CANCELLED] Late Night Improv Cage Match',
      'STATUS:CANCELLED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const sourceConfig = {
      id: 'src_rise_comedy',
      venueName: 'Rise Comedy',
      timezone: 'America/Denver'
    };

    const parsed = parseIcsSource(realRiseIcs, sourceConfig);
    assert.equal(parsed.length, 2);

    const active = parsed[0];
    assert.equal(active.title, 'Rise Comedy Open Stage & Stand-Up Jam');
    assert.equal(active.externalId, 'rise_event_48921_20260920');
    assert.equal(active.start, '2026-09-21T01:00:00.000Z');
    assert.equal(active.venue, 'Rise Comedy, 1260 22nd St, Denver, CO 80205');
    assert.equal(active.eventUrl, 'https://risecomedy.com/event/open-stage-jam/');
    assert.equal(active.isCancelled, false);

    const cancelled = parsed[1];
    assert.equal(cancelled.isCancelled, true);
  });

  // Test 3: HTML Schedule Extraction (Real Volusia Speedway Park format)
  test('3. parseHtmlScheduleSource parses semantic HTML schedule into verified race items', () => {
    const volusiaHtml = `
      <div class="event-container schedulebox" data-start-date="2026-09-26" data-track="volusia-speedway-park" data-series="world-of-outlaws">
        <p class="event-title">Federated Auto Parts 50: World of Outlaws Sprint Cars</p>
        <p class="event-series">World of Outlaws Sprint Cars, DIRTcar UMP Modifieds</p>
        <a href="https://volusiaspeedwaypark.com/event/outlaws-50/" class="btn">Event Details</a>
      </div></div></div>
      <div class="event-container schedulebox" data-start-date="2026-10-03" data-track="volusia-speedway-park">
        <p class="event-title">Volusia Fall Dirt Championship: 604 Late Models</p>
        <p class="event-series">604 Late Models, Street Stocks, Thunder Stocks</p>
        <a href="https://volusiaspeedwaypark.com/event/fall-champ/" class="btn">Tickets</a>
      </div></div></div>
    `;

    const sourceConfig = {
      venueName: 'Volusia Speedway Park',
      timezone: 'America/New_York'
    };

    const races = parseHtmlScheduleSource(volusiaHtml, sourceConfig);
    assert.equal(races.length, 2);

    const race1 = races[0];
    assert.equal(race1.title, 'Federated Auto Parts 50: World of Outlaws Sprint Cars');
    assert.equal(race1.venue, 'Volusia Speedway Park');
    assert.equal(race1.start, '2026-09-26T19:00:00.000Z');
    assert.deepEqual(race1.divisions, ['World of Outlaws Sprint Cars', 'DIRTcar UMP Modifieds']);
    assert.equal(race1.eventUrl, 'https://volusiaspeedwaypark.com/event/outlaws-50/');
    assert.equal(race1.isCancelled, false);
  });

  // Test 4: HTML Cards Extraction (Real The Stand NYC format)
  test('4. parseHtmlCardsSource parses structured HTML show cards with date-time slugs', () => {
    const theStandHtml = `
      <div class="row show_row">
        <div class="col-md-8">
          <h2 class="showtitle"><a href="https://thestandnyc.com/shows/show/4412/2026-09-20-190000-the-stand-presents">The Stand Presents: Big Jay Oakerson, Derek Gaines, & More!</a></h2>
          <div class="list-show-room">Main Room (Upstairs)</div>
        </div>
      </div></div></div>
      <div class="row show_row">
        <div class="col-md-8">
          <h2 class="showtitle"><a href="https://thestandnyc.com/shows/show/4413/2026-09-20-210000-stand-up-allstars">The Stand Late Show: NYC Stand-Up All-Stars</a></h2>
          <div class="list-show-room">Downstairs Room</div>
        </div>
      </div></div></div>
    `;

    const sourceConfig = {
      venueName: 'The Stand NYC',
      timezone: 'America/New_York'
    };

    const shows = parseHtmlCardsSource(theStandHtml, sourceConfig);
    assert.equal(shows.length, 2);

    const show1 = shows[0];
    assert.equal(show1.title, 'The Stand Presents: Big Jay Oakerson, Derek Gaines, & More!');
    assert.equal(show1.room, 'Main Room (Upstairs)');
    assert.equal(show1.externalId, 'stand_4412');
    assert.equal(show1.start, '2026-09-20T23:00:00.000Z'); // 19:00 EDT + 4h UTC
    assert.ok(show1.comedians.includes('Big Jay Oakerson'));
    assert.ok(show1.comedians.includes('Derek Gaines'));
  });

  // Test 5: Exact Confirmation Fields
  test('5. ingestSource verifies exact date, title, venue, and URL confirmation fields', async () => {
    const mockIcs = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:exact_confirm_1',
      'DTSTART:20260925T200000Z',
      'SUMMARY:Exact Confirmed Friday Headliner',
      'LOCATION:Rise Comedy',
      'URL:https://risecomedy.com/event/friday-headliner',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const sourceConfig = OFFICIAL_SOURCES.find(s => s.id === 'src_rise_comedy_denver');
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => mockIcs
    });

    const report = await ingestSource(sourceConfig, { fetchFn: mockFetch, bypassCache: true });
    assert.equal(report.httpStatus, 200);
    assert.ok(report.rawSourceHash);
    assert.equal(report.confirmedCount, 1);

    const ev = report.events[0];
    assert.equal(ev.confirmationStatus, 'confirmed_by_official_calendar');
    assert.ok(ev.sourceEvidence);
    assert.equal(ev.sourceEvidence.sourceId, 'src_rise_comedy_denver');
    assert.equal(ev.sourceEvidence.parser, 'ics');
    assert.equal(ev.sourceEvidence.httpStatus, 200);
    assert.equal(ev.sourceEvidence.exactConfirmationFields.title, true);
    assert.equal(ev.sourceEvidence.exactConfirmationFields.date, true);
    assert.equal(ev.sourceEvidence.exactConfirmationFields.venue, true);
    assert.equal(ev.sourceEvidence.exactConfirmationFields.url, true);
  });

  // Test 6: Homepage-Only Source does NOT Confirm an Event
  test('6. homepage-only content does NOT confirm an event without calendar schedule data', async () => {
    const homepageHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>Welcome to the Racetrack</title></head>
      <body>
        <h1>Historic County Speedway</h1>
        <p>Welcome to our track! Call the office for questions.</p>
      </body>
      </html>
    `;

    const sourceConfig = {
      id: 'src_homepage_only',
      venueName: 'Historic County Speedway',
      category: 'racing',
      parser: 'html_schedule',
      scheduleUrl: 'https://example.com'
    };

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => homepageHtml
    });

    const report = await ingestSource(sourceConfig, { fetchFn: mockFetch, bypassCache: true });
    assert.equal(report.rawCount, 0);
    assert.equal(report.confirmedCount, 0);
    assert.equal(report.events.length, 0);
  });

  // Test 7: Fetch Failure Decays Gracefully Without Fabricating Dates
  test('7. fetch failure records error and decays gracefully without fabricating dates', async () => {
    const sourceConfig = OFFICIAL_SOURCES[0];
    const failingFetch = async () => {
      throw new Error('Connection refused by remote box office server');
    };

    const report = await ingestSource(sourceConfig, { fetchFn: failingFetch, bypassCache: true });
    assert.equal(report.httpStatus, 0);
    assert.ok(report.parserErrors.includes('Connection refused'));
    assert.equal(report.confirmedCount, 0);
    assert.equal(report.events.length, 0);
  });

  // Test 8: Ingestion Idempotency
  test('8. repeated ingestion produces identical fingerprint and event count', async () => {
    const mockIcs = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:idempotent_event_1',
      'DTSTART:20260925T200000Z',
      'SUMMARY:Idempotent Denver Comedy Jam',
      'LOCATION:Rise Comedy',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const sourceConfig = OFFICIAL_SOURCES[0];
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => mockIcs
    });

    const run1 = await ingestSource(sourceConfig, { fetchFn: mockFetch, bypassCache: true });
    const run2 = await ingestSource(sourceConfig, { fetchFn: mockFetch, bypassCache: true });

    assert.equal(run1.confirmedCount, run2.confirmedCount);
    assert.equal(run1.events[0].id, run2.events[0].id);

    const fp1 = computeEventFingerprint({
      venue: run1.events[0].venue_name,
      startTime: run1.events[0].start_time,
      title: run1.events[0].title
    });
    const fp2 = computeEventFingerprint({
      venue: run2.events[0].venue_name,
      startTime: run2.events[0].start_time,
      title: run2.events[0].title
    });
    assert.equal(fp1, fp2);
  });

  // Test 9: Deduplication & Official Box Office Precedence
  test('9. official source event and SeatGeek event merge into one canonical event with box office URL winning', () => {
    const officialEvt = {
      id: 'ingest_rise_001',
      title: 'Rise Comedy All-Stars Showcase',
      venue_name: 'Rise Comedy',
      venueSlug: 'rise-comedy',
      city: 'Denver, CO',
      start_time: '2026-09-25T19:30:00.000Z',
      ticket_url: 'https://risecomedy.com/tickets/allstars',
      canonical_url: 'https://risecomedy.com/tickets/allstars',
      sourceType: 'official_box_office',
      source: 'official_ingestion',
      confirmationStatus: 'confirmed_by_official_calendar',
      price_display: '$18'
    };

    const seatgeekEvt = {
      id: 'sg_109283',
      title: 'Rise Comedy Showcase',
      venue_name: 'Rise Comedy',
      venueSlug: 'rise-comedy',
      city: 'Denver, CO',
      start_time: '2026-09-25T19:30:00.000Z',
      ticket_url: 'https://seatgeek.com/rise-comedy-tickets/109283',
      canonical_url: 'https://seatgeek.com/rise-comedy-tickets/109283',
      source: 'seatgeek',
      confirmationStatus: 'confirmed_by_aggregator',
      price_display: '$28'
    };

    const merged = mergeEvents([officialEvt, seatgeekEvt]);
    assert.equal(merged.length, 1);

    const canonical = merged[0];
    assert.equal(canonical.confirmationStatus, 'confirmed_by_official_calendar');
    // Box office link must win
    assert.equal(canonical.ticket_url, 'https://risecomedy.com/tickets/allstars');
    // Both sources preserved in sources[]
    assert.equal(canonical.sources.length, 2);
    const sourceNames = canonical.sources.map(s => s.source);
    assert.ok(sourceNames.includes('official_ingestion'));
    assert.ok(sourceNames.includes('seatgeek'));
  });

  // Test 10: Discrepancy Detection & Conflict Preservation
  test('10. conflicts between sources (time differences, prices) are preserved in conflicts[]', () => {
    const boxOfficeEvt = {
      id: 'ingest_rise_doors',
      title: 'Late Night Comedy Jam',
      venue_name: 'Rise Comedy',
      venueSlug: 'rise-comedy',
      city: 'Denver, CO',
      start_time: '2026-09-25T21:00:00.000Z', // 9:00 PM door
      ticket_url: 'https://risecomedy.com/event/late-jam',
      source: 'official_ingestion',
      sourceType: 'official_box_office',
      confirmationStatus: 'confirmed_by_official_calendar',
      price_display: '$15'
    };

    const aggregatorEvt = {
      id: 'sg_diff_time',
      title: 'Late Night Comedy Jam',
      venue_name: 'Rise Comedy',
      venueSlug: 'rise-comedy',
      city: 'Denver, CO',
      start_time: '2026-09-25T21:15:00.000Z', // 9:15 PM show (+15 mins diff within tolerance)
      ticket_url: 'https://seatgeek.com/late-jam',
      source: 'seatgeek',
      confirmationStatus: 'confirmed_by_aggregator',
      price_display: '$30' // Price difference ($15 vs $30)
    };

    const merged = mergeEvents([boxOfficeEvt, aggregatorEvt]);
    assert.equal(merged.length, 1);

    const canonical = merged[0];
    assert.ok(canonical.conflicts.length >= 1, 'Discrepancy must be detected');
    const conflictFields = canonical.conflicts.map(c => c.field);
    assert.ok(conflictFields.includes('start_time') || conflictFields.includes('price'));
  });

  // Test 11: Cancelled Events Excluded from Active Feed
  test('11. cancelled events are identified and excluded from active confirmed feed', async () => {
    const mockIcs = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:rainout_event_1',
      'DTSTART:20260925T200000Z',
      'SUMMARY:Rainout Sprint Car Shootout [CANCELLED]',
      'STATUS:CANCELLED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const sourceConfig = OFFICIAL_SOURCES[0];
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => mockIcs
    });

    const report = await ingestSource(sourceConfig, { fetchFn: mockFetch, bypassCache: true });
    assert.equal(report.rawCount, 1);
    // Cancelled event must NOT be in active confirmed list
    assert.equal(report.confirmedCount, 0);
    assert.equal(report.events.length, 0);
  });

  // Test 12: Ingestion Integrates into executeHybridFeed for Denver, NYC, and Volusia
  test('12. executeHybridFeed ingests official sources and merges into dynamic feed', async () => {
    clearIngestionCache();
    const mockRiseIcs = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:rise_live_feed_test',
      'DTSTART:' + new Date(Date.now() + 4 * 3600e3).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
      'SUMMARY:Rise Comedy Ingested Live Showcase',
      'LOCATION:Rise Comedy, 1260 22nd St, Denver, CO 80205',
      'URL:https://risecomedy.com/shows',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const mockFetch = async (url) => {
      const u = String(url);
      if (u.includes('risecomedy.com') || u.includes('eventbriteapi.com')) {
        return { ok: true, status: 200, text: async () => mockRiseIcs };
      }
      return { ok: true, status: 200, json: async () => ({ events: [], _embedded: { events: [] } }), text: async () => '' };
    };

    const feed = await executeHybridFeed({
      lat: 39.7392,
      lon: -104.9903,
      radiusMiles: 25,
      category: 'comedy',
      fetchFn: mockFetch
    });

    assert.ok(feed.events.length > 0);
    const riseLive = feed.events.find(e => e.title.includes('Rise Comedy Ingested Live Showcase'));
    assert.ok(riseLive, 'Rise Comedy official ingested show must appear in feed');
    assert.equal(riseLive.confirmationStatus, 'confirmed_by_official_calendar');
    assert.ok(riseLive.official_source_url.includes('eventbriteapi.com') || riseLive.official_source_url.includes('risecomedy.com'));
  });

  // Test 13: Milestone Invariant and Audit Mathematical Reconciliation
  test('13. audit milestone invariant matches strictly and totals reconcile mathematically', async () => {
    assert.equal(
      AUDIT_MILESTONE,
      'Dynamic official-source ingestion pilot deployed; verified inventory expansion in progress.'
    );

    const mockFetch = async (url) => {
      return { ok: true, status: 200, json: async () => ({ events: [] }) };
    };

    const audit = await runNationalAudit({ fetchFn: mockFetch, checkLinks: false });
    assert.equal(audit.milestone, AUDIT_MILESTONE);
    assert.equal(
      audit.totals.probedMarkets,
      audit.totals.verifiedInventoryMarkets +
      audit.totals.partialVerificationMarkets +
      audit.totals.staleOrUnlinkedMarkets +
      audit.totals.seededPresenceOnlyMarkets +
      audit.totals.honestEmptyStateMarkets
    );
  });

});
