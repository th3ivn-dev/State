const usersDb = require('../../database/users');
const { isAdmin } = require('../../utils');
const config = require('../../config');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { getUnifiedAlertsKeyboard, getAdminKeyboard } = require('../../keyboards/inline');
const { buildAlertsMessage } = require('./helpers');

async function handleAlertsCallback(bot, query, user) {
  const chatId = query.message.chat.id;
  const telegramId = String(query.from.id);
  const data = query.data;

  // Налаштування алертів - unified menu
  if (data === 'settings_alerts') {
    const currentTarget = user.power_notify_target || 'both';

    await safeEditMessageText(bot, buildAlertsMessage(user.is_active, currentTarget), {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getUnifiedAlertsKeyboard(user.is_active, currentTarget).reply_markup,
    });
    return;
  }

  // Toggle alerts on/off - unified menu
  if (data === 'alert_toggle') {
    const newValue = !user.is_active;
    await usersDb.setUserActive(telegramId, newValue);

    const updatedUser = await usersDb.getUserByTelegramId(telegramId);
    const currentTarget = updatedUser.power_notify_target || 'both';

    await safeEditMessageText(bot, buildAlertsMessage(updatedUser.is_active, currentTarget), {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getUnifiedAlertsKeyboard(updatedUser.is_active, currentTarget).reply_markup,
    });
    return;
  }

  // Admin panel
  if (data === 'settings_admin') {
    const userIsAdmin = isAdmin(telegramId, config.adminIds, config.ownerId);
    if (!userIsAdmin) {
      await safeAnswerCallbackQuery(bot, query.id, { text: '❌ Доступ заборонено', show_alert: true });
      return;
    }

    // Show admin panel directly

    await safeEditMessageText(bot,
      '🔧 <b>Адмін-панель</b>',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getAdminKeyboard().reply_markup,
      }
    );
    return;
  }

  // Встановити налаштування куди публікувати - update unified menu
  if (data.startsWith('notify_target_')) {
    const target = data.replace('notify_target_', '');
    if (['bot', 'channel', 'both'].includes(target)) {
      const success = await usersDb.updateUserPowerNotifyTarget(telegramId, target);

      if (!success) {
        await safeAnswerCallbackQuery(bot, query.id, {
          text: '❌ Помилка оновлення налаштування',
          show_alert: true
        });
        return;
      }

      // Refresh the unified alerts menu
      const updatedUser = await usersDb.getUserByTelegramId(telegramId);
      await safeEditMessageText(bot,
        buildAlertsMessage(updatedUser.is_active, target),
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: getUnifiedAlertsKeyboard(updatedUser.is_active, target).reply_markup
        }
      );
    }
    return;
  }
}

module.exports = { handleAlertsCallback };
