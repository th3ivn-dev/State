/**
 * In-memory cache for frequently accessed DB settings.
 *
 * Reduces per-request database load for hot-path reads like
 * maintenance mode, debounce minutes, and schedule intervals.
 */

const { getSetting } = require('../database/db');

const DEFAULT_TTL_MS = 30_000; // 30 seconds

class SettingsCache {
  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.cache = new Map();
    this.ttlMs = ttlMs;
  }

  async get(key, defaultValue = null) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.ts < this.ttlMs) {
      return cached.value;
    }
    const value = await getSetting(key, defaultValue);
    this.cache.set(key, { value, ts: Date.now() });
    return value;
  }

  set(key, value) {
    this.cache.set(key, { value, ts: Date.now() });
  }

  invalidate(key) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
}

module.exports = new SettingsCache();
