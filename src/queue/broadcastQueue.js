const { Queue, Worker, UnrecoverableError } = require('bullmq');
const { createConnection } = require('./connection');
const { isTelegramUserInactiveError } = require('../utils/errorHandler');
const usersDb = require('../database/users');
const { createLogger } = require('../utils/logger');

const logger = createLogger('BroadcastQueue');

const CONCURRENCY = parseInt(process.env.BROADCAST_CONCURRENCY || '25', 10);
const RATE_MAX = parseInt(process.env.BROADCAST_RATE_MAX || '25', 10);
const RATE_DURATION = parseInt(process.env.BROADCAST_RATE_DURATION || '1000', 10);
const PROGRESS_INTERVAL_MS = 5000;
/** Maximum time (ms) to wait for a broadcast to finish before giving up on polling */
const BROADCAST_TIMEOUT_MS = parseInt(process.env.BROADCAST_TIMEOUT_MS || String(2 * 60 * 60 * 1000), 10); // 2 hours
/** TTL (seconds) for Redis progress-tracking keys — auto-cleanup on crash */
const REDIS_KEY_TTL = 4 * 60 * 60; // 4 hours
/** Page size when loading users from DB for job creation */
const PAGINATION_SIZE = 1000;

let bot = null;
let worker = null;
/** Currently running broadcast ID (prevents concurrent broadcasts) */
let activeBroadcastId = null;

const queueConnection = createConnection();
const workerConnection = createConnection();

const broadcastQueue = new Queue('broadcast', {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: { count: 100 },
  },
});

/**
 * Add all broadcast jobs to the queue and poll progress, updating the admin.
 * @param {object} botInstance - Bot instance
 * @param {string|number} adminChatId - Admin chat ID for progress updates
 * @param {number} progressMessageId - Message ID to edit with progress
 * @param {string} broadcastText - Full broadcast text (with header)
 * @param {object} msgOptions - Options for sendMessage (parse_mode, reply_markup)
 * @param {number} total - Total active user count (for display)
 */
async function runBroadcast(botInstance, adminChatId, progressMessageId, broadcastText, msgOptions, total) {
  // Prevent concurrent broadcasts
  if (activeBroadcastId) {
    throw new Error(`Broadcast already in progress: ${activeBroadcastId}`);
  }

  const broadcastId = `broadcast_${Date.now()}`;
  activeBroadcastId = broadcastId;

  const redisKey = {
    sent: `broadcast:${broadcastId}:sent`,
    failed: `broadcast:${broadcastId}:failed`,
    total: `broadcast:${broadcastId}:total`,
  };

  try {
    // Reset counters with TTL to prevent Redis key leaks on crash
    const pipeline = queueConnection.pipeline();
    pipeline.set(redisKey.sent, 0, 'EX', REDIS_KEY_TTL);
    pipeline.set(redisKey.failed, 0, 'EX', REDIS_KEY_TTL);
    pipeline.set(redisKey.total, 0, 'EX', REDIS_KEY_TTL);
    await pipeline.exec();

    let jobCount = 0;

    for await (const page of usersDb.paginateActiveUsers(PAGINATION_SIZE)) {
      const jobs = page.map(user => ({
        name: 'send',
        data: {
          telegramId: user.telegram_id,
          text: broadcastText,
          options: msgOptions,
          broadcastId,
          redisKey,
          adminChatId,
        },
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
          removeOnFail: { count: 100 },
        },
      }));
      await broadcastQueue.addBulk(jobs);
      jobCount += jobs.length;
    }

    if (jobCount === 0) {
      return;
    }

    await queueConnection.set(redisKey.total, jobCount, 'EX', REDIS_KEY_TTL);

    // Poll progress every PROGRESS_INTERVAL_MS until all jobs are done or timeout
    const displayTotal = total || jobCount;
    let lastSent = 0;
    let lastFailed = 0;
    const startTime = Date.now();

    await new Promise((resolve) => {
      const interval = setInterval(async () => {
        try {
          // Timeout protection — stop polling after BROADCAST_TIMEOUT_MS
          if (Date.now() - startTime > BROADCAST_TIMEOUT_MS) {
            clearInterval(interval);
            logger.warn(`Broadcast ${broadcastId} polling timed out after ${BROADCAST_TIMEOUT_MS}ms`);

            if (progressMessageId) {
              botInstance.api.editMessageText(
                adminChatId,
                progressMessageId,
                `⚠️ <b>Розсилка перевищила час очікування</b>\n\n` +
                `📤 Відправлено: ${lastSent}\n` +
                `❌ Помилок: ${lastFailed}\n\n` +
                `Залишок повідомлень буде доставлено у фоновому режимі.`,
                { parse_mode: 'HTML' }
              ).catch(() => {});
            }

            resolve();
            return;
          }

          const [sentRaw, failedRaw, totalRaw] = await Promise.all([
            queueConnection.get(redisKey.sent),
            queueConnection.get(redisKey.failed),
            queueConnection.get(redisKey.total),
          ]);

          const sent = parseInt(sentRaw || '0', 10);
          const failed = parseInt(failedRaw || '0', 10);
          const totalJobs = parseInt(totalRaw || String(jobCount), 10);

          if (progressMessageId && (sent !== lastSent || failed !== lastFailed)) {
            lastSent = sent;
            lastFailed = failed;

            const percent = totalJobs > 0 ? Math.round(((sent + failed) / totalJobs) * 100) : 0;
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            const speed = elapsed > 0 ? Math.round(sent / elapsed) : 0;

            botInstance.api.editMessageText(
              adminChatId,
              progressMessageId,
              `📤 Відправлено: ${sent}/${displayTotal} (помилок: ${failed})\n` +
              `📊 Прогрес: ${percent}% | ⚡ ${speed} msg/s`
            ).catch(() => {});
          }

          if (sent + failed >= totalJobs) {
            clearInterval(interval);

            const elapsed = Math.round((Date.now() - startTime) / 1000);
            const speed = elapsed > 0 ? Math.round(sent / elapsed) : 0;

            // Final summary
            const summary =
              `✅ <b>Розсилка завершена!</b>\n\n` +
              `📤 Відправлено: ${sent}\n` +
              `❌ Помилок: ${failed}\n` +
              `⏱ Час: ${elapsed}с | ⚡ ${speed} msg/s`;

            if (progressMessageId) {
              botInstance.api.editMessageText(adminChatId, progressMessageId, summary, {
                parse_mode: 'HTML',
              }).catch(() => {});
            }

            // Cleanup Redis keys
            queueConnection.del(redisKey.sent, redisKey.failed, redisKey.total).catch(() => {});

            resolve();
          }
        } catch (err) {
          logger.error(`Помилка polling прогресу: ${err.message}`);
        }
      }, PROGRESS_INTERVAL_MS);
    });
  } finally {
    activeBroadcastId = null;
  }
}

