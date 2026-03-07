const usersDb = require('../../database/users');
const { REGIONS } = require('../../constants/regions');
const { getMainMenu } = require('../../keyboards/inline');
const { safeAnswerCallbackQuery, safeEditMessageText } = require('../../utils/errorHandler');
const { notifyAdminsAboutError } = require('../../utils/adminNotifier');
const { getWizardState, isInWizard, setWizardState, clearWizardState, restoreWizardStates } = require('./helpers');
const { handleStart, startWizard } = require('./command');
const { handleRegionCallback } = require('./region');
const { handleNotifyCallback } = require('./notify');

// Обробник callback query для wizard
async function handleWizardCallback(bot, query) {
  const chatId = query.message.chat.id;
  const telegramId = String(query.from.id);
  const data = query.data;

  await bot.api.answerCallbackQuery(query.id).catch(() => {});

  try {
    // Handle restore_profile: reactivate existing user and show main menu
    if (data === 'restore_profile') {
      const user = await usersDb.getUserByTelegramId(telegramId);
      if (user) {
        await usersDb.setUserActive(telegramId, true);

        const region = REGIONS[user.region]?.name || user.region;

        let botStatus = 'active';
        if (!user.channel_id) {
          botStatus = 'no_channel';
        }

        const channelPaused = user.channel_paused === true;

        let message = '✅ <b>Профіль відновлено!</b>\n\n';
        message += '🏠 <b>Головне меню</b>\n\n';
        message += `📍 Регіон: ${region} • ${user.queue}\n`;
        message += `📺 Канал: ${user.channel_id ? user.channel_id + ' ✅' : 'не підключено'}\n`;
        message += `🔔 Сповіщення: увімкнено ✅\n`;

        await safeEditMessageText(bot, message, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: getMainMenu(botStatus, channelPaused).reply_markup,
        });

        await usersDb.updateUser(telegramId, { last_start_message_id: query.message.message_id });
      }
      return;
    }

    // Handle create_new_profile: delete existing data and start wizard from scratch
    if (data === 'create_new_profile') {
      const existingUser = await usersDb.getUserByTelegramId(telegramId);
      if (existingUser) {
        await usersDb.deleteUser(telegramId);
      }
      const username = query.from.username || query.from.first_name;
      await startWizard(bot, chatId, telegramId, username, 'new');
      return;
    }

    const state = getWizardState(telegramId) || { step: 'region' };

    // Route to region/queue/confirm/back handlers
    if (await handleRegionCallback(bot, query, chatId, telegramId, data, state)) {
      return;
    }

    // Route to notify/channel handlers
    if (await handleNotifyCallback(bot, query, chatId, telegramId, data, state)) {
      return;
    }

  } catch (error) {
    // Sanitize state for logging - only log non-sensitive fields
    const state = getWizardState(telegramId);
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
