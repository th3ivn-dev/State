const { Bot } = require('grammy');
const { hydrate } = require('@grammyjs/hydrate');
const { autoRetry } = require('@grammyjs/auto-retry');
const { apiThrottler } = require('@grammyjs/transformer-throttler');
const { hydrateReply, parseMode } = require('@grammyjs/parse-mode');
const { limit } = require('@grammyjs/ratelimiter');
const config = require('./config');
const { pendingChannels, removePendingChannel, restorePendingChannels } = require('./state/pendingChannels');

// Import middleware
const { maintenanceMiddleware, autoDeleteCommandsMiddleware } = require('./middleware');

// Import handlers
const { handleStart } = require('./handlers/start');
const { handleSchedule, handleNext, handleTimer } = require('./handlers/schedule');
const { handleSettings, handleIpConversation } = require('./handlers/settings');
const {
  handleAdmin,
  handleStats,
  handleSystem,
  handleBroadcast,
  handleSetInterval,
  handleSetDebounce,
  handleGetDebounce,
  handleMonitoring,
  handleSetAlertChannel,
  handleAdminReply,
  handleAdminRouterIpConversation,
  handleAdminSupportUrlConversation,
  handleMaintenanceConversation
} = require('./handlers/admin');
const {
  handleChannel,
  handleConversation,
  handleCancelChannel
} = require('./handlers/channel');
const { handleFeedbackMessage, getSupportButton } = require('./handlers/feedback');
const { handleRegionRequestMessage } = require('./handlers/regionRequest');
const { createCallbackRouter } = require('./handlers/callbackRoutes');
const { handleChatMember } = require('./handlers/chatMember');
const { safeAnswerCallbackQuery } = require('./utils/errorHandler');
const { notifyAdminsAboutError } = require('./utils/adminNotifier');
const { startBotCleanup, stopBotCleanup } = require('./utils/cleanup');

// Store channel instruction message IDs (для видалення старих інструкцій)
const channelInstructionMessages = new Map();

// Автоочистка застарілих записів з pendingChannels та channelInstructionMessages (кожну годину)
const botCleanupInterval = startBotCleanup(channelInstructionMessages);

// Create bot instance
const bot = new Bot(config.botToken);

console.log('🤖 Telegram Bot ініціалізовано (режим: Webhook)');

// Register hydrate middleware to allow convenient message editing (msg.editText(), msg.delete(), etc.)
bot.use(hydrate());
bot.use(hydrateReply);

// === API Transformers (order: throttle → retry → parseMode) ===
const throttler = apiThrottler();
bot.api.config.use(throttler);

// Auto-retry on 429 (Too Many Requests) errors from Telegram API
bot.api.config.use(autoRetry({
  maxRetryAttempts: 5,
  maxDelaySeconds: 30,
  rethrowInternalServerErrors: false,
}));

bot.api.config.use(parseMode('HTML'));

// Compatibility for bot.options.id used in handlers
bot.options = {};
Object.defineProperty(bot.options, 'id', {
  get() { return bot.botInfo?.id; },
  set(_val) { /* ignore, grammY manages this */ }
});

// Maintenance mode middleware — blocks non-admin users when maintenance is active
bot.use(maintenanceMiddleware());

// Rate limit user requests to prevent spam
bot.use(limit({
  timeFrame: 2000,
  limit: 3,
  onLimitExceeded: async (ctx) => {
    try {
      await ctx.reply('⏳ Занадто багато запитів. Зачекайте кілька секунд.');
    } catch (_e) {
      // Ignore errors when notifying about rate limit
    }
  },
  keyGenerator: (ctx) => ctx.from?.id?.toString(),
}));

// Auto-delete user commands middleware
bot.use(autoDeleteCommandsMiddleware(bot));

// Command handlers
bot.command('start', (ctx) => handleStart(bot, ctx.message));
bot.command('schedule', (ctx) => handleSchedule(bot, ctx.message));
bot.command('next', (ctx) => handleNext(bot, ctx.message));
bot.command('timer', (ctx) => handleTimer(bot, ctx.message));
bot.command('settings', (ctx) => handleSettings(bot, ctx.message));
bot.command('channel', (ctx) => handleChannel(bot, ctx.message));
bot.command('cancel', (ctx) => handleCancelChannel(bot, ctx.message));
bot.command('admin', (ctx) => handleAdmin(bot, ctx.message));
bot.command('stats', (ctx) => handleStats(bot, ctx.message));
bot.command('system', (ctx) => handleSystem(bot, ctx.message));
bot.command('monitoring', (ctx) => handleMonitoring(bot, ctx.message));
bot.command('setalertchannel', (ctx) => {
  const match = [null, ctx.match];
  handleSetAlertChannel(bot, ctx.message, match);
});
bot.command('broadcast', (ctx) => {
  const match = [null, ctx.match];
  handleBroadcast(bot, ctx.message, match);
});
bot.command('setinterval', (ctx) => {
  const match = [null, ctx.match];
  handleSetInterval(bot, ctx.message, match);
});
bot.command('setdebounce', (ctx) => {
  const match = [null, ctx.match];
  handleSetDebounce(bot, ctx.message, match);
});
bot.command('getdebounce', (ctx) => handleGetDebounce(bot, ctx.message));

