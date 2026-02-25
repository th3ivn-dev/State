const { Bot } = require('grammy');
const { hydrate } = require('@grammyjs/hydrate');
const { autoRetry } = require('@grammyjs/auto-retry');
const config = require('./config');
const { savePendingChannel, deletePendingChannel, getAllPendingChannels } = require('./database/db');

// Import handlers
const { handleStart, handleWizardCallback, isInWizard, getWizardState, setWizardState } = require('./handlers/start');
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
const { isMaintenanceMode } = require('./handlers/admin/maintenance');
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
} = require('./handlers/menu');
const { escapeHtml, isAdmin } = require('./utils');
const { safeAnswerCallbackQuery, isTelegramUserInactiveError } = require('./utils/errorHandler');
const { MAX_INSTRUCTION_MESSAGES_MAP_SIZE, MAX_PENDING_CHANNELS_MAP_SIZE, PENDING_CHANNEL_CLEANUP_INTERVAL_MS } = require('./constants/timeouts');
const { notifyAdminsAboutError } = require('./utils/adminNotifier');
const usersDb = require('./database/users');
const { checkPauseForChannelActions } = require('./utils/guards');

// Store pending channel connections
const pendingChannels = new Map();

// Store channel instruction message IDs (для видалення старих інструкцій)
const channelInstructionMessages = new Map();

// Автоочистка застарілих записів з pendingChannels (кожну годину)
const botCleanupInterval = setInterval(() => {
  const oneHourAgo = Date.now() - PENDING_CHANNEL_CLEANUP_INTERVAL_MS;

  // Cleanup pendingChannels with size limit
  for (const [key, value] of pendingChannels.entries()) {
    if (value && value.timestamp && value.timestamp < oneHourAgo) {
      pendingChannels.delete(key);
    }
  }

  // Enforce max size limit for pendingChannels (LRU-style)
  if (pendingChannels.size >= MAX_PENDING_CHANNELS_MAP_SIZE) {
    const entriesToDelete = pendingChannels.size - MAX_PENDING_CHANNELS_MAP_SIZE;
    const keys = Array.from(pendingChannels.keys()).slice(0, entriesToDelete);
    keys.forEach(key => pendingChannels.delete(key));
    console.log(`🧹 Очищено ${entriesToDelete} старих pending channels (перевищено ліміт ${MAX_PENDING_CHANNELS_MAP_SIZE})`);
  }

  // Cleanup channelInstructionMessages with size limit
  if (channelInstructionMessages.size >= MAX_INSTRUCTION_MESSAGES_MAP_SIZE) {
    const entriesToDelete = channelInstructionMessages.size - MAX_INSTRUCTION_MESSAGES_MAP_SIZE;
    const keys = Array.from(channelInstructionMessages.keys()).slice(0, entriesToDelete);
    keys.forEach(key => channelInstructionMessages.delete(key));
    console.log(`🧹 Очищено ${entriesToDelete} старих instruction messages (перевищено ліміт ${MAX_INSTRUCTION_MESSAGES_MAP_SIZE})`);
  }
}, PENDING_CHANNEL_CLEANUP_INTERVAL_MS); // Кожну годину

// Helper functions to manage pending channels with DB persistence
async function setPendingChannel(channelId, data) {
  // Enforce max size before adding
  if (pendingChannels.size >= MAX_PENDING_CHANNELS_MAP_SIZE) {
    // Remove oldest entry (first in iteration)
    const firstKey = pendingChannels.keys().next().value;
    pendingChannels.delete(firstKey);
  }

  pendingChannels.set(channelId, data);
  await savePendingChannel(channelId, data.channelUsername, data.channelTitle, data.telegramId);
}

async function removePendingChannel(channelId) {
  pendingChannels.delete(channelId);
  await deletePendingChannel(channelId);
}

/**
 * Відновити pending channels з БД при запуску бота
 */
