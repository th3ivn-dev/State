const { Queue, Worker } = require('bullmq');
const { createConnection } = require('./connection');
const { getCachedPhoto } = require('./photoCache');
const { InputFile } = require('grammy');
const { isTelegramUserInactiveError } = require('../utils/errorHandler');
const usersDb = require('../database/users');
const { createLogger } = require('../utils/logger');

const logger = createLogger('NotificationsQueue');

const CONCURRENCY = parseInt(process.env.BULLMQ_CONCURRENCY || '15', 10);
const RATE_MAX = parseInt(process.env.BULLMQ_RATE_MAX || '20', 10);
const RATE_DURATION = parseInt(process.env.BULLMQ_RATE_DURATION || '1000', 10);

let bot = null;
let worker = null;

const queueConnection = createConnection();
const workerConnection = createConnection();

const notificationsQueue = new Queue('notifications', {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 500, age: 3600 },
    removeOnFail: { count: 1000, age: 24 * 3600 },
  },
});

function initWorker(botInstance) {
  bot = botInstance;

  worker = new Worker(
    'notifications',
    async (job) => {
      const { type, chatId, text, photo, photoCacheKey, photoFilename, options, meta } = job.data;

      let sentMessage;

      if (type === 'photo') {
        // Backward compat: use photo from job directly, or fetch from cache
        let photoData = photo;
        if (photoCacheKey && !photoData) {
          photoData = await getCachedPhoto(photoCacheKey);
        }

        if (photoData) {
          const photoBuffer = Buffer.from(photoData, 'base64');
          const photoInput = new InputFile(photoBuffer, photoFilename || 'schedule.png');
          sentMessage = await bot.api.sendPhoto(chatId, photoInput, options || {});
        } else {
          // Фото недоступне — відправити як текст з caption
          const fallbackText = options?.caption || text || '📊 Графік недоступний';
          const fallbackOptions = {};
          if (options?.parse_mode) fallbackOptions.parse_mode = options.parse_mode;
          if (options?.caption_entities) fallbackOptions.entities = options.caption_entities;
          if (options?.reply_markup) fallbackOptions.reply_markup = options.reply_markup;
          sentMessage = await bot.api.sendMessage(chatId, fallbackText, fallbackOptions);
        }
      } else {
        sentMessage = await bot.api.sendMessage(chatId, text, options || {});
      }

      // Оновлення message_id в БД після успішної відправки
      if (sentMessage && sentMessage.message_id && meta) {
        if (meta.updateLastScheduleMessageId && meta.telegramId) {
          await usersDb.updateLastScheduleMessageId(meta.telegramId, sentMessage.message_id);
        }
        if (meta.updateLastBotKeyboardMessageId && meta.telegramId) {
          await usersDb.updateLastBotKeyboardMessageId(meta.telegramId, sentMessage.message_id);
        }
        if (meta.updateLastReminderMessageId && meta.telegramId) {
          await usersDb.updateLastReminderMessageId(meta.telegramId, sentMessage.message_id);
        }
        if (meta.updateUserPostId && meta.userId) {
          await usersDb.updateUserPostId(meta.userId, sentMessage.message_id);
        }
      }

      return sentMessage ? { message_id: sentMessage.message_id } : null;
    },
    {
      connection: workerConnection,
      concurrency: CONCURRENCY,
      limiter: { max: RATE_MAX, duration: RATE_DURATION },
    }
  );

  worker.on('failed', (job, err) => {
    if (err && err.error_code === 429) {
      const retryAfter = err?.parameters?.retry_after;
      if (retryAfter) {
        logger.warn(`Rate limit для ${job?.data?.chatId}, retry after ${retryAfter}s`);
      } else {
        logger.warn(`Rate limit для ${job?.data?.chatId}, retry...`);
      }
    } else if (isTelegramUserInactiveError(err)) {
      logger.info(`Користувач ${job?.data?.chatId} заблокував бота або недоступний`);
      const meta = job?.data?.meta;
      if (meta?.telegramId) {
        usersDb.setUserActive(meta.telegramId, false).catch(() => {});
      }
    } else {
      logger.error(`Помилка відправки для ${job?.data?.chatId}: ${err?.message}`);
    }
  });

  worker.on('error', (err) => {
    logger.error(`Notifications worker помилка: ${err.message}`);
  });

  worker.on('stalled', (jobId) => {
    logger.warn(`Job ${jobId} stalled`);
  });

  worker.on('completed', (job) => {
    logger.debug(`Job ${job.id} completed for ${job.data.chatId}`);
  });

  logger.success(`Notifications worker запущено (concurrency: ${CONCURRENCY}, limiter: ${RATE_MAX}/${RATE_DURATION}ms)`);
  return worker;
}

async function closeQueue() {
  try {
    if (worker) {
      await worker.close();
      logger.info('Worker closed');
    }
    await notificationsQueue.close();
    logger.info('Queue closed');
    try { await queueConnection?.disconnect?.(); } catch (_) { /* already closed */ }
    try { await workerConnection?.disconnect?.(); } catch (_) { /* already closed */ }
    logger.success('Notifications queue та Redis з\'єднання закрито');
  } catch (err) {
    logger.error('Помилка закриття queue:', { error: err.message });
  }
}

async function getQueueStats() {
  try {
    const counts = await notificationsQueue.getJobCounts('active', 'completed', 'failed', 'delayed', 'waiting');
    return counts;
  } catch (err) {
    logger.error('Помилка отримання статистики черги:', { error: err.message });
    return null;
  }
}

module.exports = { notificationsQueue, initWorker, closeQueue, getQueueStats };
