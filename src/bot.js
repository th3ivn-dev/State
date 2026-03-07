const { Bot } = require('grammy');
const { hydrate } = require('@grammyjs/hydrate');
const { autoRetry } = require('@grammyjs/auto-retry');
const config = require('./config');
const { pendingChannels, removePendingChannel, restorePendingChannels } = require('./state/pendingChannels');

// Import middleware
const { maintenanceMiddleware, autoDeleteCommandsMiddleware } = require('./middleware');

// Import handlers
const { handleStart, handleWizardCallback } = require('./handlers/start');
const { handleSchedule, handleNext, handleTimer } = require('./handlers/schedule');
const { handleSettings, handleSettingsCallback, handleIpConversation } = require('./handlers/settings');
const {
  handleAdmin,
  handleAdminCallback,
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
  handleChannelCallback,
  handleCancelChannel
} = require('./handlers/channel');
const { handleFeedbackCallback, handleFeedbackMessage, getSupportButton } = require('./handlers/feedback');
const { handleRegionRequestCallback, handleRegionRequestMessage } = require('./handlers/regionRequest');
const {
  handleMenuSchedule,
  handleMenuTimer,
  handleMenuStats,
  handleMenuHelp,
  handleMenuSettings,
  handleBackToMain,
  handleHelpHowto,
  handleHelpFaq,
  handleTimerCallback,
  handleStatsCallback,
  handleScheduleRefresh,
  handleMyQueues,
} = require('./handlers/menu');
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

// Auto-retry on 429 (Too Many Requests) errors from Telegram API
bot.api.config.use(autoRetry({
  maxRetryAttempts: 3,
  maxDelaySeconds: 10,
}));

// Compatibility for bot.options.id used in handlers
bot.options = {};
Object.defineProperty(bot.options, 'id', {
  get() { return bot.botInfo?.id; },
  set(_val) { /* ignore, grammY manages this */ }
});

// Maintenance mode middleware — blocks non-admin users when maintenance is active
bot.use(maintenanceMiddleware());

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
          parse_mode: 'HTML',
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
          parse_mode: 'HTML',
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

// Handle callback queries
bot.on('callback_query:data', async (ctx) => {
  const query = ctx.callbackQuery;
  const data = query.data;

  try {
    // Region request callbacks - MUST be before region_ check to avoid conflict!
    if (data.startsWith('region_request_')) {
      await handleRegionRequestCallback(bot, query);
      return;
    }

    // Wizard callbacks (region selection, group selection, etc.)
    if (data.startsWith('region_') ||
        data.startsWith('queue_') ||
        data === 'confirm_setup' ||
        data === 'back_to_region' ||
        data === 'restore_profile' ||
        data === 'create_new_profile' ||
        data === 'wizard_notify_bot' ||
        data === 'wizard_notify_channel' ||
        data === 'wizard_notify_back' ||
        data.startsWith('wizard_channel_confirm_')) {
      await handleWizardCallback(bot, query);
      return;
    }

    // Menu callbacks
    if (data === 'menu_schedule') {
      await handleMenuSchedule(bot, query);
      return;
    }

    if (data === 'schedule_refresh') {
      await handleScheduleRefresh(bot, query);
      return;
    }

    if (data === 'my_queues') {
      await handleMyQueues(bot, query);
      return;
    }

    if (data === 'menu_timer') {
      await handleMenuTimer(bot, query);
      return;
    }

    if (data === 'menu_stats') {
      await handleMenuStats(bot, query);
      return;
    }

    if (data === 'menu_help') {
      await handleMenuHelp(bot, query);
      return;
    }

    if (data === 'menu_settings') {
      await handleMenuSettings(bot, query);
      return;
    }

    if (data === 'back_to_main') {
      await handleBackToMain(bot, query);
      return;
    }

    // Handle inline button callbacks from channel schedule messages
    // These callbacks include user_id like: timer_123, stats_123

    if (data.startsWith('timer_')) {
      await handleTimerCallback(bot, query, data);
      return;
    }

    if (data.startsWith('stats_')) {
      await handleStatsCallback(bot, query, data);
      return;
    }

    // Settings callbacks
    if (data.startsWith('settings_') ||
        data.startsWith('alert_') ||
        data.startsWith('ip_') ||
        data.startsWith('notify_target_') ||
        data.startsWith('notif_') ||
        data.startsWith('cleanup_') ||
        data.startsWith('schedule_alert_') ||
        data === 'channel_reconnect' ||
        data === 'confirm_deactivate' ||
        data === 'confirm_delete_data' ||
        data === 'delete_data_step2' ||
        data === 'back_to_settings') {
      await handleSettingsCallback(bot, query);
      return;
    }

    // Feedback callbacks
    if (data.startsWith('feedback_')) {
      await handleFeedbackCallback(bot, query);
      return;
    }

    // Admin callbacks (including pause mode, debounce, growth, and maintenance)
    if (data.startsWith('admin_') || data.startsWith('pause_') || data.startsWith('debounce_') || data.startsWith('growth_') || data.startsWith('maintenance_')) {
      await handleAdminCallback(bot, query);
      return;
    }

    // Channel callbacks (including auto-connect, test, and format)
    if (data.startsWith('channel_') ||
        data.startsWith('brand_') ||
        data.startsWith('test_') ||
        data.startsWith('format_') ||
        data.startsWith('connect_channel_') ||
        data.startsWith('replace_channel_') ||
        data === 'cancel_channel_connect' ||
        data === 'keep_current_channel') {
      await handleChannelCallback(bot, query);
      return;
    }

    // Help callbacks
    if (data === 'help_howto') {
      await handleHelpHowto(bot, query);
      return;
    }

    if (data === 'help_faq') {
      await handleHelpFaq(bot, query);
      return;
    }

    // Default: just acknowledge
    await bot.api.answerCallbackQuery(query.id);

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
