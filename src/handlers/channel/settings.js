const usersDb = require('../../database/users');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { getFormatSettingsKeyboard } = require('../../keyboards/inline');
const { FORMAT_SETTINGS_MESSAGE } = require('./helpers');

// Handle settings-related callbacks
async function handleSettingsCallbacks(bot, query, data, chatId, telegramId, user) {
  // Handle channel_info - show channel information
  if (data === 'channel_info') {
    if (!user || !user.channel_id) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Канал не підключено',
        show_alert: true
      });
      return true;
    }

    const statusText = user.channel_status === 'blocked' ? '🔴 Заблокований' : '🟢 Активний';
    const infoText =
      `📺 <b>Інформація про канал</b>\n\n` +
      `ID: <code>${user.channel_id}</code>\n` +
      `Назва: ${user.channel_title || 'Не налаштовано'}\n` +
      `Статус: ${statusText}\n\n` +
      (user.channel_status === 'blocked'
        ? `⚠️ Канал заблокований через ручну зміну налаштувань.\nВикористайте "Перепідключити канал" для відновлення.`
        : `✅ Канал активний і готовий до публікацій.`);

    await safeAnswerCallbackQuery(bot, query.id, {
      text: infoText.replace(/[<>]/g, ''), // Remove angle brackets for plain-text popup
      show_alert: true
    });
    return true;
  }

  // Handle channel_disable - show confirmation first
  if (data === 'channel_disable') {
    if (!user || !user.channel_id) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Канал не підключено',
        show_alert: true
      });
      return true;
    }

    // Show confirmation dialog
    const confirmKeyboard = {
      inline_keyboard: [
        [
          { text: '✓ Так, вимкнути', callback_data: 'channel_disable_confirm' },
          { text: '✕ Скасувати', callback_data: 'settings_channel' }
        ]
      ]
    };

    await safeEditMessageText(bot,
      `⚠️ <b>Точно вимкнути публікації?</b>\n\n` +
      `Канал буде відключено від бота.\n` +
      `Графіки більше не будуть публікуватись.\n\n` +
      `Для повторного підключення перейдіть у:\n` +
      `Налаштування → Канал → Підключити канал`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: confirmKeyboard
      }
    );
    return true;
  }

  // Handle confirmed channel disable
  if (data === 'channel_disable_confirm') {
    if (!user || !user.channel_id) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Канал не підключено',
        show_alert: true
      });
      return true;
    }

    // Remove channel from user
    await usersDb.updateUserChannel(telegramId, null);

    await safeEditMessageText(bot,
      `✅ <b>Публікації вимкнено</b>\n\n` +
      `Канал відключено. Графіки більше не будуть публікуватись.\n\n` +
      `Для повторного підключення перейдіть у:\n` +
      `Налаштування → Канал → Підключити канал`,
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
    await safeAnswerCallbackQuery(bot, query.id, { text: '✅ Канал відключено' });
    return true;
  }

  // Handle channel_format - show format settings menu (Level 1)
  if (data === 'channel_format') {
    if (!user || !user.channel_id) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Канал не підключено',
        show_alert: true
      });
      return true;
    }

    await safeEditMessageText(bot,
      FORMAT_SETTINGS_MESSAGE,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getFormatSettingsKeyboard(user).reply_markup
      }
    );
    return true;
  }

  // Handle format_menu - show format settings menu (Level 1)
  if (data === 'format_menu') {
    if (!user || !user.channel_id) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Канал не підключено',
        show_alert: true
      });
      return true;
    }

    await safeEditMessageText(bot,
      FORMAT_SETTINGS_MESSAGE,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getFormatSettingsKeyboard(user).reply_markup
      }
    );
    return true;
  }

  return false;
}

module.exports = { handleSettingsCallbacks };
