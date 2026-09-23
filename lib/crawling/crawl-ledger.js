/**
 * lib/crawling/crawl-ledger.js
 *
 * Durable Crawl Ledger Control Plane for Bounded Recursive Discovery
 *
 * Tracks every URL traversal, attempt, rate-limit cooldown, and content hash.
 * Serves as the authoritative control plane separating crawler execution from
 * publication eligibility.
 *
 * States:
 * - queued: Discovered and waiting for scheduled execution
 * - fetching: In-flight HTTP request
 * - parsed: Clean structured events extracted
 * - no_exact_events: HTTP 200 OK, but contained zero future exact dated shows
 * - blocked_robots: Prohibited by domain robots.txt
 * - blocked_waf: Blocked by Cloudflare, anti-bot challenge, or HTTP 403
 * - unsupported: Proprietary system, unparsable client-side JS app, or invalid feed
 * - failed_retryable: Transient HTTP 5xx or network timeout
 * - stale: Crawl result exceeded freshness TTL; eligible for re-crawl
 *
 * Core Invariants:
 * 1. Unique key on normalized canonicalUrl + sourceKind.
 * 2. Never crawl the same URL before nextEligibleAt.
 * 3. Strict max traversal depth = 2.
 * 4. Per-domain rate limit delay and request budgets enforced.
 * 5. Every attempt records status, timestamp, HTTP code, contentHash.
 * 6. Non-destructive: failure never deletes prior evidence or valid events.
 * 7. "parsed" !== publishable; publication requires deterministic event validation.
 * 8. Artist-only discoveries are strictly leads, never public events.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CRAWL_STATES = {
  QUEUED: 'queued',
  FETCHING: 'fetching',
  PARSED: 'parsed',
  NO_EXACT_EVENTS: 'no_exact_events',
  BLOCKED_ROBOTS: 'blocked_robots',
  BLOCKED_WAF: 'blocked_waf',
  UNSUPPORTED: 'unsupported',
  FAILED_RETRYABLE: 'failed_retryable',
  STALE: 'stale'
};

const SOURCE_KINDS = {
  VENUE: 'venue',
  ARTIST: 'artist',
  TICKETING: 'ticketing'
};

const DEFAULT_COOLDOWNS_MS = {
  [CRAWL_STATES.PARSED]: 24 * 60 * 60 * 1000,          // 24 hours
  [CRAWL_STATES.NO_EXACT_EVENTS]: 12 * 60 * 60 * 1000, // 12 hours
  [CRAWL_STATES.BLOCKED_WAF]: 72 * 60 * 60 * 1000,     // 72 hours
  [CRAWL_STATES.BLOCKED_ROBOTS]: 72 * 60 * 60 * 1000,  // 72 hours
  [CRAWL_STATES.UNSUPPORTED]: 168 * 60 * 60 * 1000,    // 7 days
  [CRAWL_STATES.FAILED_RETRYABLE]: 15 * 60 * 1000      // 15 minutes base
};

const MAX_TRAVERSAL_DEPTH = 2;

/**
 * Normalizes a URL for deterministic identity:
 * - Lowercases scheme and hostname
 * - Strips fragments (#...)
 * - Strips trailing slashes
 * - Strips tracking query params (utm_*, fbclid, gclid, ref)
 */
function normalizeCanonicalUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Valid URL string is required.');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch (err) {
    throw new Error(`Invalid URL format "${rawUrl}": ${err.message}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol "${parsed.protocol}": only http and https are allowed.`);
  }

  parsed.hash = '';

  // Strip tracking parameters
  const trackingKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref'];
  for (const k of trackingKeys) {
    parsed.searchParams.delete(k);
  }

  let clean = parsed.toString();
  // Strip trailing slash if path is not root
  if (parsed.pathname !== '/' && clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }

  return clean;
}

/**
 * Computes deterministic unique key for a crawl target:
 * hash(sourceKind + '|' + normalizedUrl)
 */
function computeLedgerKey(canonicalUrl, sourceKind) {
  const normUrl = normalizeCanonicalUrl(canonicalUrl);
  const normKind = String(sourceKind || 'venue').toLowerCase().trim();
  const raw = `${normKind}|${normUrl}`;
  return `cl_${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24)}`;
}

/**
 * Domain Rate Limiter & Budget Manager
 */
class DomainBudgetController {
  constructor(options = {}) {
    this.rateLimitMs = options.rateLimitMs || 300; // minimum ms between requests to same domain
    this.perDomainBudget = options.perDomainBudget || 20; // max requests per cycle
    this.domainRequestCounts = new Map();
    this.lastRequestTimes = new Map();
  }

