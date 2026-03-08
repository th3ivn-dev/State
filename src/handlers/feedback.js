const { createTicket, addTicketMessage } = require('../database/tickets');
const { safeSendMessage, safeEditMessageText, safeDeleteMessage } = require('../utils/errorHandler');
const { getState, setState, clearState } = require('../state/stateManager');
const { getHelpKeyboard } = require('../keyboards/inline');
const config = require('../config');
const { notifyAdminsAboutError } = require('../utils/adminNotifier');
const { getSetting } = require('../database/db');

// Час очікування на введення (5 хвилин)
const FEEDBACK_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Get the dynamic support button based on current support mode
 */
async function getSupportButton() {
  const mode = await getSetting('support_mode', 'channel');

  if (mode === 'channel') {
    const channelUrl = await getSetting('support_channel_url', 'https://t.me/Voltyk_news?direct');
    return { text: '✉️ Підтримка', url: channelUrl };  // URL button
  } else {
    return { text: '⚒️ Підтримка', callback_data: 'feedback_start' };  // Callback button (old tickets)
  }
}

/**
 * Клавіатура вибору типу звернення
 */
function getFeedbackTypeKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🐛 Баг', callback_data: 'feedback_type_bug' },
        { text: '💡 Ідея', callback_data: 'feedback_type_idea' }
      ],
      [{ text: '💬 Інше', callback_data: 'feedback_type_other' }],
      [{ text: '← Назад', callback_data: 'feedback_back' }],
    ],
  };
}

/**
 * Клавіатура підтвердження відправки
 */
function getFeedbackConfirmKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✅ Надіслати', callback_data: 'feedback_confirm' }],
      [{ text: '❌ Скасувати', callback_data: 'feedback_cancel' }],
    ],
  };
}

/**
 * Клавіатура скасування під час введення
 */
function getFeedbackCancelKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '❌ Скасувати', callback_data: 'feedback_cancel' }],
    ],
  };
}

/**
 * Отримати стан feedback для користувача
 */
function getFeedbackState(telegramId) {
  return getState('feedback', telegramId);
}

/**
 * Встановити стан feedback для користувача
 */
async function setFeedbackState(telegramId, data) {
  // Don't persist timeout objects to DB - they have circular refs
  await setState('feedback', telegramId, data, false);
}

/**
 * Очистити стан feedback для користувача
 */
async function clearFeedbackState(telegramId) {
  const state = getFeedbackState(telegramId);
  if (state && state.timeout) {
    clearTimeout(state.timeout);
  }
  await clearState('feedback', telegramId);
}

/**
 * Обробник початку зворотного зв'язку
 */
async function handleFeedbackStart(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const telegramId = String(query.from.id);

  try {
    // Очистимо попередній стан якщо є
    await clearFeedbackState(telegramId);

    await safeEditMessageText(bot,
      '💬 <b>Підтримка</b>\n\n' +
      'Оберіть тип вашого звернення:',
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getFeedbackTypeKeyboard(),
      }
    );
  } catch (error) {
    console.error('Помилка handleFeedbackStart:', error);
    await safeSendMessage(bot, chatId, '❌ Виникла помилка. Спробуйте пізніше.');
  }
}

/**
 * Обробник вибору типу звернення
 */
async function handleFeedbackType(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const telegramId = String(query.from.id);
  const data = query.data;

  try {
    const typeMap = {
      'feedback_type_bug': { type: 'bug', emoji: '🐛', label: 'Баг' },
      'feedback_type_idea': { type: 'feedback', emoji: '💡', label: 'Ідея' },
      'feedback_type_other': { type: 'feedback', emoji: '💬', label: 'Інше' },
    };

    const selectedType = typeMap[data];
    if (!selectedType) {
      return;
    }

    // Видалимо попереднє повідомлення
    await safeDeleteMessage(bot, chatId, messageId);

    // Відправимо нове повідомлення з інструкцією
    const sentMessage = await safeSendMessage(
      bot,
      chatId,
      `${selectedType.emoji} <b>${selectedType.label}</b>\n\n` +
      'Надішліть ваше повідомлення (текст, фото або відео).\n\n' +
      '⏱ У вас є 5 хвилин на введення.',
      {
        parse_mode: 'HTML',
        reply_markup: getFeedbackCancelKeyboard(),
      }
    );

    if (!sentMessage) {
      return;
    }

    // Встановимо таймаут на введення
    const timeout = setTimeout(async () => {
      await clearFeedbackState(telegramId);
      await safeDeleteMessage(bot, chatId, sentMessage.message_id);
      await safeSendMessage(
        bot,
        chatId,
        '⏱ Час очікування минув. Спробуйте знову, натиснувши на кнопку "💬 Підтримка".'
      );
    }, FEEDBACK_TIMEOUT_MS);

    // Зберігаємо стан
    await setFeedbackState(telegramId, {
      step: 'awaiting_message',
      type: selectedType.type,
      emoji: selectedType.emoji,
      label: selectedType.label,
      messageId: sentMessage.message_id,
      timeout,
    });
  } catch (error) {
    console.error('Помилка handleFeedbackType:', error);
    await safeSendMessage(bot, chatId, '❌ Виникла помилка. Спробуйте пізніше.');
  }
}

