const usersDb = require('../../database/users');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { getChannelNotificationKeyboard } = require('../../keyboards/inline');
const { buildChannelNotificationMessage } = require('../settings/helpers');

async function handleChannelNotificationCallbacks(bot, query, data, chatId, telegramId, user) {
  // Show channel notification settings screen
  if (data === 'channel_notifications') {
    if (!user || !user.channel_id) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Канал не підключено',
        show_alert: true
      });
      return true;
    }
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    await safeEditMessageText(bot, buildChannelNotificationMessage(fresh), {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getChannelNotificationKeyboard(fresh).reply_markup,
    });
    return true;
  }

  // Toggle: channel schedule notifications
  if (data === 'ch_notif_toggle_schedule') {
    const newVal = !(user.ch_notify_schedule !== false);
    await usersDb.updateChannelNotificationSettings(telegramId, { ch_notify_schedule: newVal });
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    await safeEditMessageText(bot, buildChannelNotificationMessage(fresh), {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getChannelNotificationKeyboard(fresh).reply_markup,
    });
    return true;
  }

  // Toggle: channel fact on/off together
  if (data === 'ch_notif_toggle_fact') {
    const currentVal = user.ch_notify_fact_off !== false;
    const newVal = !currentVal;
    await usersDb.updateChannelNotificationSettings(telegramId, { ch_notify_fact_off: newVal, ch_notify_fact_on: newVal });
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    await safeEditMessageText(bot, buildChannelNotificationMessage(fresh), {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getChannelNotificationKeyboard(fresh).reply_markup,
    });
    return true;
  }

  // Time toggles (multi-select) with sync
  const timeToggles = {
    ch_notif_time_15: 'ch_remind_15m',
    ch_notif_time_30: 'ch_remind_30m',
    ch_notif_time_60: 'ch_remind_1h',
  };
  if (timeToggles[data]) {
    const field = timeToggles[data];
    const currentVal = field === 'ch_remind_15m' ? user.ch_remind_15m !== false : user[field] === true;
    const newVal = !currentVal;
    const updates = { [field]: newVal };

    // Compute updated timer values for sync
    const t15 = field === 'ch_remind_15m' ? newVal : (user.ch_remind_15m !== false);
    const t30 = field === 'ch_remind_30m' ? newVal : (user.ch_remind_30m === true);
    const t60 = field === 'ch_remind_1h' ? newVal : (user.ch_remind_1h === true);
    const anyOn = t15 || t30 || t60;
    updates.ch_notify_remind_off = anyOn;
    updates.ch_notify_remind_on = anyOn;

    await usersDb.updateChannelNotificationSettings(telegramId, updates);
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    await safeEditMessageText(bot, buildChannelNotificationMessage(fresh), {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getChannelNotificationKeyboard(fresh).reply_markup,
    });
    return true;
  }

  return false;
}

module.exports = { handleChannelNotificationCallbacks };
