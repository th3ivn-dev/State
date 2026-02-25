const { hydrate } = require('@grammyjs/hydrate');
const { autoRetry } = require('@grammyjs/auto-retry');
const { createRateLimitMiddleware } = require('./rateLimit');
const { isAdmin } = require('../utils');
const config = require('../config');

const rateLimitMiddleware = createRateLimitMiddleware({
  limit: 30,
  windowMs: 60000,
  isAdmin: (userId) => isAdmin(userId, config.adminIds, config.ownerId),
});

/**
 * Register middleware on the bot instance.
 * @param {import('grammy').Bot} bot
 */
function applyMiddleware(bot) {
  // Rate limiting — must be first to protect against spam
  bot.use(rateLimitMiddleware);

  // Register hydrate middleware to allow convenient message editing
  bot.use(hydrate());

  // Auto-retry on 429 (Too Many Requests) errors from Telegram API
  bot.api.config.use(autoRetry({
    maxRetryAttempts: 3,
    maxDelaySeconds: 10,
  }));
}

function stopRateLimit() {
  rateLimitMiddleware.stop();
}

module.exports = { applyMiddleware, stopRateLimit };
