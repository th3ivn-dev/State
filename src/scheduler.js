const cron = require('node-cron');
const { fetchScheduleData, fetchScheduleImage } = require('./api');
const { parseScheduleForQueue, findNextEvent } = require('./parser');
const { calculateHash } = require('./utils');
const usersDb = require('./database/users');
const { REGION_CODES } = require('./constants/regions');
const schedulerManager = require('./scheduler/schedulerManager');
const settingsCache = require('./utils/settingsCache');
const { isTelegramUserInactiveError } = require('./utils/errorHandler');
const { updateScheduleCheckTime } = require('./database/scheduleChecks');
const { createLogger } = require('./utils/logger');
const { notificationsQueue } = require('./queue/notificationsQueue');
const { cachePhoto } = require('./queue/photoCache');

const logger = createLogger('Scheduler');
let bot = null;

// In-memory store for notifications deferred during quiet hours (00:00–05:59 Kyiv time)
// Map<telegramId, { user, data, newHash }>
const pendingNightNotifications = new Map();

function isQuietHours() {
  const hour = new Date().getHours(); // TZ=Europe/Kyiv is set via env
  return hour >= 0 && hour < 6;
}

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

  // Cron job: send pending quiet-hours notifications at 06:00 Kyiv time
  cron.schedule('0 6 * * *', async () => {
    if (pendingNightNotifications.size === 0) return;
    console.log(`⏰ 06:00 — відправка відкладених сповіщень (${pendingNightNotifications.size})`);
    const entries = Array.from(pendingNightNotifications.entries());
    pendingNightNotifications.clear();
    const nightImageCache = new Map();
    for (const [telegramId, { user, data }] of entries) {
      try {
        await sendScheduleNotifications(user, data, nightImageCache);
      } catch (error) {
        console.error(`Помилка відправки відкладеного сповіщення для ${telegramId}:`, error.message);
      }
    }
  }, { timezone: 'Europe/Kyiv' });

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

