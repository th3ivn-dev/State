const { fetchScheduleData } = require('./api');
const { parseScheduleForQueue, findNextEvent } = require('./parser');
const { calculateHash } = require('./utils');
const usersDb = require('./database/users');
const { REGION_CODES } = require('./constants/regions');
const schedulerManager = require('./scheduler/schedulerManager');
const { getSetting } = require('./database/db');
const { InputFile } = require('grammy');
const { isTelegramUserInactiveError } = require('./utils/errorHandler');

let bot = null;

/**
 * Initialize scheduler using centralized scheduler manager
 * @param {object} botInstance - Telegram bot instance
 */
async function initScheduler(botInstance) {
  bot = botInstance;
  console.log('📅 Ініціалізація планувальника...');

  // Read interval from database instead of config
  const intervalStr = await getSetting('schedule_check_interval', '60');
  let checkIntervalSeconds = parseInt(intervalStr, 10);

  // Validate the interval
  if (isNaN(checkIntervalSeconds) || checkIntervalSeconds < 1) {
    console.warn(`⚠️ Invalid schedule_check_interval "${intervalStr}", using default 60 seconds`);
    checkIntervalSeconds = 60;
  }

  // Initialize scheduler manager
  schedulerManager.init({
    checkIntervalSeconds: checkIntervalSeconds
  });

  // Start schedulers with dependencies
  schedulerManager.start({
    bot: botInstance,
    checkAllSchedules: checkAllSchedules
  });

  console.log(`✅ Планувальник запущено через scheduler manager`);
}

// Guard against overlapping checkAllSchedules calls
let isCheckingSchedules = false;

