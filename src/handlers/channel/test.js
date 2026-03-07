const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { getTestPublicationKeyboard } = require('../../keyboards/inline');
const { formatTemplate, getCurrentDateTimeForTemplate } = require('../../formatter');
const { publishScheduleWithPhoto } = require('../../publisher');
const { setConversationState } = require('./helpers');

// Handle test-related callbacks
async function handleTestCallbacks(bot, query, data, chatId, telegramId, user) {
  // Handle channel_test - show test publication menu
  if (data === 'channel_test') {
    if (!user || !user.channel_id) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Канал не підключено',
        show_alert: true
      });
      return true;
    }

    await safeEditMessageText(bot,
      '🧪 <b>Тест публікації</b>\n\n' +
      'Що опублікувати в канал?',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getTestPublicationKeyboard().reply_markup
      }
    );
    return true;
  }

  // Handle test_schedule - test schedule publication
  if (data === 'test_schedule') {
    if (!user || !user.channel_id) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Канал не підключено',
        show_alert: true
      });
      return true;
    }

    try {
      await publishScheduleWithPhoto(bot, user, user.region, user.queue);

      await safeAnswerCallbackQuery(bot, query.id, {
        text: '✅ Графік опубліковано в канал!',
        show_alert: true
      });
    } catch (error) {
      console.error('Error publishing test schedule:', error);
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Помилка публікації графіка',
        show_alert: true
      });
    }
    return true;
  }

  // Handle test_power_on - test power on publication
  if (data === 'test_power_on') {
    if (!user || !user.channel_id) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Канал не підключено',
        show_alert: true
      });
      return true;
    }

    try {
      const { timeStr, dateStr } = getCurrentDateTimeForTemplate();

      const template = user.power_on_text || '🟢 {time} Світло з\'явилося\n🕓 Його не було {duration}\n🗓 Наступне планове: {schedule}';
      const text = formatTemplate(template, {
        time: timeStr,
        date: dateStr,
        duration: '2 год 15 хв',
        schedule: '18:00 - 20:00'
      });

      await bot.api.sendMessage(user.channel_id, text, { parse_mode: 'HTML' });

      await safeAnswerCallbackQuery(bot, query.id, {
        text: '✅ Тестове повідомлення опубліковано!',
        show_alert: true
      });
    } catch (error) {
      console.error('Error publishing test power on:', error);
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Помилка публікації',
        show_alert: true
      });
    }
    return true;
  }

  // Handle test_power_off - test power off publication
  if (data === 'test_power_off') {
    if (!user || !user.channel_id) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Канал не підключено',
        show_alert: true
      });
      return true;
    }

    try {
      const { timeStr, dateStr } = getCurrentDateTimeForTemplate();

      const template = user.power_off_text || '🔴 {time} Світло зникло\n🕓 Воно було {duration}\n🗓 Очікуємо за графіком о {schedule}';
      const text = formatTemplate(template, {
        time: timeStr,
        date: dateStr,
        duration: '1 год 30 хв',
        schedule: '16:00'
      });

      await bot.api.sendMessage(user.channel_id, text, { parse_mode: 'HTML' });

      await safeAnswerCallbackQuery(bot, query.id, {
        text: '✅ Тестове повідомлення опубліковано!',
        show_alert: true
      });
    } catch (error) {
      console.error('Error publishing test power off:', error);
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Помилка публікації',
        show_alert: true
      });
    }
    return true;
  }

  // Handle test_custom - ask for custom message
  if (data === 'test_custom') {
    if (!user || !user.channel_id) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Канал не підключено',
        show_alert: true
      });
      return true;
    }

    await setConversationState(telegramId, {
      state: 'waiting_for_custom_test',
      previousMessageId: query.message.message_id
    });

    await safeEditMessageText(bot,
      '✏️ <b>Своє повідомлення</b>\n\n' +
      'Введіть текст, який буде опубліковано в канал.\n' +
      'Можна використовувати HTML форматування.',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML'
      }
    );
    return true;
  }

  return false;
}

module.exports = { handleTestCallbacks };
