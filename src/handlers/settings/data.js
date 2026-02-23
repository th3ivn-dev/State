const usersDb = require('../../database/users');
const { safeEditMessageText } = require('../../utils/errorHandler');
const { getDeleteDataConfirmKeyboard, getDeleteDataFinalKeyboard, getDeactivateConfirmKeyboard, getMainMenu } = require('../../keyboards/inline');

async function handleDataCallback(bot, query, user) {
  const chatId = query.message.chat.id;
  const telegramId = String(query.from.id);
  const data = query.data;

  // Delete data - Step 1
  if (data === 'settings_delete_data') {
    await safeEditMessageText(bot,
      '⚠️ <b>Увага</b>\n\n' +
      'Ви збираєтесь видалити всі дані:\n\n' +
      '• Обраний регіон та чергу\n' +
      '• Підключений канал\n' +
      '• IP-адресу роутера\n' +
      '• Налаштування сповіщень\n' +
      '• Статистику відключень\n\n' +
      'Цю дію неможливо скасувати.',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getDeleteDataConfirmKeyboard().reply_markup,
      }
    );
    return;
  }

  // Delete data - Step 2
  if (data === 'delete_data_step2') {
    await safeEditMessageText(bot,
      '❗ <b>Підтвердження</b>\n\n' +
      'Видалити всі дані?',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getDeleteDataFinalKeyboard().reply_markup,
      }
    );
    return;
  }

  // Confirm delete data - Final
  if (data === 'confirm_delete_data') {
    // Delete user from database
    await usersDb.deleteUser(telegramId);

    await safeEditMessageText(bot,
      'Добре, домовились 🙂\n' +
      'Я видалив усі дані та відключив канал.\n\n' +
      'Якщо захочете повернутись — просто напишіть /start.',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
      }
    );
    return;
  }

  // Деактивувати бота
  if (data === 'settings_deactivate') {
    await safeEditMessageText(bot,
      '❗️ Ви впевнені, що хочете деактивувати бота?\n\n' +
      'Ви перестанете отримувати сповіщення про зміни графіка.',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: getDeactivateConfirmKeyboard().reply_markup,
      }
    );
    return;
  }

  // Підтвердження деактивації
  if (data === 'confirm_deactivate') {
    await usersDb.setUserActive(telegramId, false);

    await safeEditMessageText(bot,
      '✅ Бот деактивовано.\n\n' +
      'Використайте /start для повторної активації.',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
      }
    );

    // Send main menu after successful deactivation
    await bot.api.sendMessage(
      chatId,
      '🏠 <b>Головне меню</b>',
      {
        parse_mode: 'HTML',
        ...getMainMenu('paused', false),
      }
    );
    return;
  }
}

module.exports = { handleDataCallback };
