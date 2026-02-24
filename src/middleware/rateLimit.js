const { isAdmin } = require('../utils');
const config = require('../config');
const logger = require('../logger').child({ module: 'rateLimit' });

/**
 * Create rate limiting middleware for grammY bot.
 * 
 * Якщо юзер перевищив ліміт — його запит затримується рівно на стільки,
 * скільки потрібно щоб один слот звільнився, а потім виконується нормально.
 * Юзер не бачить ніяких помилок — просто трохи повільніша відповідь.
 * 
 * @param {Object} options
 * @param {number} options.limit - Максимум запитів у вікні (default: 10)
 * @param {number} options.windowMs - Розмір вікна в мс (default: 5000)
 */
function createRateLimitMiddleware(options = {}) {
  const {
    limit = 10,
    windowMs = 5000,
  } = options;

  const userRequests = new Map(); // userId -> [timestamps]

  // Автоочистка старих записів кожні 60 секунд
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamps] of userRequests.entries()) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) {
        userRequests.delete(userId);
      } else {
        userRequests.set(userId, valid);
      }
    }
  }, 60000);

  // Prevent cleanup interval from keeping the process alive
  if (cleanupInterval.unref) cleanupInterval.unref();

  const middleware = async (ctx, next) => {
    const userId = String(ctx.from?.id);
    if (!userId || !ctx.from) {
      return await next();
    }

    // Адміни без обмежень
    if (isAdmin(userId, config.adminIds, config.ownerId)) {
      return await next();
    }

    const now = Date.now();
    const timestamps = userRequests.get(userId) || [];
    const valid = timestamps.filter(t => now - t < windowMs);

    if (valid.length >= limit) {
      // Розумна затримка: чекаємо поки найстаріший таймстамп у вікні протухне
      // valid відсортовано за зростанням, тому valid[0] — найстаріший
      const oldestTimestamp = valid[0];
      const waitTime = (oldestTimestamp + windowMs) - now;

      if (waitTime > 0) {
        logger.debug({ userId, waitMs: waitTime, count: valid.length, limit }, 'Rate limit exceeded, delaying request');
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // Після можливої затримки — додаємо поточний таймстамп
    const afterWait = Date.now();
    const refreshed = (userRequests.get(userId) || []).filter(t => afterWait - t < windowMs);
    refreshed.push(afterWait);
    userRequests.set(userId, refreshed);

    return await next();
  };

  middleware.stop = () => clearInterval(cleanupInterval);
  return middleware;
}

module.exports = { createRateLimitMiddleware };
