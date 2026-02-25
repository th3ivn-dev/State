const usersDb = require('../../database/users');
const { safeEditMessageText } = require('../../utils/errorHandler');
const { getCleanupKeyboard } = require('../../keyboards/inline');

async function handleCleanupCallback(bot, query, user) {
  const chatId = query.message.chat.id;
  const telegramId = String(query.from.id);
  const data = query.data;

  const CLEANUP_TEXT = `🗑 <b>Автоматичне очищення</b>\n\nКеруйте автоматичним видаленням повідомлень:\n\n` +
    `❌ <b>Видаляти команди</b> — команди які ви вводите вручну (/start та інші) видаляються миттєво\n\n` +
    `❌ <b>Видаляти повідомлення бота</b> — повідомлення від бота видаляються автоматично через 2 години`;

  if (data === 'settings_cleanup') {
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    await safeEditMessageText(bot, CLEANUP_TEXT, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getCleanupKeyboard(fresh).reply_markup,
    });
    return;
  }

  if (data === 'cleanup_toggle_commands') {
    const newVal = !(user.auto_delete_commands === true);
    await usersDb.updateCleanupSettings(telegramId, { auto_delete_commands: newVal });
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    await safeEditMessageText(bot, CLEANUP_TEXT, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getCleanupKeyboard(fresh).reply_markup,
    });
    return;
  }

  if (data === 'cleanup_toggle_messages') {
    const newVal = !(user.auto_delete_bot_messages === true);
    await usersDb.updateCleanupSettings(telegramId, { auto_delete_bot_messages: newVal });
    const fresh = await usersDb.getUserByTelegramId(telegramId) || user;
    await safeEditMessageText(bot, CLEANUP_TEXT, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getCleanupKeyboard(fresh).reply_markup,
    });
    return;
  }
}

module.exports = { handleCleanupCallback };
