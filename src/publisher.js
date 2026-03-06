const { fetchScheduleData, fetchScheduleImage } = require('./api');
const { parseScheduleForQueue, findNextEvent } = require('./parser');
const { formatScheduleMessage, formatTemplate } = require('./formatter');
const { getPreviousSchedule, addScheduleToHistory, compareSchedules } = require('./database/scheduleHistory');
const usersDb = require('./database/users');
const { REGIONS } = require('./constants/regions');
const crypto = require('crypto');
const { InputFile } = require('grammy');
const { isTelegramUserInactiveError } = require('./utils/errorHandler');

// Get monitoring manager
let metricsCollector = null;
try {
  metricsCollector = require('./monitoring/metricsCollector');
} catch (_e) {
  // Monitoring not available yet, will work without it
}

// Day name constants
const DAY_NAMES = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\'ятниця', 'Субота'];
const SHORT_DAY_NAMES = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

// Helper function to get bot ID (cached in bot.options.id)
async function ensureBotId(bot) {
  if (!bot.options.id) {
    const botInfo = await bot.api.getMe();
    bot.options.id = botInfo.id;
  }
  return bot.options.id;
}

// Визначити тип оновлення графіка з snapshot logic
function getUpdateTypeV2(previousSchedule, currentSchedule, userSnapshots) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  // Get tomorrow date string (YYYY-MM-DD)
  const tomorrowDateStr = tomorrowStart.toISOString().split('T')[0];

  // Split events into today and tomorrow
  const currentTodayEvents = currentSchedule.events ? currentSchedule.events.filter(event => {
    const eventStart = new Date(event.start);
    return eventStart >= todayStart && eventStart < tomorrowStart;
  }) : [];

  const currentTomorrowEvents = currentSchedule.events ? currentSchedule.events.filter(event => {
    const eventStart = new Date(event.start);
    return eventStart >= tomorrowStart && eventStart < tomorrowEnd;
  }) : [];

  // Calculate hashes for today and tomorrow using helper
  const todayHash = calculateScheduleHash(currentTodayEvents);
  const tomorrowHash = calculateScheduleHash(currentTomorrowEvents);

  // Check if snapshots changed
  const todayChanged = userSnapshots?.today_snapshot_hash !== todayHash;
  const tomorrowChanged = userSnapshots?.tomorrow_snapshot_hash !== tomorrowHash;

  // Check if tomorrow was already published for this date
  const tomorrowAlreadyPublished = userSnapshots?.tomorrow_published_date === tomorrowDateStr;

  // Determine if tomorrow just appeared (new data and wasn't published for this date)
  const tomorrowAppeared = currentTomorrowEvents.length > 0 &&
                          tomorrowChanged &&
                          !tomorrowAlreadyPublished;

  return {
    todayChanged,
    tomorrowChanged,
    tomorrowAppeared,
    todayHash,
    tomorrowHash,
    tomorrowDateStr,
    hasTomorrow: currentTomorrowEvents.length > 0,
  };
}

// Helper function to calculate schedule hash
// NOTE: This hash is used for FINE deduplication in publisher.js
// It hashes the parsed events (MD5) to determine if the actual schedule changed.
// This is separate from utils.calculateHash which uses SHA-256 on raw API data.
// The dual-hash strategy is intentional:
// - utils.calculateHash (SHA-256, raw API) → coarse change detection in scheduler.js
// - this function (MD5, parsed events) → fine deduplication to prevent redundant publications
function calculateScheduleHash(events) {
  // Normalize events to prevent hash instability from Date serialization
  const normalized = events.map(e => ({
    start: new Date(e.start).getTime(),
    end: new Date(e.end).getTime(),
    isPossible: e.isPossible,
    type: e.type,
  }));
  return crypto.createHash('md5').update(JSON.stringify(normalized)).digest('hex');
}

