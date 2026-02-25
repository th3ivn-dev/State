const usersDb = require('../../database/users');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { getFormatPowerKeyboard, getFormatScheduleKeyboard } = require('../../keyboards/inline');
const { REGIONS } = require('../../constants/regions');
const { formatTemplate } = require('../../formatter');
const {
  setConversationState,
  clearConversationState,
  getUserFormatDefaults,
  getScheduleTextKeyboard,
  getScheduleTextInstructionMessage,
  FORMAT_SCHEDULE_MESSAGE,
  FORMAT_POWER_MESSAGE,
} = require('./helpers');

// Handle format-related callbacks
async function handleFormatCallbacks(bot, query, data, chatId, telegramId, user) {
  // Handle format_schedule_settings - show schedule format settings (Level 2a)
  if (data === 'format_schedule_settings') {
    if (!user || !user.channel_id) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Канал не підключено',
        show_alert: true
      });
      return true;
    }

    await safeEditMessageText(bot,
      FORMAT_SCHEDULE_MESSAGE,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getFormatScheduleKeyboard(user).reply_markup
      }
    );
    return true;
  }

  // Handle format_power_settings - show power state settings (Level 2b)
  if (data === 'format_power_settings') {
    if (!user || !user.channel_id) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Канал не підключено',
        show_alert: true
      });
      return true;
    }

    // Clear any pending conversation state
    await clearConversationState(telegramId);

    await safeEditMessageText(bot,
      FORMAT_POWER_MESSAGE,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getFormatPowerKeyboard().reply_markup
      }
    );
    return true;
  }

  // Handle format_toggle_delete - toggle delete old message
  if (data === 'format_toggle_delete') {
    const newValue = !user.delete_old_message;
    await usersDb.updateUserFormatSettings(telegramId, { deleteOldMessage: newValue });

    await safeAnswerCallbackQuery(bot, query.id, {
      text: newValue ? '✅ Буде видалятись попереднє' : '❌ Не видалятиметься'
    });

    const updatedUser = await usersDb.getUserByTelegramId(telegramId);
    await safeEditMessageText(bot,
      FORMAT_SCHEDULE_MESSAGE,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getFormatScheduleKeyboard(updatedUser).reply_markup
      }
    );
    return true;
  }

  // Handle format_toggle_piconly - toggle picture only
  if (data === 'format_toggle_piconly') {
    const newValue = !user.picture_only;
    await usersDb.updateUserFormatSettings(telegramId, { pictureOnly: newValue });

    await safeAnswerCallbackQuery(bot, query.id, {
      text: newValue ? '✅ Тільки картинка' : '❌ Картинка з підписом'
    });

    const updatedUser = await usersDb.getUserByTelegramId(telegramId);
    await safeEditMessageText(bot,
      FORMAT_SCHEDULE_MESSAGE,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getFormatScheduleKeyboard(updatedUser).reply_markup
      }
    );
    return true;
  }

  // Handle format_schedule_text - show instruction screen for schedule text settings
  if (data === 'format_schedule_text') {
    // Clear any pending conversation state
    await clearConversationState(telegramId);

    const defaults = getUserFormatDefaults(user);

    await safeEditMessageText(bot,
      getScheduleTextInstructionMessage(defaults.caption, defaults.period),
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getScheduleTextKeyboard()
      }
    );
    return true;
  }

  // Handle format_schedule_examples - show preview examples of schedule messages
  if (data === 'format_schedule_examples') {
    await clearConversationState(telegramId);


    // Get current date information
    const now = new Date();
    const dayNames = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\'ятниця', 'Субота'];
    const shortDayNames = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

    const todayName = dayNames[now.getDay()];
    const tomorrowName = dayNames[(now.getDay() + 1) % 7];

    const todayDate = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
    const todayShortDate = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}`;

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = `${String(tomorrow.getDate()).padStart(2, '0')}.${String(tomorrow.getMonth() + 1).padStart(2, '0')}.${tomorrow.getFullYear()}`;
    const _tomorrowShortDate = `${String(tomorrow.getDate()).padStart(2, '0')}.${String(tomorrow.getMonth() + 1).padStart(2, '0')}`;

    let message = '👁 <b>Приклади публікацій в канал</b>\n\n';

    // Check if user has custom caption
    if (user.schedule_caption) {
      // Custom mode - caption is always the same
      message += 'Ваш підпис: <i>кастомний</i>\n';
      message += 'Заголовок завжди однаковий:\n\n';
      message += '━━━━━━━━━━━━━━━\n\n';

      // Render custom caption with example variables
      const variables = {
        d: todayDate,
        dm: todayShortDate,
        dd: 'сьогодні',
        sdw: shortDayNames[now.getDay()],
        fdw: dayNames[now.getDay()],
        queue: user.queue,
        region: REGIONS[user.region]?.name || user.region
      };

      const renderedCaption = formatTemplate(user.schedule_caption, variables);
      message += `<i>${renderedCaption}</i>\n\n`;

      // Example periods
      message += '🪫 <b>08:00 - 12:00 (~4 год)</b>\n';
      message += '🪫 <b>14:00 - 18:00 (~4 год)</b>\n';
      message += '🪫 <b>20:00 - 00:00 (~4 год)</b>\n';
      message += 'Загалом без світла:<b> ~12 год</b>\n\n';
      message += '━━━━━━━━━━━━━━━\n\n';
      message += '<i>⚠️ Цей підпис буде однаковий для всіх сценаріїв (перший показ, оновлення, завтра)</i>';
    } else {
      // Default/smart mode - show all scenarios with context-dependent headers
      message += 'Ваші тексти: <i>за замовчуванням</i>\n';
      message += 'Заголовок змінюється автоматично залежно від ситуації:\n\n';
      message += '━━━━━━━━━━━━━━━\n\n';

      // Scenario 1: Regular schedule
      message += '📌 <b>Сценарій 1:</b> Звичайний графік\n\n';
      message += `<i>💡 Графік відключень <b>на сьогодні, ${todayDate} (${todayName}),</b> для черги ${user.queue}:</i>\n\n`;
      message += '🪫 <b>08:00 - 12:00 (~4 год)</b>\n';
      message += '🪫 <b>14:00 - 18:00 (~4 год)</b>\n';
      message += '🪫 <b>20:00 - 00:00 (~4 год)</b>\n';
      message += 'Загалом без світла:<b> ~12 год</b>\n\n';
      message += '━━━━━━━━━━━━━━━\n\n';

      // Scenario 2: Updated schedule for today
      message += '📌 <b>Сценарій 2:</b> Оновлено графік на сьогодні\n\n';
      message += `<i>💡 Оновлено графік відключень <b>на сьогодні, ${todayDate} (${todayName}),</b> для черги ${user.queue}:</i>\n\n`;
      message += '🪫 <b>08:00 - 12:00 (~4 год)</b>\n';
      message += '🪫 <b>16:00 - 20:00 (~4 год)</b> 🆕\n';
      message += 'Загалом без світла:<b> ~8 год</b>\n\n';
      message += '━━━━━━━━━━━━━━━\n\n';

      // Scenario 3: Tomorrow's schedule appeared
      message += '📌 <b>Сценарій 3:</b> Зʼявився графік на завтра\n\n';
      message += `<i>💡 Зʼявився графік відключень <b>на завтра, ${tomorrowDate} (${tomorrowName}),</b> для черги ${user.queue}:</i>\n\n`;
      message += '🪫 <b>06:00 - 10:00 (~4 год)</b>\n';
      message += '🪫 <b>12:00 - 16:00 (~4 год)</b>\n';
      message += 'Загалом без світла:<b> ~8 год</b>\n\n';
      message += `<i>💡 Графік на сьогодні <b>без змін:</b></i>\n\n`;
      message += '🪫 <b>08:00 - 12:00 (~4 год)</b>\n';
      message += '🪫 <b>14:00 - 18:00 (~4 год)</b>\n';
      message += 'Загалом без світла:<b> ~8 год</b>';
    }

    await safeEditMessageText(bot, message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '← Назад', callback_data: 'format_schedule_text' }]
        ]
      }
    });
    return true;
  }

  // Handle format_reset_caption - reset schedule caption to default
  if (data === 'format_reset_caption') {
    await usersDb.updateUserFormatSettings(telegramId, { scheduleCaption: null });

    await safeAnswerCallbackQuery(bot, query.id, {
      text: '✅ Підпис скинуто до стандартного',
      show_alert: true
    });

    // Refresh the format_schedule_text screen to show updated values
    const updatedUser = await usersDb.getUserByTelegramId(telegramId);
    const defaults = getUserFormatDefaults(updatedUser);

    await safeEditMessageText(bot,
      getScheduleTextInstructionMessage(defaults.caption, defaults.period),
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getScheduleTextKeyboard()
      }
    );
    return true;
  }

  // Handle format_reset_periods - reset period format to default
  if (data === 'format_reset_periods') {
    await usersDb.updateUserFormatSettings(telegramId, { periodFormat: null });

    await safeAnswerCallbackQuery(bot, query.id, {
      text: '✅ Формат часу скинуто до стандартного',
      show_alert: true
    });

    // Refresh the format_schedule_text screen to show updated values
    const updatedUser = await usersDb.getUserByTelegramId(telegramId);
    const defaults = getUserFormatDefaults(updatedUser);

    await safeEditMessageText(bot,
      getScheduleTextInstructionMessage(defaults.caption, defaults.period),
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getScheduleTextKeyboard()
      }
    );
    return true;
  }

  // Handle format_schedule_caption - edit schedule caption template
  if (data === 'format_schedule_caption') {
    await setConversationState(telegramId, {
      state: 'waiting_for_schedule_caption',
      previousMessageId: query.message.message_id
    });

    const currentTemplate = user.schedule_caption || 'Графік на {dd}, {dm} для черги {queue}';

    await safeEditMessageText(bot,
      '📝 <b>Шаблон підпису під графіком</b>\n\n' +
      'Доступні змінні:\n' +
      '• {d} - дата (01.02.2026)\n' +
      '• {dm} - дата коротко (01.02)\n' +
      '• {dd} - "сьогодні" або "завтра"\n' +
      '• {sdw} - Пн, Вт, Ср...\n' +
      '• {fdw} - Понеділок, Вівторок...\n' +
      '• {queue} - номер черги (3.1)\n' +
      '• {region} - назва регіону\n' +
      '• <br> - новий рядок\n\n' +
      `Поточний шаблон:\n<code>${currentTemplate}</code>\n\n` +
      'Введіть новий шаблон:',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Скасувати', callback_data: 'format_schedule_text' }]
          ]
        }
      }
    );
    return true;
  }

  // Handle format_schedule_periods - edit period format template
  if (data === 'format_schedule_periods') {
    await setConversationState(telegramId, {
      state: 'waiting_for_period_format',
      previousMessageId: query.message.message_id
    });

    const currentTemplate = user.period_format || '{s} - {f} ({h} год)';

    await safeEditMessageText(bot,
      '⏰ <b>Формат періодів відключень</b>\n\n' +
      'Доступні змінні:\n' +
      '• {s} - початок (08:00)\n' +
      '• {f} - кінець (12:00)\n' +
      '• {h} - тривалість (4)\n\n' +
      'Можна використовувати HTML теги:\n' +
      '<b>жирний</b>, <i>курсив</i>, <code>код</code>\n\n' +
      `Поточний формат:\n<code>${currentTemplate}</code>\n\n` +
      'Приклади:\n' +
      '• {s} - {f} ({h} год)\n' +
      '• <b>{s}-{f}</b>\n' +
      '• <i>{s} - {f}</i> ({h}г)\n\n' +
      'Введіть новий формат:',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Скасувати', callback_data: 'format_schedule_text' }]
          ]
        }
      }
    );
    return true;
  }

  // Handle format_power_off - edit power off text template
  if (data === 'format_power_off') {
    await setConversationState(telegramId, {
      state: 'waiting_for_power_off_text',
      previousMessageId: query.message.message_id
    });

    const currentTemplate = user.power_off_text || '🔴 {time} Світло зникло\n🕓 Воно було {duration}\n🗓 Очікуємо за графіком о {schedule}';

    await safeEditMessageText(bot,
      '📴 <b>Текст при відключенні світла</b>\n\n' +
      'Доступні змінні:\n' +
      '• {time} - час події (14:35)\n' +
      '• {date} - дата (01.02.2026)\n' +
      '• {duration} - тривалість (якщо відомо)\n' +
      '• {schedule} - інформація про графік\n\n' +
      `Поточний текст:\n<code>${currentTemplate}</code>\n\n` +
      'Введіть новий текст:',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Скасувати', callback_data: 'format_power_settings' }]
          ]
        }
      }
    );
    return true;
  }

  // Handle format_power_on - edit power on text template
  if (data === 'format_power_on') {
    await setConversationState(telegramId, {
      state: 'waiting_for_power_on_text',
      previousMessageId: query.message.message_id
    });

    const currentTemplate = user.power_on_text || '🟢 {time} Світло з\'явилося\n🕓 Його не було {duration}\n🗓 Наступне планове: {schedule}';

    await safeEditMessageText(bot,
      '💡 <b>Текст при появі світла</b>\n\n' +
      'Доступні змінні:\n' +
      '• {time} - час події (14:35)\n' +
      '• {date} - дата (01.02.2026)\n' +
      '• {duration} - скільки не було світла\n' +
      '• {schedule} - інформація про графік\n\n' +
      `Поточний текст:\n<code>${currentTemplate}</code>\n\n` +
      'Введіть новий текст:',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Скасувати', callback_data: 'format_power_settings' }]
          ]
        }
      }
    );
    return true;
  }

  // Handle format_reset_power_off - reset power off text to default
  if (data === 'format_reset_power_off') {
    await usersDb.updateUserFormatSettings(telegramId, { powerOffText: null });

    await safeAnswerCallbackQuery(bot, query.id, {
      text: '✅ Текст "Світло зникло" скинуто до стандартного',
      show_alert: true
    });

    // Refresh the format_power_settings screen
    await safeEditMessageText(bot,
      FORMAT_POWER_MESSAGE,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getFormatPowerKeyboard().reply_markup
      }
    );
    return true;
  }

  // Handle format_reset_power_on - reset power on text to default
  if (data === 'format_reset_power_on') {
    await usersDb.updateUserFormatSettings(telegramId, { powerOnText: null });

    await safeAnswerCallbackQuery(bot, query.id, {
      text: '✅ Текст "Світло є" скинуто до стандартного',
      show_alert: true
    });

    // Refresh the format_power_settings screen
    await safeEditMessageText(bot,
      FORMAT_POWER_MESSAGE,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getFormatPowerKeyboard().reply_markup
      }
    );
    return true;
  }

  // Handle format_reset_all_schedule - reset all schedule text to defaults
  if (data === 'format_reset_all_schedule') {
    await usersDb.updateUserFormatSettings(telegramId, {
      scheduleCaption: null,
      periodFormat: null
    });

    await safeAnswerCallbackQuery(bot, query.id, {
      text: '✅ Тексти скинуто до стандартних',
      show_alert: true
    });

    // Refresh screen with default values
    const updatedUser = await usersDb.getUserByTelegramId(telegramId);
    const defaults = getUserFormatDefaults(updatedUser);

    await safeEditMessageText(bot,
      getScheduleTextInstructionMessage(defaults.caption, defaults.period),
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getScheduleTextKeyboard()
      }
    );
    return true;
  }

  // Handle format_reset_all_power - reset all power text to defaults
  if (data === 'format_reset_all_power') {
    await usersDb.updateUserFormatSettings(telegramId, {
      powerOffText: null,
      powerOnText: null
    });

    await safeAnswerCallbackQuery(bot, query.id, {
      text: '✅ Тексти скинуто до стандартних',
      show_alert: true
    });

    // Refresh screen
    await safeEditMessageText(bot,
      FORMAT_POWER_MESSAGE,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getFormatPowerKeyboard().reply_markup
      }
    );
    return true;
  }

  return false;
}

module.exports = { handleFormatCallbacks };
