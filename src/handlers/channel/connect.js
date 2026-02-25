const usersDb = require('../../database/users');
const { getBotUsername } = require('../../utils');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { checkPauseForChannelActions } = require('../../utils/guards');
const { getSetting } = require('../../database/db');
const { getSupportButton } = require('../feedback');
const {
  setConversationState,
  CHANNEL_NAME_PREFIX,
  PENDING_CHANNEL_EXPIRATION_MS,
  validateChannelConnection,
  removePendingChannelByTelegramId,
} = require('./helpers');
const { escapeHtml, getChannelConnectionInstructions } = require('../../utils');
const { parseChannelId } = require('../../utils/validators');
const logger = require('../../logger').child({ module: 'connect' });

// Handle channel_connect and related connect callbacks
async function handleConnectCallbacks(bot, query, data, chatId, telegramId, _user) {
  // Handle channel_connect - new auto-connect flow
  if (data === 'channel_connect') {
    // Check if bot is paused
    const botPaused = await getSetting('bot_paused', '0') === '1';

    if (botPaused) {
      const pauseMessage = await getSetting('pause_message', '🔧 Бот тимчасово недоступний. Спробуйте пізніше.');
      const showSupport = await getSetting('pause_show_support', '1') === '1';

      let keyboard;
      if (showSupport) {
        const supportButton = await getSupportButton();
        keyboard = {
          inline_keyboard: [
            [supportButton],
            [{ text: '← Назад', callback_data: 'settings_channel' }]
          ]
        };
      } else {
        keyboard = {
          inline_keyboard: [
            [{ text: '← Назад', callback_data: 'settings_channel' }]
          ]
        };
      }

      await safeEditMessageText(bot, pauseMessage, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: keyboard
      });
      return true;
    }

    const { pendingChannels } = require('../../bot');

    // Перевіряємо чи є pending channel для ЦЬОГО користувача
    let pendingChannel = null;
    for (const [channelId, channel] of pendingChannels.entries()) {
      // Канал має бути доданий протягом останніх 30 хвилин
      if (Date.now() - channel.timestamp < PENDING_CHANNEL_EXPIRATION_MS) {
        // Перевіряємо що канал не зайнятий іншим користувачем
        const existingUser = await usersDb.getUserByChannelId(channelId);
        if (!existingUser || existingUser.telegram_id === telegramId) {
          pendingChannel = channel;
          break;
        }
      }
    }

    if (pendingChannel) {
      // Є канал для підключення - показати підтвердження
      const keyboard = {
        inline_keyboard: [
          [
            { text: '✓ Так, підключити', callback_data: `channel_confirm_${pendingChannel.channelId}` },
            { text: '✕ Ні', callback_data: 'settings_channel' }
          ]
        ]
      };

      await safeEditMessageText(bot,
        `📺 <b>Знайдено канал!</b>\n\n` +
        `Канал: <b>${escapeHtml(pendingChannel.channelTitle)}</b>\n` +
        `(${escapeHtml(pendingChannel.channelUsername)})\n\n` +
        `Підключити цей канал?`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: keyboard
        }
      );
    } else {
      // Немає pending каналу - показати інструкції
      // Отримуємо username бота для інструкції (з кешем)
      const botUsername = await getBotUsername(bot);

      await safeEditMessageText(bot,
        getChannelConnectionInstructions(botUsername),
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Перевірити', callback_data: 'channel_connect' }],
              [{ text: '← Назад', callback_data: 'settings_channel' }]
            ]
          }
        }
      );

      // Зберегти message_id інструкції для можливості видалення при автопідключенні
      const { channelInstructionMessages } = require('../../bot');
      channelInstructionMessages.set(telegramId, query.message.message_id);
    }

    return true;
  }

  // Handle channel_confirm_ - confirm and setup channel
  if (data.startsWith('channel_confirm_')) {
    // Check pause mode
    const pauseCheck = await checkPauseForChannelActions();
    if (pauseCheck.blocked) {
      let keyboard;
      if (pauseCheck.showSupport) {
        const supportButton = await getSupportButton();
        keyboard = {
          inline_keyboard: [
            [supportButton],
            [{ text: '← Назад', callback_data: 'settings_channel' }]
          ]
        };
      } else {
        keyboard = {
          inline_keyboard: [
            [{ text: '← Назад', callback_data: 'settings_channel' }]
          ]
        };
      }

      await safeEditMessageText(bot, pauseCheck.message, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: keyboard
      });
      return true;
    }

    const channelId = parseChannelId(data.replace('channel_confirm_', ''));

    if (channelId === null) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Некоректний ідентифікатор каналу',
        show_alert: true
      });
      return true;
    }

    // Перевірка чи канал вже зайнятий
    const existingUser = await usersDb.getUserByChannelId(channelId);
    if (existingUser && existingUser.telegram_id !== telegramId) {
      await safeEditMessageText(bot,
        `⚠️ <b>Цей канал вже підключений.</b>\n\n` +
        `Якщо це ваш канал — зверніться до підтримки\n` +
        `або видаліть бота з каналу і додайте знову.`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '← Назад', callback_data: 'settings_channel' }]
            ]
          }
        }
      );
      return true;
    }

    // Перевіряємо права бота в каналі
    try {
      if (!bot.options.id) {
        const botInfo = await bot.api.getMe();
        bot.options.id = botInfo.id;
      }

      const botMember = await bot.api.getChatMember(channelId, bot.options.id);

      if (botMember.status !== 'administrator' || !botMember.can_post_messages || !botMember.can_change_info) {
        await safeEditMessageText(bot,
          '❌ <b>Недостатньо прав</b>\n\n' +
          'Бот повинен мати права на:\n' +
          '• Публікацію повідомлень\n' +
          '• Редагування інформації каналу',
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '← Назад', callback_data: 'settings_channel' }]
              ]
            }
          }
        );
        return true;
      }
    } catch (error) {
      logger.error({ err: error }, 'Error checking bot permissions');
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '😅 Щось пішло не так при перевірці прав',
        show_alert: true
      });
      return true;
    }

    // Отримуємо інфо про канал з pendingChannels
    const { pendingChannels } = require('../../bot');
    const pendingChannel = pendingChannels.get(channelId);

    if (!pendingChannel) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Канал не знайдено. Спробуйте додати бота заново.',
        show_alert: true
      });
      return true;
    }

    // Видаляємо з pending
    pendingChannels.delete(channelId);

    // Зберігаємо channel_id та початкуємо conversation для налаштування
    await usersDb.resetUserChannel(telegramId, channelId);

    await setConversationState(telegramId, {
      state: 'waiting_for_title',
      channelId: channelId,
      channelUsername: pendingChannel.channelUsername
    });

    await safeEditMessageText(bot,
      '📝 <b>Введіть назву для каналу</b>\n\n' +
      `Вона буде додана після префіксу "${CHANNEL_NAME_PREFIX}"\n\n` +
      '<b>Приклад:</b> Київ Черга 3.1\n' +
      '<b>Результат:</b> СвітлоБот ⚡️ Київ Черга 3.1',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML'
      }
    );

    return true;
  }

  // Handle connect_channel_ - connect new channel (automatic detection)
  if (data.startsWith('connect_channel_')) {
    const channelId = parseChannelId(data.replace('connect_channel_', ''));
    if (channelId === null) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Некоректний ідентифікатор каналу',
        show_alert: true
      });
      return true;
    }
    const { pendingChannels } = require('../../bot');
    const pending = pendingChannels.get(channelId);

    if (pending && pending.telegramId === telegramId) {
      // Check pause mode
      const pauseCheck = await checkPauseForChannelActions();
      if (pauseCheck.blocked) {
        await bot.api.editMessageText(
          chatId,
          query.message.message_id,
          pauseCheck.message,
          {
            parse_mode: 'HTML'
          }
        );
        return true;
      }

      // Validate channel connection
      const validation = await validateChannelConnection(bot, channelId, telegramId);
      if (!validation.valid) {
        await bot.api.editMessageText(
          chatId,
          query.message.message_id,
          validation.message,
          {
            parse_mode: 'HTML'
          }
        );
        return true;
      }

      // Зберегти канал в БД
      await usersDb.resetUserChannel(telegramId, channelId);

      // Видаляємо з pending
      pendingChannels.delete(channelId);

      // Початкуємо conversation для налаштування
      await setConversationState(telegramId, {
        state: 'waiting_for_title',
        channelId: channelId,
        channelUsername: pending.channelUsername
      });

      await bot.api.editMessageText(
        chatId,
        query.message.message_id,
        '📝 <b>Введіть назву для каналу</b>\n\n' +
        `Вона буде додана після префіксу "${CHANNEL_NAME_PREFIX}"\n\n` +
        '<b>Приклад:</b> Київ Черга 3.1\n' +
        '<b>Результат:</b> СвітлоБот ⚡️ Київ Черга 3.1',
        {
          parse_mode: 'HTML'
        }
      );
    } else {
      await bot.api.editMessageText(
        chatId,
        query.message.message_id,
        '❌ Канал не знайдено або час очікування вийшов.\n\n' +
        'Додайте бота в канал заново.'
      );
    }

    return true;
  }

  // Handle replace_channel_ - replace existing channel (automatic detection)
  if (data.startsWith('replace_channel_')) {
    const channelId = parseChannelId(data.replace('replace_channel_', ''));
    if (channelId === null) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Некоректний ідентифікатор каналу',
        show_alert: true
      });
      return true;
    }
    const { pendingChannels } = require('../../bot');
    const pending = pendingChannels.get(channelId);

    if (pending && pending.telegramId === telegramId) {
      // Check pause mode
      const pauseCheck = await checkPauseForChannelActions();
      if (pauseCheck.blocked) {
        await bot.api.editMessageText(
          chatId,
          query.message.message_id,
          pauseCheck.message,
          {
            parse_mode: 'HTML'
          }
        );
        return true;
      }

      // Validate channel connection
      const validation = await validateChannelConnection(bot, channelId, telegramId);
      if (!validation.valid) {
        await bot.api.editMessageText(
          chatId,
          query.message.message_id,
          validation.message,
          {
            parse_mode: 'HTML'
          }
        );
        return true;
      }

      // Замінити канал в БД
      await usersDb.resetUserChannel(telegramId, channelId);

      // Видаляємо з pending
      pendingChannels.delete(channelId);

      // Початкуємо conversation для налаштування
      await setConversationState(telegramId, {
        state: 'waiting_for_title',
        channelId: channelId,
        channelUsername: pending.channelUsername
      });

      await bot.api.editMessageText(
        chatId,
        query.message.message_id,
        `✅ Канал замінено на "<b>${escapeHtml(pending.channelTitle)}</b>"!\n\n` +
        '📝 <b>Введіть назву для каналу</b>\n\n' +
        `Вона буде додана після префіксу "${CHANNEL_NAME_PREFIX}"\n\n` +
        '<b>Приклад:</b> Київ Черга 3.1\n' +
        '<b>Результат:</b> СвітлоБот ⚡️ Київ Черга 3.1',
        {
          parse_mode: 'HTML'
        }
      );
    } else {
      await bot.api.editMessageText(
        chatId,
        query.message.message_id,
        '❌ Канал не знайдено або час очікування вийшов.\n\n' +
        'Додайте бота в канал заново.'
      );
    }

    return true;
  }

  // Handle keep_current_channel - keep current channel
  if (data === 'keep_current_channel') {
    // Видаляємо pending channel для цього користувача
    removePendingChannelByTelegramId(telegramId);

    await bot.api.editMessageText(
      chatId,
      query.message.message_id,
      `👌 Добре, залишаємо поточний канал.`
    );
    return true;
  }

  // Handle cancel_channel_connect - cancel channel connection
  if (data === 'cancel_channel_connect') {
    // Видаляємо pending channel для цього користувача
    removePendingChannelByTelegramId(telegramId);

    await bot.api.editMessageText(
      chatId,
      query.message.message_id,
      `👌 Добре, канал не підключено.\n\n` +
      `Ви можете підключити його пізніше в налаштуваннях.`
    );
    return true;
  }

  return false;
}

module.exports = { handleConnectCallbacks };
