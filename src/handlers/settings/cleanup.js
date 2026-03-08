const usersDb = require('../../database/users');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { getCleanupKeyboard } = require('../../keyboards/inline');

function getCleanupText(user) {
  const cmdStatus = user.auto_delete_commands ? '✅' : '❌';
  const msgStatus = user.auto_delete_bot_messages ? '✅' : '❌';

  return `🗑 <b>Автоматичне очищення</b>\n\n` +
    `⌨️ <b>Команди:</b> ${cmdStatus}\n` +
    `Миттєве видалення ваших запитів (типу /start, /my_queue тощо)\n\n` +
    `💬 <b>Відповіді:</b> ${msgStatus}\n` +
    `Очищення повідомлень бота через 120 хв`;
}

async function handleCleanupCallback(bot, query, user) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const telegramId = String(query.from.id);
  const data = query.data;

  if (data === 'settings_cleanup') {
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    await safeEditMessageText(bot, getCleanupText(fresh), {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: getCleanupKeyboard(fresh).reply_markup,
    });
    return;
  }

  if (data === 'cleanup_toggle_commands') {
    const newVal = !(user.auto_delete_commands === true);
    await usersDb.updateCleanupSettings(telegramId, { auto_delete_commands: newVal });
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;

    try {
      await bot.api.editMessageText(chatId, messageId, getCleanupText(fresh), {
        parse_mode: 'HTML',
        reply_markup: getCleanupKeyboard(fresh).reply_markup,
      });
    } catch (_e) {
      try {
        await bot.api.editMessageReplyMarkup(chatId, messageId, {
          reply_markup: getCleanupKeyboard(fresh).reply_markup,
        });
      } catch (_e2) { /* ignore */ }
    }
    await safeAnswerCallbackQuery(bot, query.id, {
      text: newVal ? '✅ Команди будуть видалятись' : '❌ Видалення команд вимкнено',
    });
    return;
  }

  if (data === 'cleanup_toggle_messages') {
    const newVal = !(user.auto_delete_bot_messages === true);
    await usersDb.updateCleanupSettings(telegramId, { auto_delete_bot_messages: newVal });
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;

    try {
      await bot.api.editMessageText(chatId, messageId, getCleanupText(fresh), {
        parse_mode: 'HTML',
        reply_markup: getCleanupKeyboard(fresh).reply_markup,
      });
    } catch (_e) {
      try {
        await bot.api.editMessageReplyMarkup(chatId, messageId, {
          reply_markup: getCleanupKeyboard(fresh).reply_markup,
        });
      } catch (_e2) { /* ignore */ }
    }
    await safeAnswerCallbackQuery(bot, query.id, {
      text: newVal ? '✅ Відповіді будуть видалятись через 120 хв' : '❌ Видалення відповідей вимкнено',
    });
    return;
  }
}

module.exports = { handleCleanupCallback };
