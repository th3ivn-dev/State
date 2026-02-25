const { Bot } = require('grammy');
const config = require('./config');
const { notifyAdminsAboutError } = require('./utils/adminNotifier');
const { applyMiddleware } = require('./middleware');
const { registerCommands } = require('./routes/commands');
const { registerCallbacks } = require('./routes/callbacks');
const { registerMessages } = require('./routes/messages');
const { registerChatMember } = require('./routes/chatMember');
const {
  pendingChannels,
  channelInstructionMessages,
  setPendingChannel,
  removePendingChannel,
  restorePendingChannels,
  stopBotCleanup,
} = require('./channels/pendingStore');
const logger = require('./logger').child({ module: 'bot' });

// Визначаємо режим роботи
const useWebhook = config.USE_WEBHOOK;

// Create bot instance
const bot = new Bot(config.botToken);
// Polling will be started in index.js via bot.start()

logger.info(`🤖 Telegram Bot ініціалізовано (режим: ${useWebhook ? 'Webhook' : 'Polling'})`);

// Compatibility for bot.options.id used in handlers
bot.options = {};
Object.defineProperty(bot.options, 'id', {
  get() { return bot.botInfo?.id; },
  set(_val) { /* ignore, grammY manages this */ }
});

// Apply middleware (hydrate, autoRetry)
applyMiddleware(bot);

// Register routes
registerCommands(bot);
registerCallbacks(bot);
registerMessages(bot);
registerChatMember(bot, { channelInstructionMessages, setPendingChannel, removePendingChannel });

// Error handling
bot.catch((err) => {
  logger.error({ err: err.error || err }, 'Помилка бота');
  notifyAdminsAboutError(bot, err.error || err, 'bot error');
});

module.exports = bot;
module.exports.pendingChannels = pendingChannels;
module.exports.channelInstructionMessages = channelInstructionMessages;
module.exports.restorePendingChannels = restorePendingChannels;
module.exports.removePendingChannel = removePendingChannel;
module.exports.useWebhook = useWebhook;
module.exports.stopBotCleanup = stopBotCleanup;
