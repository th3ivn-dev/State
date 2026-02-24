const { isAdmin } = require('../utils');
const config = require('../config');
const logger = require('../logger').child({ module: 'rateLimit' });

/**
 * Create rate limiting middleware for grammY bot.
 * 
 * Якщо юзер перевищив ліміт — його запит тихо ігнорується.
 * Для callback_query — прибирається "годинник" через answerCallbackQuery.
 * Юзер не бачить ніяких помилок. Через windowMs лічильник скидається.
 * 
 * ВАЖЛИВО: НЕ використовувати sleep/setTimeout — це блокує обробку інших юзерів!
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
      // Тихий ігнор — для callback query прибираємо "годинник"
      logger.debug({ userId, count: valid.length, limit }, 'Rate limit exceeded, silently ignoring');
      if (ctx.callbackQuery) {
        try {
          await ctx.answerCallbackQuery();
        } catch (_e) { /* ignore */ }
      }
      // НЕ викликаємо next() — запит тихо ігнорується
      return;
    }

    valid.push(now);
    userRequests.set(userId, valid);

    return await next();
  };

  middleware.stop = () => clearInterval(cleanupInterval);
  return middleware;
}

module.exports = { createRateLimitMiddleware };