// Перевірка всіх графіків
async function checkAllSchedules() {
  if (isCheckingSchedules) {
    console.log('⚠️ checkAllSchedules already running, skipping');
    return;
  }
  isCheckingSchedules = true;

  try {
    // Use Promise.allSettled for parallel region checking
    const results = await Promise.allSettled(
      REGION_CODES.map(region => checkRegionSchedule(region))
    );

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Помилка перевірки регіону ${REGION_CODES[index]}:`, result.reason);
      }
    });
  } catch (error) {
    console.error('Помилка при перевірці графіків:', error);
  } finally {
    isCheckingSchedules = false;
  }
}

// Перевірка графіка конкретного регіону
async function checkRegionSchedule(region) {
  try {
    // Отримуємо дані для регіону
    const data = await fetchScheduleData(region);

    // Отримуємо всіх користувачів для цього регіону
    const users = await usersDb.getUsersByRegion(region);

    if (users.length === 0) {
      return;
    }

    console.log(`Перевірка ${region}: знайдено ${users.length} користувачів`);

    for (const user of users) {
      try {
        await checkUserSchedule(user, data);
      } catch (error) {
        console.error(`Помилка перевірки графіка для користувача ${user.telegram_id}:`, error.message);
      }
    }

  } catch (error) {
    console.error(`Помилка при перевірці графіка для ${region}:`, error.message);
  }
}

// Перевірка графіка для конкретного користувача
async function checkUserSchedule(user, data) {
  try {
    // Skip blocked channels
    if (user.channel_status === 'blocked') {
      console.log(`[${user.telegram_id}] Пропущено - канал заблоковано`);
      return;
    }

    const queueKey = `GPV${user.queue}`;

    // Отримуємо timestamps для сьогодні та завтра
    const availableTimestamps = Object.keys(data?.fact?.data || {}).map(Number).sort((a, b) => a - b);
    const todayTimestamp = availableTimestamps[0] || null;
    const tomorrowTimestamp = availableTimestamps.length > 1 ? availableTimestamps[1] : null;

    const newHash = calculateHash(data, queueKey, todayTimestamp, tomorrowTimestamp);

    // Перевіряємо чи хеш змінився з останньої перевірки
    const hasChanged = newHash !== user.last_hash;

    // ВАЖЛИВО: Якщо хеш не змінився - нічого не робимо (запобігає дублікатам при перезапуску)
    if (!hasChanged) {
      return;
    }

    // Перевіряємо чи графік вже опублікований з цим хешем
    if (newHash === user.last_published_hash) {
      // Оновлюємо last_hash для синхронізації
      await usersDb.updateUserHash(user.id, newHash);
      return;
    }

    // Парсимо графік
    const scheduleData = parseScheduleForQueue(data, user.queue);
    const nextEvent = findNextEvent(scheduleData);

    // Отримуємо налаштування куди публікувати
    const notifyTarget = user.power_notify_target || 'both';

    console.log(`[${user.telegram_id}] Графік оновлено, публікуємо (target: ${notifyTarget})`);

    // Відправляємо в особистий чат користувача
    if (notifyTarget === 'bot' || notifyTarget === 'both') {
      try {
        const { formatScheduleMessage } = require('./formatter');
        const { fetchScheduleImage } = require('./api');
        const { getUpdateTypeV2 } = require('./publisher');
        const { appendTimestamp } = require('./utils/timestamp');
        const { updateScheduleCheckTime } = require('./database/scheduleChecks');
        const { getScheduleViewKeyboard } = require('./keyboards/inline');

        // Зберігаємо час останньої перевірки та отримуємо точний timestamp
        const lastCheck = await updateScheduleCheckTime(user.region, user.queue);

        // Обчислюємо updateType (як для каналу)
        const userSnapshots = await usersDb.getSnapshotHashes(user.telegram_id);
        const updateTypeV2 = getUpdateTypeV2(null, scheduleData, userSnapshots);
        const updateType = {
          tomorrowAppeared: updateTypeV2.tomorrowAppeared,
          todayUpdated: updateTypeV2.todayChanged,
          todayUnchanged: !updateTypeV2.todayChanged,
        };

        const message = formatScheduleMessage(user.region, user.queue, scheduleData, nextEvent, null, updateType);

        // Додаємо tg-timestamp з часом останньої перевірки
        const fullCaption = appendTimestamp(message, lastCheck);

        const scheduleKeyboard = getScheduleViewKeyboard();

        // Спробуємо з фото
        try {
          const imageBuffer = await fetchScheduleImage(user.region, user.queue);
          const photoInput = Buffer.isBuffer(imageBuffer) ? new InputFile(imageBuffer, 'schedule.png') : imageBuffer;
          await bot.api.sendPhoto(user.telegram_id, photoInput, {
            caption: fullCaption,
            parse_mode: 'HTML',
            reply_markup: scheduleKeyboard
          });
        } catch (_imgError) {
          // Без фото
          await bot.api.sendMessage(user.telegram_id, fullCaption, {
            parse_mode: 'HTML',
            reply_markup: scheduleKeyboard
          });
        }

        console.log(`📱 Графік відправлено користувачу ${user.telegram_id}`);
      } catch (error) {
        if (isTelegramUserInactiveError(error)) {
          console.log(`ℹ️ Користувач ${user.telegram_id} заблокував бота або недоступний — сповіщення вимкнено`);
          await usersDb.setUserActive(user.telegram_id, false);
        } else {
          console.error(`Помилка відправки графіка користувачу ${user.telegram_id}:`, error.message);
        }
      }
    }

    // Оновлюємо хеші після відправки в бот, але перед каналом
    // Це запобігає дублікатам, якщо публікація в канал не вдається
    await usersDb.updateUserHashes(user.id, newHash);

    // Відправляємо в канал (незалежно від відправки в бот)
    if (user.channel_id && (notifyTarget === 'channel' || notifyTarget === 'both')) {
      try {
        const { publishScheduleWithPhoto } = require('./publisher');
        const sentMsg = await publishScheduleWithPhoto(bot, user, user.region, user.queue, { force: true });
        if (sentMsg && sentMsg.message_id) {
          await usersDb.updateUserPostId(user.id, sentMsg.message_id);
        }
        console.log(`📢 Графік опубліковано в канал ${user.channel_id}`);
      } catch (channelError) {
        if (isTelegramUserInactiveError(channelError)) {
          console.log(`ℹ️ Канал ${user.channel_id} недоступний — публікацію пропущено`);
        } else {
          console.error(`Не вдалося відправити в канал ${user.channel_id}:`, channelError.message);
        }
        // Channel error doesn't affect hash — prevents duplicates in bot
      }
    }

  } catch (error) {
    console.error(`Помилка checkUserSchedule для користувача ${user.telegram_id}:`, error);
  }
}

module.exports = {
  initScheduler,
  checkAllSchedules,
  schedulerManager, // Export manager for external control
};
