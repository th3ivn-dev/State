const fs = require('fs');
const usersDb = require('../../database/users');
const { getBotUsername } = require('../../utils');
const { safeEditMessageText, safeSetChatTitle, safeSetChatDescription, safeSetChatPhoto, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const {
  setConversationState,
  getConversationState,
  clearConversationState,
  CHANNEL_NAME_PREFIX,
  CHANNEL_DESCRIPTION_BASE,
  PHOTO_PATH,
  getChannelWelcomeMessage,
} = require('./helpers');

// Apply branding to the channel
async function applyChannelBranding(bot, chatId, telegramId, state) {
  try {
    // Show typing indicator
    await bot.api.sendChatAction(chatId, 'typing');
    await bot.api.sendMessage(chatId, '⏳ Налаштовую канал...');

    const fullTitle = CHANNEL_NAME_PREFIX + state.userTitle;

    // Get bot username (getBotUsername returns '@username' format)
    const botUsername = await getBotUsername(bot);
    // Defensive check: Remove leading @ if present to avoid @@
    const cleanUsername = botUsername.startsWith('@') ? botUsername.slice(1) : botUsername;

    // Format description according to new requirements
    const brandingFooter = `${CHANNEL_DESCRIPTION_BASE}\n\n🤖 @${cleanUsername} →❓ Допомога → ⚒️ Підтримка`;

    let fullDescription;
    if (state.userDescription) {
      fullDescription = `${state.userDescription}\n\n${brandingFooter}`;
    } else {
      fullDescription = brandingFooter;
    }

    const operations = {
      title: false,
      description: false,
      photo: false
    };

    const errors = [];

    // Set channel title
    try {
      await safeSetChatTitle(bot, state.channelId, fullTitle);
      operations.title = true;
    } catch (error) {
      console.error('Error setting channel title:', error);
      errors.push('назву');
    }

    // Set channel description
    try {
      await safeSetChatDescription(bot, state.channelId, fullDescription);
      operations.description = true;
    } catch (error) {
      console.error('Error setting channel description:', error);
      errors.push('опис');
    }

    // Set channel photo
    let photoFileId = null;
    try {
      if (fs.existsSync(PHOTO_PATH)) {
        const photoBuffer = fs.readFileSync(PHOTO_PATH);
        await safeSetChatPhoto(bot, state.channelId, photoBuffer);

        // Get the file_id by fetching chat info
        const chatInfo = await bot.api.getChat(state.channelId);
        if (chatInfo.photo && chatInfo.photo.big_file_id) {
          photoFileId = chatInfo.photo.big_file_id;
        }
        operations.photo = true;
      } else {
        console.warn('Photo file not found:', PHOTO_PATH);
        errors.push('фото (файл не знайдено)');
      }
    } catch (error) {
      console.error('Error setting channel photo:', error);
      errors.push('фото');
    }

    // If critical operations failed, don't save to database and notify user
    if (!operations.title || !operations.description) {
      const failedOperations = [];
      if (!operations.title) failedOperations.push('назву');
      if (!operations.description) failedOperations.push('опис');

      await bot.api.sendMessage(
        chatId,
        `❌ <b>Не вдалося налаштувати канал повністю</b>\n\n` +
        `Помилка при зміні: ${failedOperations.join(', ')}\n\n` +
        `Переконайтесь, що бот має права на:\n` +
        `• Публікацію повідомлень\n` +
        `• Редагування інформації каналу\n\n` +
        `Спробуйте ще раз через:\n` +
        `Налаштування → Канал → Підключити канал`,
        { parse_mode: 'HTML' }
      );
      await clearConversationState(telegramId);
      return;
    }

    // Save branding info to database only if title and description succeeded
    await usersDb.updateChannelBranding(telegramId, {
      channelTitle: fullTitle,
      channelDescription: fullDescription,
      channelPhotoFileId: photoFileId,
      userTitle: state.userTitle,
      userDescription: state.userDescription
    });

    // Send first publication message to channel
    try {
      const user = await usersDb.getUserByTelegramId(telegramId);
      await bot.api.sendMessage(
        state.channelId,
        getChannelWelcomeMessage(user),
        {
          parse_mode: 'HTML',
          disable_web_page_preview: true
        }
      );
    } catch (error) {
      console.error('Error sending first publication:', error);
      // Continue even if first publication fails
    }

    // Send success message with warning
    let successMessage = `✅ <b>Канал успішно налаштовано!</b>\n\n` +
      `📺 Назва каналу: ${fullTitle}\n`;

    // If photo failed, add a note
    if (!operations.photo) {
      successMessage += `\n⚠️ Зверніть увагу: фото каналу не вдалось встановити\n`;
    }

    successMessage += `\n⚠️ <b>Увага!</b>\n` +
      `Не змінюйте назву, опис або фото каналу.\n\n` +
      `Якщо ці дані буде змінено — бот припинить роботу,\n` +
      `і канал потрібно буде налаштувати заново.`;

    await bot.api.sendMessage(chatId, successMessage, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⤴ Меню', callback_data: 'back_to_main' }]
        ]
      }
    });

  } catch (error) {
    console.error('Помилка в applyChannelBranding:', error);
    await bot.api.sendMessage(chatId, '😅 Щось пішло не так при налаштуванні каналу. Спробуйте ще раз!');
  }
}

