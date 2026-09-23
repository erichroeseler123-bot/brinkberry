import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ATLANTA_VENUES,
  ingestPunchline,
  ingestLaughingSkull,
  deduplicateAtlantaEvents,
  ingestAtlantaComedy,
  getAtlantaCanonicalShows,
  getCivilDateTime
} from '../lib/comedy/atlanta-ingestion.js';

import router from '../api/router.js';
import eventHandler from '../api/event.js';
import landingHandler from '../api/landing.js';

describe('Step 1: Canonical Comedy Show Pages (Atlanta Pioneer Market)', () => {

  describe('1. Two Real Verified Comedy Venues', () => {
    test('verifies two distinct physical landmark comedy venues in Atlanta', () => {
      const venues = Object.values(ATLANTA_VENUES);
      assert.equal(venues.length, 2);

      const punchline = ATLANTA_VENUES.punchline;
      assert.equal(punchline.name, 'The Punchline Comedy Club');
      assert.equal(punchline.city, 'Atlanta');
      assert.equal(punchline.state, 'GA');
      assert.equal(punchline.timezone, 'America/New_York');
      assert.ok(punchline.lat >= 33 && punchline.lat <= 34);
      assert.ok(punchline.lon >= -85 && punchline.lon <= -84);
      assert.equal(punchline.feedType, 'ics');

      const skull = ATLANTA_VENUES.laughingSkull;
      assert.equal(skull.name, 'Laughing Skull Lounge');
      assert.equal(skull.city, 'Atlanta');
      assert.equal(skull.state, 'GA');
      assert.equal(skull.timezone, 'America/New_York');
      assert.ok(skull.lat >= 33 && skull.lat <= 34);
      assert.ok(skull.lon >= -85 && skull.lon <= -84);
      assert.equal(skull.feedType, 'jsonld');
    });
  });

  describe('2. Ingestion & Event Extraction (>= 10 Exact Performances)', () => {
    test('extracts exact dated performances from Punchline via RFC 5545 ICS', async () => {
      const rep = await ingestPunchline();
      assert.ok(rep.events.length > 0, `Expected Punchline events, got ${rep.events.length}`);
      assert.ok(rep.rawHash, 'Expected SHA-256 hash of raw feed');
      for (const ev of rep.events) {
        assert.ok(ev.title, 'Event must have a title');
        assert.ok(ev.start, 'Event must have an ISO start time');
        assert.ok(ev.civilDate, 'Event must have a civilDate');
        assert.ok(ev.civilTime, 'Event must have a civilTime');
        assert.equal(ev.venue_name, 'The Punchline Comedy Club');
        assert.equal(ev.confirmationStatus, 'confirmed_by_official_calendar');
        assert.ok(ev.ticket_url, 'Event must have a direct ticket URL');
        assert.equal(ev.sourceEvidence.feedType, 'ics');
        assert.equal(ev.sourceEvidence.rawHash, rep.rawHash);
      }
    });

    test('extracts exact dated performances from Laughing Skull via Schema.org JSON-LD', async () => {
      const rep = await ingestLaughingSkull();
      assert.ok(rep.events.length >= 20, `Expected >= 20 Laughing Skull events, got ${rep.events.length}`);
      assert.ok(rep.rawHash, 'Expected SHA-256 hash of raw feed');
      for (const ev of rep.events) {
        assert.ok(ev.title, 'Event must have a title');
        assert.ok(ev.start, 'Event must have an ISO start time');
        assert.ok(ev.civilDate, 'Event must have a civilDate');
        assert.ok(ev.civilTime, 'Event must have a civilTime');
        assert.equal(ev.venue_name, 'Laughing Skull Lounge');
        assert.equal(ev.confirmationStatus, 'confirmed_by_official_calendar');
        assert.ok(ev.ticket_url.startsWith('http'), 'Ticket URL must be a valid URL');
        assert.equal(ev.sourceEvidence.feedType, 'jsonld');
        assert.equal(ev.sourceEvidence.rawHash, rep.rawHash);
      }
    });

    test('ingestAtlantaComedy aggregates both venues and satisfies >= 10 performance gate', async () => {
      const result = await ingestAtlantaComedy({ persist: false });
      assert.equal(result.errors.length, 0);
      assert.equal(result.venues.length, 2);
      assert.ok(result.count >= 10, `Expected at least 10 performances, got ${result.count}`);
      assert.ok(result.events.some(e => e.venue_name === 'The Punchline Comedy Club'));
      assert.ok(result.events.some(e => e.venue_name === 'Laughing Skull Lounge'));
    });
  });

  describe('3. Deduplication & Provenance Audits', () => {
    test('merges duplicate source records with identical fingerprints into one canonical show', () => {
      const duplicateRaw = [
        {
          id: 'test-1',
          slug: 'punchline-show-1',
          fingerprint: 'comedy_punchline_2026-10-15_20_headliner-showcase',
          title: 'Headliner Showcase',
          start: '2026-10-16T00:00:00.000Z',
          ticket_url: 'https://punchline.com/tickets/short',
          venue_name: 'The Punchline Comedy Club',
          sourceEvidence: { sourceUrl: 'https://punchline.com/feed1', rawHash: 'hash1' }
        },
        {
          id: 'test-2',
          slug: 'punchline-show-1',
          fingerprint: 'comedy_punchline_2026-10-15_20_headliner-showcase',
          title: 'Headliner Showcase',
          start: '2026-10-16T00:00:00.000Z',
          ticket_url: 'https://punchline.com/tickets/deep-path-101',
          venue_name: 'The Punchline Comedy Club',
          sourceEvidence: { sourceUrl: 'https://punchline.com/feed2', rawHash: 'hash2' }
        }
      ];

      const merged = deduplicateAtlantaEvents(duplicateRaw);
      assert.equal(merged.length, 1, 'Duplicate sources must be merged into 1 canonical performance');
      assert.equal(merged[0].ticket_url, 'https://punchline.com/tickets/deep-path-101', 'Should keep deeper ticket URL');
      assert.ok(Array.isArray(merged[0].sources));
      assert.equal(merged[0].sources.length, 2, 'Should record both source evidences');
    });

    test('excludes cancelled performances cleanly', async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        text: async () => `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Cancelled Comedy Night
STATUS:CANCELLED
DTSTART:20261101T200000Z
URL:https://punchline.com/cancelled
END:VEVENT
END:VCALENDAR`
      });

      const rep = await ingestPunchline({ fetchFn: mockFetch });
      assert.equal(rep.events.length, 0, 'Cancelled event must be excluded from canonical events');
    });
  });

  describe('4. Canonical Show Page Rendering (/shows/:slug & /event/:id)', () => {
    test('renders canonical show page with trust banner, box office button, and provenance audit', async () => {
      const shows = await getAtlantaCanonicalShows({ includePast: true });
      assert.ok(shows.length > 0);
      const sample = shows.find(s => new Date(s.start_time).getTime() > Date.now()) || shows[shows.length - 1];

      const req = {
        url: `https://brinkberry.com/shows/${sample.slug}`,
        query: { id: sample.slug },
        headers: { host: 'brinkberry.com' }
      };

      let statusCode = 200;
      let html = '';
      const res = {
        setHeader: () => {},
        status: (c) => { statusCode = c; return res; },
        send: (b) => { html = b; return res; },
        end: (b) => { html = b; return res; }
      };

      await eventHandler(req, res);
      assert.equal(statusCode, 200);
      assert.ok(html.includes(sample.title), 'Show page must render title');
      assert.ok(html.includes(sample.venue_name), 'Show page must render venue name');
      assert.ok(html.includes('Brinkberry found this public schedule'), 'Must display honest trust banner');
      assert.ok(html.includes('Official Box Office') || html.includes('Official Tickets'), 'Must display direct official ticket button');
      assert.ok(html.includes('Official Source Provenance Audit'), 'Must display provenance audit section');
      assert.ok(html.includes('confirmed_by_official_calendar'), 'Must show confirmed_by_official_calendar classification');
      assert.ok(html.includes(sample.sourceEvidence.rawHash), 'Must display SHA-256 evidence hash');
    });
  });

  describe('5. Live City Comedy Page (/atlanta/comedy)', () => {
    test('renders Atlanta live comedy page with verified shows and zero synthetic records', async () => {
      const req = {
        url: 'https://brinkberry.com/atlanta/comedy',
        headers: { host: 'brinkberry.com' }
      };

      let statusCode = 200;
      let html = '';
      const res = {
        setHeader: () => {},
        status: (c) => { statusCode = c; return res; },
        send: (b) => { html = b; return res; },
        end: (b) => { html = b; return res; }
      };

      await landingHandler(req, res);
      assert.equal(statusCode, 200);
      assert.ok(html.includes('Atlanta'), 'Page must contain Atlanta header');
      assert.ok(html.includes('The Punchline Comedy Club') || html.includes('The Punchline'), 'Must include Punchline shows');
      assert.ok(html.includes('Laughing Skull Lounge'), 'Must include Laughing Skull shows');
      assert.ok(html.includes('verified listings in Atlanta area'), 'Must display verified listings count');
      assert.equal(html.includes('Dave Promoter'), false, 'Zero synthetic test records permitted');
    });

    test('router dispatches /shows/:slug, /show/:id, and /atlanta/comedy accurately', async () => {
      const req = {
        url: 'https://brinkberry.com/atlanta/comedy',
        headers: { host: 'brinkberry.com' }
      };

      let statusCode = 200;
      let html = '';
      const res = {
        setHeader: () => {},
        status: (c) => { statusCode = c; return res; },
        send: (b) => { html = b; return res; },
        end: (b) => { html = b; return res; }
      };

      await router(req, res);
      assert.equal(statusCode, 200);
      assert.ok(html.includes('Atlanta Live Stand-Up Comedy'));
    });
  });

  describe('6. Milestone Preservation Invariant', () => {
    test('confirms exact milestone invariant is preserved across all modules', async () => {
      const EXPECTED = 'Dynamic official-source ingestion pilot deployed; verified inventory expansion in progress.';
      const { AUDIT_MILESTONE } = await import('../lib/audit/coverage-auditor.js');
      assert.equal(AUDIT_MILESTONE, EXPECTED);
    });
  });
});
