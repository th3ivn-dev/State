const { Queue, Worker } = require('bullmq');
const connection = require('./connection');
const { InputFile } = require('grammy');
const { isTelegramUserInactiveError } = require('../utils/errorHandler');
const usersDb = require('../database/users');

let bot = null;
let worker = null;

const notificationsQueue = new Queue('notifications', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

function initWorker(botInstance) {
  bot = botInstance;

  worker = new Worker(
    'notifications',
    async (job) => {
      const { type, chatId, text, photo, photoFilename, options, meta } = job.data;

      let sentMessage;

      if (type === 'photo' && photo) {
        const photoBuffer = Buffer.from(photo, 'base64');
        const photoInput = new InputFile(photoBuffer, photoFilename || 'schedule.png');
        sentMessage = await bot.api.sendPhoto(chatId, photoInput, options || {});
      } else {
        sentMessage = await bot.api.sendMessage(chatId, text, options || {});
      }

      // Оновлення message_id в БД після успішної відправки
      if (sentMessage && sentMessage.message_id && meta) {
        if (meta.updateLastScheduleMessageId && meta.telegramId) {
          await usersDb.updateLastScheduleMessageId(meta.telegramId, sentMessage.message_id);
        }
        if (meta.updateUserPostId && meta.userId) {
          await usersDb.updateUserPostId(meta.userId, sentMessage.message_id);
        }
      }

      return sentMessage ? { message_id: sentMessage.message_id } : null;
    },
    {
      connection,
      concurrency: 15,
      limiter: { max: 20, duration: 1000 },
    }
  );

  worker.on('failed', (job, err) => {
    if (err && err.error_code === 429) {
      console.log(`⏳ Rate limit для ${job?.data?.chatId}, retry...`);
    } else if (isTelegramUserInactiveError(err)) {
      console.log(`ℹ️ Користувач ${job?.data?.chatId} заблокував бота або недоступний`);
      const meta = job?.data?.meta;
      if (meta?.telegramId) {
        usersDb.setUserActive(meta.telegramId, false).catch(() => {});
      }
    } else {
      console.error(`❌ Помилка відправки для ${job?.data?.chatId}:`, err?.message);
    }
  });

  worker.on('error', (err) => {
    console.error('❌ Notifications worker помилка:', err.message);
  });

  console.log('✅ Notifications worker запущено (concurrency: 15, limiter: 20/s)');
  return worker;
}

async function closeQueue() {
  if (worker) {
    await worker.close();
  }
  await notificationsQueue.close();
  console.log('✅ Notifications queue закрито');
}

module.exports = { notificationsQueue, initWorker, closeQueue };
