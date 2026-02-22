const { Bot, InputFile } = require('grammy');
const { hydrate } = require('@grammyjs/hydrate');
const config = require('./config');
const { savePendingChannel, getPendingChannel, deletePendingChannel, getAllPendingChannels } = require('./database/db');

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
  handleAdminSupportUrlConversation
} = require('./handlers/admin');
const { 
  handleChannel, 
  handleSetChannel, 
  handleConversation, 
  handleChannelCallback, 
  handleCancelChannel 
} = require('./handlers/channel');
const { handleFeedbackCallback, handleFeedbackMessage, getSupportButton } = require('./handlers/feedback');
const { handleRegionRequestCallback, handleRegionRequestMessage } = require('./handlers/regionRequest');
const { getMainMenu, getHelpKeyboard, getStatisticsKeyboard, getSettingsKeyboard, getErrorKeyboard } = require('./keyboards/inline');
const { REGIONS } = require('./constants/regions');
const { formatErrorMessage } = require('./formatter');
const { generateLiveStatusMessage, escapeHtml } = require('./utils');
const { safeEditMessageText, safeAnswerCallbackQuery, isTelegramUserInactiveError } = require('./utils/errorHandler');
const { MAX_INSTRUCTION_MESSAGES_MAP_SIZE, MAX_PENDING_CHANNELS_MAP_SIZE, PENDING_CHANNEL_CLEANUP_INTERVAL_MS } = require('./constants/timeouts');
const { notifyAdminsAboutError } = require('./utils/adminNotifier');

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

// Визначаємо режим роботи
const useWebhook = config.USE_WEBHOOK;

// Create bot instance
const bot = new Bot(config.botToken);
// Polling will be started in index.js via bot.start()

console.log(`🤖 Telegram Bot ініціалізовано (режим: ${useWebhook ? 'Webhook' : 'Polling'})`);

// Register hydrate middleware to allow convenient message editing (msg.editText(), msg.delete(), etc.)
bot.use(hydrate());

// Compatibility for bot.options.id used in handlers
bot.options = {};
Object.defineProperty(bot.options, 'id', {
  get() { return bot.botInfo?.id; },
  set(val) { /* ignore, grammY manages this */ }
});