async function prefetchQueueImage(region, queue, imageCache) {
  const cacheKey = `${region}:${queue}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);
  try {
    const imageBuffer = await fetchScheduleImage(region, queue);
    const photoBase64 = Buffer.isBuffer(imageBuffer) ? imageBuffer.toString('base64') : null;
    const photoCacheKey = photoBase64 ? await cachePhoto(region, queue, photoBase64) : null;
    const entry = { photoBase64, photoCacheKey };
    imageCache.set(cacheKey, entry);
    return entry;
  } catch (_e) {
    const entry = { photoBase64: null, photoCacheKey: null };
    imageCache.set(cacheKey, entry);
    return entry;
  }
}

async function checkRegionSchedule(region) {
  try {
    const data = await fetchScheduleData(region);

    const users = await usersDb.getUsersByRegionForScheduler(region);

    if (users.length === 0) {
      return;
    }

    logger.debug(`Перевірка ${region}: ${users.length} користувачів`);

    // Pre-compute hash per queue (same data → same hash for all users in queue)
    const availableTimestamps = Object.keys(data?.fact?.data || {}).map(Number).sort((a, b) => a - b);
    const todayTimestamp = availableTimestamps[0] || null;
    const tomorrowTimestamp = availableTimestamps.length > 1 ? availableTimestamps[1] : null;

    const queueHashCache = new Map();

    // Collect hash updates for batch processing
    const hashUpdates = [];

    // Pre-fetch and cache images per queue
    const imageCache = new Map();

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
        batch.map(user => processUser(user, data, queueHashCache.get(user.queue), hashUpdates, imageCache))
      );
      if (i + BATCH_SIZE < users.length) {
        await new Promise(r => setTimeout(r, BATCH_STAGGER_MS));
      }
    }

    // Batch update all hashes in one query
    if (hashUpdates.length > 0) {
      try {
        await usersDb.batchUpdateHashes(hashUpdates);
      } catch (batchError) {
        console.error(`Batch hash update failed for ${region}:`, batchError.message);
      }
    }

  } catch (error) {
    console.error(`Помилка при перевірці графіка для ${region}:`, error.message);
  }
}

async function processUser(user, data, precomputedHash, hashUpdates, imageCache) {
  try {

    const GRACE_PERIOD_MS = 2 * 60 * 1000;
    if (user.created_at && Date.now() - new Date(user.created_at).getTime() < GRACE_PERIOD_MS) {
      return;
    }

    if (precomputedHash !== user.last_hash) {
      await handleScheduleChange(user, data, precomputedHash, hashUpdates, imageCache);
    }
  } catch (error) {
    console.error(`Помилка перевірки графіка для ${user.telegram_id}:`, error.message);
  }
}

async function handleScheduleChange(user, data, newHash, hashUpdates, imageCache) {
  if (user.last_hash === null || user.last_hash === undefined) {
    hashUpdates.push({ id: user.id, lastHash: newHash, lastPublishedHash: newHash });
    console.log(`[${user.telegram_id}] Перший запуск — зберігаємо хеш, публікацію пропускаємо`);
    return;
  }

  if (newHash === user.last_published_hash) {
    hashUpdates.push({ id: user.id, lastHash: newHash, lastPublishedHash: user.last_published_hash });
    return;
  }

  if (isQuietHours()) {
    // Save hashes now so the scheduler won't re-trigger on the same change
    hashUpdates.push({ id: user.id, lastHash: newHash, lastPublishedHash: newHash });
    // Store the latest state for this user (overwrite if already pending)
    pendingNightNotifications.set(user.telegram_id, { user, data, newHash });
    console.log(`🌙 [${user.telegram_id}] Quiet hours — сповіщення відкладено до 06:00`);
    return;
  }

  await sendScheduleNotifications(user, data, imageCache);
  hashUpdates.push({ id: user.id, lastHash: newHash, lastPublishedHash: newHash });
}

async function sendScheduleNotifications(user, data, imageCache) {
  const scheduleData = parseScheduleForQueue(data, user.queue);
  const nextEvent = findNextEvent(scheduleData);

  const notifyTarget = user.power_notify_target || 'both';

  logger.debug(`[${user.telegram_id}] Графік оновлено (target: ${notifyTarget})`);

  if (notifyTarget === 'bot' || notifyTarget === 'both') {
    try {
      const { formatScheduleMessage } = require('./formatter');
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

      const { photoBase64, photoCacheKey } = await prefetchQueueImage(user.region, user.queue, imageCache);
      if (photoBase64 && !photoCacheKey) {
        logger.warn(`[${user.telegram_id}] Photo cache недоступний, використовуємо inline base64`);
      }

      // Clear keyboard from previous keyboard message before sending new one (fire-and-forget)
      if (user.last_bot_keyboard_message_id) {
        bot.api.editMessageReplyMarkup(user.telegram_id, user.last_bot_keyboard_message_id, {
          reply_markup: { inline_keyboard: [] }
        }).catch(() => {});
      }

      if (photoBase64) {
        const jobData = {
          type: 'photo',
          chatId: user.telegram_id,
          photoFilename: 'schedule.png',
          options: { caption: fullCaption, caption_entities: timestampEntities, reply_markup: scheduleKeyboard },
          meta: { telegramId: user.telegram_id, updateLastBotKeyboardMessageId: true },
        };
        if (photoCacheKey) {
          jobData.photoCacheKey = photoCacheKey;
        } else {
          jobData.photo = photoBase64;
        }
        await notificationsQueue.add('photo', jobData);
      } else {
        await notificationsQueue.add('user', {
          type: 'user',
          chatId: user.telegram_id,
          text: fullCaption,
          options: { entities: timestampEntities, reply_markup: scheduleKeyboard },
          meta: { telegramId: user.telegram_id, updateLastBotKeyboardMessageId: true },
        });
      }

      console.log(`📱 Графік додано в чергу для ${user.telegram_id}`);
    } catch (error) {
      console.error(`Помилка підготовки графіка для ${user.telegram_id}:`, error.message);
    }
  }

  if (user.channel_id && (notifyTarget === 'channel' || notifyTarget === 'both')) {
    if (user.channel_status === 'blocked') {
      console.log(`📺 Канал ${user.channel_id} заблоковано, пропускаємо публікацію графіка для ${user.telegram_id}`);
    } else if (user.ch_notify_schedule === false) {
      console.log(`📺 Канальні сповіщення графіка вимкнено для ${user.telegram_id}, пропускаємо`);
    } else {
      try {
        const { publishScheduleWithPhoto } = require('./publisher');
        await publishScheduleWithPhoto(bot, user, user.region, user.queue, { force: true });
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
}

module.exports = {
  initScheduler,
  checkAllSchedules,
  schedulerManager,
};
