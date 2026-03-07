const usersDb = require('../../database/users');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { getMainMenu } = require('../../keyboards/inline');
const { REGIONS } = require('../../constants/regions');

// Handle pause-related callbacks
async function handlePauseCallbacks(bot, query, data, chatId, telegramId, _user) {
  // Handle channel_pause - pause channel operations
  if (data === 'channel_pause') {
    await safeEditMessageText(bot,
      `<b>Ви впевнені, що хочете тимчасово зупинити свій канал?</b>\n\n` +
      `Користувачі отримають повідомлення, що канал зупинено.\n` +
      `Поки ви не відновите роботу каналу, повідомлення про статус світла приходити не будуть.`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Скасувати', callback_data: 'back_to_main', style: 'success' },
              { text: 'Так, зупинити', callback_data: 'channel_pause_confirm', style: 'danger' }
            ]
          ]
        }
      }
    );
    return true;
  }

  // Handle channel_pause_confirm - confirm pause
  if (data === 'channel_pause_confirm') {
    // Оновити статус в БД
    await usersDb.updateUserChannelPaused(telegramId, true);

    // Відправити повідомлення в канал
    const updatedUser = await usersDb.getUserByTelegramId(telegramId);
    if (updatedUser.channel_id) {
      try {
        await bot.api.sendMessage(updatedUser.channel_id,
          '<tg-emoji emoji-id="5458603043203327669">⚠</tg-emoji> <b>Канал зупинено на технічну перерву!</b>',
          { parse_mode: 'HTML' }
        );
      } catch (error) {
        console.error('Помилка відправки повідомлення про паузу в канал:', error);
      }
    }

    await safeAnswerCallbackQuery(bot, query.id, { text: '✅ Канал зупинено' });

    // Повернутися в головне меню з оновленою кнопкою
    const region = REGIONS[updatedUser.region]?.name || updatedUser.region;

    let botStatus = 'active';
    if (!updatedUser.channel_id) {
      botStatus = 'no_channel';
    } else if (!updatedUser.is_active) {
      botStatus = 'paused';
    }

    let message = '<b>🚧 Бот у розробці</b>\n';
    message += '<i>Деякі функції можуть працювати нестабільно</i>\n\n';
    message += '🏠 <b>Головне меню</b>\n\n';
    message += `📍 Регіон: ${region} • ${updatedUser.queue}\n`;
    message += `📺 Канал: ${updatedUser.channel_id ? updatedUser.channel_id + ' ✅' : 'не підключено'}\n`;
    message += `🔔 Сповіщення: ${updatedUser.is_active ? 'увімкнено ✅' : 'вимкнено'}\n`;

    await safeEditMessageText(bot,
      message,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getMainMenu(botStatus, true).reply_markup,
      }
    );
    return true;
  }

  // Handle channel_resume - resume channel operations
  if (data === 'channel_resume') {
    await safeEditMessageText(bot,
      `<b>Ви впевнені, що хочете відновити роботу каналу?</b>\n\n` +
      `Користувачі отримають повідомлення, що роботу каналу відновлено, і потім почнуть приходити повідомлення про статус світла.`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Скасувати', callback_data: 'back_to_main', style: 'danger' },
              { text: 'Так, відновити', callback_data: 'channel_resume_confirm', style: 'success' }
            ]
          ]
        }
      }
    );
    return true;
  }

  // Handle channel_resume_confirm - confirm resume
  if (data === 'channel_resume_confirm') {
    // Оновити статус в БД
    await usersDb.updateUserChannelPaused(telegramId, false);

    // Відправити повідомлення в канал
    const updatedUser = await usersDb.getUserByTelegramId(telegramId);
    if (updatedUser.channel_id) {
      try {
        await bot.api.sendMessage(updatedUser.channel_id,
          '<tg-emoji emoji-id="5870509845911702494">✅</tg-emoji> <b>Роботу каналу відновлено!</b>',
          { parse_mode: 'HTML' }
        );
      } catch (error) {
        console.error('Помилка відправки повідомлення про відновлення в канал:', error);
      }
    }

    await safeAnswerCallbackQuery(bot, query.id, { text: '✅ Канал відновлено' });

    // Повернутися в головне меню з оновленою кнопкою
    const region = REGIONS[updatedUser.region]?.name || updatedUser.region;

    let botStatus = 'active';
    if (!updatedUser.channel_id) {
      botStatus = 'no_channel';
    } else if (!updatedUser.is_active) {
      botStatus = 'paused';
    }

    let message = '<b>🚧 Бот у розробці</b>\n';
    message += '<i>Деякі функції можуть працювати нестабільно</i>\n\n';
    message += '🏠 <b>Головне меню</b>\n\n';
    message += `📍 Регіон: ${region} • ${updatedUser.queue}\n`;
    message += `📺 Канал: ${updatedUser.channel_id ? updatedUser.channel_id + ' ✅' : 'не підключено'}\n`;
    message += `🔔 Сповіщення: ${updatedUser.is_active ? 'увімкнено ✅' : 'вимкнено'}\n`;

    await safeEditMessageText(bot,
      message,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getMainMenu(botStatus, false).reply_markup,
      }
    );
    return true;
  }

  return false;
}

module.exports = { handlePauseCallbacks };