  getDomain(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch (_) {
      return 'unknown_domain';
    }
  }

  canRequest(url) {
    const domain = this.getDomain(url);
    const count = this.domainRequestCounts.get(domain) || 0;
    return count < this.perDomainBudget;
  }

  async acquireDelay(url) {
    const domain = this.getDomain(url);
    const count = this.domainRequestCounts.get(domain) || 0;
    this.domainRequestCounts.set(domain, count + 1);

    const lastTime = this.lastRequestTimes.get(domain) || 0;
    const now = Date.now();
    const elapsed = now - lastTime;

    if (elapsed < this.rateLimitMs) {
      const waitTime = this.rateLimitMs - elapsed;
      await new Promise(r => setTimeout(r, waitTime));
    }

    this.lastRequestTimes.set(domain, Date.now());
  }

  resetCycle() {
    this.domainRequestCounts.clear();
  }
}

/**
 * Durable Crawl Ledger
 */
class CrawlLedger {
  constructor(storagePath = null, options = {}) {
    this.storagePath = storagePath || path.join(os.tmpdir(), 'brinkberry_crawl_ledger.json');
    this.budgetController = new DomainBudgetController(options);
    this.records = new Map();
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          this.records.clear();
          for (const item of data) {
            this.records.set(item.id, item);
          }
        }
      }
    } catch (_) {}
  }

  save() {
    try {
      const list = Array.from(this.records.values());
      fs.writeFileSync(this.storagePath, JSON.stringify(list, null, 2), 'utf8');
    } catch (_) {}
  }

  /**
   * Registers a URL into the crawl ledger
   */
  registerUrl(params = {}) {
    const {
      canonicalUrl,
      sourceKind = SOURCE_KINDS.VENUE,
      entityId = '',
      discoveredFromType = 'manual',
      discoveredFromId = null,
      depth = 0
    } = params;

    if (!canonicalUrl) {
      throw new Error('canonicalUrl is required to register crawl target.');
    }

    if (depth > MAX_TRAVERSAL_DEPTH) {
      throw new Error(`Max traversal depth is ${MAX_TRAVERSAL_DEPTH}. Received depth ${depth}.`);
    }

    const normUrl = normalizeCanonicalUrl(canonicalUrl);
    const id = computeLedgerKey(normUrl, sourceKind);
    const nowIso = new Date().toISOString();

    if (this.records.has(id)) {
      const existing = this.records.get(id);
      // If previously recorded, keep existing history and state, but update metadata if shallower depth
      if (depth < existing.depth) {
        existing.depth = depth;
        existing.discoveredFromType = discoveredFromType;
        existing.discoveredFromId = discoveredFromId;
        existing.updatedAt = nowIso;
        this.save();
      }
      return existing;
    }

    const record = {
      id,
      canonicalUrl: normUrl,
      sourceKind,
      entityId: entityId || id,
      discoveredFromType,
      discoveredFromId,
      depth,
      status: CRAWL_STATES.QUEUED,
      lastAttemptedAt: null,
      nextEligibleAt: nowIso, // eligible immediately
      httpStatus: null,
      robotsAllowed: null,
      wafStatus: 'untested',
      contentHash: null,
      parserName: null,
      parserVersion: null,
      exactEventCount: 0,
      failureReason: null,
      retryCount: 0,
      attempts: [],
      createdAt: nowIso,
      updatedAt: nowIso
    };

    this.records.set(id, record);
    this.save();
    return record;
  }

  /**
   * Retrieves a ledger entry by ID or URL + sourceKind
   */
  getEntry(idOrUrl, sourceKind = null) {
    if (!idOrUrl) return null;
    if (this.records.has(idOrUrl)) return this.records.get(idOrUrl);
    if (sourceKind) {
      try {
        const id = computeLedgerKey(idOrUrl, sourceKind);
        return this.records.get(id) || null;
      } catch (_) {}
    }
    return null;
  }

  /**
   * Checks if an entry is eligible for crawl right now
   */
  isEligible(record, nowMs = Date.now()) {
    if (!record) return false;
    if (!record.nextEligibleAt) return true;
    const eligibleTime = Date.parse(record.nextEligibleAt);
    if (isNaN(eligibleTime)) return true;
    return nowMs >= eligibleTime;
  }

  /**
   * Acquires the next eligible batch of crawl targets respecting domain budgets
   */
  acquireNextEligibleBatch(options = {}) {
    const {
      limit = 10,
      sourceKind = null,
      maxDepth = MAX_TRAVERSAL_DEPTH,
      nowMs = Date.now()
    } = options;

    const candidates = [];
    for (const record of this.records.values()) {
      if (sourceKind && record.sourceKind !== sourceKind) continue;
      if (record.depth > maxDepth) continue;
      if (record.status === CRAWL_STATES.FETCHING) continue;
      if (!this.isEligible(record, nowMs)) continue;
      if (!this.budgetController.canRequest(record.canonicalUrl)) continue;

      candidates.push(record);
      if (candidates.length >= limit) break;
    }

    return candidates;
  }

  /**
   * Marks an entry as fetching (in-flight)
   */
  markFetching(id) {
    const record = this.records.get(id);
    if (!record) throw new Error(`Ledger entry ${id} not found.`);
    record.status = CRAWL_STATES.FETCHING;
    record.lastAttemptedAt = new Date().toISOString();
    record.updatedAt = record.lastAttemptedAt;
    this.save();
    return record;
  }

  /**
   * Records the result of a crawl attempt (non-destructive)
   */
  recordAttempt(id, result = {}) {
    const record = this.records.get(id);
    if (!record) throw new Error(`Ledger entry ${id} not found.`);

    const now = new Date();
    const nowIso = now.toISOString();

    const {
      status,
      httpStatus = null,
      robotsAllowed = null,
      wafStatus = 'clear',
      contentHash = null,
      parserName = null,
      parserVersion = null,
      exactEventCount = 0,
      failureReason = null,
      customCooldownMs = null
    } = result;

    if (!status || !Object.values(CRAWL_STATES).includes(status)) {
      throw new Error(`Invalid crawl status "${status}".`);
    }

    record.status = status;
    record.lastAttemptedAt = nowIso;
    record.httpStatus = httpStatus;
    if (robotsAllowed !== null) record.robotsAllowed = robotsAllowed;
    record.wafStatus = wafStatus;
    if (contentHash) record.contentHash = contentHash;
    if (parserName) record.parserName = parserName;
    if (parserVersion) record.parserVersion = parserVersion;
    record.exactEventCount = exactEventCount;
    record.failureReason = failureReason;

    // Retry count logic
    if (status === CRAWL_STATES.FAILED_RETRYABLE) {
      record.retryCount += 1;
    } else if (status === CRAWL_STATES.PARSED) {
      record.retryCount = 0;
    }

    // Cooldown calculation: Never crawl before nextEligibleAt
    let cooldownMs = customCooldownMs;
    if (cooldownMs == null) {
      if (status === CRAWL_STATES.FAILED_RETRYABLE) {
        // Exponential backoff: 15m * (2 ^ (retryCount - 1)), max 24h
        const expMultiplier = Math.pow(2, Math.min(record.retryCount - 1, 6));
        cooldownMs = Math.min(DEFAULT_COOLDOWNS_MS[CRAWL_STATES.FAILED_RETRYABLE] * expMultiplier, 24 * 60 * 60 * 1000);
      } else {
        cooldownMs = DEFAULT_COOLDOWNS_MS[status] || 24 * 60 * 60 * 1000;
      }
    }

    record.nextEligibleAt = new Date(now.getTime() + cooldownMs).toISOString();
    record.updatedAt = nowIso;

    // Append-only attempt log (preserves prior history)
    record.attempts.push({
      timestamp: nowIso,
      status,
      httpStatus,
      robotsAllowed,
      wafStatus,
      contentHash,
      exactEventCount,
      failureReason
    });

    this.save();
    return record;
  }

  /**
   * Resets or clears the ledger (for test isolation)
   */
  clear() {
    this.records.clear();
    this.budgetController.resetCycle();
    this.save();
  }

  /**
   * Summary diagnostics for monitoring
   */
  getDiagnostics() {
    const total = this.records.size;
    const byStatus = {};
    const byKind = {};
    let totalExactEvents = 0;

    for (const r of this.records.values()) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      byKind[r.sourceKind] = (byKind[r.sourceKind] || 0) + 1;
      totalExactEvents += (r.exactEventCount || 0);
    }

    return {
      totalEntries: total,
      byStatus,
      byKind,
      totalExactEvents,
      storagePath: this.storagePath
    };
  }
}

// Global default ledger instance
const defaultCrawlLedger = new CrawlLedger();

module.exports = {
  CrawlLedger,
  DomainBudgetController,
  defaultCrawlLedger,
  CRAWL_STATES,
  SOURCE_KINDS,
  MAX_TRAVERSAL_DEPTH,
  normalizeCanonicalUrl,
  computeLedgerKey
};
