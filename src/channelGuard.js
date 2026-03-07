const cron = require('node-cron');
const usersDb = require('./database/users');
const { cleanOldSchedules } = require('./database/scheduleHistory');
const logger = require('./utils/logger');

let bot = null;

// Initialize channel guard with daily check at 03:00
function initChannelGuard(botInstance) {
  bot = botInstance;
  logger.info('🛡️ Ініціалізація захисту каналів...');

  // Schedule daily check at 03:00
  cron.schedule('0 3 * * *', async () => {
    logger.info('🔍 Виконання щоденної перевірки каналів...');
    await verifyAllChannels();

    // Clean old schedule history
    logger.info('🧹 Очищення старої історії графіків...');
    await cleanOldSchedules();
  });

  logger.info('✅ Захист каналів запущено (перевірка щодня о 03:00)');
}

// Verify all channels for branding compliance
async function verifyAllChannels() {
  try {
    const users = await usersDb.getUsersWithChannelsForVerification();

    if (users.length === 0) {
      logger.info('ℹ️ Немає каналів для перевірки');
      return;
    }

    logger.info(`Перевірка ${users.length} каналів...`);

    for (const user of users) {
      try {
        await verifyChannelBranding(user);
      } catch (error) {
        logger.error(`Помилка перевірки каналу для користувача ${user.telegram_id}:`, { message: error.message });
      }
    }

    logger.info('✅ Перевірка каналів завершена');
  } catch (error) {
    logger.error('Помилка при перевірці каналів', { error });
  }
}

// Verify single channel branding
async function verifyChannelBranding(user) {
  // Skip already blocked channels
  if (user.channel_status === 'blocked') {
    return;
  }

  try {
    // Get current channel info
    const chatInfo = await bot.api.getChat(user.channel_id);

    const currentTitle = chatInfo.title || '';
    const currentDescription = chatInfo.description || '';
    let currentPhotoFileId = null;

    if (chatInfo.photo && chatInfo.photo.big_file_id) {
      currentPhotoFileId = chatInfo.photo.big_file_id;
    }

    // Check for violations
    const violations = [];

    if (currentTitle !== user.channel_title) {
      violations.push('назву');
      logger.info(`[${user.telegram_id}] Змінено назву: "${user.channel_title}" -> "${currentTitle}"`);
    }

    if (currentDescription !== user.channel_description) {
      violations.push('опис');
      logger.info(`[${user.telegram_id}] Змінено опис`);
    }

    if (user.channel_photo_file_id && currentPhotoFileId !== user.channel_photo_file_id) {
      violations.push('фото');
      logger.info(`[${user.telegram_id}] Змінено фото`);
    }

    // If violations found, check if change was made through bot recently (within 24 hours)
    if (violations.length > 0) {
      let shouldBlock = true;

      // Check if change was made through bot recently
      if (user.channel_branding_updated_at) {
        const updatedAt = new Date(user.channel_branding_updated_at);
        const now = new Date();
        const hoursSinceUpdate = (now - updatedAt) / (1000 * 60 * 60);

        // If change was made less than 24 hours ago through bot, don't block
        if (hoursSinceUpdate < 24) {
          logger.info(`[${user.telegram_id}] Зміна була зроблена через бота ${hoursSinceUpdate.toFixed(1)} годин тому - пропускаємо`);
          shouldBlock = false;
        }
      }

      if (shouldBlock) {
        logger.info(`⚠️ Виявлено порушення для користувача ${user.telegram_id}: ${violations.join(', ')}`);

        // Update channel status to blocked
        await usersDb.updateChannelStatus(user.telegram_id, 'blocked');

        // Send notification to user
        const violationText = violations.join('/');
        const message =
          `⚠️ <b>Виявлено зміни в каналі "${user.channel_title}"</b>\n\n` +
          `Ви змінили ${violationText} каналу, що заборонено\n` +
          `правилами використання СвітлоБот.\n\n` +
          `🔴 <b>Моніторинг зупинено.</b>\n\n` +
          `Щоб відновити роботу, перейдіть в:\n` +
          `Налаштування → Канал → Підключити канал`;

        try {
          await bot.api.sendMessage(user.telegram_id, message);
        } catch (sendError) {
          logger.error(`Не вдалося надіслати повідомлення користувачу ${user.telegram_id}:`, { message: sendError.message });
        }

        logger.info(`🔴 Канал користувача ${user.telegram_id} заблоковано`);
      }
    }

  } catch (error) {
    // If channel is not accessible (deleted, bot removed, etc.), we don't block it
    // Just log the error
    logger.error(`Не вдалося перевірити канал ${user.channel_id}:`, { message: error.message });
  }
}