// Handle branding-related callbacks
async function handleBrandingCallbacks(bot, query, data, chatId, telegramId, user) {
  // Handle channel_edit_title - edit channel title
  if (data === 'channel_edit_title') {
    if (!user || !user.channel_id) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Канал не підключено',
        show_alert: true
      });
      return true;
    }

    await setConversationState(telegramId, {
      state: 'editing_title',
      channelId: user.channel_id
    });

    await safeEditMessageText(bot,
      `📝 <b>Зміна назви каналу</b>\n\n` +
      `Поточна назва: ${user.channel_title || 'Не налаштовано'}\n\n` +
      `Введіть нову назву для каналу.\n` +
      `Вона буде додана після префіксу "${CHANNEL_NAME_PREFIX}"\n\n` +
      `<b>Приклад:</b> Київ Черга 3.1\n` +
      `<b>Результат:</b> ${CHANNEL_NAME_PREFIX}Київ Черга 3.1`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
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

    return true;
  }

  // Handle channel_edit_description - edit channel description
  if (data === 'channel_edit_description') {
    if (!user || !user.channel_id) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Канал не підключено',
        show_alert: true
      });
      return true;
    }

    await setConversationState(telegramId, {
      state: 'editing_description',
      channelId: user.channel_id
    });

    await safeEditMessageText(bot,
      `📝 <b>Зміна опису каналу</b>\n\n` +
      `Поточний опис: ${user.user_description || 'Не налаштовано'}\n\n` +
      `Введіть новий опис для каналу.\n\n` +
      `<b>Приклад:</b> ЖК "Сонячний", під'їзд 2`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML'
      }
    );

    return true;
  }

  // Handle existing conversation state callbacks
  const state = getConversationState(telegramId);
  if (!state) {
    // No conversation state - these callbacks need a state
    if (data === 'channel_add_desc' || data === 'channel_skip_desc') {
      await safeAnswerCallbackQuery(bot, query.id, { text: '❌ Сесія закінчилась. Почніть заново.' });
      return true;
    }
  } else {
    // Has conversation state - handle description choice callbacks
    if (data === 'channel_add_desc') {
      state.state = 'waiting_for_description';
      await setConversationState(telegramId, state);

      await safeEditMessageText(bot,
        '📝 <b>Введіть опис каналу:</b>\n\n' +
        'Наприклад: ЖК "Сонячний", під\'їзд 2',
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML'
        }
      );

      return true;
    }

    if (data === 'channel_skip_desc') {
      state.userDescription = null;
      await applyChannelBranding(bot, chatId, telegramId, state);
      await clearConversationState(telegramId);
      await bot.api.deleteMessage(chatId, query.message.message_id);
      return true;
    }
  }

  return false;
}

module.exports = { applyChannelBranding, handleBrandingCallbacks };
