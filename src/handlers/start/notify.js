const usersDb = require('../../database/users');
const { getWizardNotifyTargetKeyboard } = require('../../keyboards/inline');
const { REGIONS } = require('../../constants/regions');
const { getBotUsername, getChannelConnectionInstructions, escapeHtml } = require('../../utils');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { getSetting } = require('../../database/db');
const { isRegistrationEnabled, checkUserLimit, logUserRegistration, logWizardCompletion } = require('../../growthMetrics');
const { setConversationState } = require('../channel');
const { pendingChannels, removePendingChannel } = require('../../state/pendingChannels');
const {
  PENDING_CHANNEL_EXPIRATION_MS,
  CHANNEL_NAME_PREFIX,
  setWizardState,
  clearWizardState,
  createPauseKeyboard,
  notifyAdminsAboutNewUser,
} = require('./helpers');

/**
 * Handles wizard_notify_* and wizard_channel_* callbacks.
 * @param {object} bot
 * @param {object} query
 * @param {string|number} chatId
 * @param {string} telegramId
 * @param {string} data
 * @param {object} state
 * @returns {boolean} true if handled, false otherwise
 */
async function handleNotifyCallback(bot, query, chatId, telegramId, data, state) {
  // Wizard: вибір "У цьому боті"
  if (data === 'wizard_notify_bot') {
    const username = query.from.username || query.from.first_name;

    // Перевіряємо чи користувач вже існує
    const existingUser = await usersDb.getUserByTelegramId(telegramId);

    if (existingUser) {
      // Користувач вже існує - оновлюємо налаштування включаючи регіон та чергу з wizard
      await usersDb.updateUserRegionAndQueue(telegramId, state.region, state.queue);
      await usersDb.updateUserPowerNotifyTarget(telegramId, 'bot');
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

      // Створюємо користувача з power_notify_target = 'bot'
      // Note: Two separate calls used here to maintain backward compatibility with createUser
      // TODO: Consider extending createUser to accept power_notify_target parameter
      await usersDb.createUser(telegramId, username, state.region, state.queue);
      await usersDb.updateUserPowerNotifyTarget(telegramId, 'bot');

      // Log user registration for growth tracking
      await logUserRegistration(telegramId, { region: state.region, queue: state.queue, username, notify_target: 'bot' });
      await logWizardCompletion(telegramId);

      // Notify admins about new user
      await notifyAdminsAboutNewUser(bot, telegramId, username, state.region, state.queue);
    }
    await clearWizardState(telegramId);

    const region = REGIONS[state.region]?.name || state.region;

    await safeEditMessageText(bot,
      `✅ <b>Готово!</b>\n\n` +
      `📍 Регіон: ${region}\n` +
      `⚡ Черга: ${state.queue}\n` +
      `🔔 Сповіщення: увімкнено ✅\n\n` +
      `Я одразу повідомлю вас про наступне\n` +
      `відключення або появу світла.\n\n` +
      `Натисніть <b>⤴ Меню</b>, щоб перейти до головного меню.`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⤴ Меню', callback_data: 'back_to_main' }],
            [{ text: '📢 Новини бота', url: 'https://t.me/Voltyk_news' }],
          ]
        }
      }
    );

    return true;
  }

  // Wizard: вибір "У Telegram-каналі"
  if (data === 'wizard_notify_channel') {
    // Перевірка режиму паузи
    const botPaused = await getSetting('bot_paused', '0') === '1';

    if (botPaused) {
      const pauseMessage = await getSetting('pause_message', '🔧 Бот тимчасово недоступний. Спробуйте пізніше.');
      const showSupport = await getSetting('pause_show_support', '1') === '1';

      await safeEditMessageText(bot, pauseMessage, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: await createPauseKeyboard(showSupport)
      });
      return true;
    }

    const username = query.from.username || query.from.first_name;

    // Перевіряємо чи користувач вже існує
    const existingUser = await usersDb.getUserByTelegramId(telegramId);

    if (existingUser) {
      // Користувач вже існує - оновлюємо налаштування включаючи регіон та чергу з wizard
      await usersDb.updateUserRegionAndQueue(telegramId, state.region, state.queue);
      await usersDb.updateUserPowerNotifyTarget(telegramId, 'both');
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

      // Створюємо нового користувача з power_notify_target = 'both'
      // Note: Two separate calls used here to maintain backward compatibility with createUser
      // TODO: Consider extending createUser to accept power_notify_target parameter
      await usersDb.createUser(telegramId, username, state.region, state.queue);
      await usersDb.updateUserPowerNotifyTarget(telegramId, 'both');

      // Log user registration for growth tracking
      await logUserRegistration(telegramId, { region: state.region, queue: state.queue, username, notify_target: 'both' });
      await logWizardCompletion(telegramId);

      // Notify admins about new user
      await notifyAdminsAboutNewUser(bot, telegramId, username, state.region, state.queue);
    }

    // Зберігаємо wizard state для обробки підключення каналу
    state.step = 'channel_setup';
    await setWizardState(telegramId, state);

    // Використовуємо існуючу логіку підключення каналу

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
      await safeEditMessageText(bot,
        `✅ Канал знайдено: "<b>${escapeHtml(pendingChannel.channelTitle)}</b>"\n\n` +
        `Використовувати його для сповіщень?`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✓ Так, підключити', callback_data: `wizard_channel_confirm_${pendingChannel.channelId}` },
                { text: '✕ Ні', callback_data: 'wizard_notify_back' }
              ]
            ]
          }
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
              [{ text: '✅ Перевірити', callback_data: 'wizard_notify_channel' }],
              [{ text: '← Назад', callback_data: 'wizard_notify_back' }]
            ]
          }
        }
      );

      // Оновлюємо wizard state з message ID
      state.lastMessageId = query.message.message_id;
      await setWizardState(telegramId, state);
    }

    return true;
  }

  // Wizard: назад до вибору куди сповіщати
  if (data === 'wizard_notify_back') {
    state.step = 'notify_target';
    await setWizardState(telegramId, state);

    await safeEditMessageText(bot,
      `✅ Черга: ${state.queue}\n\n` +
      `📬 Крок 3 із 3 — Куди надсилати сповіщення?\n\n` +
      `📱 <b>У цьому боті</b>\n` +
      `Сповіщення приходитимуть прямо в цей чат\n\n` +
      `📺 <b>У Telegram-каналі</b>\n` +
      `Бот публікуватиме у ваш канал\n` +
      `(потрібно додати бота як адміністратора)`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getWizardNotifyTargetKeyboard().reply_markup,
      }
    );

    return true;
  }

  // Wizard: підтвердження підключення каналу
  if (data.startsWith('wizard_channel_confirm_')) {
    // Перевірка режиму паузи
    const botPaused = await getSetting('bot_paused', '0') === '1';

    if (botPaused) {
      const pauseMessage = await getSetting('pause_message', '🔧 Бот тимчасово недоступний. Спробуйте пізніше.');
      const showSupport = await getSetting('pause_show_support', '1') === '1';

      await safeEditMessageText(bot, pauseMessage, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: await createPauseKeyboard(showSupport)
      });
      return true;
    }

    const channelId = data.replace('wizard_channel_confirm_', '');

    // Перевіряємо чи бот ще в каналі
    try {
      const botInfo = await bot.api.getMe();
      const chatMember = await bot.api.getChatMember(channelId, botInfo.id);

      if (chatMember.status !== 'administrator') {
        await safeAnswerCallbackQuery(bot, query.id, {
          text: '❌ Бота більше немає в каналі. Додайте його знову.',
          show_alert: true
        });
        return true;
      }
    } catch (_error) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Не вдалося перевірити канал. Спробуйте ще раз.',
        show_alert: true
      });
      return true;
    }

    const pending = pendingChannels.get(channelId);

    if (!pending) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Канал не знайдено. Додайте бота в канал ще раз.',
        show_alert: true
      });
      return true;
    }

    // Зберігаємо канал
    await usersDb.updateUser(telegramId, {
      channel_id: channelId,
      channel_title: pending.channelTitle
    });

    // Видаляємо з pending
    removePendingChannel(channelId);

    // Очищаємо wizard state (wizard завершено, далі channel conversation)
    await clearWizardState(telegramId);

    // Запускаємо channel branding flow (як у settings flow)
    await setConversationState(telegramId, {
      state: 'waiting_for_title',
      channelId: channelId,
      channelUsername: pending.channelUsername || pending.channelTitle,
      timestamp: Date.now()
    });

    // Показуємо форму введення назви
    await safeEditMessageText(bot,
      '✅ <b>Канал підключено!</b>\n\n' +
      'Як назвати канал?\n\n' +
      `Назва буде додана після "${CHANNEL_NAME_PREFIX}"\n\n` +
      '<b>Приклад:</b> Київ Черга 3.1\n' +
      '<b>Результат:</b> СвітлоБот ⚡ Київ Черга 3.1',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML'
      }
    );

    return true;
  }

  // Wizard: відмова від підключення
  if (data === 'wizard_channel_cancel') {

    // Видаляємо pending channel якщо є
    if (state && state.pendingChannelId) {
      removePendingChannel(state.pendingChannelId);
    }

    // Повертаємося до вибору куди сповіщати
    state.step = 'notify_target';
    state.pendingChannelId = null;
    await setWizardState(telegramId, state);

    await safeEditMessageText(bot,
      `👌 Добре, канал не підключено.\n\n` +
      `Оберіть куди надсилати сповіщення:`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getWizardNotifyTargetKeyboard().reply_markup
      }
    );

    return true;
  }

  return false;
}

module.exports = { handleNotifyCallback };
