const usersDb = require('../../database/users');
const { isAdmin } = require('../../utils');
const config = require('../../config');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const {
  getUnifiedAlertsKeyboard,
  getAdminKeyboard,
  getNotificationKeyboard,
} = require('../../keyboards/inline');
const { buildAlertsMessage, buildNotificationSettingsMessage } = require('./helpers');

async function handleAlertsCallback(bot, query, user) {
  const chatId = query.message.chat.id;
  const telegramId = String(query.from.id);
  const data = query.data;

  // ── Single-screen notification menu ───────────────────────────

  // Show notification settings screen
  if (data === 'settings_alerts' || data === 'notif_main') {
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    await safeEditMessageText(bot, buildNotificationSettingsMessage(fresh), {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getNotificationKeyboard(fresh).reply_markup,
    });
    return;
  }

  // Toggle: schedule change notifications
  if (data === 'notif_toggle_schedule') {
    const newVal = !(user.notify_schedule_changes !== false);
    await usersDb.updateNotificationSettings(telegramId, { notify_schedule_changes: newVal });
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    await safeEditMessageText(bot, buildNotificationSettingsMessage(fresh), {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getNotificationKeyboard(fresh).reply_markup,
    });
    return;
  }

  // Toggle: fact on/off together
  if (data === 'notif_toggle_fact') {
    const currentVal = user.notify_fact_off !== false;
    const newVal = !currentVal;
    await usersDb.updateNotificationSettings(telegramId, { notify_fact_off: newVal, notify_fact_on: newVal });
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    await safeEditMessageText(bot, buildNotificationSettingsMessage(fresh), {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getNotificationKeyboard(fresh).reply_markup,
    });
    return;
  }

  // Time toggles (multi-select) with sync of notify_remind_off / notify_remind_on
  const timeToggles = {
    notif_time_15: 'remind_15m',
    notif_time_30: 'remind_30m',
    notif_time_60: 'remind_1h',
  };
  if (timeToggles[data]) {
    const field = timeToggles[data];
    const currentVal = field === 'remind_15m' ? user.remind_15m !== false : user[field] === true;
    const newVal = !currentVal;
    const updates = { [field]: newVal };

    // Compute updated timer values for sync
    const t15 = field === 'remind_15m' ? newVal : (user.remind_15m !== false);
    const t30 = field === 'remind_30m' ? newVal : (user.remind_30m === true);
    const t60 = field === 'remind_1h' ? newVal : (user.remind_1h === true);
    const anyOn = t15 || t30 || t60;
    updates.notify_remind_off = anyOn;
    updates.notify_remind_on = anyOn;

    await usersDb.updateNotificationSettings(telegramId, updates);
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    await safeEditMessageText(bot, buildNotificationSettingsMessage(fresh), {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getNotificationKeyboard(fresh).reply_markup,
    });
    return;
  }

  // ── Legacy unified alerts menu (backward compatibility) ───────

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
