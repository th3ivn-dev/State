const usersDb = require('../../database/users');
const { getBotUsername } = require('../../utils');
const { safeSetChatTitle, safeSetChatDescription } = require('../../utils/errorHandler');
const { getFormatPowerKeyboard, getMainMenu, getPauseMessageKeyboard } = require('../../keyboards/inline');
const { getSetting, setSetting } = require('../../database/db');
const {
  setConversationState,
  getConversationState,
  clearConversationState,
  CHANNEL_NAME_PREFIX,
  CHANNEL_DESCRIPTION_BASE,
  FORMAT_POWER_MESSAGE,
  getScheduleTextInstructionMessage,
} = require('./helpers');
const { applyChannelBranding } = require('./branding');

// Handle conversation messages
async function handleConversation(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);
  const text = msg.text;

  const state = getConversationState(telegramId);
  if (!state) return false;

  try {
    if (state.state === 'waiting_for_title') {
      // Validate title
      if (!text || text.trim().length === 0) {
        await bot.api.sendMessage(chatId, '❌ Назва не може бути пустою. Спробуйте ще раз:');
        return true;
      }

      const MAX_TITLE_LENGTH = 128;
      if (text.length > MAX_TITLE_LENGTH) {
        await bot.api.sendMessage(chatId, `❌ Назва занадто довга (максимум ${MAX_TITLE_LENGTH} символів).\n\nПеревищено на: ${text.length - MAX_TITLE_LENGTH} символів\n\nСпробуйте ще раз:`);
        return true;
      }

      state.userTitle = text.trim();
      state.state = 'waiting_for_description_choice';

      // Ask about description
      const keyboard = {
        inline_keyboard: [
          [
            { text: '✍️ Додати опис', callback_data: 'channel_add_desc' },
            { text: '⏭️ Пропустити', callback_data: 'channel_skip_desc' }
          ]
        ]
      };

      await bot.api.sendMessage(
        chatId,
        '📝 <b>Хочете додати додатковий опис каналу?</b>\n\n' +
        'Наприклад: ЖК "Сонячний", під\'їзд 2',
        { parse_mode: 'HTML', reply_markup: keyboard }
      );

      await setConversationState(telegramId, state);
      return true;
    }

    if (state.state === 'waiting_for_description') {
      // Validate description
      if (!text || text.trim().length === 0) {
        await bot.api.sendMessage(chatId, '❌ Опис не може бути пустим. Спробуйте ще раз:');
        return true;
      }

      const MAX_DESC_LENGTH = 255;
      if (text.length > MAX_DESC_LENGTH) {
        await bot.api.sendMessage(chatId, `❌ Опис занадто довгий (максимум ${MAX_DESC_LENGTH} символів).\n\nПеревищено на: ${text.length - MAX_DESC_LENGTH} символів\n\nСпробуйте ще раз:`);
        return true;
      }

      state.userDescription = text.trim();
      await applyChannelBranding(bot, chatId, telegramId, state);
      await clearConversationState(telegramId);
      return true;
    }

    if (state.state === 'editing_title') {
      // Validate title
      if (!text || text.trim().length === 0) {
        await bot.api.sendMessage(chatId, '❌ Назва не може бути пустою. Спробуйте ще раз:');
        return true;
      }

      const MAX_TITLE_LENGTH = 128;
      if (text.length > MAX_TITLE_LENGTH) {
        await bot.api.sendMessage(chatId, `❌ Назва занадто довга (максимум ${MAX_TITLE_LENGTH} символів).\n\nПеревищено на: ${text.length - MAX_TITLE_LENGTH} символів\n\nСпробуйте ще раз:`);
        return true;
      }

      const userTitle = text.trim();
      const fullTitle = CHANNEL_NAME_PREFIX + userTitle;

      // Update channel title
      try {
        await safeSetChatTitle(bot, state.channelId, fullTitle);

        // Update database with timestamp tracking
        await usersDb.updateChannelBrandingPartial(telegramId, {
          channelTitle: fullTitle,
          userTitle: userTitle
        });

        await bot.api.sendMessage(
          chatId,
          `✅ <b>Назву каналу змінено!</b>\n\n` +
          `Нова назва: ${fullTitle}\n\n` +
          `⚠️ <b>Важливо:</b> Зміна через бота - дозволена.\n` +
          `Не змінюйте назву вручну в Telegram!`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '⤴ Меню', callback_data: 'back_to_main' }]
              ]
            }
          }
        );

        await clearConversationState(telegramId);

        return true;
      } catch (error) {
        console.error('Error updating channel title:', error);
        await bot.api.sendMessage(
          chatId,
          '😅 Щось пішло не так. Не вдалося змінити назву каналу. Переконайтесь, що бот має права на редагування інформації каналу.'
        );
        await clearConversationState(telegramId);
        return true;
      }
    }

    if (state.state === 'editing_description') {
      // Validate description
      if (!text || text.trim().length === 0) {
        await bot.api.sendMessage(chatId, '❌ Опис не може бути пустим. Спробуйте ще раз:');
        return true;
      }

      const MAX_DESC_LENGTH = 255;
      if (text.length > MAX_DESC_LENGTH) {
        await bot.api.sendMessage(chatId, `❌ Опис занадто довгий (максимум ${MAX_DESC_LENGTH} символів).\n\nПеревищено на: ${text.length - MAX_DESC_LENGTH} символів\n\nСпробуйте ще раз:`);
        return true;
      }

      const userDescription = text.trim();

      // Get bot username (getBotUsername returns '@username' format)
      const botUsername = await getBotUsername(bot);
      // Defensive check: Remove leading @ if present to avoid @@
      const cleanUsername = botUsername.startsWith('@') ? botUsername.slice(1) : botUsername;

      // Format description according to new requirements
      const brandingFooter = `${CHANNEL_DESCRIPTION_BASE}\n\n🤖 @${cleanUsername} →❓ Допомога → ⚒️ Підтримка`;

      let fullDescription;
      if (userDescription) {
        fullDescription = `${userDescription}\n\n${brandingFooter}`;
      } else {
        fullDescription = brandingFooter;
      }

      // Update channel description
      try {
        await safeSetChatDescription(bot, state.channelId, fullDescription);

        // Update database with timestamp tracking
        await usersDb.updateChannelBrandingPartial(telegramId, {
          channelDescription: fullDescription,
          userDescription: userDescription
        });

        await bot.api.sendMessage(
          chatId,
          `✅ <b>Опис каналу змінено!</b>\n\n` +
          `Новий опис: ${fullDescription}\n\n` +
          `⚠️ <b>Важливо:</b> Зміна через бота - дозволена.\n` +
          `Не змінюйте опис вручну в Telegram!`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '⤴ Меню', callback_data: 'back_to_main' }]
              ]
            }
          }
        );

        await clearConversationState(telegramId);

        return true;
      } catch (error) {
        console.error('Error updating channel description:', error);
        await bot.api.sendMessage(
          chatId,
          '😅 Щось пішло не так. Не вдалося змінити опис каналу. Переконайтесь, що бот має права на редагування інформації каналу.'
        );
        await clearConversationState(telegramId);
        return true;
      }
    }

    if (state.state === 'waiting_for_schedule_caption') {
      if (!text || text.trim().length === 0) {
        await bot.api.sendMessage(chatId, '❌ Шаблон не може бути пустим. Спробуйте ще раз:');
        return true;
      }

      await usersDb.updateUserFormatSettings(telegramId, { scheduleCaption: text.trim() });

      await bot.api.sendMessage(chatId, '✅ Шаблон підпису оновлено!', { parse_mode: 'HTML' });

      // Return to schedule text instruction screen
      const user = await usersDb.getUserByTelegramId(telegramId);
      const currentCaption = user.schedule_caption || 'Графік на {dd}, {dm} для черги {queue}';
      const currentPeriod = user.period_format || '{s} - {f} ({h} год)';

      await bot.api.sendMessage(
        chatId,
        getScheduleTextInstructionMessage(currentCaption, currentPeriod),
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📝 Змінити підпис', callback_data: 'format_schedule_caption' }],
              [{ text: '⏰ Змінити формат часу', callback_data: 'format_schedule_periods' }],
              [{ text: '← Назад', callback_data: 'format_schedule_settings' }],
            ]
          }
        }
      );

      await clearConversationState(telegramId);
      return true;
    }

    if (state.state === 'waiting_for_period_format') {
      if (!text || text.trim().length === 0) {
        await bot.api.sendMessage(chatId, '❌ Формат не може бути пустим. Спробуйте ще раз:');
        return true;
      }

      await usersDb.updateUserFormatSettings(telegramId, { periodFormat: text.trim() });

      await bot.api.sendMessage(chatId, '✅ Формат періодів оновлено!', { parse_mode: 'HTML' });

      // Return to schedule text instruction screen
      const user = await usersDb.getUserByTelegramId(telegramId);
      const currentCaption = user.schedule_caption || 'Графік на {dd}, {dm} для черги {queue}';
      const currentPeriod = user.period_format || '{s} - {f} ({h} год)';

      await bot.api.sendMessage(
        chatId,
        getScheduleTextInstructionMessage(currentCaption, currentPeriod),
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📝 Змінити підпис', callback_data: 'format_schedule_caption' }],
              [{ text: '⏰ Змінити формат часу', callback_data: 'format_schedule_periods' }],
              [{ text: '← Назад', callback_data: 'format_schedule_settings' }],
            ]
          }
        }
      );

      await clearConversationState(telegramId);
      return true;
    }

    if (state.state === 'waiting_for_power_off_text') {
      if (!text || text.trim().length === 0) {
        await bot.api.sendMessage(chatId, '❌ Текст не може бути пустим. Спробуйте ще раз:');
        return true;
      }

      await usersDb.updateUserFormatSettings(telegramId, { powerOffText: text.trim() });

      await bot.api.sendMessage(chatId, '✅ Текст відключення оновлено!', { parse_mode: 'HTML' });

      // Return to power state settings menu (Level 2b)
      await bot.api.sendMessage(
        chatId,
        FORMAT_POWER_MESSAGE,
        {
          parse_mode: 'HTML',
          ...getFormatPowerKeyboard()
        }
      );

      await clearConversationState(telegramId);
      return true;
    }

    if (state.state === 'waiting_for_power_on_text') {
      if (!text || text.trim().length === 0) {
        await bot.api.sendMessage(chatId, '❌ Текст не може бути пустим. Спробуйте ще раз:');
        return true;
      }

      await usersDb.updateUserFormatSettings(telegramId, { powerOnText: text.trim() });

      await bot.api.sendMessage(chatId, '✅ Текст включення оновлено!', { parse_mode: 'HTML' });

      // Return to power state settings menu (Level 2b)
      await bot.api.sendMessage(
        chatId,
        FORMAT_POWER_MESSAGE,
        {
          parse_mode: 'HTML',
          ...getFormatPowerKeyboard()
        }
      );

      await clearConversationState(telegramId);
      return true;
    }

    if (state.state === 'waiting_for_custom_test') {
      if (!text || text.trim().length === 0) {
        await bot.api.sendMessage(chatId, '❌ Текст не може бути пустим. Спробуйте ще раз:');
        return true;
      }

      const user = await usersDb.getUserByTelegramId(telegramId);

      try {
        await bot.api.sendMessage(user.channel_id, text.trim(), { parse_mode: 'HTML' });

        // Send success message with navigation buttons
        let botStatus = 'active';
        if (!user.channel_id) {
          botStatus = 'no_channel';
        } else if (!user.is_active) {
          botStatus = 'paused';
        }
        const channelPaused = user.channel_paused === true;

        await bot.api.sendMessage(
          chatId,
          '✅ Повідомлення опубліковано в канал!\n\nОберіть наступну дію:',
          {
            parse_mode: 'HTML',
            ...getMainMenu(botStatus, channelPaused)
          }
        );
      } catch (error) {
        console.error('Error publishing custom test:', error);

        // Send error message with navigation buttons
        let botStatus = 'active';
        if (!user.channel_id) {
          botStatus = 'no_channel';
        } else if (!user.is_active) {
          botStatus = 'paused';
        }
        const channelPaused = user.channel_paused === true;

        await bot.api.sendMessage(
          chatId,
          '❌ Помилка публікації. Перевірте формат повідомлення.\n\nОберіть наступну дію:',
          getMainMenu(botStatus, channelPaused)
        );
      }

      await clearConversationState(telegramId);
      return true;
    }

    if (state.state === 'waiting_for_pause_message') {
      if (!text || text.trim().length === 0) {
        await bot.api.sendMessage(chatId, '❌ Текст не може бути пустим. Спробуйте ще раз:');
        return true;
      }

      await setSetting('pause_message', text.trim());

      await bot.api.sendMessage(chatId, '✅ Повідомлення паузи збережено!', { parse_mode: 'HTML' });

      // Show pause message settings again
      const showSupport = await getSetting('pause_show_support', '1') === '1';

      await bot.api.sendMessage(
        chatId,
        '📋 <b>Налаштування повідомлення паузи</b>\n\n' +
        'Оберіть шаблон або введіть свій текст:\n\n' +
        `Поточне повідомлення:\n"${text.trim()}"`,
        {
          parse_mode: 'HTML',
          reply_markup: getPauseMessageKeyboard(showSupport).reply_markup
        }
      );

      await clearConversationState(telegramId);
      return true;
    }

  } catch (error) {
    console.error('Помилка в handleConversation:', error);
    await bot.api.sendMessage(chatId, '😅 Щось пішло не так. Спробуйте ще раз.');
    await clearConversationState(telegramId);
  }

  return false;
}

module.exports = { handleConversation };