// Function to check and migrate existing users
async function checkExistingUsers(botInstance) {
  bot = botInstance;

  try {
    // Get all users with channels but without proper branding
    // Also exclude users who have already been notified (migration_notified = 1)
    const { pool } = require('./database/db');
    const result = await pool.query(`
      SELECT * FROM users 
      WHERE channel_id IS NOT NULL 
      AND (channel_title IS NULL OR channel_title = '')
      AND channel_status != 'blocked'
      AND (migration_notified IS NULL OR migration_notified = 0)
      AND is_active = true
    `);

    const users = result.rows;

    if (users.length === 0) {
      logger.info('✅ Всі існуючі канали налаштовані правильно');
      return;
    }

    logger.info(`⚠️ Знайдено ${users.length} каналів без правильного брендування`);

    // Block these channels and notify users
    for (const user of users) {
      try {
        // Verify the channel actually needs migration by checking current state
        let needsMigration = false;

        try {
          const chatInfo = await bot.api.getChat(user.channel_id);
          const currentTitle = chatInfo.title || '';

          // Check if title doesn't start with "СвітлоБот ⚡️ " prefix
          if (!currentTitle.startsWith('СвітлоБот ⚡️ ')) {
            needsMigration = true;
          }
        } catch (error) {
          // If we can't access the channel, skip this user
          logger.info(`[${user.telegram_id}] Не вдалося перевірити канал: ${error.message}`);
          continue;
        }

        if (!needsMigration) {
          // Channel is actually properly configured, just update database
          logger.info(`[${user.telegram_id}] Канал вже правильно налаштований, оновлюємо БД`);
          // Don't send notification, channel is fine
          continue;
        }

        // Update channel status to blocked and mark as notified
        await usersDb.updateChannelStatus(user.telegram_id, 'blocked');

        // Mark user as notified about migration
        await pool.query('UPDATE users SET migration_notified = 1 WHERE telegram_id = $1', [user.telegram_id]);

        // Send migration notification
        const message =
          `⚠️ <b>Оновлення СвітлоБот!</b>\n\n` +
          `Тепер всі канали мають використовувати стандартний формат:\n` +
          `• Назва: СвітлоБот ⚡️ {ваша назва}\n` +
          `• Фото: стандартне фото СвітлоБот\n\n` +
          `🔴 <b>Моніторинг вашого каналу зупинено.</b>\n\n` +
          `Щоб продовжити роботу, перейдіть в:\n` +
          `Налаштування → Канал → Підключити канал`;

        await bot.api.sendMessage(user.telegram_id, message);
        logger.info(`📧 Надіслано повідомлення про міграцію користувачу ${user.telegram_id}`);
      } catch (error) {
        logger.error(`Помилка надсилання повідомлення користувачу ${user.telegram_id}:`, { message: error.message });
      }
    }

    logger.info('✅ Міграція існуючих користувачів завершена');
  } catch (error) {
    logger.error('Помилка при перевірці існуючих користувачів', { error });
  }
}

module.exports = {
  initChannelGuard,
  verifyAllChannels,
  checkExistingUsers,
};