// Handle text button presses from main menu
bot.on('message', async (ctx) => {
  const msg = ctx.message;
  const chatId = msg.chat.id;
  const text = msg.text;

  // Handle text commands first (if text is present and starts with /)
  if (text && text.startsWith('/')) {
    // List of known commands
    const knownCommands = [
      '/start', '/schedule', '/next', '/timer', '/settings',
      '/channel', '/cancel', '/admin', '/stats', '/system',
      '/monitoring', '/setalertchannel',
      '/broadcast', '/setinterval', '/setdebounce', '/getdebounce'
    ];

    // Extract command without parameters
    const command = text.split(' ')[0].toLowerCase();

    // If it's not a known command, show error
    if (!knownCommands.includes(command)) {
      await bot.api.sendMessage(
        chatId,
        '❓ Команда не розпізнана.\n\nОберіть дію:',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '⤴ Меню', callback_data: 'back_to_main' }],
              [{ text: '📢 Новини', url: 'https://t.me/Voltyk_news' }],
              [{ text: '💬 Обговорення', url: 'https://t.me/voltyk_chat' }]
            ]
          }
        }
      );
    }
    return;
  }

  try {
    // Main menu buttons are now handled via inline keyboard callbacks
    // Keeping only conversation handlers for IP setup, channel setup, feedback, and region requests

    // Handle admin ticket replies first (before other handlers)
    const adminReplyHandled = await handleAdminReply(bot, msg);
    if (adminReplyHandled) return;

    // Try maintenance message conversation
    const maintenanceHandled = await handleMaintenanceConversation(bot, msg);
    if (maintenanceHandled) return;

    // Try feedback conversation first (handles text, photo, video)
    const feedbackHandled = await handleFeedbackMessage(bot, msg);
    if (feedbackHandled) return;

    // Try region request conversation (handles text only)
    const regionRequestHandled = await handleRegionRequestMessage(bot, msg);
    if (regionRequestHandled) return;

    // Try IP setup conversation (handles text only)
    const ipHandled = await handleIpConversation(bot, msg);
    if (ipHandled) return;

    // Try admin router IP setup conversation (handles text only)
    const adminRouterIpHandled = await handleAdminRouterIpConversation(bot, msg);
    if (adminRouterIpHandled) return;

    // Try admin support URL conversation (handles text only)
    const adminSupportUrlHandled = await handleAdminSupportUrlConversation(bot, msg);
    if (adminSupportUrlHandled) return;

    // Handle channel conversation (handles text only)
    const channelHandled = await handleConversation(bot, msg);
    if (channelHandled) return;

    // If message was not handled by any conversation - show fallback message (only for text)
    if (text) {
      const supportButton = await getSupportButton();
      await bot.api.sendMessage(
        chatId,
        '❓ Команда не розпізнана.\n\nОберіть дію:',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '⤴ Меню', callback_data: 'back_to_main' }],
              [supportButton]
            ]
          }
        }
      );
    }

  } catch (error) {
    console.error('Помилка обробки повідомлення:', error);
    notifyAdminsAboutError(bot, error, 'message handler');
  }
});

// Create callback router
const callbackRouter = createCallbackRouter();

// Handle callback queries
bot.on('callback_query:data', async (ctx) => {
  const query = ctx.callbackQuery;
  const data = query.data;

  try {
    const handled = await callbackRouter.route(data, bot, query, data);

    if (!handled) {
      // Default: just acknowledge unknown callbacks
      await bot.api.answerCallbackQuery(query.id);
    }
  } catch (error) {
    console.error('Помилка обробки callback query:', error);
    notifyAdminsAboutError(bot, error, `callback_query: ${data}`);
    await safeAnswerCallbackQuery(bot, query.id, {
      text: '❌ Виникла помилка',
      show_alert: false
    });
  }
});

// Error handling
bot.catch((err) => {
  console.error('Помилка бота:', err.message || err);
  notifyAdminsAboutError(bot, err.error || err, 'bot error');
});

// Handle my_chat_member events for auto-connecting channels
bot.on('my_chat_member', handleChatMember(bot, channelInstructionMessages));

module.exports = bot;
module.exports.pendingChannels = pendingChannels;
module.exports.channelInstructionMessages = channelInstructionMessages;
module.exports.restorePendingChannels = restorePendingChannels;
module.exports.removePendingChannel = removePendingChannel;
module.exports.stopBotCleanup = function() {
  stopBotCleanup(botCleanupInterval);
};
