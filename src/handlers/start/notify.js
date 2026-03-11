const usersDb = require('../../database/users');
const {
  getWizardNotifyTargetKeyboard,
  getWizardBotNotificationKeyboard,
  getWizardChannelNotificationKeyboard,
} = require('../../keyboards/inline');
const { REGIONS } = require('../../constants/regions');
const { getBotUsername, getChannelConnectionInstructions, escapeHtml } = require('../../utils');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { getSetting } = require('../../database/db');
const { isRegistrationEnabled, checkUserLimit, logUserRegistration, logWizardCompletion } = require('../../growthMetrics');
const { setConversationState } = require('../channel');
const { pendingChannels, removePendingChannel } = require('../../state/pendingChannels');
const { buildWizardNotificationSettingsMessage, buildWizardChannelNotificationMessage } = require('../settings/helpers');
const {
  PENDING_CHANNEL_EXPIRATION_MS,
  CHANNEL_NAME_PREFIX,
  setWizardState,
  clearWizardState,
  createPauseKeyboard,
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

      // Mark pending admin notification (will notify admins when user clicks "Меню")
      state.pendingAdminNotification = true;
      state.pendingUsername = username;
    }

    // Save wizard state to bot_notifications step
    state.step = 'bot_notifications';
    await setWizardState(telegramId, state);

    // Show bot notification settings screen
    const user = await usersDb.getUserByTelegramId(telegramId);
    await safeEditMessageText(bot,
      buildWizardNotificationSettingsMessage(user),
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getWizardBotNotificationKeyboard(user).reply_markup,
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

      // Mark pending admin notification (will notify admins when user clicks "Меню")
      state.pendingAdminNotification = true;
      state.pendingUsername = username;
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

    // Зберігаємо wizard step (не очищаємо — wizard завершиться при натисканні "Меню")
    state.step = 'channel_notifications';
    await setWizardState(telegramId, state);

    // Запускаємо channel branding flow (як у settings flow)
    await setConversationState(telegramId, {
      state: 'waiting_for_title',
      channelId: channelId,
      channelUsername: pending.channelUsername || pending.channelTitle,
      fromWizard: true,
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

  // Wizard: кнопка "Готово!" для бота — показати фінальне повідомлення
  if (data === 'wizard_bot_done') {
    const region = REGIONS[state.region]?.name || state.region;

    await safeEditMessageText(bot,
      `✅ <b>Готово!</b>\n\n` +
      `📍 Регіон: ${region}\n` +
      `⚡ Черга: ${state.queue}\n` +
      `🔔 Сповіщення: увімкнено ✅\n\n` +
      `Я одразу повідомлю вас про наступне\n` +
      `відключення або появу світла.\n\n` +
      `⤵ Меню — перейти в головне меню\n` +
      `📢 Новини бота — канал з оновленнями`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⤵ Меню', callback_data: 'back_to_main' }],
            [{ text: '📢 Новини бота', url: 'https://t.me/Voltyk_news' }],
          ]
        }
      }
    );

    return true;
  }

  // Wizard: кнопка "Готово!" для каналу — показати фінальне повідомлення
  if (data === 'wizard_channel_done') {
    const user = await usersDb.getUserByTelegramId(telegramId);
    const channelTitle = user?.channel_title || '';

    let successMessage = `✅ <b>Канал успішно налаштовано!</b>\n\n` +
      `📺 Назва каналу: ${channelTitle}\n`;

    successMessage += `\n⚠️ <b>Увага!</b>\n` +
      `Не змінюйте назву, опис або фото каналу.\n\n` +
      `Якщо ці дані буде змінено — бот припинить роботу,\n` +
      `і канал потрібно буде налаштувати заново.\n\n` +
      `⤵ Меню — перейти в головне меню\n` +
      `📢 Новини бота — канал з оновленнями`;

    await safeEditMessageText(bot,
      successMessage,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⤵ Меню', callback_data: 'back_to_main' }],
            [{ text: '📢 Новини бота', url: 'https://t.me/Voltyk_news' }],
          ]
        }
      }
    );

    return true;
  }

  // Wizard: кнопка "← Назад" для каналу — повернутися до вибору куди сповіщати
  if (data === 'wizard_channel_back') {
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

  // Wizard: toggles для сповіщень бота
  if (data === 'wizard_notif_toggle_schedule') {
    const user = await usersDb.getUserByTelegramId(telegramId);
    if (!user) return false;
    const newVal = !(user.notify_schedule_changes !== false);
    await usersDb.updateNotificationSettings(telegramId, { notify_schedule_changes: newVal });
    const fresh = await usersDb.getUserByTelegramId(telegramId);
    await safeEditMessageText(bot, buildWizardNotificationSettingsMessage(fresh), {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getWizardBotNotificationKeyboard(fresh).reply_markup,
    });
    return true;
  }

  if (data === 'wizard_notif_toggle_fact') {
    const user = await usersDb.getUserByTelegramId(telegramId);
    if (!user) return false;
    const currentVal = user.notify_fact_off !== false;
    const newVal = !currentVal;
    await usersDb.updateNotificationSettings(telegramId, { notify_fact_off: newVal, notify_fact_on: newVal });
    const fresh = await usersDb.getUserByTelegramId(telegramId);
    await safeEditMessageText(bot, buildWizardNotificationSettingsMessage(fresh), {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getWizardBotNotificationKeyboard(fresh).reply_markup,
    });
    return true;
  }

  const wizardBotTimeToggles = {
    wizard_notif_time_15: 'remind_15m',
    wizard_notif_time_30: 'remind_30m',
    wizard_notif_time_60: 'remind_1h',
  };
  if (wizardBotTimeToggles[data]) {
    const user = await usersDb.getUserByTelegramId(telegramId);
    if (!user) return false;
    const field = wizardBotTimeToggles[data];
    const currentVal = field === 'remind_15m' ? user.remind_15m !== false : user[field] === true;
    const newVal = !currentVal;
    const updates = { [field]: newVal };

    const t15 = field === 'remind_15m' ? newVal : (user.remind_15m !== false);
    const t30 = field === 'remind_30m' ? newVal : (user.remind_30m === true);
    const t60 = field === 'remind_1h' ? newVal : (user.remind_1h === true);
    const anyOn = t15 || t30 || t60;
    updates.notify_remind_off = anyOn;
    updates.notify_remind_on = anyOn;

    await usersDb.updateNotificationSettings(telegramId, updates);
    const fresh = await usersDb.getUserByTelegramId(telegramId);
    await safeEditMessageText(bot, buildWizardNotificationSettingsMessage(fresh), {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getWizardBotNotificationKeyboard(fresh).reply_markup,
    });
    return true;
  }

  // Wizard: toggles для сповіщень каналу
  if (data === 'wizard_ch_notif_toggle_schedule') {
    const user = await usersDb.getUserByTelegramId(telegramId);
    if (!user) return false;
    const newVal = !(user.ch_notify_schedule !== false);
    await usersDb.updateChannelNotificationSettings(telegramId, { ch_notify_schedule: newVal });
    const fresh = await usersDb.getUserByTelegramId(telegramId);
    await safeEditMessageText(bot, buildWizardChannelNotificationMessage(fresh), {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getWizardChannelNotificationKeyboard(fresh).reply_markup,
    });
    return true;
  }

  if (data === 'wizard_ch_notif_toggle_fact') {
    const user = await usersDb.getUserByTelegramId(telegramId);
    if (!user) return false;
    const currentVal = user.ch_notify_fact_off !== false;
    const newVal = !currentVal;
    await usersDb.updateChannelNotificationSettings(telegramId, { ch_notify_fact_off: newVal, ch_notify_fact_on: newVal });
    const fresh = await usersDb.getUserByTelegramId(telegramId);
    await safeEditMessageText(bot, buildWizardChannelNotificationMessage(fresh), {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getWizardChannelNotificationKeyboard(fresh).reply_markup,
    });
    return true;
  }

  const wizardChTimeToggles = {
    wizard_ch_notif_time_15: 'ch_remind_15m',
    wizard_ch_notif_time_30: 'ch_remind_30m',
    wizard_ch_notif_time_60: 'ch_remind_1h',
  };
  if (wizardChTimeToggles[data]) {
    const user = await usersDb.getUserByTelegramId(telegramId);
    if (!user) return false;
    const field = wizardChTimeToggles[data];
    const currentVal = field === 'ch_remind_15m' ? user.ch_remind_15m !== false : user[field] === true;
    const newVal = !currentVal;
    const updates = { [field]: newVal };

    const t15 = field === 'ch_remind_15m' ? newVal : (user.ch_remind_15m !== false);
    const t30 = field === 'ch_remind_30m' ? newVal : (user.ch_remind_30m === true);
    const t60 = field === 'ch_remind_1h' ? newVal : (user.ch_remind_1h === true);
    const anyOn = t15 || t30 || t60;
    updates.ch_notify_remind_off = anyOn;
    updates.ch_notify_remind_on = anyOn;

    await usersDb.updateChannelNotificationSettings(telegramId, updates);
    const fresh = await usersDb.getUserByTelegramId(telegramId);
    await safeEditMessageText(bot, buildWizardChannelNotificationMessage(fresh), {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getWizardChannelNotificationKeyboard(fresh).reply_markup,
    });
    return true;
  }

  return false;
}

module.exports = { handleNotifyCallback };
