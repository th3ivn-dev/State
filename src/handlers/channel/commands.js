const usersDb = require('../../database/users');
const { safeSendMessage } = require('../../utils/errorHandler');
const { getMainMenu } = require('../../keyboards/inline');
const { logChannelConnection } = require('../../growthMetrics');
const {
  setConversationState,
  CHANNEL_NAME_PREFIX,
  hasConversationState,
  clearConversationState,
} = require('./helpers');

// Обробник команди /channel
async function handleChannel(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);

  try {
    const user = await usersDb.getUserByTelegramId(telegramId);

    if (!user) {
      await safeSendMessage(bot, chatId, '❌ Спочатку запустіть бота, натиснувши /start');
      return;
    }

    const message =
      `📺 <b>Підключення до каналу</b>\n\n` +
      `Щоб підключити бота до вашого каналу:\n\n` +
      `1️⃣ Додайте бота як адміністратора вашого каналу\n` +
      `2️⃣ Дайте боту права на:\n` +
      `   • Публікацію повідомлень\n` +
      `   • Редагування інформації каналу\n` +
      `3️⃣ Перейдіть в Налаштування → Канал → Підключити канал\n\n` +
      (user.channel_id
        ? `✅ Канал підключено: <code>${user.channel_id}</code>\n\n` +
          `Назва: <b>${user.channel_title || 'Не налаштовано'}</b>\n` +
          `Статус: <b>${user.channel_status === 'blocked' ? '🔴 Заблокований' : '🟢 Активний'}</b>\n\n` +
          `Для зміни каналу використайте меню налаштувань.`
        : `ℹ️ Канал ще не підключено.`);

    await safeSendMessage(bot, chatId, message, { parse_mode: 'HTML' });

  } catch (error) {
    console.error('Помилка в handleChannel:', error);
    await safeSendMessage(bot, chatId, '😅 Щось пішло не так. Спробуйте ще раз!');
  }
}