// Публікувати графік з фото та кнопками
async function publishScheduleWithPhoto(bot, user, region, queue, { force = false } = {}) {
  try {
    // Check if channel is paused
    if (user.channel_paused) {
      console.log(`Канал користувача ${user.telegram_id} зупинено, пропускаємо публікацію графіка`);
      return;
    }

    // Validate channel before publishing
    try {
      // Check if channel exists and bot has access
      await bot.api.getChat(user.channel_id);

      // Check if bot has necessary permissions
      const botId = await ensureBotId(bot);
      const botMember = await bot.api.getChatMember(user.channel_id, botId);

      if (botMember.status !== 'administrator' || !botMember.can_post_messages) {
        console.log(`Бот не має прав на публікацію в канал ${user.channel_id}, оновлюємо статус`);
        await usersDb.updateChannelStatus(user.telegram_id, 'blocked');

        // Notify user about the issue
        try {
          await bot.api.sendMessage(
            user.telegram_id,
            `⚠️ <b>Канал недоступний</b>\n\n` +
            `Бот не має доступу до вашого каналу або прав на публікацію.\n\n` +
            `🔴 <b>Моніторинг зупинено.</b>\n\n` +
            `Переконайтесь, що бот є адміністратором з правами на публікацію.\n` +
            `Перейдіть у Налаштування → Канал → Підключити канал`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '⚙️ Налаштування', callback_data: 'menu_settings' }]
                ]
              }
            }
          );
        } catch (notifyError) {
          if (isTelegramUserInactiveError(notifyError)) {
            console.log(`ℹ️ Користувач ${user.telegram_id} недоступний — сповіщення про канал пропущено`);
          } else {
            console.error(`Не вдалося повідомити користувача ${user.telegram_id}:`, notifyError.message);
          }
        }

        return;
      }
    } catch (validationError) {
      // Channel not found or not accessible
      console.log(`ℹ️ Канал ${user.channel_id} недоступний: ${validationError.message}`);
      await usersDb.updateChannelStatus(user.telegram_id, 'blocked');

      // Notify user about the issue
      try {
        await bot.api.sendMessage(
          user.telegram_id,
          `⚠️ <b>Канал недоступний</b>\n\n` +
          `Не вдалося отримати доступ до вашого каналу.\n` +
          `Можливо, бот був видалений або канал видалено.\n\n` +
          `🔴 <b>Моніторинг зупинено.</b>\n\n` +
          `Перейдіть у Налаштування → Канал → Підключити канал`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '⚙️ Налаштування', callback_data: 'menu_settings' }]
              ]
            }
          }
        );
      } catch (notifyError) {
        if (isTelegramUserInactiveError(notifyError)) {
          console.log(`ℹ️ Користувач ${user.telegram_id} недоступний — сповіщення про канал пропущено`);
        } else {
          console.error(`Не вдалося повідомити користувача ${user.telegram_id}:`, notifyError.message);
        }
      }

      return;
    }

    // Delete previous schedule message if delete_old_message is enabled
    if (user.delete_old_message && user.last_schedule_message_id) {
      try {
        await bot.api.deleteMessage(user.channel_id, user.last_schedule_message_id);
        console.log(`Видалено попереднє повідомлення ${user.last_schedule_message_id} з каналу ${user.channel_id}`);
      } catch (deleteError) {
        // Ignore errors if message was already deleted or doesn't exist
        console.log(`Не вдалося видалити попереднє повідомлення: ${deleteError.message}`);
      }
    }

    // Also delete previous post if it exists (legacy)
    if (user.last_post_id) {
      try {
        await bot.api.deleteMessage(user.channel_id, user.last_post_id);
        console.log(`Видалено попередній пост ${user.last_post_id} з каналу ${user.channel_id}`);
      } catch (deleteError) {
        // Ignore errors if message was already deleted or doesn't exist
        console.log(`Не вдалося видалити попередній пост: ${deleteError.message}`);
      }
    }

    // Отримуємо дані графіка
    const data = await fetchScheduleData(region);
    const scheduleData = parseScheduleForQueue(data, queue);
    const nextEvent = findNextEvent(scheduleData);

    // Use snapshot fields already present on the user object (avoids extra DB query)
    const { updateSnapshotHashes } = require('./database/users');

    const updateTypeV2 = getUpdateTypeV2(null, scheduleData, user);

    // Skip publication if nothing changed (unless forced)
    if (!force && !updateTypeV2.todayChanged && !updateTypeV2.tomorrowChanged) {
      console.log(`[${user.telegram_id}] Snapshots unchanged, skipping publication`);
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
          parse_mode: 'HTML',
          reply_markup: inlineKeyboard
        });
      }
    } catch (_imageError) {
      console.log(`Зображення недоступне для ${region}/${queue}, відправляємо тільки текст`);

      // Якщо не вдалося завантажити зображення, відправляємо тільки текст
      sentMessage = await bot.api.sendMessage(user.channel_id, messageText, {
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard
      });
    }

    // Save the message_id for potential deletion later
    if (sentMessage && sentMessage.message_id) {
      await usersDb.updateLastScheduleMessageId(user.telegram_id, sentMessage.message_id);
    }

    return sentMessage;

  } catch (error) {
    console.error('Помилка публікації графіка:', error);

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
  getUpdateTypeV2,
};
