const usersDb = require('../../database/users');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { getChannelMenuKeyboard, getMainMenu } = require('../../keyboards/inline');
const { publishScheduleWithPhoto } = require('../../publisher');

async function handleChannelCallback(bot, query, user) {
  const chatId = query.message.chat.id;
  const telegramId = String(query.from.id);
  const data = query.data;

  // Channel menu
  if (data === 'settings_channel') {
    const isPublic = user.channel_id && user.channel_id.startsWith('@');
    let channelName = user.channel_id || 'не підключено';

    // Truncate long channel names
    if (channelName.length > 20) {
      channelName = channelName.substring(0, 20) + '...';
    }

    const channelStatus = user.channel_status || 'active';
    const statusText = channelStatus === 'blocked' ? '🔴 Заблокований' : '🟢 Активний';

    const message =
      `📺 <b>Налаштування каналу</b>\n\n` +
      `Поточний: ${channelName}\n` +
      (user.channel_id ? `Статус: ${statusText}\n\n` : '\n') +
      (isPublic ? '' : user.channel_id ? 'Канал приватний\n\n' : '') +
      (channelStatus === 'blocked' ? '⚠️ Канал заблокований через зміну назви/опису/фото.\nВикористайте "Перепідключити канал" для відновлення.\n\n' : '') +
      'Оберіть опцію:';

    await safeEditMessageText(bot, message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getChannelMenuKeyboard(user.channel_id, isPublic, channelStatus).reply_markup,
    });
    return;
  }

  // Channel reconnect
  if (data === 'channel_reconnect') {
    if (!user.channel_id) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Канал не підключено',
        show_alert: true
      });
      return;
    }

    // Reset channel status to active
    await usersDb.updateChannelStatus(telegramId, 'active');

    await safeEditMessageText(bot,
      '✅ <b>Канал розблоковано!</b>\n\n' +
      'Статус каналу змінено на "Активний".\n\n' +
      '⚠️ <b>Важливо:</b> Не змінюйте назву, опис або фото каналу в майбутньому, ' +
      'інакше канал буде знову заблоковано.\n\n' +
      'Публікації в канал відновлено.',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
      }
    );

    // Затримка 3 секунди
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Повернення до головного меню
    const updatedUser = await usersDb.getUserByTelegramId(telegramId);

    let botStatus = 'active';
    if (!updatedUser.channel_id) {
      botStatus = 'no_channel';
    } else if (!updatedUser.is_active) {
      botStatus = 'paused';
    }
    const channelPaused = updatedUser.channel_paused === true;

    await bot.api.sendMessage(
      chatId,
      '🏠 <b>Головне меню</b>',
      {
        parse_mode: 'HTML',
        ...getMainMenu(botStatus, channelPaused),
      }
    );
    return;
  }

  // Test button
  if (data === 'settings_test') {
    if (!user.channel_id) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Спочатку підключіть канал',
        show_alert: true
      });
      return;
    }

    try {
      await publishScheduleWithPhoto(bot, user, user.region, user.queue, { force: true });

      await safeAnswerCallbackQuery(bot, query.id, {
        text: '✅ Тестове повідомлення відправлено!',
        show_alert: true
      });
    } catch (_error) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Не вдалось відправити. Перевірте налаштування каналу.',
        show_alert: true
      });
    }
    return;
  }
}

module.exports = { handleChannelCallback };
