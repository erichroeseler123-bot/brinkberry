/**
 * In-Memory Geospatial Tile & Time Bucket Cache
 *
 * Quantizes geographic coordinates into ~0.05° spatial tiles (~3.5 miles)
 * to maximize cache reuse for nearby searches while respecting rolling 48-hour time buckets.
 */

class GeoCache {
  constructor(options = {}) {
    this.ttlMs = options.ttlMs || 10 * 60 * 1000; // 10 minutes default
    this.maxEntries = options.maxEntries || 500;
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }

  // Quantize coordinates to ~0.05 degrees (approx 3.5 miles resolution)
  getTile(lat, lon, precision = 0.05) {
    const qLat = (Math.round(lat / precision) * precision).toFixed(2);
    const qLon = (Math.round(lon / precision) * precision).toFixed(2);
    return `${qLat}:${qLon}`;
  }

  // Quantize time window into 10-minute rolling buckets
  getTimeBucket(bucketMinutes = 10) {
    const ms = bucketMinutes * 60 * 1000;
    return Math.floor(Date.now() / ms);
  }

  getCacheKey(provider, lat, lon, radius, window, mode, category) {
    const tile = this.getTile(lat, lon);
    const timeBucket = this.getTimeBucket(10);
    const filterKey = category ? `${mode || 'all'}_${category}` : (mode || 'all');
    return `${provider}:${tile}:${radius}:${window}:${filterKey}:${timeBucket}`;
  }

  get(provider, lat, lon, radius, window, mode, category) {
    const key = this.getCacheKey(provider, lat, lon, radius, window, mode, category);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.data;
  }

  set(provider, lat, lon, radius, window, mode, data, category) {
    const key = this.getCacheKey(provider, lat, lon, radius, window, mode, category);

    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      }
    }

    this.cache.set(key, {
      data,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs
    });
  }

  clear() {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  getMetrics() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) : 0;
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: Number(hitRate.toFixed(3)),
      evictions: this.stats.evictions
    };
  }
}

const defaultGeoCache = new GeoCache();

module.exports = {
  GeoCache,
  defaultGeoCache
};