/**
 * Обробник введення повідомлення користувачем
 */
async function handleFeedbackMessage(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);
  const state = getFeedbackState(telegramId);

  if (!state || state.step !== 'awaiting_message') {
    return false; // Не наш стан
  }

  try {
    // Очищаємо таймаут
    if (state.timeout) {
      clearTimeout(state.timeout);
    }

    // Видаляємо попереднє повідомлення з інструкцією
    await safeDeleteMessage(bot, chatId, state.messageId);

    let messageType = 'text';
    let content = null;
    let fileId = null;

    if (msg.text) {
      messageType = 'text';
      content = msg.text;
    } else if (msg.photo) {
      messageType = 'photo';
      // Telegram надає кілька розмірів фото, останній елемент - найвища якість
      fileId = msg.photo[msg.photo.length - 1].file_id;
      content = msg.caption || '';
    } else if (msg.video) {
      messageType = 'video';
      fileId = msg.video.file_id;
      content = msg.caption || '';
    } else {
      await safeSendMessage(
        bot,
        chatId,
        '❌ Підтримуються тільки текст, фото та відео. Спробуйте ще раз.'
      );
      return true;
    }

    // Зберігаємо отримані дані
    await setFeedbackState(telegramId, {
      ...state,
      step: 'confirming',
      messageType,
      content,
      fileId,
      originalMessageId: msg.message_id,
      timeout: null,
    });

    // Показуємо preview з підтвердженням
    let previewText = `${state.emoji} <b>${state.label}</b>\n\n`;

    if (messageType === 'text') {
      previewText += `📝 Ваше повідомлення:\n${content}\n\n`;
    } else if (messageType === 'photo') {
      previewText += `📷 Фото${content ? ' з підписом:\n' + content : ''}\n\n`;
    } else if (messageType === 'video') {
      previewText += `🎥 Відео${content ? ' з підписом:\n' + content : ''}\n\n`;
    }

    previewText += 'Надіслати це звернення?';

    const sentMessage = await safeSendMessage(bot, chatId, previewText, {
      parse_mode: 'HTML',
      reply_markup: getFeedbackConfirmKeyboard(),
    });

    if (sentMessage) {
      // Оновлюємо стан з ID повідомлення підтвердження
      const currentState = getFeedbackState(telegramId);
      await setFeedbackState(telegramId, {
        ...currentState,
        confirmMessageId: sentMessage.message_id,
      });
    }

    return true; // Повідомлення оброблене
  } catch (error) {
    console.error('Помилка handleFeedbackMessage:', error);
    notifyAdminsAboutError(bot, error, 'handleFeedbackMessage');
    await safeSendMessage(bot, chatId, '❌ Виникла помилка. Спробуйте пізніше.');
    await clearFeedbackState(telegramId);
    return true;
  }
}

/**
 * Обробник підтвердження відправки
 */
