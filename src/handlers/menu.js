const { InputFile } = require('grammy');
const config = require('../config');
const { getMainMenu, getHelpKeyboard, getSettingsKeyboard, getErrorKeyboard, getScheduleViewKeyboard } = require('../keyboards/inline');
const { REGIONS } = require('../constants/regions');
const { formatErrorMessage, formatScheduleMessage, formatTimerMessage, formatTimerPopup } = require('../formatter');
const { generateLiveStatusMessage } = require('../utils');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../utils/errorHandler');
const usersDb = require('../database/users');
const { fetchScheduleData, fetchScheduleImage } = require('../api');
const { parseScheduleForQueue, findNextEvent } = require('../parser');
const { getWeeklyStats, formatStatsPopup } = require('../statistics');
const { getUpdateTypeV2 } = require('../publisher');
const { appendTimestamp } = require('../utils/timestamp');
const { getScheduleCheckTime } = require('../database/scheduleChecks');

// Константа для FAQ popup
const help_faq = `❓ Чому не приходять сповіщення?\n→ Перевірте налаштування\n\n❓ Як працює IP моніторинг?\n→ Бот пінгує роутер для визначення наявності світла`;

/**
 * Check if a Telegram API error is "message is not modified" (content identical).
 * This is not a real error — just means nothing changed, so we can safely ignore it.
 */
function isMessageNotModifiedError(error) {
  return error?.description?.includes('message is not modified') ||
         error?.message?.includes('message is not modified');
}

// Обробник callback menu_schedule
async function handleMenuSchedule(bot, query) {
  let messageDeleted = false;
  try {
    const telegramId = String(query.from.id);
    const user = await usersDb.getUserByTelegramId(telegramId);

    if (!user) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Користувач не знайдений',
        show_alert: true
      });
      return;
    }

    // Answer Telegram immediately to avoid timeout (after user validation)
    await bot.api.answerCallbackQuery(query.id).catch(() => {});

    // Get schedule data
    const data = await fetchScheduleData(user.region);
    const scheduleData = parseScheduleForQueue(data, user.queue);
    const nextEvent = findNextEvent(scheduleData);

    // Check if data exists
    if (!scheduleData || !scheduleData.events || scheduleData.events.length === 0) {
      await safeEditMessageText(bot,
        '📊 <b>Графік</b>\n\n' +
        'ℹ️ Дані ще не опубліковані.\n' +
        'Спробуйте пізніше.',
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⤴︎ Меню', callback_data: 'back_to_main' }]
            ]
          }
        }
      );
      return;
    }

    // Format message
    const userSnapshots = await usersDb.getSnapshotHashes(telegramId);
    const updateTypeV2 = getUpdateTypeV2(null, scheduleData, userSnapshots);
    const updateType = {
      tomorrowAppeared: updateTypeV2.tomorrowAppeared,
      todayUpdated: updateTypeV2.todayChanged,
      todayUnchanged: !updateTypeV2.todayChanged,
    };
    const message = formatScheduleMessage(user.region, user.queue, scheduleData, nextEvent, null, updateType);

    // Читаємо час останньої перевірки ботом та додаємо date_time entity
    let lastCheck;
    try {
      lastCheck = await getScheduleCheckTime(user.region, user.queue);
    } catch (dbError) {
      console.error('Failed to get schedule check time:', dbError.message);
      lastCheck = Math.floor(Date.now() / 1000);
    }
    const { text: fullCaption, entities: timestampEntities } = appendTimestamp(message, lastCheck);

    const scheduleKeyboard = getScheduleViewKeyboard();

    // Fetch schedule image
    let imageBuffer;
    let photoInput;
    try {
      imageBuffer = await fetchScheduleImage(user.region, user.queue);
      photoInput = Buffer.isBuffer(imageBuffer) ? new InputFile(imageBuffer, 'schedule.png') : imageBuffer;
    } catch (_fetchError) {
      // Image unavailable — will fall back to text-only path below
    }

    if (photoInput) {
      // Try editMessageMedia first to avoid delete+send flicker
      try {
        await bot.api.editMessageMedia(
          query.message.chat.id,
          query.message.message_id,
          {
            type: 'photo',
            media: photoInput,
            caption: fullCaption,
            caption_entities: timestampEntities,
          },
          { reply_markup: scheduleKeyboard }
        );
        return;
      } catch (editError) {
        // "message is not modified" means content is identical — not a real error
        if (isMessageNotModifiedError(editError)) {
          return; // Nothing changed, keep current message as-is
        }
        // Fallback: delete + send new if edit fails for other reasons
        console.log('editMessageMedia failed, falling back to delete+send:', editError.message);
        try { await bot.api.deleteMessage(query.message.chat.id, query.message.message_id); } catch (_e) {}
        messageDeleted = true;
        try {
          await bot.api.sendPhoto(query.message.chat.id, photoInput, {
            caption: fullCaption,
            caption_entities: timestampEntities,
            reply_markup: scheduleKeyboard
          });
          return;
        } catch (imgError) {
          // Fall through to text-only
          console.log('sendPhoto failed after delete, falling back to text:', imgError.message);
        }
      }
    }

    // No photo or photo failed — use text
    if (messageDeleted) {
      await bot.api.sendMessage(query.message.chat.id, fullCaption, {
        entities: timestampEntities,
        reply_markup: scheduleKeyboard
      });
    } else {
      await safeEditMessageText(bot,
        fullCaption,
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          entities: timestampEntities,
          reply_markup: scheduleKeyboard
        }
      );
    }
  } catch (error) {
    console.error('Помилка отримання графіка:', error);

    const errorKeyboard = await getErrorKeyboard();
    if (messageDeleted) {
      await bot.api.sendMessage(query.message.chat.id,
        formatErrorMessage(),
        {
          parse_mode: 'HTML',
          reply_markup: errorKeyboard.reply_markup
        }
      );
    } else {
      await safeEditMessageText(bot,
        formatErrorMessage(),
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: errorKeyboard.reply_markup
        }
      );
    }
  }
}

