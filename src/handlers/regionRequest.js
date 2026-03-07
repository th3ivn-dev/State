const { createTicket, addTicketMessage } = require('../database/tickets');
const { safeSendMessage, safeDeleteMessage } = require('../utils/errorHandler');
const { getState, setState, clearState } = require('../state/stateManager');
const config = require('../config');

// Час очікування на введення (5 хвилин)
const REGION_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_REGION_NAME_LENGTH = 2;
const MAX_REGION_NAME_LENGTH = 100;

/**
 * Клавіатура підтвердження запиту регіону
 */
function getRegionRequestConfirmKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✅ Надіслати', callback_data: 'region_request_confirm' }],
      [{ text: '❌ Скасувати', callback_data: 'region_request_cancel' }],
    ],
  };
}

/**
 * Клавіатура скасування під час введення
 */
function getRegionRequestCancelKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '❌ Скасувати', callback_data: 'region_request_cancel' }],
    ],
  };
}

/**
 * Отримати стан region_request для користувача
 */
function getRegionRequestState(telegramId) {
  return getState('regionRequest', telegramId);
}

/**
 * Встановити стан region_request для користувача
 */
async function setRegionRequestState(telegramId, data) {
  // Don't persist timeout objects to DB - they have circular refs
  await setState('regionRequest', telegramId, data, false);
}

/**
 * Очистити стан region_request для користувача
 */
async function clearRegionRequestState(telegramId) {
  const state = getRegionRequestState(telegramId);
  if (state && state.timeout) {
    clearTimeout(state.timeout);
  }
  await clearState('regionRequest', telegramId);
}

/**
 * Обробник початку запиту на новий регіон
 */
async function handleRegionRequestStart(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const telegramId = String(query.from.id);

  try {
    // Очистимо попередній стан якщо є
    await clearRegionRequestState(telegramId);

    // Видалимо попереднє повідомлення
    await safeDeleteMessage(bot, chatId, messageId);

    // Відправимо нове повідомлення з інструкцією
    const sentMessage = await safeSendMessage(
      bot,
      chatId,
      '🏙 <b>Запит на новий регіон</b>\n\n' +
      'Введіть назву міста або регіону, який ви хочете додати.\n\n' +
      'Приклад: <i>Житомир</i>, <i>Вінниця</i>, <i>Черкаси</i>\n\n' +
      '⏱ У вас є 5 хвилин на введення.',
      {
        parse_mode: 'HTML',
        reply_markup: getRegionRequestCancelKeyboard(),
      }
    );

    if (!sentMessage) {
      return;
    }

    // Встановимо таймаут на введення
    const timeout = setTimeout(async () => {
      await clearRegionRequestState(telegramId);
      await safeDeleteMessage(bot, chatId, sentMessage.message_id);

      // Перевіряємо чи користувач в wizard
      const wizardState = getState('wizard', telegramId);
      const isInWizardFlow = !!(wizardState && wizardState.step);

      const navigationButton = isInWizardFlow
        ? [{ text: '← Назад', callback_data: 'back_to_region' }]
        : [{ text: '⤴ Меню', callback_data: 'back_to_main' }];

      await safeSendMessage(
        bot,
        chatId,
        '⏱ Час очікування минув. Спробуйте знову.',
        {
          reply_markup: {
            inline_keyboard: [navigationButton]
          }
        }
      );
    }, REGION_REQUEST_TIMEOUT_MS);

    // Зберігаємо стан
    await setRegionRequestState(telegramId, {
      step: 'awaiting_region',
      messageId: sentMessage.message_id,
      timeout,
    });
  } catch (error) {
    console.error('Помилка handleRegionRequestStart:', error);
    await safeSendMessage(bot, chatId, '❌ Виникла помилка. Спробуйте пізніше.');
  }
}

/**
 * Обробник введення назви регіону користувачем
 */
async function handleRegionRequestMessage(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);
  const state = getRegionRequestState(telegramId);

  if (!state || state.step !== 'awaiting_region') {
    return false; // Не наш стан
  }

  try {
    // Перевіряємо що це текстове повідомлення
    if (!msg.text) {
      await safeSendMessage(
        bot,
        chatId,
        '❌ Будь ласка, введіть текст з назвою регіону.'
      );
      return true;
    }

    const regionName = msg.text.trim();

    // Перевіряємо довжину
    if (regionName.length < MIN_REGION_NAME_LENGTH) {
      await safeSendMessage(
        bot,
        chatId,
        '❌ Назва регіону занадто коротка. Спробуйте ще раз.'
      );
      return true;
    }

    if (regionName.length > MAX_REGION_NAME_LENGTH) {
      await safeSendMessage(
        bot,
        chatId,
        '❌ Назва регіону занадто довга. Спробуйте ще раз.'
      );
      return true;
    }

    // Очищаємо таймаут
    if (state.timeout) {
      clearTimeout(state.timeout);
    }

    // Видаляємо попереднє повідомлення з інструкцією
    await safeDeleteMessage(bot, chatId, state.messageId);

    // Зберігаємо отримані дані
    await setRegionRequestState(telegramId, {
      ...state,
      step: 'confirming',
      regionName,
      originalMessageId: msg.message_id,
      timeout: null,
    });

    // Показуємо preview з підтвердженням
    const previewText =
      '🏙 <b>Запит на новий регіон</b>\n\n' +
      `📍 <b>Регіон:</b> ${regionName}\n\n` +
      'Надіслати цей запит?';

    const sentMessage = await safeSendMessage(bot, chatId, previewText, {
      parse_mode: 'HTML',
      reply_markup: getRegionRequestConfirmKeyboard(),
    });

    if (sentMessage) {
      // Оновлюємо стан з ID повідомлення підтвердження
      const currentState = getRegionRequestState(telegramId);
      await setRegionRequestState(telegramId, {
        ...currentState,
        confirmMessageId: sentMessage.message_id,
      });
    }

    return true; // Повідомлення оброблене
  } catch (error) {
    console.error('Помилка handleRegionRequestMessage:', error);
    await safeSendMessage(bot, chatId, '❌ Виникла помилка. Спробуйте пізніше.');
    await clearRegionRequestState(telegramId);
    return true;
  }
}

