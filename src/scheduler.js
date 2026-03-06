const { fetchScheduleData } = require('./api');
const { parseScheduleForQueue, findNextEvent } = require('./parser');
const { calculateHash } = require('./utils');
const usersDb = require('./database/users');
const { REGION_CODES } = require('./constants/regions');
const schedulerManager = require('./scheduler/schedulerManager');
const settingsCache = require('./utils/settingsCache');
const { InputFile } = require('grammy');
const { isTelegramUserInactiveError } = require('./utils/errorHandler');
const { updateScheduleCheckTime } = require('./database/scheduleChecks');

let bot = null;

async function initScheduler(botInstance) {
  bot = botInstance;
  console.log('📅 Ініціалізація планувальника...');

  const intervalStr = await settingsCache.get('schedule_check_interval', '60');
  let checkIntervalSeconds = parseInt(intervalStr, 10);

  if (isNaN(checkIntervalSeconds) || checkIntervalSeconds < 1) {
    console.warn(`⚠️ Invalid schedule_check_interval "${intervalStr}", using default 60 seconds`);
    checkIntervalSeconds = 60;
  }

  schedulerManager.init({ checkIntervalSeconds });
  schedulerManager.start({ bot: botInstance, checkAllSchedules });

  console.log(`✅ Планувальник запущено через scheduler manager`);
}

let isCheckingSchedules = false;

async function checkAllSchedules() {
  if (isCheckingSchedules) {
    console.log('⚠️ checkAllSchedules already running, skipping');
    return;
  }
  isCheckingSchedules = true;

  try {
    const results = await Promise.allSettled(
      REGION_CODES.map(region => checkRegionSchedule(region))
    );

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

const BATCH_SIZE = 50; // process up to 50 users concurrently
const BATCH_STAGGER_MS = 200; // pause between batches to spread Telegram load

async function checkRegionSchedule(region) {
  try {
    const data = await fetchScheduleData(region);

    const users = await usersDb.getUsersByRegionForScheduler(region);

    if (users.length === 0) {
      return;
    }

    console.log(`Перевірка ${region}: ${users.length} користувачів`);

    // Pre-compute hash per queue (same data → same hash for all users in queue)
    const availableTimestamps = Object.keys(data?.fact?.data || {}).map(Number).sort((a, b) => a - b);
    const todayTimestamp = availableTimestamps[0] || null;
    const tomorrowTimestamp = availableTimestamps.length > 1 ? availableTimestamps[1] : null;

    const queueHashCache = new Map();

    // Update schedule_checks once per unique region+queue
    const checkedQueues = new Set();
    for (const user of users) {
      const qk = user.queue;
      if (!checkedQueues.has(qk)) {
        checkedQueues.add(qk);
        await updateScheduleCheckTime(region, qk);

        const gpvKey = `GPV${qk}`;
        queueHashCache.set(qk, calculateHash(data, gpvKey, todayTimestamp, tomorrowTimestamp));
      }
    }

    // Process users in parallel batches
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(user => processUser(user, data, queueHashCache.get(user.queue)))
      );
      if (i + BATCH_SIZE < users.length) {
        await new Promise(r => setTimeout(r, BATCH_STAGGER_MS));
      }
    }

  } catch (error) {
    console.error(`Помилка при перевірці графіка для ${region}:`, error.message);
  }
}

async function processUser(user, data, precomputedHash) {
  try {
    if (user.channel_status === 'blocked') return;

    const GRACE_PERIOD_MS = 2 * 60 * 1000;
    if (user.created_at && Date.now() - new Date(user.created_at).getTime() < GRACE_PERIOD_MS) {
      return;
    }

    if (precomputedHash !== user.last_hash) {
      await handleScheduleChange(user, data, precomputedHash);
    }
  } catch (error) {
    console.error(`Помилка перевірки графіка для ${user.telegram_id}:`, error.message);
  }
}

async function handleScheduleChange(user, data, newHash) {
  if (user.last_hash === null || user.last_hash === undefined) {
    await usersDb.updateUserHashes(user.id, newHash);
    console.log(`[${user.telegram_id}] Перший запуск — зберігаємо хеш, публікацію пропускаємо`);
    return;
  }

  if (newHash === user.last_published_hash) {
    await usersDb.updateUserHash(user.id, newHash);
    return;
  }

  const scheduleData = parseScheduleForQueue(data, user.queue);
  const nextEvent = findNextEvent(scheduleData);

  const notifyTarget = user.power_notify_target || 'both';

  console.log(`[${user.telegram_id}] Графік оновлено, публікуємо (target: ${notifyTarget})`);

  if (notifyTarget === 'bot' || notifyTarget === 'both') {
    try {
      const { formatScheduleMessage } = require('./formatter');
      const { fetchScheduleImage } = require('./api');
      const { getUpdateTypeV2 } = require('./publisher');
      const { appendTimestamp } = require('./utils/timestamp');
      const { getScheduleViewKeyboard } = require('./keyboards/inline');

      // Use snapshot fields directly from user object (no extra DB query)
      const updateTypeV2 = getUpdateTypeV2(null, scheduleData, user);
      const updateType = {
        tomorrowAppeared: updateTypeV2.tomorrowAppeared,
        todayUpdated: updateTypeV2.todayChanged,
        todayUnchanged: !updateTypeV2.todayChanged,
      };

      const message = formatScheduleMessage(user.region, user.queue, scheduleData, nextEvent, null, updateType);
      const { text: fullCaption, entities: timestampEntities } = appendTimestamp(message, Math.floor(Date.now() / 1000));
      const scheduleKeyboard = getScheduleViewKeyboard();

      try {
        const imageBuffer = await fetchScheduleImage(user.region, user.queue);
        const photoInput = Buffer.isBuffer(imageBuffer) ? new InputFile(imageBuffer, 'schedule.png') : imageBuffer;
        await bot.api.sendPhoto(user.telegram_id, photoInput, {
          caption: fullCaption,
          caption_entities: timestampEntities,
          reply_markup: scheduleKeyboard
        });
      } catch (_imgError) {
        await bot.api.sendMessage(user.telegram_id, fullCaption, {
          entities: timestampEntities,
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

  await usersDb.updateUserHashes(user.id, newHash);

  if (user.channel_id && (notifyTarget === 'channel' || notifyTarget === 'both')) {
    try {
      const { publishScheduleWithPhoto } = require('./publisher');
      const sentMsg = await publishScheduleWithPhoto(bot, user, user.region, user.queue);
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
    }
  }
}

module.exports = {
  initScheduler,
  checkAllSchedules,
  schedulerManager,
};
