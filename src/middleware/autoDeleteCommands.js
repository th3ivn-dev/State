const usersDb = require('../database/users');
const { safeDeleteMessage } = require('../utils/errorHandler');

// In-memory cache for auto_delete_commands setting per user
// Key: telegramId (string), Value: { enabled: boolean, ts: number }
const settingsCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Periodic cleanup to prevent unbounded growth (runs every 10 minutes)
// Entries are removed only after 2× TTL so a slightly-stale entry is never
// evicted mid-window by the cleanup timer, avoiding a thundering-herd of DB
// lookups when many users are active simultaneously.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of settingsCache) {
    if (now - entry.ts > CACHE_TTL_MS * 2) {
      settingsCache.delete(key);
    }
  }
}, 10 * 60 * 1000).unref();

function autoDeleteCommandsMiddleware(bot) {
  return async (ctx, next) => {
    await next();
    // After processing: if it's a command message and user has auto_delete_commands enabled, delete it
    if (ctx.message?.text?.startsWith('/') && ctx.from) {
      try {
        const telegramId = String(ctx.from.id);
        const now = Date.now();
        let cached = settingsCache.get(telegramId);

        if (!cached || now - cached.ts > CACHE_TTL_MS) {
          const user = await usersDb.getUserByTelegramId(telegramId);
          cached = { enabled: !!user?.auto_delete_commands, ts: now };
          settingsCache.set(telegramId, cached);
        }

        if (cached.enabled) {
          await safeDeleteMessage(bot, ctx.message.chat.id, ctx.message.message_id);
        }
      } catch (_e) {
        // Non-critical, ignore errors
      }
    }
  };
}

/**
 * Invalidate cache for a specific user (call when they toggle the setting)
 * @param {string} telegramId
 */
function invalidateAutoDeleteCache(telegramId) {
  settingsCache.delete(String(telegramId));
}

module.exports = { autoDeleteCommandsMiddleware, invalidateAutoDeleteCache };