/**
 * Обробник підтвердження відправки запиту
 */
async function handleRegionRequestConfirm(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const telegramId = String(query.from.id);
  const username = query.from.username || 'без username';
  const state = getRegionRequestState(telegramId);

  if (!state || state.step !== 'confirming') {
    // Early answer in main handler already sent - no need to answer with error message here
    return;
  }

  try {

    // Створюємо тикет
    const ticket = await createTicket(telegramId, 'region_request', `Запит на додавання регіону: ${state.regionName}`);

    // Додаємо повідомлення до тикета
    await addTicketMessage(
      ticket.id,
      'user',
      telegramId,
      'text',
      state.regionName,
      null
    );

    // Видаляємо повідомлення підтвердження та оригінальне повідомлення
    await safeDeleteMessage(bot, chatId, messageId);
    if (state.originalMessageId) {
      await safeDeleteMessage(bot, chatId, state.originalMessageId);
    }

    // Перевіряємо чи користувач в wizard
    const wizardState = getState('wizard', telegramId);
    const isInWizardFlow = !!(wizardState && wizardState.step);

    const navigationButton = isInWizardFlow
      ? [{ text: '← Назад', callback_data: 'back_to_region' }]
      : [{ text: '⤴ Меню', callback_data: 'back_to_main' }];

    // Відправляємо підтвердження користувачу
    await safeSendMessage(
      bot,
      chatId,
      `✅ <b>Дякуємо за запит!</b>\n\n` +
      `Ваш запит #${ticket.id} на додавання регіону "<b>${state.regionName}</b>" прийнято.\n\n` +
      `Ми розглянемо його найближчим часом.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [navigationButton]
        }
      }
    );

    // Сповіщаємо адмінів
    await notifyAdminsAboutRegionRequest(bot, ticket, state, username);

    // Очищаємо стан
    await clearRegionRequestState(telegramId);
  } catch (error) {
    console.error('Помилка handleRegionRequestConfirm:', error);
    await safeSendMessage(bot, chatId, '❌ Виникла помилка під час відправки. Спробуйте пізніше.');
    await clearRegionRequestState(telegramId);
  }
}

/**
 * Обробник скасування
 */
async function handleRegionRequestCancel(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const telegramId = String(query.from.id);
  const state = getRegionRequestState(telegramId);

  try {
    // Already answered in main handler - removed duplicate answer call to prevent double acknowledgment

    // Видаляємо повідомлення
    await safeDeleteMessage(bot, chatId, messageId);

    // Видаляємо оригінальне повідомлення якщо є
    if (state && state.originalMessageId) {
      await safeDeleteMessage(bot, chatId, state.originalMessageId);
    }

    // Очищаємо стан
    await clearRegionRequestState(telegramId);

    // Перевіряємо чи користувач в wizard
    const wizardState = getState('wizard', telegramId);
    const isInWizardFlow = !!(wizardState && wizardState.step);

    const navigationButton = isInWizardFlow
      ? [{ text: '← Назад', callback_data: 'back_to_region' }]
      : [{ text: '⤴ Меню', callback_data: 'back_to_main' }];

    await safeSendMessage(bot, chatId, '❌ Запит скасовано.', {
      reply_markup: {
        inline_keyboard: [navigationButton]
      }
    });
  } catch (error) {
    console.error('Помилка handleRegionRequestCancel:', error);
  }
}

/**
 * Сповістити адмінів про новий запит регіону
 */
async function notifyAdminsAboutRegionRequest(bot, ticket, state, username) {
  try {
    const allAdmins = [...config.adminIds];
    if (config.ownerId && !allAdmins.includes(config.ownerId)) {
      allAdmins.push(config.ownerId);
    }

    const message =
      `🏙 <b>Запит на новий регіон #${ticket.id}</b>\n\n` +
      `📍 <b>Регіон:</b> ${state.regionName}\n` +
      `👤 <b>Від:</b> @${username} (ID: <code>${ticket.telegram_id}</code>)\n` +
      `📅 <b>Дата:</b> ${new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })}`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '📩 Переглянути', callback_data: `admin_ticket_view_${ticket.id}` }],
      ],
    };

    for (const adminId of allAdmins) {
      try {
        await bot.api.sendMessage(adminId, message, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
      } catch (error) {
        // Ігноруємо помилки відправки адміну
        console.error(`Не вдалося сповістити адміна ${adminId}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Помилка notifyAdminsAboutRegionRequest:', error);
  }
}

/**
 * Основний обробник callback для region request
 */
async function handleRegionRequestCallback(bot, query) {
  const data = query.data;
  await bot.api.answerCallbackQuery(query.id).catch(() => {});

  if (data === 'region_request_start') {
    await handleRegionRequestStart(bot, query);
  } else if (data === 'region_request_confirm') {
    await handleRegionRequestConfirm(bot, query);
  } else if (data === 'region_request_cancel') {
    await handleRegionRequestCancel(bot, query);
  }
}

module.exports = {
  handleRegionRequestCallback,
  handleRegionRequestMessage,
  getRegionRequestState,
  clearRegionRequestState,
};
