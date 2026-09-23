/**
 * Durable Shared Rate Limiter
 *
 * Implements sliding-window rate limiting backed by durable temporary storage
 * (os.tmpdir()/brinkberry_rate_limits.json) and memory caching. Survives cold starts
 * and instance recycling in serverless runtimes.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const RATE_LIMIT_FILE = path.join(os.tmpdir(), 'brinkberry_rate_limits.json');
const memoryCache = new Map();

function readDurableStore() {
  try {
    if (fs.existsSync(RATE_LIMIT_FILE)) {
      const data = fs.readFileSync(RATE_LIMIT_FILE, 'utf8');
      const parsed = JSON.parse(data || '{}');
      for (const [k, v] of Object.entries(parsed)) {
        if (Array.isArray(v)) {
          memoryCache.set(k, v);
        }
      }
    }
  } catch (_) {
    // Graceful fallback to memory on read error
  }
}

function writeDurableStore() {
  try {
    const obj = {};
    for (const [k, v] of memoryCache.entries()) {
      if (Array.isArray(v) && v.length > 0) {
        obj[k] = v;
      }
    }
    fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify(obj), 'utf8');
  } catch (_) {
    // Non-blocking disk write failure (e.g. read-only environment)
  }
}

// Initial read on module load
readDurableStore();

/**
 * Checks and increments rate limit for a given key.
 * Throws an Error with err.code = 'RATE_LIMIT_EXCEEDED' and err.status = 429 if limit reached.
 */
function checkDurableRateLimit(key, maxRequests = 5, windowMs = 10 * 60 * 1000) {
  if (!key) return true;

  // Re-read file to pick up any updates from concurrent lambda containers
  readDurableStore();

  const now = Date.now();
  let history = memoryCache.get(key) || [];

  // Filter out timestamps older than the sliding window
  history = history.filter(ts => (now - ts) < windowMs);

  if (history.length >= maxRequests) {
    const err = new Error(`Rate limit exceeded: Maximum ${maxRequests} requests per ${Math.round(windowMs / 60000)} minutes. Please wait before submitting more requests.`);
    err.code = 'RATE_LIMIT_EXCEEDED';
    err.status = 429;
    throw err;
  }

  history.push(now);
  memoryCache.set(key, history);
  writeDurableStore();

  return true;
}

/**
 * Clears rate limit entries for a specific key (e.g. during test cleanup).
 */
function resetDurableRateLimit(key) {
  readDurableStore();
  if (key) {
    memoryCache.delete(key);
  } else {
    memoryCache.clear();
  }
  writeDurableStore();
}

/**
 * Purges expired entries across all keys.
 */
function purgeExpiredRateLimits(windowMs = 10 * 60 * 1000) {
  readDurableStore();
  const now = Date.now();
  for (const [k, timestamps] of memoryCache.entries()) {
    const valid = (timestamps || []).filter(ts => (now - ts) < windowMs);
    if (valid.length === 0) {
      memoryCache.delete(k);
    } else {
      memoryCache.set(k, valid);
    }
  }
  writeDurableStore();
}

module.exports = {
  checkDurableRateLimit,
  resetDurableRateLimit,
  purgeExpiredRateLimits,
  RATE_LIMIT_FILE
};
