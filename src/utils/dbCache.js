const { createLogger } = require('./logger');

const logger = createLogger('DbCache');

/**
 * Simple in-memory cache with TTL support
 * Used for frequently accessed database values that change infrequently
 */
class DbCache {
  constructor() {
    this.cache = new Map();
    this.ttls = new Map();
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or null if not found/expired
   */
  get(key) {
    const ttl = this.ttls.get(key);

    // Check if expired
    if (ttl && Date.now() > ttl) {
      this.cache.delete(key);
      this.ttls.delete(key);
      logger.debug(`Cache expired: ${key}`);
      return null;
    }

    const value = this.cache.get(key);
    if (value !== undefined) {
      logger.debug(`Cache hit: ${key}`);
      return value;
    }

    logger.debug(`Cache miss: ${key}`);
    return null;
  }

  /**
   * Set value in cache with optional TTL
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttlSeconds - Time to live in seconds (default: 60)
   */
  set(key, value, ttlSeconds = 60) {
    this.cache.set(key, value);
    this.ttls.set(key, Date.now() + (ttlSeconds * 1000));
    logger.debug(`Cache set: ${key} (TTL: ${ttlSeconds}s)`);
  }

  /**
   * Delete value from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
    this.ttls.delete(key);
    logger.debug(`Cache deleted: ${key}`);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.ttls.clear();
    logger.info(`Cache cleared: ${size} entries removed`);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Clean expired entries
   */
  cleanExpired() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, ttl] of this.ttls.entries()) {
      if (now > ttl) {
        this.cache.delete(key);
        this.ttls.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned ${cleaned} expired cache entries`);
    }

    return cleaned;
  }
}

// Create singleton instance
const dbCache = new DbCache();

// Periodically clean expired entries (every 5 minutes)
setInterval(() => {
  dbCache.cleanExpired();
}, 5 * 60 * 1000);

module.exports = dbCache;
