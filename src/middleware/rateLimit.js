const logger = require('../logger').child({ module: 'rateLimit' });

/**
 * Creates a per-user sliding-window rate limiting middleware for grammY.
 * Requests that exceed the limit are delayed, not rejected.
 * Admin users bypass rate limiting entirely.
 *
 * @param {Object} options
 * @param {number} [options.limit=30] - Max requests per window per user
 * @param {number} [options.windowMs=60000] - Window size in milliseconds
 * @param {Function} [options.isAdmin] - Function(userId: string) => boolean
 * @returns {Function} grammY middleware with a `stop()` method
 */
function createRateLimitMiddleware(options = {}) {
  const { limit = 30, windowMs = 60000, isAdmin = () => false } = options;

  // Map<userId, number[]> — timestamps of recent requests
  const userTimestamps = new Map();

  // Periodic cleanup of stale entries
  const cleanupInterval = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [userId, timestamps] of userTimestamps.entries()) {
      const filtered = timestamps.filter(ts => ts > cutoff);
      if (filtered.length === 0) {
        userTimestamps.delete(userId);
      } else {
        userTimestamps.set(userId, filtered);
      }
    }
  }, windowMs);

  async function middleware(ctx, next) {
    // Pass through requests with no sender info
    if (!ctx.from) {
      return next();
    }

    const userId = String(ctx.from.id);

    // Admins bypass rate limiting
    if (isAdmin(userId)) {
      return next();
    }

    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (userTimestamps.get(userId) || []).filter(ts => ts > cutoff);

    if (timestamps.length >= limit) {
      // Delay until the oldest request falls outside the window
      const oldest = timestamps[0];
      const waitTime = oldest + windowMs - now;
      if (waitTime > 0) {
        logger.debug(`Rate limit exceeded for user ${userId}, delaying ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      // Re-compute after delay
      const afterWait = Date.now();
      const cutoff2 = afterWait - windowMs;
      const updated = (userTimestamps.get(userId) || []).filter(ts => ts > cutoff2);
      updated.push(afterWait);
      userTimestamps.set(userId, updated);
    } else {
      timestamps.push(now);
      userTimestamps.set(userId, timestamps);
    }

    return next();
  }

  /**
   * Stop the cleanup interval (call during graceful shutdown).
   */
  middleware.stop = () => {
    clearInterval(cleanupInterval);
  };

  return middleware;
}

module.exports = { createRateLimitMiddleware };
