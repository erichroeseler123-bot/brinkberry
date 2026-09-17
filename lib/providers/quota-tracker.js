/**
 * Provider Rate Limiter & Quota Tracker
 *
 * Enforces per-second/minute burst limits and daily request quotas for third-party APIs.
 * If quota is exhausted or rate limit is reached, it signals providers to fail gracefully
 * without blocking the overall user feed.
 */

const PROVIDER_LIMITS = {
  ticketmaster: {
    maxPerMinute: 300,  // Ticketmaster standard allows 5 req/sec (300/min)
    maxPerDay: 5000     // Free tier 5,000 req/day
  },
  seatgeek: {
    maxPerMinute: 600,  // SeatGeek allows generous burst
    maxPerDay: 10000
  }
};

class QuotaTracker {
  constructor() {
    this.counters = {};
  }

  _getKey(provider, type) {
    const d = new Date();
    if (type === 'minute') {
      return `${provider}:min:${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}:${d.getUTCHours()}:${d.getUTCMinutes()}`;
    }
    return `${provider}:day:${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  }

  canMakeRequest(provider) {
    const limits = PROVIDER_LIMITS[provider];
    if (!limits) return true;

    const minKey = this._getKey(provider, 'minute');
    const dayKey = this._getKey(provider, 'day');

    const minCount = this.counters[minKey] || 0;
    const dayCount = this.counters[dayKey] || 0;

    if (minCount >= limits.maxPerMinute) {
      return false;
    }
    if (dayCount >= limits.maxPerDay) {
      return false;
    }

    return true;
  }

  recordRequest(provider) {
    const minKey = this._getKey(provider, 'minute');
    const dayKey = this._getKey(provider, 'day');

    this.counters[minKey] = (this.counters[minKey] || 0) + 1;
    this.counters[dayKey] = (this.counters[dayKey] || 0) + 1;

    // Prune old keys occasionally
    if (Math.random() < 0.05) {
      this._prune();
    }
  }

  _prune() {
    const currentMin = this._getKey('', 'minute').slice(1);
    const currentDay = this._getKey('', 'day').slice(1);

    for (const key of Object.keys(this.counters)) {
      if (!key.endsWith(currentMin) && !key.endsWith(currentDay)) {
        delete this.counters[key];
      }
    }
  }

  getUsage(provider) {
    const minKey = this._getKey(provider, 'minute');
    const dayKey = this._getKey(provider, 'day');
    const limits = PROVIDER_LIMITS[provider] || { maxPerMinute: Infinity, maxPerDay: Infinity };

    return {
      minute: {
        used: this.counters[minKey] || 0,
        limit: limits.maxPerMinute
      },
      day: {
        used: this.counters[dayKey] || 0,
        limit: limits.maxPerDay
      }
    };
  }

  reset() {
    this.counters = {};
  }
}

const defaultQuotaTracker = new QuotaTracker();

module.exports = {
  QuotaTracker,
  defaultQuotaTracker,
  PROVIDER_LIMITS
};
