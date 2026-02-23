const usersDb = require('../../database/users');
const { getSettingsKeyboard, getErrorKeyboard } = require('../../keyboards/inline');
const { REGIONS } = require('../../constants/regions');
const { isAdmin, generateLiveStatusMessage } = require('../../utils');
const config = require('../../config');
const { formatErrorMessage } = require('../../formatter');
const { safeSendMessage, safeDeleteMessage, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { handleRegionCallback } = require('./region');
const { handleAlertsCallback } = require('./alerts');
const { handleDataCallback } = require('./data');
const { handleIpCallback, handleIpConversation } = require('./ip');
const { handleChannelCallback } = require('./channel');
const { restoreIpSetupStates, clearIpSetupState, isValidIPorDomain } = require('./helpers');

// Обробник команди /settings
async function handleSettings(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);

  try {
    const user = await usersDb.getUserByTelegramId(telegramId);

    if (!user) {
      await safeSendMessage(bot, chatId, '❌ Спочатку запустіть бота, натиснувши /start');
      return;
    }

    // Delete previous settings message if exists
    if (user.last_settings_message_id) {
      await safeDeleteMessage(bot, chatId, user.last_settings_message_id);
    }

    const userIsAdmin = isAdmin(telegramId, config.adminIds, config.ownerId);
    const regionName = REGIONS[user.region]?.name || user.region;

    // Generate Live Status message using helper function
    const message = generateLiveStatusMessage(user, regionName);

    const sentMessage = await safeSendMessage(bot, chatId, message, {
      parse_mode: 'HTML',
      ...getSettingsKeyboard(userIsAdmin),
    });

    if (sentMessage) {
      await usersDb.updateUser(telegramId, { last_settings_message_id: sentMessage.message_id });
    }

  } catch (error) {
    console.error('Помилка в handleSettings:', error);
    const errorKeyboard = await getErrorKeyboard();
    await safeSendMessage(bot, chatId, formatErrorMessage(), {
      parse_mode: 'HTML',
      ...errorKeyboard
    });
  }
}

// Обробник callback для налаштувань
async function handleSettingsCallback(bot, query) {
  const telegramId = String(query.from.id);
  const data = query.data;

  try {
    const user = await usersDb.getUserByTelegramId(telegramId);

    if (!user) {
      await safeAnswerCallbackQuery(bot, query.id, { text: '❌ Користувача не знайдено' });
      return;
    }

    // Answer callback query immediately to prevent timeout (after user validation)
    await bot.api.answerCallbackQuery(query.id).catch(() => {});

    // Route to appropriate sub-handler
    if (data === 'settings_region' || data === 'settings_region_confirm' || data === 'back_to_settings') {
      await handleRegionCallback(bot, query, user);
    } else if (data === 'settings_alerts' || data === 'alert_toggle' || data === 'settings_admin' || data.startsWith('notify_target_')) {
      await handleAlertsCallback(bot, query, user);
    } else if (data === 'settings_delete_data' || data === 'delete_data_step2' || data === 'confirm_delete_data' || data === 'settings_deactivate' || data === 'confirm_deactivate') {
      await handleDataCallback(bot, query, user);
    } else if (data === 'settings_ip' || data === 'ip_instruction' || data === 'ip_setup' || data === 'ip_cancel' || data === 'ip_show' || data === 'ip_delete') {
      await handleIpCallback(bot, query, user);
    } else if (data === 'settings_channel' || data === 'channel_reconnect' || data === 'settings_test') {
      await handleChannelCallback(bot, query, user);
    }

  } catch (error) {
    console.error('Помилка в handleSettingsCallback:', error);
    await safeAnswerCallbackQuery(bot, query.id, { text: '😅 Щось пішло не так. Спробуйте ще раз!' });
  }
}

module.exports = {
  handleSettings,
  handleSettingsCallback,
  handleIpConversation,
  restoreIpSetupStates,
  clearIpSetupState, // Export for /start cleanup
  isValidIPorDomain, // Export for admin router IP validation
};