async function restorePendingChannels() {
  const channels = await getAllPendingChannels();
  for (const channel of channels) {
    // Don't call setPendingChannel here to avoid double-writing to DB
    pendingChannels.set(channel.channel_id, {
      channelId: channel.channel_id,
      channelUsername: channel.channel_username,
      channelTitle: channel.channel_title,
      telegramId: channel.telegram_id,
      timestamp: new Date(channel.created_at).getTime()
    });
  }
  console.log(`✅ Відновлено ${channels.length} pending каналів`);
}

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
bot.use(async (ctx, next) => {
  const maintenance = await isMaintenanceMode();
  if (maintenance.enabled) {
    const userId = String(ctx.from?.id);
    if (!isAdmin(userId, config.adminIds, config.ownerId)) {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({ text: maintenance.message, show_alert: true }).catch(() => {});
      } else {
        await ctx.reply(maintenance.message, { parse_mode: 'HTML' }).catch(() => {});
      }
      return;
    }
  }
  await next();
});

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
bot.on('my_chat_member', async (ctx) => {
  try {
    const update = ctx.myChatMember;
    const chat = update.chat;
    const newStatus = update.new_chat_member.status;
    const oldStatus = update.old_chat_member.status;
    const userId = String(update.from.id); // User who added the bot (convert to String for consistency)

    // Перевіряємо що це канал
    if (chat.type !== 'channel') return;

    const channelId = String(chat.id);
    const channelTitle = chat.title || 'Без назви';

    // Бота додали як адміністратора
    if (newStatus === 'administrator' && oldStatus !== 'administrator') {
      // Перевірка режиму паузи
      const pauseCheck = await checkPauseForChannelActions();
      if (pauseCheck.blocked) {
        // Бот на паузі - не дозволяємо додавання каналів
        try {
          await bot.api.sendMessage(
            userId,
            pauseCheck.message,
            { parse_mode: 'HTML' }
          );
        } catch (error) {
          if (isTelegramUserInactiveError(error)) {
            console.log(`ℹ️ Користувач ${userId} недоступний — сповіщення про паузу пропущено`);
          } else {
            console.error('Error sending pause message in my_chat_member:', error);
          }
        }
        return;
      }

      const channelUsername = chat.username ? `@${chat.username}` : chat.title;

      // Перевіряємо чи канал вже зайнятий іншим користувачем
      const existingUser = await usersDb.getUserByChannelId(channelId);
      if (existingUser && existingUser.telegram_id !== userId) {
        // Канал вже зайнятий - повідомляємо користувача
        console.log(`Channel ${channelId} already connected to user ${existingUser.telegram_id}`);

        try {
          await bot.api.sendMessage(
            userId,
            '⚠️ <b>Канал вже підключений</b>\n\n' +
            `Канал "${escapeHtml(channelTitle)}" вже підключено до іншого користувача.\n\n` +
            'Кожен канал може бути підключений тільки до одного облікового запису.\n\n' +
            'Якщо це ваш канал — зверніться до підтримки.',
            { parse_mode: 'HTML' }
          );
        } catch (error) {
          if (isTelegramUserInactiveError(error)) {
            console.log(`ℹ️ Користувач ${userId} недоступний — сповіщення про зайнятий канал пропущено`);
          } else {
            console.error('Error sending occupied channel notification:', error);
          }
        }
        return;
      }

      // Перевіряємо чи користувач в wizard на етапі channel_setup

      if (isInWizard(userId)) {
        const wizardState = getWizardState(userId);

        if (wizardState && wizardState.step === 'channel_setup') {
          // Користувач в wizard - замінюємо інструкцію на підтвердження

          // Видаляємо попереднє повідомлення якщо є
          if (wizardState.lastMessageId) {
            try {
              await bot.api.deleteMessage(userId, wizardState.lastMessageId);
            } catch (e) {
              console.log('Could not delete wizard instruction message:', e.message);
            }
          }

          // Зберігаємо pending channel
          setPendingChannel(channelId, {
            channelId,
            channelUsername: chat.username ? `@${chat.username}` : null,
            channelTitle: channelTitle,
            telegramId: userId,
            timestamp: Date.now()
          });

          // Надсилаємо підтвердження
          const confirmMessage = await bot.api.sendMessage(
            userId,
            `✅ Ви додали мене в канал "<b>${escapeHtml(channelTitle)}</b>"!\n\n` +
            `Підключити цей канал для сповіщень про світло?`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '✅ Так, підключити', callback_data: `wizard_channel_confirm_${channelId}` }],
                  [{ text: '❌ Ні', callback_data: 'wizard_channel_cancel' }]
                ]
              }
            }
          );

          // Оновлюємо wizard state з новим message ID
          setWizardState(userId, {
            ...wizardState,
            lastMessageId: confirmMessage.message_id,
            pendingChannelId: channelId
          });

          console.log(`Bot added to channel during wizard: ${channelUsername} (${channelId}) by user ${userId}`);
          return; // Не продовжуємо стандартну логіку
        }
      }

      // Спробувати видалити старе повідомлення з інструкцією
      // (якщо є збережений message_id)
      const lastInstructionMessageId = channelInstructionMessages.get(userId);
      if (lastInstructionMessageId) {
        try {
          await bot.api.deleteMessage(userId, lastInstructionMessageId);
          channelInstructionMessages.delete(userId);
          console.log(`Deleted instruction message ${lastInstructionMessageId} for user ${userId}`);
        } catch (e) {
          console.log('Could not delete instruction message:', e.message);
        }
      }

      // Отримати користувача з БД
      const user = await usersDb.getUserByTelegramId(userId);

      if (user && user.channel_id) {
        // У користувача вже є канал - запитати про заміну
        const currentChannelTitle = user.channel_title || 'Поточний канал';

        try {
          await bot.api.sendMessage(userId,
            `✅ Ви додали мене в канал "<b>${escapeHtml(channelTitle)}</b>"!\n\n` +
            `⚠️ У вас вже підключений канал "<b>${escapeHtml(currentChannelTitle)}</b>".\n` +
            `Замінити на новий?`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '✅ Так, замінити', callback_data: `replace_channel_${channelId}` }],
                  [{ text: '❌ Залишити поточний', callback_data: 'keep_current_channel' }]
                ]
              }
            }
          );
        } catch (error) {
          if (isTelegramUserInactiveError(error)) {
            console.log(`ℹ️ Користувач ${userId} недоступний — запит на заміну каналу пропущено`);
          } else {
            console.error('Error sending replace channel prompt:', error);
          }
        }
      } else {
        // У користувача немає каналу - запропонувати підключити
        try {
          await bot.api.sendMessage(userId,
            `✅ Ви додали мене в канал "<b>${escapeHtml(channelTitle)}</b>"!\n\n` +
            `Підключити цей канал для сповіщень про світло?`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '✅ Так, підключити', callback_data: `connect_channel_${channelId}` }],
                  [{ text: '❌ Ні', callback_data: 'cancel_channel_connect' }]
                ]
              }
            }
          );
        } catch (error) {
          if (isTelegramUserInactiveError(error)) {
            console.log(`ℹ️ Користувач ${userId} недоступний — запит на підключення каналу пропущено`);
          } else {
            console.error('Error sending connect channel prompt:', error);
          }
        }
      }

      // Зберегти інформацію про канал тимчасово для callback
      setPendingChannel(channelId, {
        channelId,
        channelUsername,
        channelTitle: chat.title,
        telegramId: userId,
        timestamp: Date.now()
      });

      console.log(`Bot added as admin to channel: ${channelUsername} (${channelId}) by user ${userId}`);
    }

    // Бота видалили з каналу
    if ((newStatus === 'left' || newStatus === 'kicked') &&
        (oldStatus === 'administrator' || oldStatus === 'member')) {

      console.log(`Bot removed from channel: ${channelTitle} (${channelId})`);

      // Видаляємо з pending channels
      removePendingChannel(channelId);

      // Перевіряємо чи користувач в wizard з цим каналом

      if (isInWizard(userId)) {
        const wizardState = getWizardState(userId);

        if (wizardState && wizardState.pendingChannelId === channelId) {
          // Оновлюємо повідомлення
          if (wizardState.lastMessageId) {
            try {
              await bot.api.editMessageText(
                userId,
                wizardState.lastMessageId,
                `❌ <b>Бота видалено з каналу</b>\n\n` +
                `Канал "${escapeHtml(channelTitle)}" більше недоступний.\n\n` +
                `Щоб підключити канал, додайте бота як адміністратора.`,
                {
                  parse_mode: 'HTML',
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: '← Назад', callback_data: 'wizard_notify_back' }]
                    ]
                  }
                }
              );
            } catch (e) {
              console.log('Could not update wizard message after bot removal:', e.message);
            }
          }

          // Очищаємо pending channel з wizard state
          setWizardState(userId, {
            ...wizardState,
            pendingChannelId: null
          });
        }
      }

      const user = await usersDb.getUserByTelegramId(userId);

      // Також перевіряємо чи це був підключений канал користувача
      if (user && String(user.channel_id) === channelId) {
        try {
          await bot.api.sendMessage(userId,
            `⚠️ Мене видалили з каналу "<b>${escapeHtml(channelTitle)}</b>".\n\n` +
            `Сповіщення в цей канал більше не надсилатимуться.`,
            { parse_mode: 'HTML' }
          );
        } catch (error) {
          if (isTelegramUserInactiveError(error)) {
            console.log(`ℹ️ Користувач ${userId} недоступний — сповіщення про видалення каналу пропущено`);
          } else {
            console.error('Error sending channel removal notification:', error);
          }
        }

        // Очистити channel_id в БД
        await usersDb.updateUser(userId, { channel_id: null, channel_title: null });
      }
    }

  } catch (error) {
    console.error('Error in my_chat_member handler:', error);
  }
});

module.exports = bot;
module.exports.pendingChannels = pendingChannels;
module.exports.channelInstructionMessages = channelInstructionMessages;
module.exports.restorePendingChannels = restorePendingChannels;
module.exports.removePendingChannel = removePendingChannel;
module.exports.stopBotCleanup = function() {
  clearInterval(botCleanupInterval);
};
