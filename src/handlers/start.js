const usersDb = require('../database/users');
const { formatWelcomeMessage, formatErrorMessage } = require('../formatter');
const { getRegionKeyboard, getMainMenu, getQueueKeyboard, getConfirmKeyboard, getErrorKeyboard, getWizardNotifyTargetKeyboard } = require('../keyboards/inline');
const { REGIONS } = require('../constants/regions');
const { getBotUsername, getChannelConnectionInstructions, escapeHtml } = require('../utils');
const { safeSendMessage, safeDeleteMessage, safeEditMessage, safeEditMessageText, safeAnswerCallbackQuery } = require('../utils/errorHandler');
const { getSetting } = require('../database/db');
const { isRegistrationEnabled, checkUserLimit, logUserRegistration, logWizardCompletion } = require('../growthMetrics');
const { getState, setState, clearState, hasState } = require('../state/stateManager');
const { setConversationState } = require('./channel');
const { notifyAdminsAboutError } = require('../utils/adminNotifier');

// Constants imported from channel.js for consistency
const PENDING_CHANNEL_EXPIRATION_MS = 30 * 60 * 1000; // 30 minutes
const CHANNEL_NAME_PREFIX = 'СвітлоБот ⚡️ ';

// News channel subscription message configuration
const NEWS_CHANNEL_MESSAGE = {
  text: '📢 <b>Підпишіться на канал оновлень</b>\nЩоб не пропустити нові функції та важливі зміни:',
  options: {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📢 Новини/Оновлення', url: 'https://t.me/Voltyk_news' }]
      ]
    }
  }
};

// Development phase warning text
const DEVELOPMENT_WARNING = 
  '⚠️ Бот знаходиться в активній фазі розробки.\n\n' +
  'Наразі підтримуються такі регіони:\n' +
  '• Київ\n' +
  '• Київщина\n' +
  '• Дніпропетровщина\n' +
  '• Одещина\n\n' +
  'Якщо вашого регіону немає — ви можете запропонувати його додати.';

// Helper function to check if user is in wizard
function isInWizard(telegramId) {
  const state = getState('wizard', telegramId);
  return !!(state && state.step);
}

// Helper functions to manage wizard state (now using centralized state manager)
async function setWizardState(telegramId, data) {
  await setState('wizard', telegramId, data);
}

function getWizardState(telegramId) {
  return getState('wizard', telegramId);
}

async function clearWizardState(telegramId) {
  await clearState('wizard', telegramId);
}

/**
 * Відновити wizard стани з БД при запуску бота
 * NOTE: This is now handled by centralized state manager, kept for backward compatibility
 */
function restoreWizardStates() {
  // State restoration is now handled by initStateManager()
  console.log('✅ Wizard states restored by centralized state manager');
}

// Helper function to create pause mode keyboard
async function createPauseKeyboard(showSupport) {
  const buttons = [];
  
  if (showSupport) {
    const { getSupportButton } = require('./feedback');
    const supportButton = await getSupportButton();
    buttons.push([supportButton]);
  }
  
  buttons.push([{ text: '← Назад', callback_data: 'wizard_notify_back' }]);
  
  return { inline_keyboard: buttons };
}

// Helper function to notify admins about new user
async function notifyAdminsAboutNewUser(bot, telegramId, username, region, queue) {
  try {
    const config = require('../config');
    const { REGIONS } = require('../constants/regions');
    const usersDb = require('../database/users');
    
    const stats = await usersDb.getUserStats();
    const regionName = REGIONS[region]?.name || region;
    
    const message = 
      `🆕 <b>Новий користувач!</b>\n\n` +
      `👤 ${username ? '@' + username : 'без username'} (ID: <code>${telegramId}</code>)\n` +
      `🏙 Регіон: ${regionName}\n` +
      `⚡ Черга: ${queue}\n` +
      `📅 ${new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })}\n\n` +
      `📊 Всього користувачів: ${stats.total}`;
    
    // Надсилаємо всім адмінам
    const allAdmins = [...config.adminIds];
    if (config.ownerId && !allAdmins.includes(config.ownerId)) {
      allAdmins.push(config.ownerId);
    }
    
    for (const adminId of allAdmins) {
      try {
        await bot.api.sendMessage(adminId, message, { parse_mode: 'HTML' });
      } catch (error) {
        // Ігноруємо помилки (адмін може мати заблоковані повідомлення)
      }
    }
  } catch (error) {
    console.error('Помилка сповіщення адмінів про нового користувача:', error);
  }
}

