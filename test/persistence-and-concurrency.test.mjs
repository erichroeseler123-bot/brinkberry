import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { OFFICIAL_SOURCES, ingestSource, clearIngestionCache } = require('../lib/ingestion/engine.js');
const { SourceRefreshScheduler } = require('../lib/ingestion/scheduler.js');
const {
  LocalFileCanonicalStorage,
  ExternalSharedCanonicalStorage,
  SharedMemoryStoreDriver,
  getStorageConfiguration
} = require('../lib/storage/canonical-event-storage.js');
const {
  LocalRawSourceStorage,
  GcsRawSourceStorage,
  SharedMemoryGcsDriver,
  sanitizeRawEvidence,
  generateLifecycleMetadata
} = require('../lib/storage/raw-source-storage.js');
const { AUDIT_MILESTONE } = require('../lib/audit/coverage-auditor.js');
const cronIngestHandler = require('../api/cron-ingest.js');

describe('Production Persistence & Multi-Instance Concurrency Suite', () => {
  beforeEach(() => {
    clearIngestionCache();
  });

  const volusiaConfig = OFFICIAL_SOURCES.find(s => s.id === 'src_volusia_speedway');

  it('1. Storage configuration introspection: verifies separated stores and health without exposing secrets', () => {
    const config = getStorageConfiguration();

    // Verify separated store objects exist
    assert.ok(config.canonicalStore);
    assert.ok(config.rawEvidenceStore);
    assert.ok(config.rawEvidenceProvider);
    assert.ok(config.canonicalEventProvider);
    assert.equal(typeof config.isProductionDurable, 'boolean');

    // In local unconfigured test environment:
    assert.equal(config.canonicalStore.provider, 'local_file');
    assert.equal(config.canonicalStore.durable, false);
    assert.equal(config.rawEvidenceStore.provider, 'local_fs');
    assert.equal(config.rawEvidenceStore.durable, false);
    assert.equal(config.rawEvidenceStore.classification, 'test_and_development_only');

    // System must NEVER claim full production durability while rawEvidenceStore is local_fs
    assert.equal(config.isProductionDurable, false);

    // Asserts no secrets or sensitive credentials are leaked
    const json = JSON.stringify(config);
    assert.equal(json.includes('password'), false);
    assert.equal(json.includes('token'), false);
    assert.equal(json.includes('secret'), false);
    assert.equal(json.includes('key'), false);
  });

  it('2. Strict labeling: LocalFileCanonicalStorage is strictly test-only and never production durable', () => {
    const localStore = new LocalFileCanonicalStorage();
    assert.equal(localStore.providerName, 'local_file');
    assert.equal(localStore.classification, 'test_and_development_only');
    assert.equal(localStore.isProductionDurable, false);

    const diag = localStore.getStorageDiagnostics();
    assert.equal(diag.isProductionDurable, false);
    assert.equal(diag.adapterClassification, 'test_and_development_only');
  });

  it('3. Persistence Proof: writes 1 Rise and 1 Volusia event, queries across all dimensions from separate fresh instance', async () => {
    // Shared backend representing an external shared database (Postgres/Supabase/KV)
    const externalSharedDb = new Map();
    const sharedDriver = new SharedMemoryStoreDriver(externalSharedDb);

    // Instance A: First serverless invocation / worker
    const instanceAStore = new ExternalSharedCanonicalStorage({ driver: sharedDriver });
    assert.equal(instanceAStore.classification, 'production_durable');
    assert.equal(instanceAStore.isProductionDurable, true);

    const sampleRiseIcs = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:evt-rise-persistence-01@risecomedy.com',
      'SUMMARY:Denver Comedy Champions Showcase',
      'DTSTART:20261015T020000Z',
      'LOCATION:Rise Comedy',
      'URL:https://risecomedy.com/shows/champions-showcase',
      'DESCRIPTION:Top Denver improvisers and standups.',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const sampleVolusiaHtml = `
      <div class="event-container schedulebox" data-start-date="2026-10-24" data-track="Volusia Speedway Park">
        <p class="event-title">CLAY CLASSIC - BREAST CANCER AWARENESS NIGHT</p>
        <p class="event-series">DIRTcar UMP Modifieds</p>
        <a href="https://volusiaspeedwaypark.com/schedule/event-info/?event=4549432">Tickets</a>
      </div></div></div>
    `;

    const riseConfig = OFFICIAL_SOURCES.find(s => s.id === 'src_rise_comedy_denver');
    const mockRiseFetch = async () => ({ ok: true, status: 200, text: async () => sampleRiseIcs });
    const mockVolusiaFetch = async () => ({ ok: true, status: 200, text: async () => sampleVolusiaHtml });

    // Ingest 1 Rise event via Instance A
    const resRise = await ingestSource(riseConfig, {
      fetchFn: mockRiseFetch,
      bypassCache: true,
      canonicalStorage: instanceAStore
    });
    assert.equal(resRise.confirmedCount, 1);
    const riseId = resRise.events[0].id;
    const riseFingerprint = resRise.events[0].fingerprint || resRise.events[0].id;

    // Ingest 1 Volusia event via Instance A
    const resVolusia = await ingestSource(volusiaConfig, {
      fetchFn: mockVolusiaFetch,
      bypassCache: true,
      canonicalStorage: instanceAStore
    });
    assert.equal(resVolusia.confirmedCount, 1);
    const volusiaId = resVolusia.events[0].id;
    const volusiaFingerprint = resVolusia.events[0].fingerprint || resVolusia.events[0].id;

    // Instance B: Completely separate fresh serverless invocation (simulating cold start)
    const instanceBStore = new ExternalSharedCanonicalStorage({ driver: sharedDriver });

    // Dimension 1: Fetch by exact ID & Fingerprint
    const fetchedRise = await instanceBStore.getEventById(riseId);
    assert.ok(fetchedRise);
    assert.equal(fetchedRise.title, 'Denver Comedy Champions Showcase');
    assert.equal(fetchedRise.fingerprint, riseFingerprint);
    assert.equal(fetchedRise.category, 'comedy');
    assert.equal(fetchedRise.sourceEvidence.sourceId, 'src_rise_comedy_denver');
    assert.equal(fetchedRise.freshnessStatus, 'verified_current');
    assert.equal(fetchedRise.sourceEvidence.exactConfirmationFields.title, true);
    assert.equal(fetchedRise.sourceEvidence.exactConfirmationFields.date, true);
    assert.equal(fetchedRise.sourceEvidence.exactConfirmationFields.venue, true);
    assert.equal(fetchedRise.sourceEvidence.exactConfirmationFields.url, true);

    const fetchedVolusia = await instanceBStore.getEventById(volusiaId);
    assert.ok(fetchedVolusia);
    assert.equal(fetchedVolusia.title, 'CLAY CLASSIC - BREAST CANCER AWARENESS NIGHT');
    assert.equal(fetchedVolusia.fingerprint, volusiaFingerprint);
    assert.equal(fetchedVolusia.category, 'racing');
    assert.equal(fetchedVolusia.sourceEvidence.sourceId, 'src_volusia_speedway');
    assert.equal(fetchedVolusia.freshnessStatus, 'verified_current');
    assert.equal(fetchedVolusia.sourceEvidence.exactConfirmationFields.title, true);
    assert.equal(fetchedVolusia.sourceEvidence.exactConfirmationFields.date, true);
    assert.equal(fetchedVolusia.sourceEvidence.exactConfirmationFields.venue, true);
    assert.equal(fetchedVolusia.sourceEvidence.exactConfirmationFields.url, true);

    // Dimension 2: Category Filtering
    const comedyResults = await instanceBStore.queryEvents({
      category: 'comedy',
      windowStart: '2026-10-01T00:00:00Z',
      windowEnd: '2026-11-01T00:00:00Z'
    });
    assert.equal(comedyResults.length, 1);
    assert.equal(comedyResults[0].id, riseId);

    const racingResults = await instanceBStore.queryEvents({
      category: 'racing',
      windowStart: '2026-10-01T00:00:00Z',
      windowEnd: '2026-11-01T00:00:00Z'
    });
    assert.equal(racingResults.length, 1);
    assert.equal(racingResults[0].id, volusiaId);

    // Dimension 3: Geographic Radius Queries
    // Denver coordinates: should return Rise Comedy, exclude Volusia
    const denverRadiusResults = await instanceBStore.queryEvents({
      lat: 39.7538,
      lon: -104.9942,
      radiusMiles: 25,
      windowStart: '2026-10-01T00:00:00Z',
      windowEnd: '2026-11-01T00:00:00Z'
    });
    assert.equal(denverRadiusResults.length, 1);
    assert.equal(denverRadiusResults[0].id, riseId);

    // Florida coordinates: should return Volusia, exclude Rise Comedy
    const floridaRadiusResults = await instanceBStore.queryEvents({
      lat: 29.1868,
      lon: -81.5218,
      radiusMiles: 25,
      windowStart: '2026-10-01T00:00:00Z',
      windowEnd: '2026-11-01T00:00:00Z'
    });
    assert.equal(floridaRadiusResults.length, 1);
    assert.equal(floridaRadiusResults[0].id, volusiaId);

    // Ocean / distant coordinates: should return 0 events
    const distantResults = await instanceBStore.queryEvents({
      lat: 0.0,
      lon: 0.0,
      radiusMiles: 50,
      windowStart: '2026-10-01T00:00:00Z',
      windowEnd: '2026-11-01T00:00:00Z'
    });
    assert.equal(distantResults.length, 0);

    // Dimension 4: Planning-Window Filtering
    // Window matching only Rise (Oct 14-16)
    const riseWindowResults = await instanceBStore.queryEvents({
      windowStart: '2026-10-14T00:00:00Z',
      windowEnd: '2026-10-16T00:00:00Z'
    });
    assert.equal(riseWindowResults.length, 1);
    assert.equal(riseWindowResults[0].id, riseId);

    // Window matching only Volusia (Oct 23-25)
    const volusiaWindowResults = await instanceBStore.queryEvents({
      windowStart: '2026-10-23T00:00:00Z',
      windowEnd: '2026-10-25T00:00:00Z'
    });
    assert.equal(volusiaWindowResults.length, 1);
    assert.equal(volusiaWindowResults[0].id, volusiaId);

    // Window before both events (Sept 2026)
    const pastWindowResults = await instanceBStore.queryEvents({
      windowStart: '2026-09-01T00:00:00Z',
      windowEnd: '2026-09-30T00:00:00Z'
    });
    assert.equal(pastWindowResults.length, 0);

    // Persistence: records remain in sharedDb after invocations finish
    assert.equal(externalSharedDb.size, 2);
    assert.ok(externalSharedDb.has(riseId));
    assert.ok(externalSharedDb.has(volusiaId));
  });

  it('4. Multi-instance race test: concurrent ingestion calls produce no duplicates and deterministic record', async () => {
    const externalSharedDb = new Map();
    const sharedDriver = new SharedMemoryStoreDriver(externalSharedDb);

    const sampleRiseIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-race-test-99@risecomedy.com
SUMMARY:Concurrent Improv Showcase
DTSTART:20261010T020000Z
URL:https://risecomedy.com/shows/concurrent
END:VEVENT
END:VCALENDAR`;

    const mockFetch = async () => ({ ok: true, status: 200, text: async () => sampleRiseIcs });
    const riseConfig = OFFICIAL_SOURCES.find(s => s.id === 'src_rise_comedy_denver');

    // Simulate two concurrent serverless invocations executing refresh simultaneously
    const schedulerInstance1 = new SourceRefreshScheduler({
      canonicalStorage: new ExternalSharedCanonicalStorage({ driver: sharedDriver }),
      sources: [riseConfig]
    });
    const schedulerInstance2 = new SourceRefreshScheduler({
      canonicalStorage: new ExternalSharedCanonicalStorage({ driver: sharedDriver }),
      sources: [riseConfig]
    });

    // Execute concurrently
    const [result1, result2] = await Promise.all([
      schedulerInstance1.refreshSource(riseConfig.id, { fetchFn: mockFetch, force: true }),
      schedulerInstance2.refreshSource(riseConfig.id, { fetchFn: mockFetch, force: true })
    ]);

    assert.equal(result1.status, 'ok');
    assert.equal(result2.status, 'ok');
    assert.equal(result1.rawSourceHash, result2.rawSourceHash);

    // Verify no duplicates in the external shared database
    const allStored = Array.from(externalSharedDb.values());
    assert.equal(allStored.length, 1);
    assert.equal(allStored[0].title, 'Concurrent Improv Showcase');
    assert.ok(allStored[0].fingerprint);
  });

  it('5. Security: /api/cron-ingest rejects query-string tokens and unauthenticated requests', async () => {
    function createMockReqRes(options = {}) {
      const req = {
        method: options.method || 'GET',
        url: options.url || '/api/cron-ingest',
        headers: options.headers || {}
      };
      let statusCode = 200;
      let body = null;
      const res = {
        status(c) { statusCode = c; return this; },
        setHeader() { return this; },
        json(d) { body = d; return this; }
      };
      return { req, res, getStatus: () => statusCode, getBody: () => body };
    }

    const testSecret = 'brinkberry_cron_secret_2026';
    const oldSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = testSecret;

    try {
      // 5a. Unauthenticated request without headers
      const { req: r1, res: s1, getStatus: status1 } = createMockReqRes({
        url: '/api/cron-ingest'
      });
      await cronIngestHandler(r1, s1);
      assert.equal(status1(), 401);

      // 5b. Query-string token (?token=...) MUST be rejected
      const { req: r2, res: s2, getStatus: status2 } = createMockReqRes({
        url: `/api/cron-ingest?token=${testSecret}`
      });
      await cronIngestHandler(r2, s2);
      assert.equal(status2(), 401);

      // 5c. Query-string secret (?secret=...) MUST be rejected
      const { req: r3, res: s3, getStatus: status3 } = createMockReqRes({
        url: `/api/cron-ingest?secret=${testSecret}`
      });
      await cronIngestHandler(r3, s3);
      assert.equal(status3(), 401);

      // 5d. Query-string key (?key=...) MUST be rejected
      const { req: r4, res: s4, getStatus: status4 } = createMockReqRes({
        url: `/api/cron-ingest?key=${testSecret}`
      });
      await cronIngestHandler(r4, s4);
      assert.equal(status4(), 401);
    } finally {
      if (oldSecret !== undefined) {
        process.env.CRON_SECRET = oldSecret;
      } else {
        delete process.env.CRON_SECRET;
      }
    }
  });

  it('6. Cron ingestion job performs and awaits complete refresh with Authorization: Bearer', async () => {
    const testSecret = 'brinkberry_cron_secret_2026';
    const oldSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = testSecret;

    try {
      function createMockReqRes() {
        const req = {
          method: 'POST',
          url: '/api/cron-ingest?force=true',
          headers: {
            authorization: `Bearer ${testSecret}`
          }
        };
        let statusCode = 200;
        let body = null;
        const res = {
          status(c) { statusCode = c; return this; },
          setHeader() { return this; },
          json(d) { body = d; return this; }
        };
        return { req, res, getStatus: () => statusCode, getBody: () => body };
      }

      const { req, res, getStatus, getBody } = createMockReqRes();
      const startTime = Date.now();
      await cronIngestHandler(req, res);
      const durationMs = Date.now() - startTime;

      assert.equal(getStatus(), 200);
      const body = getBody();
      assert.equal(body.success, true);
      assert.equal(body.milestone, AUDIT_MILESTONE);
      assert.ok(body.storage);
      assert.equal(typeof body.storage.isProductionDurable, 'boolean');
      assert.ok(Array.isArray(body.reports));
      assert.equal(body.reports.length, 3);
      assert.ok(durationMs >= 0);
    } finally {
      if (oldSecret !== undefined) {
        process.env.CRON_SECRET = oldSecret;
      } else {
        delete process.env.CRON_SECRET;
      }
    }
  });

  it('7. Milestone status strictly matches required validation in progress wording', () => {
    assert.equal(
      AUDIT_MILESTONE,
      'Dynamic official-source ingestion pilot deployed; verified inventory expansion in progress.'
    );
  });

  it('8. GCS Raw Evidence Storage: content-hash deduplication, per-fetch metadata, sanitization, and read-after-write verification', async () => {
    const sharedGcsStore = new Map();
    const gcsDriver = new SharedMemoryGcsDriver(sharedGcsStore);

    // Instance A: Worker/Serverless Invocation 1 writing to remote GCS
    const instanceA = new GcsRawSourceStorage({
      driver: gcsDriver,
      bucketName: 'brinkberry-raw-evidence-prod'
    });

    assert.equal(instanceA.providerName, 'gcs');
    assert.equal(instanceA.classification, 'production_raw_archive');
    assert.equal(instanceA.isProductionDurable, true);

    const sampleIcsV1 = 'BEGIN:VCALENDAR\nSUMMARY:Test Show 1\nEND:VCALENDAR';
    const sampleIcsV2 = 'BEGIN:VCALENDAR\nSUMMARY:Test Show 2 Updated\nEND:VCALENDAR';

    // 8a. First fetch of source
    const saveRes1 = await instanceA.saveRawEvidence({
      sourceId: 'src_rise_comedy_denver',
      fetchedAt: '2026-10-01T10:00:00.000Z',
      httpStatus: 200,
      parserName: 'ics',
      parserVersion: '1.0.0',
      rawResponse: sampleIcsV1,
      headers: {
        'content-type': 'text/calendar',
        'cookie': 'session_id=secret123',
        'authorization': 'Bearer confidential_api_token'
      }
    });

    assert.equal(saveRes1.success, true);
    assert.equal(saveRes1.storageType, 'gcs');
    assert.equal(saveRes1.isNewSnapshot, true);
    const hash1 = saveRes1.contentHash;

    // 8b. Second fetch with identical content (unchanged hash) -> content-hash deduplication
    const saveRes2 = await instanceA.saveRawEvidence({
      sourceId: 'src_rise_comedy_denver',
      fetchedAt: '2026-10-01T11:00:00.000Z',
      httpStatus: 200,
      contentHash: hash1,
      parserName: 'ics',
      parserVersion: '1.0.0',
      rawResponse: sampleIcsV1
    });

    assert.equal(saveRes2.success, true);
    assert.equal(saveRes2.isNewSnapshot, false); // Deduplicated!

    // Verify snapshot objects vs metadata objects in GCS store
    const allObjects = Array.from(sharedGcsStore.keys());
    const snapshotObjects = allObjects.filter(k => k.startsWith('raw-evidence/snapshots/'));
    const metadataObjects = allObjects.filter(k => k.startsWith('raw-evidence/metadata/'));

    // EXACTLY 1 snapshot stored for hash1 (deduplicated!), but 2 metadata records (one for each fetch)
    assert.equal(snapshotObjects.length, 1);
    assert.equal(metadataObjects.length, 2);

    // 8c. Third fetch with changed content -> creates new snapshot
    const saveRes3 = await instanceA.saveRawEvidence({
      sourceId: 'src_rise_comedy_denver',
      fetchedAt: '2026-10-01T12:00:00.000Z',
      httpStatus: 200,
      parserName: 'ics',
      parserVersion: '1.0.0',
      rawResponse: sampleIcsV2
    });

    assert.equal(saveRes3.success, true);
    assert.equal(saveRes3.isNewSnapshot, true);
    const hash2 = saveRes3.contentHash;
    assert.notEqual(hash1, hash2);

    const snapshotObjectsAfter = Array.from(sharedGcsStore.keys()).filter(k => k.startsWith('raw-evidence/snapshots/'));
    assert.equal(snapshotObjectsAfter.length, 2);

    // 8d. Per-fetch metadata inspection & Lifecycle policy
    const latestMetaKey = Array.from(sharedGcsStore.keys())
      .filter(k => k.startsWith('raw-evidence/metadata/src_rise_comedy_denver/'))
      .sort()
      .pop();
    const metaRecord = JSON.parse(sharedGcsStore.get(latestMetaKey).body);

    assert.equal(metaRecord.sourceId, 'src_rise_comedy_denver');
    assert.equal(metaRecord.httpStatus, 200);
    assert.equal(metaRecord.rawSourceHash, hash2);
    assert.equal(metaRecord.parserName, 'ics');
    assert.equal(metaRecord.parserVersion, '1.0.0');
    assert.equal(metaRecord.sanitized, true);
    assert.ok(metaRecord.lifecycle);
    assert.equal(metaRecord.lifecycle.retentionDays, 90);
    assert.equal(metaRecord.lifecycle.tier, 'standard');
    assert.ok(metaRecord.lifecycle.purgeAfter);

    // 8e. Sanitization verification: cookies, authorization headers, and passwords stripped
    const firstMetaKey = Array.from(sharedGcsStore.keys())
      .filter(k => k.startsWith('raw-evidence/metadata/src_rise_comedy_denver/'))
      .sort()[0];
    const firstMeta = JSON.parse(sharedGcsStore.get(firstMetaKey).body);
    const firstSnapshot = JSON.parse(sharedGcsStore.get(`raw-evidence/snapshots/src_rise_comedy_denver/${hash1}.json`).body);

    assert.equal(firstMeta.headers?.cookie, undefined);
    assert.equal(firstMeta.headers?.authorization, undefined);
    assert.equal(firstSnapshot.rawResponse.includes('session_id'), false);

    // 8f. Read-After-Write Verification from Separate Isolated Invocation
    const instanceB = new GcsRawSourceStorage({
      driver: gcsDriver,
      bucketName: 'brinkberry-raw-evidence-prod'
    });

    const latestEvidenceB = await instanceB.getLatestRawEvidence('src_rise_comedy_denver');
    assert.ok(latestEvidenceB);
    assert.equal(latestEvidenceB.sourceId, 'src_rise_comedy_denver');
    assert.equal(latestEvidenceB.contentHash, hash2);
    assert.equal(latestEvidenceB.rawResponse, sampleIcsV2);

    const snapshot1B = await instanceB.getSnapshotByHash('src_rise_comedy_denver', hash1);
    assert.ok(snapshot1B);
    assert.equal(snapshot1B.contentHash, hash1);
    assert.equal(snapshot1B.rawResponse, sampleIcsV1);

    // 8g. Diagnostics separation: when GCS driver is active, raw evidence store reports durable: true
    const gcsDiag = instanceB.getStorageDiagnostics();
    assert.equal(gcsDiag.rawEvidenceProvider, 'gcs');
    assert.equal(gcsDiag.adapterClassification, 'production_raw_archive');
    assert.equal(gcsDiag.isProductionDurable, true);
    assert.equal(gcsDiag.bucketName, 'brinkberry-raw-evidence-prod');
  });
});