// Help messages (must be under 200 characters for show_alert: true)
const help_howto = `📖 Як користуватись:\n\n1. Оберіть регіон та чергу\n2. Підключіть канал (опційно)\n3. Додайте IP роутера (опційно)\n4. Готово! Бот сповіщатиме про відключення`;
const help_faq = `❓ Чому не приходять сповіщення?\n→ Перевірте налаштування\n\n❓ Як працює IP моніторинг?\n→ Бот пінгує роутер для визначення наявності світла`;

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
      try {
        const usersDb = require('./database/users');
        const { fetchScheduleData, fetchScheduleImage } = require('./api');
        const { parseScheduleForQueue, findNextEvent } = require('./parser');
        const { formatScheduleMessage } = require('./formatter');
        
        const telegramId = String(query.from.id);
        const user = await usersDb.getUserByTelegramId(telegramId);
        
        if (!user) {
          await safeAnswerCallbackQuery(bot, query.id, {
            text: '❌ Користувач не знайдений',
            show_alert: true
          });
          return;
        }
        
        // Answer Telegram immediately to avoid timeout (after user validation)
        await bot.api.answerCallbackQuery(query.id).catch(() => {});
        
        // Get schedule data
        const data = await fetchScheduleData(user.region);
        const scheduleData = parseScheduleForQueue(data, user.queue);
        const nextEvent = findNextEvent(scheduleData);
        
        // Check if data exists
        if (!scheduleData || !scheduleData.events || scheduleData.events.length === 0) {
          await safeEditMessageText(bot, 
            '📊 <b>Графік</b>\n\n' +
            'ℹ️ Дані ще не опубліковані.\n' +
            'Спробуйте пізніше.',
            {
              chat_id: query.message.chat.id,
              message_id: query.message.message_id,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '⤴︎ Меню', callback_data: 'back_to_main' }]
                ]
              }
            }
          );
          return;
        }
        
        // Format message
        const message = formatScheduleMessage(user.region, user.queue, scheduleData, nextEvent);
        const scheduleKeyboard = {
          inline_keyboard: [
            [
              { text: '⏱ Таймер', callback_data: 'menu_timer' },
              { text: '⤴︎ Меню', callback_data: 'back_to_main' }
            ]
          ]
        };
        
        // Try to get and send image with edit
        let messageDeleted = false;
        try {
          const imageBuffer = await fetchScheduleImage(user.region, user.queue);
          
          // Delete the old message and send new one with photo
          await bot.api.deleteMessage(query.message.chat.id, query.message.message_id);
          messageDeleted = true;
          const photoInput = Buffer.isBuffer(imageBuffer) ? new InputFile(imageBuffer, 'schedule.png') : imageBuffer;
          await bot.api.sendPhoto(query.message.chat.id, photoInput, {
            caption: message,
            parse_mode: 'HTML',
            reply_markup: scheduleKeyboard
          });
        } catch (imgError) {
          // If image unavailable, send/edit text message
          console.log('Schedule image unavailable:', imgError.message);
          if (messageDeleted) {
            await bot.api.sendMessage(query.message.chat.id, message, {
              parse_mode: 'HTML',
              reply_markup: scheduleKeyboard
            });
          } else {
            await safeEditMessageText(bot, 
              message,
              {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                parse_mode: 'HTML',
                reply_markup: scheduleKeyboard
              }
            );
          }
        }
      } catch (error) {
        console.error('Помилка отримання графіка:', error);
        
        const errorKeyboard = await getErrorKeyboard();
        await safeEditMessageText(bot, 
          formatErrorMessage(),
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            parse_mode: 'HTML',
            reply_markup: errorKeyboard.reply_markup
          }
        );
      }
      return;
    }

    if (data === 'menu_timer') {
      // Show timer as popup instead of sending a new message
      try {
        const usersDb = require('./database/users');
        const { fetchScheduleData } = require('./api');
        const { parseScheduleForQueue, findNextEvent } = require('./parser');
        const { formatTimerMessage } = require('./formatter');
        
        const telegramId = String(query.from.id);
        const user = await usersDb.getUserByTelegramId(telegramId);
        
        if (!user) {
          await safeAnswerCallbackQuery(bot, query.id, {
            text: '❌ Користувач не знайдений',
            show_alert: true
          });
          return;
        }
        
        const data = await fetchScheduleData(user.region);
        const scheduleData = parseScheduleForQueue(data, user.queue);
        const nextEvent = findNextEvent(scheduleData);
        
        const message = formatTimerMessage(nextEvent);
        // Remove HTML tags for popup
        const cleanMessage = message.replace(/<[^>]*>/g, '');
        
        await safeAnswerCallbackQuery(bot, query.id, {
          text: cleanMessage,
          show_alert: true
        });
      } catch (error) {
        console.error('Помилка отримання таймера:', error);
        await safeAnswerCallbackQuery(bot, query.id, {
          text: '😅 Щось пішло не так. Спробуйте ще раз!',
          show_alert: true
        });
      }
      return;
    }

    if (data === 'menu_stats') {
      // Show statistics as popup
      try {
        const usersDb = require('./database/users');
        const { getWeeklyStats, formatStatsPopup } = require('./statistics');
        
        const telegramId = String(query.from.id);
        const user = await usersDb.getUserByTelegramId(telegramId);
        
        if (!user) {
          await safeAnswerCallbackQuery(bot, query.id, {
            text: '❌ Користувач не знайдений',
            show_alert: true
          });
          return;
        }
        
        const stats = await getWeeklyStats(user.id);
        const message = formatStatsPopup(stats);
        
        await safeAnswerCallbackQuery(bot, query.id, {
          text: message,
          show_alert: true
        });
      } catch (error) {
        console.error('Помилка отримання статистики:', error);
        await safeAnswerCallbackQuery(bot, query.id, {
          text: '😅 Щось пішло не так. Спробуйте ще раз!',
          show_alert: true
        });
      }
      return;
    }

    if (data === 'menu_help') {
      // Answer Telegram immediately to avoid timeout
      await bot.api.answerCallbackQuery(query.id).catch(() => {});
      
      const helpKeyboard = await getHelpKeyboard();
      await safeEditMessageText(bot, 
        '❓ <b>Допомога</b>\n\n' +
        'ℹ️ Тут ви можете дізнатися як\n' +
        'користуватися ботом.',
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: helpKeyboard.reply_markup,
        }
      );
      return;
    }

    if (data === 'menu_settings') {
      const usersDb = require('./database/users');
      const telegramId = String(query.from.id);
      const user = await usersDb.getUserByTelegramId(telegramId);
      
      if (!user) {
        await safeAnswerCallbackQuery(bot, query.id, { text: '❌ Спочатку запустіть бота, натиснувши /start' });
        return;
      }
      
      // Answer Telegram immediately to avoid timeout (after user validation)
      await bot.api.answerCallbackQuery(query.id).catch(() => {});
      
      const isAdmin = config.adminIds.includes(telegramId) || telegramId === config.ownerId;
      const regionName = REGIONS[user.region]?.name || user.region;
      
      // Generate Live Status message using helper function
      const message = generateLiveStatusMessage(user, regionName);
      
      await safeEditMessageText(bot, 
        message,
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: getSettingsKeyboard(isAdmin).reply_markup,
        }
      );
      return;
    }

    if (data === 'back_to_main') {
      // Answer Telegram immediately to avoid timeout
      await bot.api.answerCallbackQuery(query.id).catch(() => {});
      
      const usersDb = require('./database/users');
      const telegramId = String(query.from.id);
      const user = await usersDb.getUserByTelegramId(telegramId);
      
      if (user) {
        const region = REGIONS[user.region]?.name || user.region;
        
        // Determine bot status
        let botStatus = 'active';
        if (!user.channel_id) {
          botStatus = 'no_channel';
        } else if (!user.is_active) {
          botStatus = 'paused';
        }
        
        const channelPaused = user.channel_paused === true;
        
        // Build main menu message with beta warning
        let message = '<b>🚧 Бот у розробці</b>\n';
        message += '<i>Деякі функції можуть працювати нестабільно</i>\n\n';
        message += '🏠 <b>Головне меню</b>\n\n';
        message += `📍 Регіон: ${region} • ${user.queue}\n`;
        message += `📺 Канал: ${user.channel_id ? user.channel_id + ' ✅' : 'не підключено'}\n`;
        message += `🔔 Сповіщення: ${user.is_active ? 'увімкнено ✅' : 'вимкнено'}\n`;
        
        // If current message is a photo/media, skip editMessageText and go straight to delete+send
        const isMediaMessage = !!(query.message.photo || query.message.document ||
                                  query.message.video || query.message.animation);
        
        if (isMediaMessage) {
          // Delete the media message and send a new text message
          try {
            await bot.api.deleteMessage(query.message.chat.id, query.message.message_id);
          } catch (deleteError) {
            // Ignore delete errors - message may already be deleted or inaccessible
          }
          await bot.api.sendMessage(
            query.message.chat.id,
            message,
            {
              parse_mode: 'HTML',
              ...getMainMenu(botStatus, channelPaused)
            }
          );
        } else {
          // Try to edit message text first
          try {
            await safeEditMessageText(bot, 
              message,
              {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                parse_mode: 'HTML',
                reply_markup: getMainMenu(botStatus, channelPaused).reply_markup,
              }
            );
          } catch (error) {
            // If edit fails for other reasons (e.g., message deleted, permission issues), delete and send new message
            try {
              await bot.api.deleteMessage(query.message.chat.id, query.message.message_id);
            } catch (deleteError) {
              // Ignore delete errors - message may already be deleted or inaccessible
            }
            await bot.api.sendMessage(
              query.message.chat.id,
              message,
              {
                parse_mode: 'HTML',
                ...getMainMenu(botStatus, channelPaused)
              }
            );
          }
        }
      }
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
    
    // Admin callbacks (including pause mode, debounce, and growth)
    if (data.startsWith('admin_') || data.startsWith('pause_') || data.startsWith('debounce_') || data.startsWith('growth_')) {
      await handleAdminCallback(bot, query);
      return;
    }
    
    // Handle inline button callbacks from channel schedule messages
    // These callbacks include user_id like: timer_123, stats_123
    
    if (data.startsWith('timer_')) {
      try {
        const userId = parseInt(data.replace('timer_', ''));
        const usersDb = require('./database/users');
        const { fetchScheduleData } = require('./api');
        const { parseScheduleForQueue, findNextEvent } = require('./parser');
        const { formatTime } = require('./utils');
        
        const user = await usersDb.getUserById(userId);
        if (!user) {
          await safeAnswerCallbackQuery(bot, query.id, {
            text: '❌ Користувач не знайдений',
            show_alert: true
          });
          return;
        }
        
        const scheduleRawData = await fetchScheduleData(user.region);
        const scheduleData = parseScheduleForQueue(scheduleRawData, user.queue);
        const nextEvent = findNextEvent(scheduleData);
        
        // Format timer message according to the new requirements
        const lines = [];
        
        if (!nextEvent) {
          // No outages today
          lines.push('🎉 Сьогодні без відключень!');
          lines.push('');
          
          // Try to show tomorrow's schedule
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
          const tomorrowEnd = new Date(tomorrowStart);
          tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
          
          const tomorrowEvents = scheduleData.events.filter(event => {
            const eventStart = new Date(event.start);
            return eventStart >= tomorrowStart && eventStart < tomorrowEnd;
          });
          
          if (tomorrowEvents.length > 0) {
            lines.push('📅 Завтра:');
            tomorrowEvents.forEach(event => {
              const start = formatTime(event.start);
              const end = formatTime(event.end);
              lines.push(`• ${start}–${end}`);
            });
          } else {
            lines.push('ℹ️ Дані на завтра ще не опубліковані');
          }
        } else if (nextEvent.type === 'power_off') {
          // Light is currently on
          lines.push('За графіком зараз:');
          lines.push('🟢 Світло зараз є');
          lines.push('');
          
          const hours = Math.floor(nextEvent.minutes / 60);
          const mins = nextEvent.minutes % 60;
          let timeStr = '';
          if (hours > 0) {
            timeStr = `${hours} год`;
            if (mins > 0) timeStr += ` ${mins} хв`;
          } else {
            timeStr = `${mins} хв`;
          }
          
          lines.push(`⏳ Вимкнення через ${timeStr}`);
          const start = formatTime(nextEvent.time);
          const end = nextEvent.endTime ? formatTime(nextEvent.endTime) : '?';
          lines.push(`📅 Очікуємо - ${start}–${end}`);
          
          // Show other outages today
          const now = new Date();
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const todayEnd = new Date(todayStart);
          todayEnd.setHours(23, 59, 59, 999);
          
          const otherOutages = scheduleData.events.filter(event => {
            const eventStart = new Date(event.start);
            return eventStart > new Date(nextEvent.time) && 
                   eventStart >= todayStart && 
                   eventStart <= todayEnd;
          });
          
          if (otherOutages.length > 0) {
            lines.push('');
            lines.push('Інші відключення сьогодні:');
            otherOutages.forEach(event => {
              const start = formatTime(event.start);
              const end = formatTime(event.end);
              lines.push(`• ${start}–${end}`);
            });
          }
        } else {
          // Light is currently off
          lines.push('За графіком зараз:');
          lines.push('🔴 Світла немає');
          lines.push('');
          
          const hours = Math.floor(nextEvent.minutes / 60);
          const mins = nextEvent.minutes % 60;
          let timeStr = '';
          if (hours > 0) {
            timeStr = `${hours} год`;
            if (mins > 0) timeStr += ` ${mins} хв`;
          } else {
            timeStr = `${mins} хв`;
          }
          
          lines.push(`⏳ До увімкнення ${timeStr}`);
          const start = nextEvent.startTime ? formatTime(nextEvent.startTime) : '?';
          const end = formatTime(nextEvent.time);
          lines.push(`📅 Поточне - ${start}–${end}`);
        }
        
        const message = lines.join('\n');
        
        await safeAnswerCallbackQuery(bot, query.id, {
          text: message,
          show_alert: true
        });
      } catch (error) {
        console.error('Помилка обробки timer callback:', error);
        await safeAnswerCallbackQuery(bot, query.id, {
          text: '😅 Щось пішло не так. Спробуйте ще раз!',
          show_alert: true
        });
      }
      return;
    }
    
    if (data.startsWith('stats_')) {
      try {
        const userId = parseInt(data.replace('stats_', ''));
        
        // Ігноруємо некоректні stats_ callback (наприклад, stats_week, stats_device)
        if (isNaN(userId)) {
          await safeAnswerCallbackQuery(bot, query.id, {
            text: '⚠️ Ця функція в розробці',
            show_alert: false
          });
          return;
        }
        
        const usersDb = require('./database/users');
        const { getWeeklyStats } = require('./statistics');
        
        const user = await usersDb.getUserById(userId);
        if (!user) {
          await safeAnswerCallbackQuery(bot, query.id, {
            text: '❌ Користувач не знайдений',
            show_alert: true
          });
          return;
        }
        
        const stats = await getWeeklyStats(userId);
        
        // Check if this is from a channel (Telegram uses negative IDs for channels/groups, positive for private chats)
        const isChannel = query.message.chat.id < 0;
        
        // Format stats message according to the new requirements
        const lines = [];
        lines.push('📈 Статистика за 7 днів');
        lines.push('');
        
        if (stats.count === 0) {
          lines.push('📊 Дані ще не зібрані');
          lines.push('ℹ️ Статистика з\'явиться після першого');
          lines.push('зафіксованого відключення.');
          // Only show IP monitoring suggestion in bot, not in channel
          if (!isChannel) {
            lines.push('');
            lines.push('💡 Підключіть IP-моніторинг для');
            lines.push('автоматичного збору даних.');
          }
        } else {
          const totalHours = Math.floor(stats.totalMinutes / 60);
          const totalMins = stats.totalMinutes % 60;
          const avgHours = Math.floor(stats.avgMinutes / 60);
          const avgMins = stats.avgMinutes % 60;
          
          lines.push(`⚡ Відключень: ${stats.count}`);
          
          let totalStr = '';
          if (totalHours > 0) {
            totalStr = `${totalHours} год`;
            if (totalMins > 0) totalStr += ` ${totalMins} хв`;
          } else {
            totalStr = `${totalMins} хв`;
          }
          lines.push(`⏱ Без світла: ${totalStr}`);
          
          let avgStr = '';
          if (avgHours > 0) {
            avgStr = `${avgHours} год`;
            if (avgMins > 0) avgStr += ` ${avgMins} хв`;
          } else {
            avgStr = `${avgMins} хв`;
          }
          lines.push(`📈 Середнє: ${avgStr}`);
        }
        
        const message = lines.join('\n');
        
        await safeAnswerCallbackQuery(bot, query.id, {
          text: message,
          show_alert: true
        });
      } catch (error) {
        console.error('Помилка обробки stats callback:', error);
        await safeAnswerCallbackQuery(bot, query.id, {
          text: '😅 Щось пішло не так. Спробуйте ще раз!',
          show_alert: true
        });
      }
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
      // Answer Telegram immediately to avoid timeout
      await bot.api.answerCallbackQuery(query.id).catch(() => {});
      
      await safeEditMessageText(bot, 
        '📖 <b>Як користуватися ботом:</b>\n\n' +
        '1. Оберіть регіон і чергу\n' +
        '2. Увімкніть сповіщення\n' +
        '3. (Опціонально) Підключіть канал\n' +
        '4. (Опціонально) Налаштуйте IP моніторинг\n\n' +
        'Бот автоматично сповістить про:\n' +
        '• Зміни в графіку\n' +
        '• Фактичні відключення (з IP)',
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '← Назад', callback_data: 'menu_help' },
                { text: '⤴ Меню', callback_data: 'back_to_main' }
              ]
            ]
          }
        }
      );
      return;
    }
    
    if (data === 'help_faq') {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: help_faq,
        show_alert: true
      });
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
    
    const usersDb = require('./database/users');
    const channelId = String(chat.id);
    const channelTitle = chat.title || 'Без назви';
    
    // Бота додали як адміністратора
    if (newStatus === 'administrator' && oldStatus !== 'administrator') {
      // Перевірка режиму паузи
      const { checkPauseForChannelActions } = require('./utils/guards');
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
      const { isInWizard, getWizardState, setWizardState } = require('./handlers/start');
      
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
      const { isInWizard, getWizardState, setWizardState } = require('./handlers/start');
      
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
module.exports.useWebhook = useWebhook;
module.exports.stopBotCleanup = function() {
  clearInterval(botCleanupInterval);
};