// Обробник команди /setchannel
async function handleSetChannel(bot, msg, match) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);
  const channelUsername = match ? match[1].trim() : null;

  try {
    const user = await usersDb.getUserByTelegramId(telegramId);

    if (!user) {
      await bot.api.sendMessage(
        chatId,
        '❌ Спочатку запустіть бота, натиснувши /start\n\nОберіть наступну дію:',
        getMainMenu('no_channel', false)
      );
      return;
    }

    if (!channelUsername) {
      let botStatus = 'active';
      if (!user.channel_id) {
        botStatus = 'no_channel';
      } else if (!user.is_active) {
        botStatus = 'paused';
      }
      const channelPaused = user.channel_paused === true;

      await bot.api.sendMessage(
        chatId,
        '❌ Вкажіть канал.\n\nПриклад: <code>/setchannel @mychannel</code>\n\nОберіть наступну дію:',
        {
          parse_mode: 'HTML',
          ...getMainMenu(botStatus, channelPaused)
        }
      );
      return;
    }

    // Check if user was previously blocked
    if (user.channel_status === 'blocked' && user.channel_id) {
      await bot.api.sendMessage(
        chatId,
        '⚠️ Ваш канал був заблокований через зміну назви/опису/фото.\n\n' +
        'Будь ласка, не змінюйте налаштування каналу в майбутньому.\n' +
        'Продовжуємо налаштування...'
      );
    }

    // Try to get channel info
    let channelInfo;
    try {
      channelInfo = await bot.api.getChat(channelUsername);
    } catch (_error) {
      let botStatus = 'active';
      if (!user.channel_id) {
        botStatus = 'no_channel';
      } else if (!user.is_active) {
        botStatus = 'paused';
      }
      const channelPaused = user.channel_paused === true;

      await bot.api.sendMessage(
        chatId,
        '❌ Не вдалося знайти канал. Переконайтесь, що:\n' +
        '1. Канал існує\n' +
        '2. Канал є публічним або ви використовуєте правильний @username\n\n' +
        'Оберіть наступну дію:',
        getMainMenu(botStatus, channelPaused)
      );
      return;
    }

    if (channelInfo.type !== 'channel') {
      let botStatus = 'active';
      if (!user.channel_id) {
        botStatus = 'no_channel';
      } else if (!user.is_active) {
        botStatus = 'paused';
      }
      const channelPaused = user.channel_paused === true;

      await bot.api.sendMessage(
        chatId,
        '❌ Це не канал. Вкажіть канал (не групу).\n\nОберіть наступну дію:',
        getMainMenu(botStatus, channelPaused)
      );
      return;
    }

    const channelId = String(channelInfo.id);

    // Перевіряємо чи бот є адміністратором з необхідними правами
    try {
      // Get bot ID - it should be available but handle race condition
      const botId = bot.options.id;
      if (!botId) {
        // Fallback: get bot info on the fly
        const botInfo = await bot.api.getMe();
        bot.options.id = botInfo.id;
      }

      const botMember = await bot.api.getChatMember(channelId, bot.options.id);

      if (botMember.status !== 'administrator') {
        let botStatus = 'active';
        if (!user.channel_id) {
          botStatus = 'no_channel';
        } else if (!user.is_active) {
          botStatus = 'paused';
        }
        const channelPaused = user.channel_paused === true;

        await bot.api.sendMessage(
          chatId,
          '❌ Бот не є адміністратором каналу.\n\n' +
          'Додайте бота як адміністратора з правами на:\n' +
          '• Публікацію повідомлень\n' +
          '• Редагування інформації каналу\n\n' +
          'Оберіть наступну дію:',
          getMainMenu(botStatus, channelPaused)
        );
        return;
      }

      // Check specific permissions
      if (!botMember.can_post_messages || !botMember.can_change_info) {
        let botStatus = 'active';
        if (!user.channel_id) {
          botStatus = 'no_channel';
        } else if (!user.is_active) {
          botStatus = 'paused';
        }
        const channelPaused = user.channel_paused === true;

        await bot.api.sendMessage(
          chatId,
          '❌ Бот не має необхідних прав.\n\n' +
          'Дайте боту права на:\n' +
          '• Публікацію повідомлень\n' +
          '• Редагування інформації каналу\n\n' +
          'Оберіть наступну дію:',
          getMainMenu(botStatus, channelPaused)
        );
        return;
      }

    } catch (error) {
      console.error('Помилка перевірки прав бота:', error);
      let botStatus = 'active';
      if (!user.channel_id) {
        botStatus = 'no_channel';
      } else if (!user.is_active) {
        botStatus = 'paused';
      }
      const channelPaused = user.channel_paused === true;

      await bot.api.sendMessage(
        chatId,
        '❌ Не вдалося перевірити права бота в каналі.\n' +
        'Переконайтесь, що бот є адміністратором.\n\n' +
        'Оберіть наступну дію:',
        getMainMenu(botStatus, channelPaused)
      );
      return;
    }

    // Save channel_id and start conversation for title
    await usersDb.resetUserChannel(telegramId, channelId);

    // Log channel connection for growth tracking
    await logChannelConnection(telegramId, channelId);

    await setConversationState(telegramId, {
      state: 'waiting_for_title',
      channelId: channelId,
      channelUsername: channelUsername,
      timestamp: Date.now()
    });

    await bot.api.sendMessage(
      chatId,
      '📝 <b>Введіть назву для каналу</b>\n\n' +
      `Вона буде додана після префіксу "${CHANNEL_NAME_PREFIX}"\n\n` +
      '<b>Приклад:</b> Київ Черга 3.1\n' +
      '<b>Результат:</b> СвітлоБот ⚡️ Київ Черга 3.1',
      { parse_mode: 'HTML' }
    );

  } catch (error) {
    console.error('Помилка в handleSetChannel:', error);

    const user = await usersDb.getUserByTelegramId(String(msg.from.id));

    let botStatus = 'active';
    if (user && !user.channel_id) {
      botStatus = 'no_channel';
    } else if (user && !user.is_active) {
      botStatus = 'paused';
    }
    const channelPaused = user ? user.channel_paused === true : false;

    await bot.api.sendMessage(
      chatId,
      '😅 Щось пішло не так при налаштуванні каналу. Спробуйте ще раз!\n\nОберіть наступну дію:',
      getMainMenu(botStatus, channelPaused)
    );
  }
}

// Handle /cancel command
async function handleCancelChannel(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);

  if (hasConversationState(telegramId)) {
    await clearConversationState(telegramId);
    await bot.api.sendMessage(
      chatId,
      '❌ Налаштування каналу скасовано.\n\nОберіть наступну дію:',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '← Назад', callback_data: 'settings_channel' },
              { text: '⤴ Меню', callback_data: 'back_to_main' }
            ]
          ]
        }
      }
    );
  } else {
    // User not in any conversation state - show main menu
    const user = await usersDb.getUserByTelegramId(telegramId);
    if (user) {
      let botStatus = 'active';
      if (!user.channel_id) {
        botStatus = 'no_channel';
      } else if (!user.is_active) {
        botStatus = 'paused';
      }
      const channelPaused = user.channel_paused === true;

      await bot.api.sendMessage(
        chatId,
        '❌ Налаштування каналу скасовано.\n\nОберіть наступну дію:',
        getMainMenu(botStatus, channelPaused)
      );
    }
  }
}

// Обробник пересланих повідомлень для підключення каналу (deprecated but kept for compatibility)
async function handleForwardedMessage(bot, msg) {
  const chatId = msg.chat.id;

  // Just inform user about new method
  await bot.api.sendMessage(
    chatId,
    '📺 Тепер для підключення каналу використовуйте команду:\n\n' +
    '<code>/setchannel @your_channel</code>',
    { parse_mode: 'HTML' }
  );
}

module.exports = {
  handleChannel,
  handleSetChannel,
  handleCancelChannel,
  handleForwardedMessage,
};