// Запустити wizard для нового або існуючого користувача
async function startWizard(bot, chatId, telegramId, username, mode = 'new') {
  await setWizardState(telegramId, { step: 'region', mode });
  
  // Видаляємо попереднє wizard-повідомлення якщо є
  const lastMsg = getState('lastMenuMessages', telegramId);
  if (lastMsg && lastMsg.messageId) {
    try {
      await bot.api.deleteMessage(chatId, lastMsg.messageId);
    } catch (e) {
      // Ігноруємо помилки: повідомлення може бути вже видалене користувачем або застаріле
    }
  }
  
  let sentMessage;
  if (mode === 'new') {
    sentMessage = await safeSendMessage(
      bot,
      chatId,
      '👋 Привіт! Я СвітлоБот 🤖\n\n' +
      'Я допоможу відстежувати відключення світла\n' +
      'та повідомлю, коли воно зʼявиться або зникне.\n\n' +
      'Давайте налаштуємося.\n\n' +
      DEVELOPMENT_WARNING + '\n\n' +
      'Оберіть свій регіон:',
      { parse_mode: 'HTML', ...getRegionKeyboard() }
    );
  } else {
    sentMessage = await safeSendMessage(
      bot,
      chatId,
      '1️⃣ Оберіть ваш регіон:\n\n' +
      DEVELOPMENT_WARNING,
      getRegionKeyboard()
    );
  }
  
  // Зберігаємо ID нового повідомлення або видаляємо запис при невдачі
  if (sentMessage) {
    await setState('lastMenuMessages', telegramId, {
      messageId: sentMessage.message_id
    }, false); // Don't persist menu message IDs to DB
  } else {
    // Видаляємо запис якщо не вдалося відправити, щоб уникнути застарілих ID
    await clearState('lastMenuMessages', telegramId);
  }
}

// Обробник команди /start
async function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);
  const username = msg.from.username || msg.from.first_name;
  
  try {
    // Clear stale wizard state if older than 1 hour
    const wizardState = getWizardState(telegramId);
    if (wizardState && wizardState.timestamp && typeof wizardState.timestamp === 'number') {
      const stateAge = Date.now() - wizardState.timestamp;
      const ONE_HOUR_MS = 60 * 60 * 1000;
      
      if (stateAge > ONE_HOUR_MS) {
        // State is stale, clear it
        await clearWizardState(telegramId);
      }
    }
    
    // Якщо користувач в процесі wizard — не пускати в головне меню
    if (isInWizard(telegramId)) {
      await safeSendMessage(bot, chatId, 
        '⚠️ Спочатку завершіть налаштування!\n\n' +
        'Продовжіть з того місця, де зупинились.',
        { parse_mode: 'HTML' }
      );
      return;
    }
    
    // Clear any pending IP setup state
    const { clearIpSetupState } = require('./settings');
    await clearIpSetupState(telegramId);
    
    // Clear any pending channel conversation state
    const { clearConversationState } = require('./channel');
    await clearConversationState(telegramId);
    
    // Clear any pending region request state
    const { clearRegionRequestState } = require('./regionRequest');
    await clearRegionRequestState(telegramId);
    
    // Clear any pending feedback state
    const { clearFeedbackState } = require('./feedback');
    await clearFeedbackState(telegramId);
    
    // Видаляємо попереднє меню якщо є
    const user = await usersDb.getUserByTelegramId(telegramId);
    if (user && user.last_start_message_id) {
      await safeDeleteMessage(bot, chatId, user.last_start_message_id);
    }
    
    // Перевіряємо чи користувач вже існує
    if (user) {
      // Check if user was deactivated
      if (!user.is_active) {
        const { getRestorationKeyboard } = require('../keyboards/inline');
        const sentMessage = await safeSendMessage(
          bot,
          chatId,
          `👋 З поверненням!\n\n` +
          `Ваш профіль було деактивовано.\n\n` +
          `Оберіть опцію:`,
          getRestorationKeyboard()
        );
        if (sentMessage) {
          await usersDb.updateUser(telegramId, { last_start_message_id: sentMessage.message_id });
        }
        return;
      }
      
      // Існуючий користувач - показуємо головне меню
      const region = REGIONS[user.region]?.name || user.region;
      
      // Determine bot status
      let botStatus = 'active';
      if (!user.channel_id) {
        botStatus = 'no_channel';
      } else if (!user.is_active) {
        botStatus = 'paused';
      }
      
      const channelPaused = user.channel_paused === true;
      
      // Build main menu message
      let message = '<b>🚧 Бот у розробці</b>\n';
      message += '<i>Деякі функції можуть працювати нестабільно</i>\n\n';
      message += '🏠 <b>Головне меню</b>\n\n';
      message += `📍 Регіон: ${region} • ${user.queue}\n`;
      message += `📺 Канал: ${user.channel_id ? user.channel_id + ' ✅' : 'не підключено'}\n`;
      message += `🔔 Сповіщення: ${user.is_active ? 'увімкнено ✅' : 'вимкнено'}\n`;
      
      const sentMessage = await safeSendMessage(
        bot,
        chatId,
        message,
        {
          parse_mode: 'HTML',
          ...getMainMenu(botStatus, channelPaused)
        }
      );
      if (sentMessage) {
        await usersDb.updateUser(telegramId, { last_start_message_id: sentMessage.message_id });
      }
    } else {
      // Новий користувач - запускаємо wizard
      await startWizard(bot, chatId, telegramId, username, 'new');
    }
  } catch (error) {
    console.error('Помилка в handleStart:', error);
    notifyAdminsAboutError(bot, error, 'handleStart');
    const errorKeyboard = await getErrorKeyboard();
    await safeSendMessage(bot, chatId, formatErrorMessage(), {
      parse_mode: 'HTML',
      ...errorKeyboard
    });
  }
}