// Обробник callback menu_timer
async function handleMenuTimer(bot, query) {
  // Show timer as popup instead of sending a new message
  try {
    const telegramId = String(query.from.id);
    const user = await usersDb.getUserByTelegramId(telegramId);

    if (!user) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Користувач не знайдений',
        show_alert: true
      });
      return;
    }

    const data = await fetchScheduleData(user.region);
    const scheduleData = parseScheduleForQueue(data, user.queue);
    const nextEvent = findNextEvent(scheduleData);

    const message = formatTimerMessage(nextEvent);
    // Strip HTML tags for popup (loop to handle any nesting)
    let cleanMessage = message;
    let prev;
    do {
      prev = cleanMessage;
      cleanMessage = prev.replace(/<[^>]*>/g, '');
    } while (cleanMessage !== prev);

    await safeAnswerCallbackQuery(bot, query.id, {
      text: cleanMessage,
      show_alert: true
    });
  } catch (error) {
    console.error('Помилка отримання таймера:', error);
    await safeAnswerCallbackQuery(bot, query.id, {
      text: '😅 Щось пішло не так. Спробуйте ще раз!',
      show_alert: true
    });
  }
}

// Обробник callback menu_stats
async function handleMenuStats(bot, query) {
  // Show statistics as popup
  try {
    const telegramId = String(query.from.id);
    const user = await usersDb.getUserByTelegramId(telegramId);

    if (!user) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Користувач не знайдений',
        show_alert: true
      });
      return;
    }

    const stats = await getWeeklyStats(user.id);
    const message = formatStatsPopup(stats);

    await safeAnswerCallbackQuery(bot, query.id, {
      text: message,
      show_alert: true
    });
  } catch (error) {
    console.error('Помилка отримання статистики:', error);
    await safeAnswerCallbackQuery(bot, query.id, {
      text: '😅 Щось пішло не так. Спробуйте ще раз!',
      show_alert: true
    });
  }
}

