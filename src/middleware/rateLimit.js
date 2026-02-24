const { isAdmin } = require('../utils');
const config = require('../config');
const logger = require('../logger').child({ module: 'rateLimit' });

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
      // Тиха затримка — чекаємо windowMs і потім виконуємо нормально
      logger.debug({ userId, count: valid.length, limit }, 'Rate limit exceeded, delaying request');
      await new Promise(resolve => setTimeout(resolve, windowMs));
    }

    // Оновлюємо таймстампи після можливої затримки
    const afterDelay = Date.now();
    const refreshed = (userRequests.get(userId) || []).filter(t => afterDelay - t < windowMs);
    refreshed.push(afterDelay);
    userRequests.set(userId, refreshed);

    return await next();
  };

  middleware.stop = () => clearInterval(cleanupInterval);
  return middleware;
}

module.exports = { createRateLimitMiddleware };
