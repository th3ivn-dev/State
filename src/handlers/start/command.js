const usersDb = require('../../database/users');
const { formatErrorMessage } = require('../../formatter');
const { getErrorKeyboard, getMainMenu, getRegionKeyboard, getRestorationKeyboard } = require('../../keyboards/inline');
const { REGIONS } = require('../../constants/regions');
const { safeSendMessage, safeDeleteMessage } = require('../../utils/errorHandler');
const { getState, setState, clearState } = require('../../state/stateManager');
const { clearConversationState } = require('../channel');
const { notifyAdminsAboutError } = require('../../utils/adminNotifier');
const { clearFeedbackState } = require('../feedback');
const { clearRegionRequestState } = require('../regionRequest');
const { clearIpSetupState } = require('../settings');
const { isInWizard, setWizardState, getWizardState, clearWizardState, DEVELOPMENT_WARNING } = require('./helpers');

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
    await clearIpSetupState(telegramId);
    
    // Clear any pending channel conversation state
    await clearConversationState(telegramId);
    
    // Clear any pending region request state
    await clearRegionRequestState(telegramId);
    
    // Clear any pending feedback state
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

module.exports = {
  handleStart,
  startWizard,
};
