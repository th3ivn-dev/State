const usersDb = require('../database/users');
const { fetchScheduleData, fetchScheduleImage } = require('../api');
const { parseScheduleForQueue, findNextEvent } = require('../parser');
const { formatScheduleMessage, formatNextEventMessage, formatTimerMessage } = require('../formatter');
const { safeSendMessage, safeDeleteMessage, safeSendPhoto } = require('../utils/errorHandler');
const { getUpdateTypeV2 } = require('../publisher');
const { appendTimestamp } = require('../utils/timestamp');
const { getScheduleViewKeyboard } = require('../keyboards/inline');
const { getScheduleCheckTime } = require('../database/scheduleChecks');
const logger = require('../utils/logger');

// Обробник команди /schedule
async function handleSchedule(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);

  try {
    // Отримуємо користувача
    const user = await usersDb.getUserByTelegramId(telegramId);

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

    // Fetch data, image, and check time in parallel
    const [data, imageResult, lastCheck] = await Promise.all([
      fetchScheduleData(user.region),
      fetchScheduleImage(user.region, user.queue).catch(() => null),
      getScheduleCheckTime(user.region, user.queue).catch(() => Math.floor(Date.now() / 1000)),
    ]);

    const scheduleData = parseScheduleForQueue(data, user.queue);
    const nextEvent = findNextEvent(scheduleData);

    // user object already contains snapshot fields (today_snapshot_hash, etc.)
    const updateTypeV2 = getUpdateTypeV2(null, scheduleData, user);
    const updateType = {
      tomorrowAppeared: updateTypeV2.tomorrowAppeared,
      todayUpdated: updateTypeV2.todayChanged,
      todayUnchanged: !updateTypeV2.todayChanged,
    };

    // Форматуємо повідомлення
    // Pass null for changes parameter since we're not marking new events in bot view
    const message = formatScheduleMessage(user.region, user.queue, scheduleData, nextEvent, null, updateType);

    // Додаємо date_time entity до повідомлення
    const { text: fullCaption, entities: timestampEntities } = appendTimestamp(message, lastCheck);

    const scheduleKeyboard = getScheduleViewKeyboard();

    // Спробуємо відправити зображення графіка з caption
    let sentMsg;
    if (imageResult) {
      sentMsg = await safeSendPhoto(bot, chatId, imageResult, {
        caption: fullCaption,
        caption_entities: timestampEntities,
        parse_mode: undefined, // Override global parseMode — entities handle formatting
        reply_markup: scheduleKeyboard,
      }, { filename: 'schedule.png', contentType: 'image/png' });
    }
    if (!sentMsg) {
      sentMsg = await safeSendMessage(bot, chatId, fullCaption, {
        entities: timestampEntities,
        parse_mode: undefined, // Override global parseMode — entities handle formatting
        reply_markup: scheduleKeyboard,
      });
    }

    if (sentMsg) {
      await usersDb.updateUser(telegramId, { last_schedule_message_id: sentMsg.message_id });
    }

  } catch (error) {
    logger.error('Помилка в handleSchedule', { error });
    await safeSendMessage(bot, chatId, '🔄 Не вдалося завантажити. Спробуйте пізніше.');
  }
}

// Обробник команди /next
async function handleNext(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);

  try {
    const user = await usersDb.getUserByTelegramId(telegramId);

    if (!user) {
      await safeSendMessage(bot, chatId, '❌ Спочатку запустіть бота, натиснувши /start');
      return;
    }

    await bot.api.sendChatAction(chatId, 'typing');

    const data = await fetchScheduleData(user.region);
    const scheduleData = parseScheduleForQueue(data, user.queue);
    const nextEvent = findNextEvent(scheduleData);

    const message = formatNextEventMessage(nextEvent);
    await safeSendMessage(bot, chatId, message);

  } catch (error) {
    logger.error('Помилка в handleNext', { error });
    await bot.api.sendMessage(chatId, '🔄 Не вдалося завантажити. Спробуйте пізніше.');
  }
}

// Обробник команди /timer
async function handleTimer(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);

  try {
    const user = await usersDb.getUserByTelegramId(telegramId);

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

    const data = await fetchScheduleData(user.region);
    const scheduleData = parseScheduleForQueue(data, user.queue);
    const nextEvent = findNextEvent(scheduleData);

    const message = formatTimerMessage(nextEvent);
    await bot.api.sendMessage(chatId, message);

  } catch (error) {
    logger.error('Помилка в handleTimer', { error });
    await bot.api.sendMessage(chatId, '🔄 Не вдалося завантажити. Спробуйте пізніше.');
  }
}

module.exports = {
  handleSchedule,
  handleNext,
  handleTimer,
};