// Обробник callback menu_help
async function handleMenuHelp(bot, query) {
  // Answer Telegram immediately to avoid timeout
  await bot.api.answerCallbackQuery(query.id).catch(() => {});

  const helpKeyboard = await getHelpKeyboard();
  await safeEditMessageText(bot,
    '❓ <b>Допомога</b>\n\n' +
    'ℹ️ Тут ви можете дізнатися як\n' +
    'користуватися ботом.',
    {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: helpKeyboard.reply_markup,
    }
  );
}

// Обробник callback menu_settings
async function handleMenuSettings(bot, query) {
  const telegramId = String(query.from.id);
  const user = await usersDb.getUserByTelegramId(telegramId);

  if (!user) {
    await safeAnswerCallbackQuery(bot, query.id, { text: '❌ Спочатку запустіть бота, натиснувши /start' });
    return;
  }

  // Answer Telegram immediately to avoid timeout (after user validation)
  await bot.api.answerCallbackQuery(query.id).catch(() => {});

  const isAdmin = config.adminIds.includes(telegramId) || telegramId === config.ownerId;
  const regionName = REGIONS[user.region]?.name || user.region;

  // Generate Live Status message using helper function
  const message = generateLiveStatusMessage(user, regionName);

  await safeEditMessageText(bot,
    message,
    {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getSettingsKeyboard(isAdmin).reply_markup,
    }
  );
}

// Обробник callback back_to_main
async function handleBackToMain(bot, query) {
  // Answer Telegram immediately to avoid timeout
  await bot.api.answerCallbackQuery(query.id).catch(() => {});

  const telegramId = String(query.from.id);
  const user = await usersDb.getUserByTelegramId(telegramId);

  if (user) {
    // Delete previous main menu message if it exists AND is different from current
    if (user.last_start_message_id && user.last_start_message_id !== query.message.message_id) {
      try {
        await bot.api.deleteMessage(query.message.chat.id, user.last_start_message_id);
      } catch (_e) {
        // Ignore - message might already be deleted
      }
    }

    const region = REGIONS[user.region]?.name || user.region;

    // Determine bot status
    let botStatus = 'active';
    if (!user.channel_id) {
      botStatus = 'no_channel';
    } else if (!user.is_active) {
      botStatus = 'paused';
    }

    const channelPaused = user.channel_paused === true;

    // Build main menu message with beta warning
    let message = '<b>🚧 Бот у розробці</b>\n';
    message += '<i>Деякі функції можуть працювати нестабільно</i>\n\n';
    message += '🏠 <b>Головне меню</b>\n\n';
    message += `📍 Регіон: ${region} • ${user.queue}\n`;
    message += `📺 Канал: ${user.channel_id ? user.channel_id + ' ✅' : 'не підключено'}\n`;
    message += `🔔 Сповіщення: ${user.is_active ? 'увімкнено ✅' : 'вимкнено'}\n`;
    message += '\n💬 Допоможіть нам стати краще — скористайтеся ❓ Допомога\n';

    // Try editMessageText first (works even on media messages in some cases)
    try {
      await safeEditMessageText(bot,
        message,
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: getMainMenu(botStatus, channelPaused).reply_markup,
        }
      );
      // Update last_start_message_id to current message
      await usersDb.updateUser(telegramId, { last_start_message_id: query.message.message_id });
    } catch (_error) {
      // If edit fails (e.g., media→text not supported, message deleted), delete and send new
      try {
        await bot.api.deleteMessage(query.message.chat.id, query.message.message_id);
      } catch (_deleteError) {
        // Ignore delete errors
      }
      const sentMessage = await bot.api.sendMessage(
        query.message.chat.id,
        message,
        {
          parse_mode: 'HTML',
          ...getMainMenu(botStatus, channelPaused)
        }
      ).catch(() => null);
      // Update last_start_message_id to new message
      if (sentMessage) {
        await usersDb.updateUser(telegramId, { last_start_message_id: sentMessage.message_id });
      }
    }
  }
}

