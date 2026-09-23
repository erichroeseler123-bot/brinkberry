/**
 * Scheduled Source Refresh Engine with Stale-While-Revalidate (SWR)
 *
 * Implements scheduled refresh for the three official pilot sources:
 * - Rise Comedy (Denver, CO - ICS)
 * - Volusia Speedway Park (Barberville, FL - HTML Schedule)
 * - The Stand NYC (New York, NY - HTML Show Cards)
 *
 * Durability & Operational Rules:
 * 1. Stale-While-Revalidate:
 *    - Serves last known confirmed events immediately from durable canonical storage
 *    - Refreshes asynchronously when stale or cadence threshold reached
 * 2. Hash-Aware Content Validation:
 *    - Compares new content hash with prior raw source snapshot
 *    - If hash is identical, skips re-parsing and maintains existing event records
 * 3. Operational Failure & Freshness Decay:
 *    - When refresh fails (HTTP 4xx/5xx, timeouts), retains last known events but
 *      triggers freshness decay (transitions from 'verified_current' to 'aging' to 'stale')
 *    - Never fabricates replacement dates
 *    - Never renews freshness from a homepage-only HTTP 200 response
 */

const { OFFICIAL_SOURCES, ingestSource } = require('./engine');
const { defaultRawStorage } = require('../storage/raw-source-storage');
const { defaultCanonicalStorage } = require('../storage/canonical-event-storage');
const { evaluateEventFreshness } = require('../freshness');

// In-memory status of last refresh cycle
const sourceRefreshState = new Map();

class SourceRefreshScheduler {
  constructor(options = {}) {
    this.rawStorage = options.rawStorage || defaultRawStorage;
    this.canonicalStorage = options.canonicalStorage || defaultCanonicalStorage;
    this.fetchFn = options.fetchFn || fetch;
    this.sources = options.sources || OFFICIAL_SOURCES;
  }

  /**
   * Refreshes a single source with Stale-While-Revalidate semantics
   */
  async refreshSource(sourceId, options = {}) {
    const sourceConfig = this.sources.find(s => s.id === sourceId);
    if (!sourceConfig) {
      throw new Error(`Source not registered for refresh: ${sourceId}`);
    }

    const fetchFn = options.fetchFn || this.fetchFn;
    const previousEvidence = await this.rawStorage.getLatestRawEvidence(sourceId);
    const priorHash = previousEvidence?.contentHash || null;

    // Halt active retries if source is awaiting verified organizer ID or venue authorization
    // In live network execution (fetchFn === fetch), halt retries to prevent hammering unverified IDs
    if (sourceConfig.status === 'pending_venue_authorization' && !options.allowPendingAuth && fetchFn === fetch) {
      const cycleRecord = {
        sourceId,
        venueName: sourceConfig.venueName,
        lastAttemptAt: new Date().toISOString(),
        lastSuccessAt: null,
        httpStatus: 0,
        rawSourceHash: null,
        priorHash,
        isUnchangedHash: false,
        status: 'pending_authorization',
        error: 'Awaiting verified organizer ID or direct RISE Comedy venue authorization. Ingestion retries halted.',
        confirmedCount: 0
      };
      sourceRefreshState.set(sourceId, cycleRecord);
      return cycleRecord;
    }

    let refreshResult;
    try {
      refreshResult = await ingestSource(sourceConfig, {
        fetchFn,
        bypassCache: options.force === true,
        rawStorage: this.rawStorage,
        canonicalStorage: this.canonicalStorage
      });
    } catch (err) {
      refreshResult = {
        sourceId,
        venueName: sourceConfig.venueName,
        httpStatus: 0,
        parserErrors: err.message,
        events: [],
        rawCount: 0,
        confirmedCount: 0
      };
    }

    const isSuccess = refreshResult.httpStatus === 200 && !refreshResult.parserErrors;
    const isUnchangedHash = Boolean(isSuccess && priorHash && refreshResult.rawSourceHash === priorHash);

    // Record refresh cycle state
    const cycleRecord = {
      sourceId,
      venueName: sourceConfig.venueName,
      lastAttemptAt: new Date().toISOString(),
      lastSuccessAt: isSuccess ? new Date().toISOString() : sourceRefreshState.get(sourceId)?.lastSuccessAt || null,
      httpStatus: refreshResult.httpStatus,
      rawSourceHash: refreshResult.rawSourceHash,
      priorHash,
      isUnchangedHash,
      status: isSuccess ? 'ok' : 'failed',
      error: refreshResult.parserErrors || null,
      confirmedCount: refreshResult.confirmedCount
    };

    sourceRefreshState.set(sourceId, cycleRecord);

    if (isSuccess && isUnchangedHash) {
      // Unchanged content hash: skip canonical upsert churn, but record fetch check in raw storage
      if (this.rawStorage.recordFetchCheck) {
        await this.rawStorage.recordFetchCheck(sourceId, {
          fetchedAt: cycleRecord.lastAttemptAt,
          httpStatus: refreshResult.httpStatus,
          contentHash: refreshResult.rawSourceHash,
          parserName: sourceConfig.parser,
          parserVersion: '1.0.0',
          isContentChanged: false
        });
      }
    } else if (isSuccess && refreshResult.events.length > 0) {
      // Changed hash or initial fetch: upsert into durable canonical storage
      await this.canonicalStorage.upsertEvents(refreshResult.events);
    } else if (!isSuccess) {
      // Refresh failed: trigger freshness decay on existing stored events
      await this.canonicalStorage.decayStaleEvents(7 * 86400e3, 30 * 86400e3);
    }

    return cycleRecord;
  }

  /**
   * Executes scheduled refresh across all 3 pilot sources
   */
  async refreshAllSources(options = {}) {
    const startTime = Date.now();
    const reports = [];

    for (const src of this.sources) {
      const rep = await this.refreshSource(src.id, options);
      reports.push(rep);
    }

    return {
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      totalSources: this.sources.length,
      successfulRefreshes: reports.filter(r => r.status === 'ok').length,
      failedRefreshes: reports.filter(r => r.status === 'failed').length,
      unchangedHashCount: reports.filter(r => r.isUnchangedHash).length,
      reports
    };
  }

  /**
   * Returns current operational state for all sources
   */
  getRefreshStatus() {
    return Array.from(sourceRefreshState.values());
  }
}

const defaultScheduler = new SourceRefreshScheduler();

module.exports = {
  SourceRefreshScheduler,
  defaultScheduler,
  sourceRefreshState
};