function initBroadcastWorker(botInstance) {
  bot = botInstance;

  worker = new Worker(
    'broadcast',
    async (job) => {
      if (job.name !== 'send') return;

      const { telegramId, text, options, redisKey } = job.data;

      try {
        await bot.api.sendMessage(telegramId, text, options || {});
      } catch (err) {
        // Handle Telegram 429 flood control — respect retry_after
        if (err.error_code === 429 || err.message?.includes('Too Many Requests')) {
          const retryAfter = err.parameters?.retry_after || 5;
          logger.warn(`Broadcast: 429 flood control for ${telegramId}, retry after ${retryAfter}s`);
          // Re-throw with delay info so BullMQ retries with proper backoff
          const retryError = new Error(`Too Many Requests: retry after ${retryAfter}s`);
          retryError.retryAfter = retryAfter;
          throw retryError;
        }

        // User blocked/deactivated — mark inactive and treat as unrecoverable
        if (isTelegramUserInactiveError(err)) {
          usersDb.setUserActive(telegramId, false).catch(() => {});
          throw new UnrecoverableError(`User ${telegramId} inactive: ${err.message}`);
        }

        // Other errors — rethrow for BullMQ retry
        throw err;
      }

      // Increment sent counter
      if (redisKey) {
        await workerConnection.incr(redisKey.sent);
      }
    },
    {
      connection: workerConnection,
      concurrency: CONCURRENCY,
      limiter: { max: RATE_MAX, duration: RATE_DURATION },
    }
  );

  worker.on('failed', async (job, err) => {
    const telegramId = job?.data?.telegramId;
    const redisKey = job?.data?.redisKey;
    const maxAttempts = job?.opts?.attempts ?? 3;

    // On terminal failures (not retried further) — increment failed counter
    if ((job?.attemptsMade ?? 0) >= maxAttempts || err instanceof UnrecoverableError) {
      if (redisKey) {
        await workerConnection.incr(redisKey.failed).catch(() => {});
      }
      if (isTelegramUserInactiveError(err) || (err.message && err.message.includes('inactive'))) {
        logger.info(`Broadcast: користувач ${telegramId} заблокував бота — пропущено`);
      } else {
        logger.error(`Broadcast: помилка відправки для ${telegramId}: ${err?.message}`);
      }
    }
  });

  worker.on('error', (err) => {
    logger.error(`Broadcast worker помилка: ${err.message}`);
  });

  worker.on('stalled', (jobId) => {
    logger.warn(`Broadcast job ${jobId} stalled`);
  });

  logger.success(`Broadcast worker запущено (concurrency: ${CONCURRENCY}, limiter: ${RATE_MAX}/${RATE_DURATION}ms)`);
  return worker;
}

/**
 * Check if a broadcast is currently in progress.
 * @returns {boolean}
 */
function isBroadcastRunning() {
  return activeBroadcastId !== null;
}

async function closeBroadcastQueue() {
  try {
    if (worker) {
      await worker.close();
      logger.info('Broadcast worker closed');
    }
    await broadcastQueue.close();
    logger.info('Broadcast queue closed');
    await queueConnection.disconnect().catch(() => {});
    await workerConnection.disconnect().catch(() => {});
    logger.success('Broadcast queue та Redis з\'єднання закрито');
  } catch (err) {
    logger.error('Помилка закриття broadcast queue:', { error: err.message });
  }
}

module.exports = {
  broadcastQueue,
  runBroadcast,
  initBroadcastWorker,
  closeBroadcastQueue,
  isBroadcastRunning,
};