// Обробник callback query для wizard
async function handleWizardCallback(bot, query) {
  const chatId = query.message.chat.id;
  const telegramId = String(query.from.id);
  const data = query.data;
  
  await bot.api.answerCallbackQuery(query.id).catch(() => {});
  
  try {
    const state = getWizardState(telegramId) || { step: 'region' };
    
    // Вибір регіону
    if (data.startsWith('region_')) {
      const region = data.replace('region_', '');
      state.region = region;
      state.step = 'queue';
      await setWizardState(telegramId, state);
      
      await safeEditMessageText(bot, 
        `✅ Регіон: ${REGIONS[region].name}\n\n2️⃣ Оберіть свою чергу:`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: getQueueKeyboard(region, 1).reply_markup,
        }
      );
      return;
    }
    
    // Pagination для черг Києва
    if (data.startsWith('queue_page_')) {
      const pageNum = parseInt(data.replace('queue_page_', ''), 10);
      
      await safeEditMessageText(bot, 
        `✅ Регіон: ${REGIONS[state.region].name}\n\n2️⃣ Оберіть свою чергу:`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: getQueueKeyboard(state.region, pageNum).reply_markup,
        }
      );
      return;
    }
    
    // Вибір черги
    if (data.startsWith('queue_')) {
      const queue = data.replace('queue_', '');
      state.queue = queue;
      
      // For new users, show notification target selection
      if (state.mode === 'new') {
        state.step = 'notify_target';
        await setWizardState(telegramId, state);
        
        const region = REGIONS[state.region]?.name || state.region;
        
        await safeEditMessageText(bot, 
          `✅ Налаштування:\n\n` +
          `📍 Регіон: ${region}\n` +
          `⚡️ Черга: ${queue}\n\n` +
          `📬 Куди надсилати сповіщення про світло та графіки?\n\n` +
          `Оберіть, де вам зручніше їх отримувати:\n\n` +
          `📱 <b>У цьому боті</b>\n` +
          `Сповіщення приходитимуть прямо в цей чат\n\n` +
          `📺 <b>У вашому Telegram-каналі</b>\n` +
          `Бот публікуватиме сповіщення у ваш канал\n` +
          `(потрібно додати бота як адміністратора)`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'HTML',
            reply_markup: getWizardNotifyTargetKeyboard().reply_markup,
          }
        );
        return;
      } else {
        // For edit mode, go to confirmation as before
        state.step = 'confirm';
        await setWizardState(telegramId, state);
        
        const region = REGIONS[state.region]?.name || state.region;
        
        await safeEditMessageText(bot, 
          `✅ Налаштування:\n\n` +
          `📍 Регіон: ${region}\n` +
          `⚡️ Черга: ${queue}\n\n` +
          `Підтвердіть налаштування:`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: getConfirmKeyboard().reply_markup,
          }
        );
        return;
      }
    }
    
    // Підтвердження
    if (data === 'confirm_setup') {
      const username = query.from.username || query.from.first_name;
      const mode = state.mode || 'new';
      
      if (mode === 'edit') {
        // Режим редагування - оновлюємо існуючого користувача
        await usersDb.updateUserRegionAndQueue(telegramId, state.region, state.queue);
        await clearWizardState(telegramId);
        
        const region = REGIONS[state.region]?.name || state.region;
        
        await safeEditMessageText(bot, 
          `✅ <b>Налаштування оновлено!</b>\n\n` +
          `📍 Регіон: ${region}\n` +
          `⚡ Черга: ${state.queue}\n\n` +
          `Графік буде опубліковано при наступній перевірці.`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '⤴ Меню', callback_data: 'back_to_main' }]
              ]
            }
          }
        );
      } else {
        // Режим створення нового користувача (legacy flow without notification target selection)
        // Перевіряємо чи користувач вже існує (для безпеки)
        const existingUser = await usersDb.getUserByTelegramId(telegramId);
        
        if (existingUser) {
          // Користувач вже існує - оновлюємо налаштування
          await usersDb.updateUserRegionAndQueue(telegramId, state.region, state.queue);
        } else {
          // Check registration limits before creating new user
          const limit = await checkUserLimit();
          if (limit.reached || !await isRegistrationEnabled()) {
            await safeEditMessageText(bot, 
              `⚠️ <b>Реєстрація тимчасово обмежена</b>\n\n` +
              `На даний момент реєстрація нових користувачів тимчасово зупинена.\n\n` +
              `Спробуйте пізніше або зв'яжіться з підтримкою.`,
              {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'HTML'
              }
            );
            await clearWizardState(telegramId);
            return;
          }
          
          // Створюємо нового користувача
          await usersDb.createUser(telegramId, username, state.region, state.queue);
          
          // Log user registration for growth tracking
          await logUserRegistration(telegramId, { region: state.region, queue: state.queue, username });
          await logWizardCompletion(telegramId);
          
          // Notify admins about new user
          await notifyAdminsAboutNewUser(bot, telegramId, username, state.region, state.queue);
        }
        await clearWizardState(telegramId);
        
        const region = REGIONS[state.region]?.name || state.region;
        
        await safeEditMessageText(bot, 
          `✅ Налаштування збережено!\n\n` +
          `📍 Регіон: ${region}\n` +
          `⚡️ Черга: ${state.queue}\n\n` +
          `Тепер ви будете отримувати сповіщення про зміни графіка.\n\n` +
          `Використовуйте команду /channel для підключення до каналу.`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
          }
        );
        
        // Відправляємо головне меню і зберігаємо ID
        const botStatus = 'no_channel'; // New user won't have channel yet
        const sentMessage = await bot.api.sendMessage(chatId, 'Головне меню:', getMainMenu(botStatus, false));
        await usersDb.updateUser(telegramId, { last_start_message_id: sentMessage.message_id });
      }
      
      return;
    }
    
    // Назад до регіону
    if (data === 'back_to_region') {
      state.step = 'region';
      await setWizardState(telegramId, state);
      
      await safeEditMessageText(bot, 
        '1️⃣ Оберіть ваш регіон:\n\n' +
        DEVELOPMENT_WARNING,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: getRegionKeyboard().reply_markup,
        }
      );
      return;
    }
    
    // Wizard: вибір "У цьому боті"
    if (data === 'wizard_notify_bot') {
      const username = query.from.username || query.from.first_name;
      
      // Перевіряємо чи користувач вже існує
      const existingUser = await usersDb.getUserByTelegramId(telegramId);
      
      if (existingUser) {
        // Користувач вже існує - оновлюємо налаштування включаючи регіон та чергу з wizard
        await usersDb.updateUserRegionAndQueue(telegramId, state.region, state.queue);
        await usersDb.updateUserPowerNotifyTarget(telegramId, 'bot');
      } else {
        // Check registration limits before creating new user
        const limit = await checkUserLimit();
        if (limit.reached || !await isRegistrationEnabled()) {
          await safeEditMessageText(bot, 
            `⚠️ <b>Реєстрація тимчасово обмежена</b>\n\n` +
            `На даний момент реєстрація нових користувачів тимчасово зупинена.\n\n` +
            `Спробуйте пізніше або зв'яжіться з підтримкою.`,
            {
              chat_id: chatId,
              message_id: query.message.message_id,
              parse_mode: 'HTML'
            }
          );
          await clearWizardState(telegramId);
          return;
        }
        
        // Створюємо користувача з power_notify_target = 'bot'
        // Note: Two separate calls used here to maintain backward compatibility with createUser
        // TODO: Consider extending createUser to accept power_notify_target parameter
        await usersDb.createUser(telegramId, username, state.region, state.queue);
        await usersDb.updateUserPowerNotifyTarget(telegramId, 'bot');
        
        // Log user registration for growth tracking
        await logUserRegistration(telegramId, { region: state.region, queue: state.queue, username, notify_target: 'bot' });
        await logWizardCompletion(telegramId);
        
        // Notify admins about new user
        await notifyAdminsAboutNewUser(bot, telegramId, username, state.region, state.queue);
      }
      await clearWizardState(telegramId);
      
      const region = REGIONS[state.region]?.name || state.region;
      
      await safeEditMessageText(bot, 
        `✅ <b>Налаштування завершено!</b>\n\n` +
        `📍 Регіон: ${region}\n` +
        `⚡️ Черга: ${state.queue}\n` +
        `📬 Сповіщення: у цей чат\n\n` +
        `Сповіщення приходитимуть у цей чат.`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
        }
      );
      
      // Затримка перед показом головного меню
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Пропозиція підписатись на канал новин
      await bot.api.sendMessage(chatId, NEWS_CHANNEL_MESSAGE.text, NEWS_CHANNEL_MESSAGE.options);
      
      // Відправляємо головне меню
      const botStatus = 'no_channel'; // New user won't have channel yet
      const sentMessage = await bot.api.sendMessage(
        chatId, 
        '🏠 <b>Головне меню</b>',
        {
          parse_mode: 'HTML',
          ...getMainMenu(botStatus, false)
        }
      );
      await usersDb.updateUser(telegramId, { last_start_message_id: sentMessage.message_id });
      
      return;
    }
    
    // Wizard: вибір "У Telegram-каналі"
    if (data === 'wizard_notify_channel') {
      // Перевірка режиму паузи
      const botPaused = await getSetting('bot_paused', '0') === '1';
      
      if (botPaused) {
        const pauseMessage = await getSetting('pause_message', '🔧 Бот тимчасово недоступний. Спробуйте пізніше.');
        const showSupport = await getSetting('pause_show_support', '1') === '1';
        
        await safeEditMessageText(bot, pauseMessage, {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: await createPauseKeyboard(showSupport)
        });
        return;
      }
      
      const username = query.from.username || query.from.first_name;
      
      // Перевіряємо чи користувач вже існує
      const existingUser = await usersDb.getUserByTelegramId(telegramId);
      
      if (existingUser) {
        // Користувач вже існує - оновлюємо налаштування включаючи регіон та чергу з wizard
        await usersDb.updateUserRegionAndQueue(telegramId, state.region, state.queue);
        await usersDb.updateUserPowerNotifyTarget(telegramId, 'both');
      } else {
        // Check registration limits before creating new user
        const limit = await checkUserLimit();
        if (limit.reached || !await isRegistrationEnabled()) {
          await safeEditMessageText(bot, 
            `⚠️ <b>Реєстрація тимчасово обмежена</b>\n\n` +
            `На даний момент реєстрація нових користувачів тимчасово зупинена.\n\n` +
            `Спробуйте пізніше або зв'яжіться з підтримкою.`,
            {
              chat_id: chatId,
              message_id: query.message.message_id,
              parse_mode: 'HTML'
            }
          );
          await clearWizardState(telegramId);
          return;
        }
        
        // Створюємо нового користувача з power_notify_target = 'both'
        // Note: Two separate calls used here to maintain backward compatibility with createUser
        // TODO: Consider extending createUser to accept power_notify_target parameter
        await usersDb.createUser(telegramId, username, state.region, state.queue);
        await usersDb.updateUserPowerNotifyTarget(telegramId, 'both');
        
        // Log user registration for growth tracking
        await logUserRegistration(telegramId, { region: state.region, queue: state.queue, username, notify_target: 'both' });
        await logWizardCompletion(telegramId);
        
        // Notify admins about new user
        await notifyAdminsAboutNewUser(bot, telegramId, username, state.region, state.queue);
      }
      
      // Зберігаємо wizard state для обробки підключення каналу
      state.step = 'channel_setup';
      await setWizardState(telegramId, state);
      
      // Використовуємо існуючу логіку підключення каналу
      const { pendingChannels } = require('../bot');
      
      // Перевіряємо чи є pending channel для ЦЬОГО користувача
      let pendingChannel = null;
      for (const [channelId, channel] of pendingChannels.entries()) {
        // Канал має бути доданий протягом останніх 30 хвилин
        if (Date.now() - channel.timestamp < PENDING_CHANNEL_EXPIRATION_MS) {
          // Перевіряємо що канал не зайнятий іншим користувачем
          const existingUser = await usersDb.getUserByChannelId(channelId);
          if (!existingUser || existingUser.telegram_id === telegramId) {
            pendingChannel = channel;
            break;
          }
        }
      }
      
      if (pendingChannel) {
        // Є канал для підключення - показати підтвердження
        await safeEditMessageText(bot, 
          `📺 <b>Знайдено канал!</b>\n\n` +
          `Канал: <b>${escapeHtml(pendingChannel.channelTitle)}</b>\n` +
          `(${pendingChannel.channelUsername})\n\n` +
          `Підключити цей канал?`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✓ Так, підключити', callback_data: `wizard_channel_confirm_${pendingChannel.channelId}` },
                  { text: '✕ Ні', callback_data: 'wizard_notify_back' }
                ]
              ]
            }
          }
        );
      } else {
        // Немає pending каналу - показати інструкції
        // Отримуємо username бота для інструкції (з кешем)
        const botUsername = await getBotUsername(bot);
        
        await safeEditMessageText(bot, 
          getChannelConnectionInstructions(botUsername),
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Перевірити', callback_data: 'wizard_notify_channel' }],
                [{ text: '← Назад', callback_data: 'wizard_notify_back' }]
              ]
            }
          }
        );
        
        // Оновлюємо wizard state з message ID
        state.lastMessageId = query.message.message_id;
        await setWizardState(telegramId, state);
      }
      
      return;
    }
    
    // Wizard: назад до вибору куди сповіщати
    if (data === 'wizard_notify_back') {
      state.step = 'notify_target';
      await setWizardState(telegramId, state);
      
      const region = REGIONS[state.region]?.name || state.region;
      
      await safeEditMessageText(bot, 
        `✅ Налаштування:\n\n` +
        `📍 Регіон: ${region}\n` +
        `⚡️ Черга: ${state.queue}\n\n` +
        `📬 Куди надсилати сповіщення про світло та графіки?\n\n` +
        `Оберіть, де вам зручніше їх отримувати:\n\n` +
        `📱 <b>У цьому боті</b>\n` +
        `Сповіщення приходитимуть прямо в цей чат\n\n` +
        `📺 <b>У вашому Telegram-каналі</b>\n` +
        `Бот публікуватиме сповіщення у ваш канал\n` +
        `(потрібно додати бота як адміністратора)`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: getWizardNotifyTargetKeyboard().reply_markup,
        }
      );
      
      return;
    }
    
    // Wizard: підтвердження підключення каналу
    if (data.startsWith('wizard_channel_confirm_')) {
      // Перевірка режиму паузи
      const botPaused = await getSetting('bot_paused', '0') === '1';
      
      if (botPaused) {
        const pauseMessage = await getSetting('pause_message', '🔧 Бот тимчасово недоступний. Спробуйте пізніше.');
        const showSupport = await getSetting('pause_show_support', '1') === '1';
        
        await safeEditMessageText(bot, pauseMessage, {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: await createPauseKeyboard(showSupport)
        });
        return;
      }
      
      const channelId = data.replace('wizard_channel_confirm_', '');
      
      // Перевіряємо чи бот ще в каналі
      try {
        const botInfo = await bot.api.getMe();
        const chatMember = await bot.api.getChatMember(channelId, botInfo.id);
        
        if (chatMember.status !== 'administrator') {
          await safeAnswerCallbackQuery(bot, query.id, {
            text: '❌ Бота більше немає в каналі. Додайте його знову.',
            show_alert: true
          });
          return;
        }
      } catch (error) {
        await safeAnswerCallbackQuery(bot, query.id, {
          text: '❌ Не вдалося перевірити канал. Спробуйте ще раз.',
          show_alert: true
        });
        return;
      }
      
      const { pendingChannels, removePendingChannel } = require('../bot');
      const pending = pendingChannels.get(channelId);
      
      if (!pending) {
        await safeAnswerCallbackQuery(bot, query.id, {
          text: '❌ Канал не знайдено. Додайте бота в канал ще раз.',
          show_alert: true
        });
        return;
      }
      
      // Зберігаємо канал
      await usersDb.updateUser(telegramId, {
        channel_id: channelId,
        channel_title: pending.channelTitle
      });
      
      // Видаляємо з pending
      removePendingChannel(channelId);
      
      // Очищаємо wizard state (wizard завершено, далі channel conversation)
      await clearWizardState(telegramId);
      
      // Запускаємо channel branding flow (як у settings flow)
      await setConversationState(telegramId, {
        state: 'waiting_for_title',
        channelId: channelId,
        channelUsername: pending.channelUsername || pending.channelTitle,
        timestamp: Date.now()
      });
      
      // Показуємо форму введення назви
      await safeEditMessageText(bot,
        '✅ Канал підключено!\n\n' +
        '📝 <b>Введіть назву для каналу</b>\n\n' +
        `Вона буде додана після префіксу "${CHANNEL_NAME_PREFIX}"\n\n` +
        '<b>Приклад:</b> Київ Черга 3.1\n' +
        '<b>Результат:</b> СвітлоБот ⚡️ Київ Черга 3.1',
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML'
        }
      );
      
      return;
    }
    
    // Wizard: відмова від підключення
    if (data === 'wizard_channel_cancel') {
      const { removePendingChannel } = require('../bot');
      
      // Видаляємо pending channel якщо є
      if (state && state.pendingChannelId) {
        removePendingChannel(state.pendingChannelId);
      }
      
      // Повертаємося до вибору куди сповіщати
      state.step = 'notify_target';
      state.pendingChannelId = null;
      await setWizardState(telegramId, state);
      
      await safeEditMessageText(bot,
        `👌 Добре, канал не підключено.\n\n` +
        `Оберіть куди надсилати сповіщення:`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: getWizardNotifyTargetKeyboard().reply_markup
        }
      );
      
      return;
    }
    
  } catch (error) {
    // Sanitize state for logging - only log non-sensitive fields
    const sanitizedState = state ? {
      step: state.step,
      region: state.region,
      queue: state.queue,
      mode: state.mode,
    } : null;
    console.error('Помилка в handleWizardCallback:', error, 'data:', data, 'state:', sanitizedState);
    notifyAdminsAboutError(bot, error, 'handleWizardCallback');
    await safeAnswerCallbackQuery(bot, query.id, { text: '😅 Щось пішло не так. Спробуйте ще раз!' });
  }
}

module.exports = {
  handleStart,
  handleWizardCallback,
  startWizard,
  isInWizard,
  getWizardState,
  setWizardState,
  clearWizardState,
  restoreWizardStates,
};
