const usersDb = require('../../database/users');
const { isAdmin } = require('../../utils');
const config = require('../../config');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const {
  getUnifiedAlertsKeyboard,
  getAdminKeyboard,
  getNotificationMainKeyboard,
  getNotificationRemindersKeyboard,
  getNotificationTargetsKeyboard,
  getNotificationTargetSelectKeyboard,
} = require('../../keyboards/inline');
const { buildAlertsMessage } = require('./helpers');

async function handleAlertsCallback(bot, query, user) {
  const chatId = query.message.chat.id;
  const telegramId = String(query.from.id);
  const data = query.data;

  // ── New 3-level notification menu ─────────────────────────────

  // Screen 1 — main notification screen
  if (data === 'settings_alerts' || data === 'notif_main') {
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    await safeEditMessageText(bot, '🔔 <b>Сповіщення</b>', {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getNotificationMainKeyboard(fresh).reply_markup,
    });
    return;
  }

  // Toggle: schedule change notifications
  if (data === 'notif_toggle_schedule') {
    const newVal = !(user.notify_schedule_changes !== false);
    await usersDb.updateNotificationSettings(telegramId, { notify_schedule_changes: newVal });
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    await safeEditMessageText(bot, '🔔 <b>Сповіщення</b>', {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getNotificationMainKeyboard(fresh).reply_markup,
    });
    return;
  }

  // Screen 2 — reminders submenu
  if (data === 'notif_reminders') {
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    await safeEditMessageText(bot, '⏰ <b>Нагадування</b>', {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getNotificationRemindersKeyboard(fresh).reply_markup,
    });
    return;
  }

  // Reminder toggles
  const reminderToggles = {
    notif_toggle_remind_off: 'notify_remind_off',
    notif_toggle_fact_off: 'notify_fact_off',
    notif_toggle_remind_on: 'notify_remind_on',
    notif_toggle_fact_on: 'notify_fact_on',
  };
  if (reminderToggles[data]) {
    const field = reminderToggles[data];
    const newVal = !(user[field] !== false);
    await usersDb.updateNotificationSettings(telegramId, { [field]: newVal });
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    await safeEditMessageText(bot, '⏰ <b>Нагадування</b>', {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getNotificationRemindersKeyboard(fresh).reply_markup,
    });
    return;
  }

  // Time toggles (multi-select)
  const timeToggles = {
    notif_time_15: 'remind_15m',
    notif_time_30: 'remind_30m',
    notif_time_60: 'remind_1h',
  };
  if (timeToggles[data]) {
    const field = timeToggles[data];
    const currentVal = data === 'notif_time_15' ? user.remind_15m !== false : user[field] === true;
    await usersDb.updateNotificationSettings(telegramId, { [field]: !currentVal });
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    await safeEditMessageText(bot, '⏰ <b>Нагадування</b>', {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getNotificationRemindersKeyboard(fresh).reply_markup,
    });
    return;
  }

  // Screen 3 — where to send
  if (data === 'notif_targets') {
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    await safeEditMessageText(bot, '📍 <b>Куди надсилати</b>', {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getNotificationTargetsKeyboard(fresh).reply_markup,
    });
    return;
  }

  // Screen 3.1 — select target for type
  if (data.startsWith('notif_target_type_')) {
    const type = data.replace('notif_target_type_', '');
    const typeField = { schedule: 'notify_schedule_target', remind: 'notify_remind_target', power: 'notify_power_target' }[type];
    const typeLabel = { schedule: 'Зміни графіка', remind: 'Нагадування', power: 'Факт. стан (IP)' }[type];
    if (!typeField) return;

    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    const current = fresh[typeField] || 'bot';
    await safeEditMessageText(bot, `📍 <b>Куди: ${typeLabel}</b>`, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getNotificationTargetSelectKeyboard(type, current).reply_markup,
    });
    return;
  }

  // Set target for type
  if (data.startsWith('notif_target_set_')) {
    const parts = data.replace('notif_target_set_', '').split('_');
    // parts = [type, value] but value may be 'both' which contains no underscore issue
    // Format: notif_target_set_{type}_{value}
    // type can be 'schedule', 'remind', 'power'
    const value = parts[parts.length - 1];
    const type = parts.slice(0, -1).join('_');
    const typeField = { schedule: 'notify_schedule_target', remind: 'notify_remind_target', power: 'notify_power_target' }[type];
    const typeLabel = { schedule: 'Зміни графіка', remind: 'Нагадування', power: 'Факт. стан (IP)' }[type];
    if (!typeField || !['bot', 'channel', 'both'].includes(value)) return;

    await usersDb.updateNotificationSettings(telegramId, { [typeField]: value });
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    const current = fresh[typeField] || 'bot';
    await safeEditMessageText(bot, `📍 <b>Куди: ${typeLabel}</b>`, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getNotificationTargetSelectKeyboard(type, current).reply_markup,
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