// Обробник callback help_howto
async function handleHelpHowto(bot, query) {
  // Answer Telegram immediately to avoid timeout
  await bot.api.answerCallbackQuery(query.id).catch(() => {});

  await safeEditMessageText(bot,
    '📖 <b>Як користуватися ботом:</b>\n\n' +
    '1. Оберіть регіон і чергу\n' +
    '2. Увімкніть сповіщення\n' +
    '3. (Опціонально) Підключіть канал\n' +
    '4. (Опціонально) Налаштуйте IP моніторинг\n\n' +
    'Бот автоматично сповістить про:\n' +
    '• Зміни в графіку\n' +
    '• Фактичні відключення (з IP)',
    {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '← Назад', callback_data: 'menu_help' },
            { text: '⤴ Меню', callback_data: 'back_to_main' }
          ]
        ]
      }
    }
  );
}

// Обробник callback help_faq
async function handleHelpFaq(bot, query) {
  await safeAnswerCallbackQuery(bot, query.id, {
    text: help_faq,
    show_alert: true
  });
}

// Обробник callback timer_userId (канальні кнопки)
async function handleTimerCallback(bot, query, data) {
  try {
    const userId = parseInt(data.replace('timer_', ''));

    const user = await usersDb.getUserById(userId);
    if (!user) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Користувач не знайдений',
        show_alert: true
      });
      return;
    }

    const scheduleRawData = await fetchScheduleData(user.region);
    const scheduleData = parseScheduleForQueue(scheduleRawData, user.queue);
    const nextEvent = findNextEvent(scheduleData);

    const message = formatTimerPopup(nextEvent, scheduleData);

    await safeAnswerCallbackQuery(bot, query.id, {
      text: message,
      show_alert: true
    });
  } catch (error) {
    console.error('Помилка обробки timer callback:', error);
    await safeAnswerCallbackQuery(bot, query.id, {
      text: '😅 Щось пішло не так. Спробуйте ще раз!',
      show_alert: true
    });
  }
}

// Обробник callback stats_userId (канальні кнопки)
async function handleStatsCallback(bot, query, data) {
  try {
    const userId = parseInt(data.replace('stats_', ''));

    // Ігноруємо некоректні stats_ callback (наприклад, stats_week, stats_device)
    if (isNaN(userId)) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '⚠️ Ця функція в розробці',
        show_alert: false
      });
      return;
    }

    const user = await usersDb.getUserById(userId);
    if (!user) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Користувач не знайдений',
        show_alert: true
      });
      return;
    }

    const stats = await getWeeklyStats(userId);

    // Check if this is from a channel (Telegram uses negative IDs for channels/groups, positive for private chats)
    const isChannel = query.message.chat.id < 0;

    const message = formatStatsPopup(stats, isChannel);

    await safeAnswerCallbackQuery(bot, query.id, {
      text: message,
      show_alert: true
    });
  } catch (error) {
    console.error('Помилка обробки stats callback:', error);
    await safeAnswerCallbackQuery(bot, query.id, {
      text: '😅 Щось пішло не так. Спробуйте ще раз!',
      show_alert: true
    });
  }
}

