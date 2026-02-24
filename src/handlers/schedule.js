const { userService, scheduleService } = require('../services');
const { fetchScheduleImage } = require('../api'); // Прямий імпорт — немає в сервісному шарі
const { findNextEvent } = require('../parser');
const { formatScheduleMessage, formatNextEventMessage, formatTimerMessage } = require('../formatter');
const { safeSendMessage, safeDeleteMessage, safeSendPhoto } = require('../utils/errorHandler');
const { getUpdateTypeV2 } = require('../publisher');

// Обробник команди /schedule
async function handleSchedule(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);

  try {
    // Отримуємо користувача
    const user = await userService.getUserByTelegramId(telegramId);

    if (!user) {
      await safeSendMessage(bot, chatId, '❌ Спочатку запустіть бота, натиснувши /start');
      return;
    }

    // Delete previous schedule message if exists
    if (user.last_schedule_message_id) {
      await safeDeleteMessage(bot, chatId, user.last_schedule_message_id);
    }

    // Показуємо індикатор завантаження
    await bot.api.sendChatAction(chatId, 'typing');

    // Отримуємо дані графіка
    const scheduleData = await scheduleService.getScheduleForQueue(user.region, user.queue);
    const nextEvent = findNextEvent(scheduleData);

    // Get snapshot-based updateType for contextual headers
    const userSnapshots = await userService.getSnapshotHashes(telegramId);
    // getUpdateTypeV2 uses snapshot-based logic only (previousSchedule is not used)
    const updateTypeV2 = getUpdateTypeV2(null, scheduleData, userSnapshots);
    const updateType = {
      tomorrowAppeared: updateTypeV2.tomorrowAppeared,
      todayUpdated: updateTypeV2.todayChanged,
      todayUnchanged: !updateTypeV2.todayChanged,
    };

    // Форматуємо повідомлення
    // Pass null for changes parameter since we're not marking new events in bot view
    const message = formatScheduleMessage(user.region, user.queue, scheduleData, nextEvent, null, updateType);

    // Спробуємо відправити зображення графіка з caption
    let sentMsg;
    try {
      const imageBuffer = await fetchScheduleImage(user.region, user.queue);
      sentMsg = await safeSendPhoto(bot, chatId, imageBuffer, {
        caption: message,
        parse_mode: 'HTML',
      }, { filename: 'schedule.png', contentType: 'image/png' });
    } catch (imgError) {
      // Якщо зображення недоступне, відправляємо тільки текст
      console.log('Зображення графіка недоступне:', imgError.message);
      sentMsg = await safeSendMessage(bot, chatId, message, { parse_mode: 'HTML' });
    }

    if (sentMsg) {
      await userService.updateUser(telegramId, { last_schedule_message_id: sentMsg.message_id });
    }

  } catch (error) {
    console.error('Помилка в handleSchedule:', error);
    await safeSendMessage(bot, chatId, '🔄 Не вдалося завантажити. Спробуйте пізніше.');
  }
}

// Обробник команди /next
async function handleNext(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);

  try {
    const user = await userService.getUserByTelegramId(telegramId);

    if (!user) {
      await safeSendMessage(bot, chatId, '❌ Спочатку запустіть бота, натиснувши /start');
      return;
    }

    await bot.api.sendChatAction(chatId, 'typing');

    const scheduleData = await scheduleService.getScheduleForQueue(user.region, user.queue);
    const nextEvent = findNextEvent(scheduleData);

    const message = formatNextEventMessage(nextEvent);
    await safeSendMessage(bot, chatId, message, { parse_mode: 'HTML' });

  } catch (error) {
    console.error('Помилка в handleNext:', error);
    await bot.api.sendMessage(chatId, '🔄 Не вдалося завантажити. Спробуйте пізніше.');
  }
}

// Обробник команди /timer
async function handleTimer(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);

  try {
    const user = await userService.getUserByTelegramId(telegramId);

    if (!user) {
      const { getMainMenu } = require('../keyboards/inline');
      await bot.api.sendMessage(
        chatId,
        '❌ Спочатку запустіть бота, натиснувши /start\n\nОберіть наступну дію:',
        getMainMenu('no_channel', false)
      );
      return;
    }

    await bot.api.sendChatAction(chatId, 'typing');

    const scheduleData = await scheduleService.getScheduleForQueue(user.region, user.queue);
    const nextEvent = findNextEvent(scheduleData);

    const message = formatTimerMessage(nextEvent);
    await bot.api.sendMessage(chatId, message, { parse_mode: 'HTML' });

  } catch (error) {
    console.error('Помилка в handleTimer:', error);
    await bot.api.sendMessage(chatId, '🔄 Не вдалося завантажити. Спробуйте пізніше.');
  }
}

module.exports = {
  handleSchedule,
  handleNext,
  handleTimer,
};