async function handleFeedbackConfirm(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const telegramId = String(query.from.id);
  const username = query.from.username || 'без username';
  const state = getFeedbackState(telegramId);

  if (!state || state.step !== 'confirming') {
    // Early answer in main handler already sent - no need to answer with error message here
    return;
  }

  try {

    // Створюємо тикет
    const ticket = await createTicket(telegramId, state.type, state.label);

    // Додаємо повідомлення до тикета
    await addTicketMessage(
      ticket.id,
      'user',
      telegramId,
      state.messageType,
      state.content,
      state.fileId
    );

    // Видаляємо повідомлення підтвердження та оригінальне повідомлення
    await safeDeleteMessage(bot, chatId, messageId);
    if (state.originalMessageId) {
      await safeDeleteMessage(bot, chatId, state.originalMessageId);
    }

    // Відправляємо підтвердження користувачу
    await safeSendMessage(
      bot,
      chatId,
      `✅ <b>Дякуємо за звернення!</b>\n\n` +
      `Ваше звернення #${ticket.id} прийнято.\n` +
      `Ми розглянемо його найближчим часом.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⤴ Меню', callback_data: 'back_to_main' }]
          ]
        }
      }
    );

    // Сповіщаємо адмінів
    await notifyAdminsAboutNewTicket(bot, ticket, state, username);

    // Очищаємо стан
    await clearFeedbackState(telegramId);
  } catch (error) {
    console.error('Помилка handleFeedbackConfirm:', error);
    notifyAdminsAboutError(bot, error, 'handleFeedbackConfirm');
    await safeSendMessage(bot, chatId, '❌ Виникла помилка під час відправки. Спробуйте пізніше.');
    await clearFeedbackState(telegramId);
  }
}

/**
 * Обробник скасування
 */
async function handleFeedbackCancel(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const telegramId = String(query.from.id);
  const state = getFeedbackState(telegramId);

  try {
    // Already answered in main handler - removed duplicate answer call to prevent double acknowledgment

    // Видаляємо повідомлення
    await safeDeleteMessage(bot, chatId, messageId);

    // Видаляємо оригінальне повідомлення якщо є
    if (state && state.originalMessageId) {
      await safeDeleteMessage(bot, chatId, state.originalMessageId);
    }

    // Очищаємо стан
    await clearFeedbackState(telegramId);

    await safeSendMessage(bot, chatId, '❌ Звернення скасовано.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '⤴ Меню', callback_data: 'back_to_main' }]
        ]
      }
    });
  } catch (error) {
    console.error('Помилка handleFeedbackCancel:', error);
  }
}

/**
 * Сповістити адмінів про нове звернення
 */
async function notifyAdminsAboutNewTicket(bot, ticket, state, username) {
  try {
    const allAdmins = [...config.adminIds];
    if (config.ownerId && !allAdmins.includes(config.ownerId)) {
      allAdmins.push(config.ownerId);
    }

    let message =
      `🎫 <b>Нове звернення #${ticket.id}</b>\n\n` +
      `${state.emoji} <b>Тип:</b> ${state.label}\n` +
      `👤 <b>Від:</b> @${username} (ID: <code>${ticket.telegram_id}</code>)\n` +
      `📅 <b>Дата:</b> ${new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })}\n\n`;

    if (state.messageType === 'text') {
      message += `📝 <b>Повідомлення:</b>\n${state.content}`;
    } else if (state.messageType === 'photo') {
      message += `📷 Фото${state.content ? ' з підписом:\n' + state.content : ''}`;
    } else if (state.messageType === 'video') {
      message += `🎥 Відео${state.content ? ' з підписом:\n' + state.content : ''}`;
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: '📩 Переглянути', callback_data: `admin_ticket_view_${ticket.id}` }],
      ],
    };

    for (const adminId of allAdmins) {
      try {
        if (state.messageType === 'text') {
          await bot.api.sendMessage(adminId, message, {
            parse_mode: 'HTML',
            reply_markup: keyboard,
          });
        } else if (state.messageType === 'photo' && state.fileId) {
          await bot.api.sendPhoto(adminId, state.fileId, {
            caption: message,
            parse_mode: 'HTML',
            reply_markup: keyboard,
          });
        } else if (state.messageType === 'video' && state.fileId) {
          await bot.api.sendVideo(adminId, state.fileId, {
            caption: message,
            parse_mode: 'HTML',
            reply_markup: keyboard,
          });
        }
      } catch (error) {
        // Ігноруємо помилки відправки адміну
        console.error(`Не вдалося сповістити адміна ${adminId}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Помилка notifyAdminsAboutNewTicket:', error);
  }
}

/**
 * Основний обробник callback для feedback
 */
async function handleFeedbackCallback(bot, query) {
  const data = query.data;
  await bot.api.answerCallbackQuery(query.id).catch(() => {});

  if (data === 'feedback_start') {
    await handleFeedbackStart(bot, query);
  } else if (data.startsWith('feedback_type_')) {
    await handleFeedbackType(bot, query);
  } else if (data === 'feedback_confirm') {
    await handleFeedbackConfirm(bot, query);
  } else if (data === 'feedback_cancel') {
    await handleFeedbackCancel(bot, query);
  } else if (data === 'feedback_back') {
    // Очистити стан feedback
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const telegramId = String(query.from.id);

    await clearFeedbackState(telegramId);

    // Повернутися до допомоги
    const helpKeyboard = await getHelpKeyboard();
    await safeEditMessageText(bot,
      '❓ <b>Допомога</b>\n\n' +
      'ℹ️ Тут ви можете дізнатися як\n' +
      'користуватися ботом.',
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: helpKeyboard.reply_markup,
      }
    );
  }
}

module.exports = {
  handleFeedbackCallback,
  handleFeedbackMessage,
  getFeedbackState,
  clearFeedbackState,
  getSupportButton,
};