// Обробник callback schedule_refresh — оновити графік і показати заново
async function handleScheduleRefresh(bot, query) {
  const chatId = query.message.chat.id;
  const telegramId = String(query.from.id);

  try {
    const user = await usersDb.getUserByTelegramId(telegramId);
    if (!user) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Користувач не знайдений',
        show_alert: true
      });
      return;
    }

    // Answer Telegram immediately to avoid timeout
    await bot.api.answerCallbackQuery(query.id).catch(() => {});

    const apiData = await fetchScheduleData(user.region);
    const scheduleData = parseScheduleForQueue(apiData, user.queue);
    const nextEvent = findNextEvent(scheduleData);

    // Читаємо час останньої перевірки ботом та отримуємо точний timestamp
    let lastCheck;
    try {
      lastCheck = await getScheduleCheckTime(user.region, user.queue);
    } catch (dbError) {
      console.error('Failed to get schedule check time:', dbError.message);
      lastCheck = Math.floor(Date.now() / 1000);
    }

    const userSnapshots = await usersDb.getSnapshotHashes(telegramId);
    const updateTypeV2 = getUpdateTypeV2(null, scheduleData, userSnapshots);
    const updateType = {
      tomorrowAppeared: updateTypeV2.tomorrowAppeared,
      todayUpdated: updateTypeV2.todayChanged,
      todayUnchanged: !updateTypeV2.todayChanged,
    };

    const message = formatScheduleMessage(user.region, user.queue, scheduleData, nextEvent, null, updateType);
    const { text: fullCaption, entities: timestampEntities } = appendTimestamp(message, lastCheck);

    const scheduleKeyboard = getScheduleViewKeyboard();

    // Fetch image once, then try editMessageMedia; fall back to delete+send on failure
    let imageBuffer;
    let photoInput;
    try {
      imageBuffer = await fetchScheduleImage(user.region, user.queue);
      photoInput = Buffer.isBuffer(imageBuffer) ? new InputFile(imageBuffer, 'schedule.png') : imageBuffer;
    } catch (_fetchError) {
      // Image unavailable — will fall back to text-only path below
    }

    // Оновлюємо фото і caption існуючого повідомлення через editMessageMedia
    if (photoInput) {
      try {
        await bot.api.editMessageMedia(
          chatId,
          query.message.message_id,
          {
            type: 'photo',
            media: photoInput,
            caption: fullCaption,
            caption_entities: timestampEntities,
          },
          { reply_markup: scheduleKeyboard }
        );
        return;
      } catch (editError) {
        // "message is not modified" means content is identical — not a real error
        if (isMessageNotModifiedError(editError)) {
          return; // Nothing changed, keep current message as-is
        }
        // Якщо edit не вдалося з іншої причини — fallback на delete+send
        console.log('editMessageMedia failed, falling back to delete+send:', editError.message);
      }
    }

    // Fallback: delete old message and send new one
    try {
      await bot.api.deleteMessage(chatId, query.message.message_id);
    } catch (_e) {
      // Ігноруємо помилку видалення
    }

    if (photoInput) {
      try {
        await bot.api.sendPhoto(chatId, photoInput, {
          caption: fullCaption,
          caption_entities: timestampEntities,
          reply_markup: scheduleKeyboard
        });
        return;
      } catch (_imgError) {
        // Fall through to text-only
      }
    }

    await bot.api.sendMessage(chatId, fullCaption, {
      entities: timestampEntities,
      reply_markup: scheduleKeyboard
    });
  } catch (error) {
    console.error('Помилка handleScheduleRefresh:', error);
    await safeAnswerCallbackQuery(bot, query.id, {
      text: '😅 Щось пішло не так. Спробуйте ще раз!',
      show_alert: true
    });
  }
}

// Обробник callback my_queues
async function handleMyQueues(bot, query) {
  await safeAnswerCallbackQuery(bot, query.id, {
    text: '🚧 Функціонал "Мої черги" в розробці',
    show_alert: true
  });
}

module.exports = {
  handleMenuSchedule,
  handleMenuTimer,
  handleMenuStats,
  handleMenuHelp,
  handleMenuSettings,
  handleBackToMain,
  handleHelpHowto,
  handleHelpFaq,
  handleTimerCallback,
  handleStatsCallback,
  handleScheduleRefresh,
  handleMyQueues,
};
