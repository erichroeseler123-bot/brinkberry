import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  OFFICIAL_SOURCES,
  ingestSource,
  clearIngestionCache,
  getIngestedOfficialEvents
} from '../lib/ingestion/engine.js';
import {
  parseEventbriteSource,
  fetchEventbriteOrganizerEvents,
  parseEventbriteEvent,
  parseEventbriteDateTime
} from '../lib/ingestion/adapters/eventbrite.js';
import {
  GcsRawSourceStorage,
  SharedMemoryGcsDriver
} from '../lib/storage/raw-source-storage.js';
import {
  ExternalSharedCanonicalStorage,
  SharedMemoryStoreDriver
} from '../lib/storage/canonical-event-storage.js';

describe('Official Eventbrite Adapter & RISE Comedy Ingestion Suite', () => {

  const riseSource = OFFICIAL_SOURCES.find(s => s.id === 'src_rise_comedy_denver');

  beforeEach(() => {
    clearIngestionCache();
  });

  // Test 1: Multi-Page Pagination
  test('1. multi-page pagination correctly retrieves and aggregates all organizer events', async () => {
    assert.ok(riseSource, 'src_rise_comedy_denver must be registered in OFFICIAL_SOURCES');
    assert.equal(riseSource.parser, 'eventbrite');
    assert.equal(riseSource.organizerId, '17188177583');

    const page1Data = {
      pagination: {
        object_count: 4,
        page_number: 1,
        page_size: 2,
        page_count: 2,
        has_more_items: true,
        continuation: 'cursor_token_page_2'
      },
      events: [
        {
          id: 'eb_show_101',
          name: { text: 'RISE Comedy Friday Night Improv Showcase', html: 'RISE Comedy Friday Night Improv Showcase' },
          start: { timezone: 'America/Denver', utc: '2026-10-09T01:00:00Z', local: '2026-10-08T19:00:00' },
          end: { timezone: 'America/Denver', utc: '2026-10-09T03:00:00Z', local: '2026-10-08T21:00:00' },
          status: 'live',
          url: 'https://www.eventbrite.com/e/rise-friday-night-improv-101',
          is_free: false,
          ticket_availability: { minimum_ticket_price: { display: '$15.00' } }
        },
        {
          id: 'eb_show_102',
          name: { text: 'RISE Comedy Late Night Stand-Up Rumble', html: 'RISE Comedy Late Night Stand-Up Rumble' },
          start: { timezone: 'America/Denver', utc: '2026-10-09T04:00:00Z', local: '2026-10-08T22:00:00' },
          end: { timezone: 'America/Denver', utc: '2026-10-09T06:00:00Z', local: '2026-10-09T00:00:00' },
          status: 'live',
          url: 'https://www.eventbrite.com/e/rise-late-night-standup-102',
          is_free: false,
          ticket_availability: { minimum_ticket_price: { display: '$12.00' } }
        }
      ]
    };

    const page2Data = {
      pagination: {
        object_count: 4,
        page_number: 2,
        page_size: 2,
        page_count: 2,
        has_more_items: false
      },
      events: [
        {
          id: 'eb_show_103',
          name: { text: 'Saturday Night Improv Extravaganza', html: 'Saturday Night Improv Extravaganza' },
          start: { timezone: 'America/Denver', utc: '2026-10-10T01:00:00Z', local: '2026-10-09T19:00:00' },
          end: { timezone: 'America/Denver', utc: '2026-10-10T03:00:00Z', local: '2026-10-09T21:00:00' },
          status: 'live',
          url: 'https://www.eventbrite.com/e/rise-saturday-night-improv-103',
          is_free: false,
          ticket_availability: { minimum_ticket_price: { display: '$20.00' } }
        },
        {
          id: 'eb_show_104',
          name: { text: 'Sunday Denver Open Mic Workshop', html: 'Sunday Denver Open Mic Workshop' },
          start: { timezone: 'America/Denver', utc: '2026-10-11T00:00:00Z', local: '2026-10-10T18:00:00' },
          end: { timezone: 'America/Denver', utc: '2026-10-11T02:00:00Z', local: '2026-10-10T20:00:00' },
          status: 'live',
          url: 'https://www.eventbrite.com/e/rise-sunday-open-mic-104',
          is_free: true
        }
      ]
    };

    const requestedUrls = [];
    const mockMultiPageFetch = async (url) => {
      requestedUrls.push(String(url));
      if (url.includes('page=1')) {
        return { ok: true, status: 200, text: async () => JSON.stringify(page1Data) };
      }
      if (url.includes('page=2') || url.includes('cursor_token_page_2')) {
        return { ok: true, status: 200, text: async () => JSON.stringify(page2Data) };
      }
      return { ok: false, status: 404, text: async () => 'Not found' };
    };

    const report = await ingestSource(riseSource, {
      fetchFn: mockMultiPageFetch,
      bypassCache: true
    });

    assert.equal(report.httpStatus, 200);
    assert.equal(report.rawCount, 4);
    assert.equal(report.confirmedCount, 4);
    assert.equal(report.events.length, 4);
    assert.equal(requestedUrls.length, 2, 'Must request both page 1 and page 2');

    const ids = report.events.map(e => e.sourceEvidence.externalEventId);
    assert.deepEqual(ids, ['eb_show_101', 'eb_show_102', 'eb_show_103', 'eb_show_104']);

    // Check open mic classification
    const openMic = report.events.find(e => e.title.includes('Open Mic'));
    assert.ok(openMic);
    assert.equal(openMic.comedy.showType, 'open_mic');
    assert.equal(openMic.price_display, 'Free');
  });

  // Test 2: Cancellations Filtered from Confirmed Feed
  test('2. cancellations (status: canceled and [CANCELLED] title) are excluded from confirmed inventory', async () => {
    const rawData = {
      pagination: { has_more_items: false },
      events: [
        {
          id: 'eb_live_201',
          name: { text: 'Confirmed Live Standup Show' },
          start: { timezone: 'America/Denver', utc: '2026-10-15T01:00:00Z' },
          status: 'live',
          url: 'https://www.eventbrite.com/e/201'
        },
        {
          id: 'eb_canceled_202',
          name: { text: 'Canceled Standup Show' },
          start: { timezone: 'America/Denver', utc: '2026-10-15T03:00:00Z' },
          status: 'canceled',
          url: 'https://www.eventbrite.com/e/202'
        },
        {
          id: 'eb_canceled_title_203',
          name: { text: '[CANCELLED] Guest Headliner Night' },
          start: { timezone: 'America/Denver', utc: '2026-10-16T01:00:00Z' },
          status: 'live', // status still says live, but title has [CANCELLED]
          url: 'https://www.eventbrite.com/e/203'
        }
      ]
    };

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(rawData)
    });

    const report = await ingestSource(riseSource, {
      fetchFn: mockFetch,
      bypassCache: true
    });

    assert.equal(report.rawCount, 3);
    assert.equal(report.confirmedCount, 1, 'Only genuine non-cancelled event should be confirmed');
    assert.equal(report.events.length, 1);
    assert.equal(report.events[0].sourceEvidence.externalEventId, 'eb_live_201');
  });

  // Test 3: Duplicate Ingestion Idempotency & GCS Snapshot Deduplication
  test('3. duplicate consecutive ingestion deduplicates snapshots in GCS and is idempotent in Supabase', async () => {
    const sharedGcsMap = new Map();
    const gcsDriver = new SharedMemoryGcsDriver(sharedGcsMap);
    const rawStorage = new GcsRawSourceStorage({ bucketName: 'brinkberry-raw-evidence-prod', driver: gcsDriver });

    const sharedDbMap = new Map();
    const dbDriver = new SharedMemoryStoreDriver(sharedDbMap);
    const canonicalStorage = new ExternalSharedCanonicalStorage({ driver: dbDriver });

    const eventbritePayload = {
      pagination: { has_more_items: false },
      events: [
        {
          id: 'eb_idem_301',
          name: { text: 'Downtown Denver Improv Rumble' },
          start: { timezone: 'America/Denver', utc: '2026-10-20T01:00:00Z' },
          status: 'live',
          url: 'https://www.eventbrite.com/e/301'
        }
      ]
    };

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(eventbritePayload)
    });

    // Run Ingestion 1
    const run1 = await ingestSource(riseSource, {
      fetchFn: mockFetch,
      bypassCache: true,
      rawStorage,
      canonicalStorage
    });
    assert.equal(run1.confirmedCount, 1);

    // Run Ingestion 2 with identical content
    const run2 = await ingestSource(riseSource, {
      fetchFn: mockFetch,
      bypassCache: true,
      rawStorage,
      canonicalStorage
    });
    assert.equal(run2.confirmedCount, 1);

    // Content hashes must be identical
    assert.equal(run1.rawSourceHash, run2.rawSourceHash);

    // Snapshot body must only be stored ONCE in GCS for this hash
    const snapshotKeys = Array.from(sharedGcsMap.keys()).filter(k => k.startsWith('raw-evidence/snapshots/src_rise_comedy_denver/'));
    assert.equal(snapshotKeys.length, 1, 'Exactly one snapshot file stored for identical payload hash');

    // Metadata records must exist for both fetch runs
    const metaKeys = Array.from(sharedGcsMap.keys()).filter(k => k.startsWith('raw-evidence/metadata/src_rise_comedy_denver/'));
    assert.equal(metaKeys.length, 2, 'Every fetch check creates a metadata audit record');

    // Canonical store contains exactly 1 unique event (no duplicates)
    const storedEvents = await canonicalStorage.queryEvents({ category: 'comedy', windowStart: '2026-01-01', windowEnd: '2027-01-01' });
    assert.equal(storedEvents.length, 1);
    assert.equal(storedEvents[0].title, 'Downtown Denver Improv Rumble');
  });

  // Test 4: Empty Results Handling
  test('4. empty organizer events list produces 0 confirmed events without fabricating dates', async () => {
    const emptyPayload = {
      pagination: { object_count: 0, has_more_items: false },
      events: []
    };

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(emptyPayload)
    });

    const report = await ingestSource(riseSource, {
      fetchFn: mockFetch,
      bypassCache: true
    });

    assert.equal(report.httpStatus, 200);
    assert.equal(report.rawCount, 0);
    assert.equal(report.confirmedCount, 0);
    assert.equal(report.events.length, 0);
    assert.equal(report.parserErrors, null);
  });

  // Test 5: Expired / Missing Credentials
  test('5. expired or missing Eventbrite credentials (HTTP 401 NO_AUTH) reports cleanly without leaking secrets', async () => {
    const sharedGcsMap = new Map();
    const gcsDriver = new SharedMemoryGcsDriver(sharedGcsMap);
    const rawStorage = new GcsRawSourceStorage({ bucketName: 'brinkberry-raw-evidence-prod', driver: gcsDriver });

    const authErrorPayload = {
      status_code: 401,
      error: 'NO_AUTH',
      error_description: 'An OAuth token is required for all requests'
    };

    const mockFetch401 = async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify(authErrorPayload)
    });

    const report = await ingestSource(riseSource, {
      fetchFn: mockFetch401,
      bypassCache: true,
      rawStorage
    });

    assert.equal(report.httpStatus, 401);
    assert.equal(report.rawCount, 0);
    assert.equal(report.confirmedCount, 0);
    assert.equal(report.events.length, 0);
    assert.ok(report.parserErrors.includes('401'));

    // GCS evidence captures the failed fetch truthfully
    const latest = await rawStorage.getLatestRawEvidence('src_rise_comedy_denver');
    assert.ok(latest);
    assert.equal(latest.httpStatus, 401);
    assert.ok(latest.parserErrors.includes('401'));
  });

  // Test 6: Changed Event Data
  test('6. changed event data produces a distinct content hash and updates the canonical record', async () => {
    const sharedGcsMap = new Map();
    const gcsDriver = new SharedMemoryGcsDriver(sharedGcsMap);
    const rawStorage = new GcsRawSourceStorage({ bucketName: 'brinkberry-raw-evidence-prod', driver: gcsDriver });

    const sharedDbMap = new Map();
    const dbDriver = new SharedMemoryStoreDriver(sharedDbMap);
    const canonicalStorage = new ExternalSharedCanonicalStorage({ driver: dbDriver });

    const v1Data = {
      pagination: { has_more_items: false },
      events: [
        {
          id: 'eb_mutable_601',
          name: { text: 'Friday Night Headliner (Early Schedule)' },
          start: { timezone: 'America/Denver', utc: '2026-10-23T01:00:00Z' },
          status: 'live',
          url: 'https://www.eventbrite.com/e/601'
        }
      ]
    };

    const v2Data = {
      pagination: { has_more_items: false },
      events: [
        {
          id: 'eb_mutable_601',
          name: { text: 'Friday Night Headliner: Special Celebrity Guest Added!' },
          start: { timezone: 'America/Denver', utc: '2026-10-23T01:30:00Z' }, // 30 min shift
          status: 'live',
          url: 'https://www.eventbrite.com/e/601'
        }
      ]
    };

    // Run 1: Initial event
    const rep1 = await ingestSource(riseSource, {
      fetchFn: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(v1Data) }),
      bypassCache: true,
      rawStorage,
      canonicalStorage
    });

    // Run 2: Changed event
    const rep2 = await ingestSource(riseSource, {
      fetchFn: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(v2Data) }),
      bypassCache: true,
      rawStorage,
      canonicalStorage
    });

    // Hashes must differ
    assert.notEqual(rep1.rawSourceHash, rep2.rawSourceHash);

    // Two distinct snapshots stored in GCS
    const snapshotKeys = Array.from(sharedGcsMap.keys()).filter(k => k.startsWith('raw-evidence/snapshots/src_rise_comedy_denver/'));
    assert.equal(snapshotKeys.length, 2, 'Two different snapshots must be created for changed content');

    // Canonical store contains updated event details
    const stored = await canonicalStorage.queryEvents({ category: 'comedy', windowStart: '2026-01-01', windowEnd: '2027-01-01' });
    assert.equal(stored.length, 1);
    assert.equal(stored[0].title, 'Friday Night Headliner: Special Celebrity Guest Added!');
    assert.equal(stored[0].start_time, '2026-10-23T01:30:00.000Z');
  });

  // Test 7: Eventbrite Provenance Integrity
  test('7. event candidate retains complete Eventbrite provenance, venueSlug, and ticketing links', async () => {
    const singleData = {
      pagination: { has_more_items: false },
      events: [
        {
          id: 'eb_prov_701',
          name: { text: 'Sunday Improv Jam at RISE' },
          start: { timezone: 'America/Denver', utc: '2026-10-25T23:00:00Z', local: '2026-10-25T17:00:00' },
          end: { timezone: 'America/Denver', utc: '2026-10-26T01:00:00Z', local: '2026-10-25T19:00:00' },
          status: 'live',
          url: 'https://www.eventbrite.com/e/sunday-improv-jam-701'
        }
      ]
    };

    const report = await ingestSource(riseSource, {
      fetchFn: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(singleData) }),
      bypassCache: true
    });

    assert.equal(report.confirmedCount, 1);
    const ev = report.events[0];

    assert.equal(ev.venue_name, 'RISE Comedy');
    assert.equal(ev.venueSlug, 'rise-comedy');
    assert.equal(ev.city, 'Denver, CO');
    assert.equal(ev.venue_latitude, 39.7538);
    assert.equal(ev.venue_longitude, -104.9942);
    assert.equal(ev.confirmationStatus, 'confirmed_by_official_calendar');
    assert.equal(ev.ticket_url, 'https://www.eventbrite.com/e/sunday-improv-jam-701');

    // Provenance
    const prov = ev.sourceEvidence;
    assert.equal(prov.platform, 'eventbrite');
    assert.equal(prov.organizerId, '17188177583');
    assert.equal(prov.externalEventId, 'eb_prov_701');
    assert.equal(prov.eventUrl, 'https://www.eventbrite.com/e/sunday-improv-jam-701');
    assert.equal(prov.parser, 'eventbrite');
    assert.equal(prov.exactConfirmationFields.title, true);
    assert.equal(prov.exactConfirmationFields.date, true);
    assert.equal(prov.exactConfirmationFields.venue, true);
    assert.equal(prov.exactConfirmationFields.url, true);
  });

  // Test 8: National Roster & The Stand Status Invariant
  test('8. The Stand NYC remains in source_unavailable status and national roster remains frozen', async () => {
    const theStandSource = OFFICIAL_SOURCES.find(s => s.id === 'src_the_stand_nyc');
    assert.ok(theStandSource, 'The Stand NYC must remain registered');

    // Simulate The Stand returning 403 Forbidden
    const standReport = await ingestSource(theStandSource, {
      fetchFn: async () => ({ ok: false, status: 403, text: async () => 'Cloudflare 403' }),
      bypassCache: true
    });

    assert.equal(standReport.httpStatus, 403);
    assert.equal(standReport.confirmedCount, 0);
    assert.equal(standReport.events.length, 0);

    // Registered official sources roster count check: only 3 registered sources
    assert.equal(OFFICIAL_SOURCES.length, 3, 'National roster must not expand beyond the 3 registered sources');
    const sourceIds = OFFICIAL_SOURCES.map(s => s.id);
    assert.deepEqual(sourceIds, ['src_rise_comedy_denver', 'src_volusia_speedway', 'src_the_stand_nyc']);
  });

});
