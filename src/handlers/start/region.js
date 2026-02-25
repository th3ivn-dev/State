const { userService } = require('../../services');
const { getConfirmKeyboard, getMainMenu, getQueueKeyboard, getRegionKeyboard, getWizardNotifyTargetKeyboard } = require('../../keyboards/inline');
const { REGIONS } = require('../../constants/regions');
const { safeEditMessageText, safeSendMessage } = require('../../utils/errorHandler');
const { parsePageNumber } = require('../../utils/validators');
const { isRegistrationEnabled, checkUserLimit, logUserRegistration, logWizardCompletion } = require('../../growthMetrics');
const { setWizardState, clearWizardState, DEVELOPMENT_WARNING, notifyAdminsAboutNewUser } = require('./helpers');

/**
 * Handles region/queue/confirm/back callbacks.
 * @param {object} bot
 * @param {object} query
 * @param {string|number} chatId
 * @param {string} telegramId
 * @param {string} data
 * @param {object} state
 * @returns {boolean} true if handled, false otherwise
 */
async function handleRegionCallback(bot, query, chatId, telegramId, data, state) {
  // Вибір регіону
  if (data.startsWith('region_')) {
    const region = data.replace('region_', '');

    if (!REGIONS[region]) {
      await safeEditMessageText(bot,
        '❌ Невідомий регіон. Спробуйте ще раз.',
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: getRegionKeyboard().reply_markup,
        }
      );
      return true;
    }

    state.region = region;
    state.step = 'queue';
    await setWizardState(telegramId, state);

    await safeEditMessageText(bot,
      `✅ Регіон: ${REGIONS[region].name}\n\n2️⃣ Оберіть свою чергу:`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: getQueueKeyboard(region, 1).reply_markup,
      }
    );
    return true;
  }

  // Pagination для черг Києва
  if (data.startsWith('queue_page_')) {
    const pageNum = parsePageNumber(data.replace('queue_page_', ''));

    await safeEditMessageText(bot,
      `✅ Регіон: ${REGIONS[state.region].name}\n\n2️⃣ Оберіть свою чергу:`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: getQueueKeyboard(state.region, pageNum).reply_markup,
      }
    );
    return true;
  }

  // Вибір черги
  if (data.startsWith('queue_')) {
    const queue = data.replace('queue_', '');

    if (!/^\d+\.\d+$/.test(queue)) {
      await safeEditMessageText(bot,
        '❌ Некоректний формат черги. Спробуйте ще раз.',
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: getQueueKeyboard(state.region, 1).reply_markup,
        }
      );
      return true;
    }

    state.queue = queue;

    // For new users, show notification target selection
    if (state.mode === 'new') {
      state.step = 'notify_target';
      await setWizardState(telegramId, state);

      const region = REGIONS[state.region]?.name || state.region;

      await safeEditMessageText(bot,
        `✅ Налаштування:\n\n` +
        `📍 Регіон: ${region}\n` +
        `⚡️ Черга: ${queue}\n\n` +
        `📬 Куди надсилати сповіщення про світло та графіки?\n\n` +
        `Оберіть, де вам зручніше їх отримувати:\n\n` +
        `📱 <b>У цьому боті</b>\n` +
        `Сповіщення приходитимуть прямо в цей чат\n\n` +
        `📺 <b>У вашому Telegram-каналі</b>\n` +
        `Бот публікуватиме сповіщення у ваш канал\n` +
        `(потрібно додати бота як адміністратора)`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: getWizardNotifyTargetKeyboard().reply_markup,
        }
      );
      return true;
    } else {
      // For edit mode, go to confirmation as before
      state.step = 'confirm';
      await setWizardState(telegramId, state);

      const region = REGIONS[state.region]?.name || state.region;

      await safeEditMessageText(bot,
        `✅ Налаштування:\n\n` +
        `📍 Регіон: ${region}\n` +
        `⚡️ Черга: ${queue}\n\n` +
        `Підтвердіть налаштування:`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: getConfirmKeyboard().reply_markup,
        }
      );
      return true;
    }
  }

  // Підтвердження
  if (data === 'confirm_setup') {
    const username = query.from.username || query.from.first_name;
    const mode = state.mode || 'new';

    if (mode === 'edit') {
      // Режим редагування - оновлюємо існуючого користувача
      await userService.updateUserRegionAndQueue(telegramId, state.region, state.queue);
      await clearWizardState(telegramId);

      const region = REGIONS[state.region]?.name || state.region;

      try {
        await safeEditMessageText(bot,
          `✅ <b>Налаштування оновлено!</b>\n\n` +
          `📍 Регіон: ${region}\n` +
          `⚡ Черга: ${state.queue}\n\n` +
          `Графік буде опубліковано при наступній перевірці.`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'HTML',
          }
        );
      } catch (_e) {
        // Ігноруємо помилки редагування — головне меню буде відправлено нижче
      }

      // Отримуємо актуальні дані користувача для розрахунку botStatus
      const updatedUser = await userService.getUserByTelegramId(telegramId);
      let botStatus = 'active';
      if (!updatedUser?.channel_id) {
        botStatus = 'no_channel';
      } else if (!updatedUser?.is_active) {
        botStatus = 'paused';
      }
      const channelPaused = updatedUser?.channel_paused === true;

      // Відправляємо головне меню як нове повідомлення
      const sentMessage = await safeSendMessage(bot, chatId, '🏠 <b>Головне меню</b>', {
        parse_mode: 'HTML',
        ...getMainMenu(botStatus, channelPaused),
      });
      if (sentMessage) {
        await userService.updateUser(telegramId, { last_start_message_id: sentMessage.message_id });
      }
    } else {
      // Режим створення нового користувача (legacy flow without notification target selection)
      // Перевіряємо чи користувач вже існує (для безпеки)
      const existingUser = await userService.getUserByTelegramId(telegramId);

      if (existingUser) {
        // Користувач вже існує - оновлюємо налаштування
        await userService.updateUserRegionAndQueue(telegramId, state.region, state.queue);
      } else {
        // Check registration limits before creating new user
        const limit = await checkUserLimit();
        if (limit.reached || !await isRegistrationEnabled()) {
          await safeEditMessageText(bot,
            `⚠️ <b>Реєстрація тимчасово обмежена</b>\n\n` +
            `На даний момент реєстрація нових користувачів тимчасово зупинена.\n\n` +
            `Спробуйте пізніше або зв'яжіться з підтримкою.`,
            {
              chat_id: chatId,
              message_id: query.message.message_id,
              parse_mode: 'HTML'
            }
          );
          await clearWizardState(telegramId);
          return true;
        }

        // Створюємо нового користувача
        await userService.createUser(telegramId, username, state.region, state.queue);

        // Log user registration for growth tracking
        await logUserRegistration(telegramId, { region: state.region, queue: state.queue, username });
        await logWizardCompletion(telegramId);

        // Notify admins about new user
        await notifyAdminsAboutNewUser(bot, telegramId, username, state.region, state.queue);
      }
      await clearWizardState(telegramId);

      const region = REGIONS[state.region]?.name || state.region;

      await safeEditMessageText(bot,
        `✅ Налаштування збережено!\n\n` +
        `📍 Регіон: ${region}\n` +
        `⚡️ Черга: ${state.queue}\n\n` +
        `Тепер ви будете отримувати сповіщення про зміни графіка.\n\n` +
        `Використовуйте команду /channel для підключення до каналу.`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
        }
      );

      // Відправляємо головне меню і зберігаємо ID
      const botStatus = 'no_channel'; // New user won't have channel yet
      const sentMessage = await bot.api.sendMessage(chatId, 'Головне меню:', getMainMenu(botStatus, false));
      await userService.updateUser(telegramId, { last_start_message_id: sentMessage.message_id });
    }

    return true;
  }

  // Назад до регіону
  if (data === 'back_to_region') {
    state.step = 'region';
    await setWizardState(telegramId, state);

    await safeEditMessageText(bot,
      '1️⃣ Оберіть ваш регіон:\n\n' +
      DEVELOPMENT_WARNING,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: getRegionKeyboard().reply_markup,
      }
    );
    return true;
  }

  return false;
}

module.exports = { handleRegionCallback };
