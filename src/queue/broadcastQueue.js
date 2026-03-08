const { Queue, Worker, UnrecoverableError } = require('bullmq');
const { createConnection } = require('./connection');
const { isTelegramUserInactiveError } = require('../utils/errorHandler');
const { createLogger } = require('../utils/logger');

const logger = createLogger('BroadcastQueue');

const CONCURRENCY = parseInt(process.env.BROADCAST_CONCURRENCY || '25', 10);
const RATE_MAX = parseInt(process.env.BROADCAST_RATE_MAX || '25', 10);
const RATE_DURATION = parseInt(process.env.BROADCAST_RATE_DURATION || '1000', 10);
const PROGRESS_INTERVAL_MS = 5000;

let bot = null;
let worker = null;

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
 * @param {object} bot - Bot instance
 * @param {string|number} adminChatId - Admin chat ID for progress updates
 * @param {number} progressMessageId - Message ID to edit with progress
 * @param {string} broadcastText - Full broadcast text (with header)
 * @param {object} msgOptions - Options for sendMessage (parse_mode, reply_markup)
 * @param {number} total - Total active user count (for display)
 */
async function runBroadcast(botInstance, adminChatId, progressMessageId, broadcastText, msgOptions, total) {
  const usersDb = require('../database/users');
  const broadcastId = `broadcast_${Date.now()}`;
  const redisKey = {
    sent: `broadcast:${broadcastId}:sent`,
    failed: `broadcast:${broadcastId}:failed`,
    total: `broadcast:${broadcastId}:total`,
  };

  // Reset counters
  await queueConnection.set(redisKey.sent, 0);
  await queueConnection.set(redisKey.failed, 0);
  await queueConnection.set(redisKey.total, 0);

  let jobCount = 0;

  for await (const page of usersDb.paginateActiveUsers(500)) {
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

  await queueConnection.set(redisKey.total, jobCount);

  // Poll progress every PROGRESS_INTERVAL_MS until all jobs are done
  const displayTotal = total || jobCount;
  let lastSent = 0;
  let lastFailed = 0;

  await new Promise((resolve) => {
    const interval = setInterval(async () => {
      try {
        const [sentRaw, failedRaw, totalRaw] = await Promise.all([
          queueConnection.get(redisKey.sent),
          queueConnection.get(redisKey.failed),
          queueConnection.get(redisKey.total),
        ]);

        const sent = parseInt(sentRaw || '0', 10);
        const failed = parseInt(failedRaw || '0', 10);
        const totalJobs = parseInt(totalRaw || String(jobCount), 10);

        if (sent !== lastSent || failed !== lastFailed) {
          lastSent = sent;
          lastFailed = failed;
          botInstance.api.editMessageText(
            adminChatId,
            progressMessageId,
            `📤 Відправлено: ${sent}/${displayTotal} (помилок: ${failed})`
          ).catch(() => {});
        }

        if (sent + failed >= totalJobs) {
          clearInterval(interval);

          // Final summary
          const summary =
            `✅ <b>Розсилка завершена!</b>\n\n` +
            `📤 Відправлено: ${sent}\n` +
            `❌ Помилок: ${failed}`;

          botInstance.api.editMessageText(adminChatId, progressMessageId, summary, {
            parse_mode: 'HTML',
          }).catch(() => {});

          // Cleanup Redis keys
          queueConnection.del(redisKey.sent, redisKey.failed, redisKey.total).catch(() => {});

          resolve();
        }
      } catch (err) {
        logger.error(`Помилка polling прогресу: ${err.message}`);
      }
    }, PROGRESS_INTERVAL_MS);
  });
}

function initBroadcastWorker(botInstance) {
  bot = botInstance;

  worker = new Worker(
    'broadcast',
    async (job) => {
      if (job.name !== 'send') return;

      const { telegramId, text, options, broadcastId, redisKey } = job.data;

      await bot.api.sendMessage(telegramId, text, options || {});

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

    // On terminal failures (not retried further) — increment failed counter
    if (job?.attemptsMade >= (job?.opts?.attempts || 3) || err instanceof UnrecoverableError) {
      if (redisKey) {
        await workerConnection.incr(redisKey.failed).catch(() => {});
      }
      if (isTelegramUserInactiveError(err)) {
        logger.info(`Broadcast: користувач ${telegramId} заблокував бота — пропущено`);
      } else {
        logger.error(`Broadcast: помилка відправки для ${telegramId}: ${err?.message}`);
      }
    }
  });

  worker.on('error', (err) => {
    logger.error(`Broadcast worker помилка: ${err.message}`);
  });

  logger.success(`Broadcast worker запущено (concurrency: ${CONCURRENCY}, limiter: ${RATE_MAX}/${RATE_DURATION}ms)`);
  return worker;
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
};
