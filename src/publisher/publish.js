const { fetchScheduleData, fetchScheduleImage } = require('../api');
const { parseScheduleForQueue, findNextEvent } = require('../parser');
const { formatScheduleMessage, formatTemplate } = require('../formatter');
const { getPreviousSchedule, addScheduleToHistory, compareSchedules } = require('../database/scheduleHistory');
const usersDb = require('../database/users');
const { REGIONS } = require('../constants/regions');
const { InputFile } = require('grammy');
const { calculateScheduleHash, getUpdateTypeV2 } = require('./scheduleHash');
const { validateChannel } = require('./channelValidator');
const logger = require('../utils/logger');

// Get monitoring manager
let metricsCollector = null;
try {
  metricsCollector = require('../monitoring/metricsCollector');
} catch (_e) {
  // Monitoring not available yet, will work without it
}

// Day name constants
const DAY_NAMES = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\'ятниця', 'Субота'];
const SHORT_DAY_NAMES = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

// Публікувати графік з фото та кнопками
async function publishScheduleWithPhoto(bot, user, region, queue, { force = false } = {}) {
  try {
    // Check if channel is paused
    if (user.channel_paused) {
      logger.info(`Канал користувача ${user.telegram_id} зупинено, пропускаємо публікацію графіка`);
      return;
    }

    // Validate channel before publishing
    const isValid = await validateChannel(bot, user);
    if (!isValid) {
      return;
    }

    // Delete previous schedule message if delete_old_message is enabled
    if (user.delete_old_message && user.last_schedule_message_id) {
      try {
        await bot.api.deleteMessage(user.channel_id, user.last_schedule_message_id);
        logger.info(`Видалено попереднє повідомлення ${user.last_schedule_message_id} з каналу ${user.channel_id}`);
      } catch (deleteError) {
        // Ignore errors if message was already deleted or doesn't exist
        logger.info(`Не вдалося видалити попереднє повідомлення: ${deleteError.message}`);
      }
    }

    // Also delete previous post if it exists (legacy)
    if (user.last_post_id) {
      try {
        await bot.api.deleteMessage(user.channel_id, user.last_post_id);
        logger.info(`Видалено попередній пост ${user.last_post_id} з каналу ${user.channel_id}`);
      } catch (deleteError) {
        // Ignore errors if message was already deleted or doesn't exist
        logger.info(`Не вдалося видалити попередній пост: ${deleteError.message}`);
      }
    }

    // Отримуємо дані графіка
    const data = await fetchScheduleData(region);
    const scheduleData = parseScheduleForQueue(data, queue);
    const nextEvent = findNextEvent(scheduleData);

    // Use snapshot fields already present on the user object (avoids extra DB query)
    const { updateSnapshotHashes } = require('../database/users');

    const updateTypeV2 = getUpdateTypeV2(null, scheduleData, user);

    // Skip publication if nothing changed (unless forced)
    if (!force && !updateTypeV2.todayChanged && !updateTypeV2.tomorrowChanged) {
      logger.info(`[${user.telegram_id}] Snapshots unchanged, skipping publication`);
      return null;
    }

    // Update snapshots
    const tomorrowDateToStore = updateTypeV2.hasTomorrow ? updateTypeV2.tomorrowDateStr : null;
    await updateSnapshotHashes(
      user.telegram_id,
      updateTypeV2.todayHash,
      updateTypeV2.tomorrowHash,
      tomorrowDateToStore
    );

    // Calculate hash for schedule history using helper
    const scheduleHash = calculateScheduleHash(scheduleData.events);

    // Save schedule to history
    await addScheduleToHistory(user.id, region, queue, scheduleData, scheduleHash);

    // Get previous schedule for comparison (for legacy compatibility)
    const previousSchedule = await getPreviousSchedule(user.id);

    // ALWAYS set updateType from v2 snapshot logic
    const updateType = {
      tomorrowAppeared: updateTypeV2.tomorrowAppeared,
      todayUpdated: updateTypeV2.todayChanged,
      todayUnchanged: !updateTypeV2.todayChanged,
    };

    // Compare schedules if previous exists (for changes display)
    let changes = null;
    if (previousSchedule && previousSchedule.hash !== scheduleHash) {
      changes = compareSchedules(previousSchedule.schedule_data, scheduleData);
    }

    // Форматуємо повідомлення
    let messageText = formatScheduleMessage(region, queue, scheduleData, nextEvent, changes, updateType, true);

    // Apply custom caption template if set
    if (user.schedule_caption) {
      const now = new Date();

      const variables = {
        d: `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`,
        dm: `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}`,
        dd: 'сьогодні',
        sdw: SHORT_DAY_NAMES[now.getDay()],
        fdw: DAY_NAMES[now.getDay()],
        queue: queue,
        region: REGIONS[region]?.name || region
      };

      const customCaption = formatTemplate(user.schedule_caption, variables);
      // PREPEND custom caption to the formatted schedule message
      // messageText is fully formatted at this point and won't be modified further
      messageText = customCaption + '\n\n' + messageText;
    }

    // Створюємо inline кнопки
    const buttons = [];

    // Show timer button
    const timerButton = { text: '⏰ Таймер', callback_data: `timer_${user.id}` };

    // Show statistics button only if router_ip is configured
    if (user.router_ip) {
      buttons.push([
        timerButton,
        { text: '📊 Статистика', callback_data: `stats_${user.id}` }
      ]);
    } else {
      buttons.push([timerButton]);
    }

    const inlineKeyboard = {
      inline_keyboard: buttons
    };

    let sentMessage;

    try {
      // Завантажуємо зображення як Buffer
      const imageBuffer = await fetchScheduleImage(region, queue);

      // Check if picture_only mode is enabled
      if (user.picture_only) {
        // Відправляємо тільки фото без підпису
        const photoInput = Buffer.isBuffer(imageBuffer) ? new InputFile(imageBuffer, 'schedule.png') : imageBuffer;
        sentMessage = await bot.api.sendPhoto(user.channel_id, photoInput, {
          reply_markup: inlineKeyboard
        });
      } else {
        // Відправляємо фото з підписом та кнопками
        const photoInput = Buffer.isBuffer(imageBuffer) ? new InputFile(imageBuffer, 'schedule.png') : imageBuffer;
        sentMessage = await bot.api.sendPhoto(user.channel_id, photoInput, {
          caption: messageText,
          reply_markup: inlineKeyboard
        });
      }
    } catch (_imageError) {
      logger.info('Зображення недоступне для /, відправляємо тільки текст', { region, queue });

      // Якщо не вдалося завантажити зображення, відправляємо тільки текст
      sentMessage = await bot.api.sendMessage(user.channel_id, messageText, {
        reply_markup: inlineKeyboard
      });
    }

    // Save the message_id for potential deletion later
    if (sentMessage && sentMessage.message_id) {
      await usersDb.updateLastScheduleMessageId(user.telegram_id, sentMessage.message_id);
    }

    return sentMessage;

  } catch (error) {
    logger.error('Помилка публікації графіка:', error);

    // Track channel publish error
    if (metricsCollector) {
      metricsCollector.trackChannelEvent('publishErrors');
      metricsCollector.trackError(error, {
        context: 'schedule_publish',
        channelId: user.channel_id,
        region: region,
        queue: queue
      });
    }

    throw error;
  }
}

module.exports = {
  publishScheduleWithPhoto,
};
