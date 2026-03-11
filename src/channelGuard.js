const cron = require('node-cron');
const usersDb = require('./database/users');
const { cleanOldSchedules } = require('./database/scheduleHistory');

let bot = null;

/**
 * Normalizes text for reliable comparison.
 * Telegram API may trim, collapse whitespace, or alter line breaks
 * compared to what was originally set, so we normalize before comparing.
 */
function normalizeText(text) {
  return (text || '').trim().replace(/\s+/g, ' ');
}

// Initialize channel guard with daily check at 03:00
function initChannelGuard(botInstance) {
  bot = botInstance;
  console.log('🛡️ Ініціалізація захисту каналів...');

  // Schedule daily check at 03:00
  cron.schedule('0 3 * * *', async () => {
    console.log('🔍 Виконання щоденної перевірки каналів...');
    await verifyAllChannels();

    // Clean old schedule history
    console.log('🧹 Очищення старої історії графіків...');
    await cleanOldSchedules();
  });

  console.log('✅ Захист каналів запущено (перевірка щодня о 03:00)');
}

// Verify all channels for branding compliance
async function verifyAllChannels() {
  try {
    const users = await usersDb.getUsersWithChannelsForVerification();

    if (users.length === 0) {
      console.log('ℹ️ Немає каналів для перевірки');
      return;
    }

    console.log(`Перевірка ${users.length} каналів...`);

    for (const user of users) {
      try {
        await verifyChannelBranding(user);
      } catch (error) {
        console.error(`Помилка перевірки каналу для користувача ${user.telegram_id}:`, error.message);
      }
    }

    console.log('✅ Перевірка каналів завершена');
  } catch (error) {
    console.error('Помилка при перевірці каналів:', error);
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

    if (normalizeText(currentTitle) !== normalizeText(user.channel_title)) {
      violations.push('назву');
      console.log(`[${user.telegram_id}] Змінено назву: "${user.channel_title}" -> "${currentTitle}"`);
    }

    if (normalizeText(currentDescription) !== normalizeText(user.channel_description)) {
      violations.push('опис');
      console.log(`[${user.telegram_id}] Змінено опис`);
    }

    if (user.channel_photo_file_id && !currentPhotoFileId) {
      // Photo was completely removed — real violation
      violations.push('фото');
      console.log(`[${user.telegram_id}] Фото каналу видалено`);
    } else if (user.channel_photo_file_id && currentPhotoFileId && currentPhotoFileId !== user.channel_photo_file_id) {
      // file_id changed but photo still exists — Telegram regenerated the file_id
      // Silently update the stored file_id in the database
      try {
        await usersDb.updateChannelBrandingPartial(user.telegram_id, {
          channelPhotoFileId: currentPhotoFileId
        });
        console.log(`[${user.telegram_id}] Photo file_id оновлено в БД (Telegram regeneration)`);
      } catch (updateError) {
        console.error(`[${user.telegram_id}] Не вдалося оновити photo file_id:`, updateError.message);
      }
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
          console.log(`[${user.telegram_id}] Зміна була зроблена через бота ${hoursSinceUpdate.toFixed(1)} годин тому - пропускаємо`);
          shouldBlock = false;
        }
      }

      if (shouldBlock) {
        // Two-strike system: first violation → warning, second consecutive → block
        const currentWarnings = user.channel_guard_warnings || 0;

        if (currentWarnings === 0) {
          // First strike — warn, don't block yet
          console.log(`⚠️ [${user.telegram_id}] Перше попередження: ${violations.join(', ')}`);
          await usersDb.incrementChannelGuardWarnings(user.telegram_id);

          // Send warning to user (not blocking)
          const warningMessage =
            `⚠️ <b>Увага! Виявлено зміни в каналі "${user.channel_title}"</b>\n\n` +
            `Змінено: ${violations.join('/')}\n\n` +
            `Якщо ви не змінювали канал — ігноруйте це повідомлення.\n` +
            `Якщо зміни справжні — поверніть налаштування, інакше\n` +
            `моніторинг буде зупинено при наступній перевірці.`;

          try {
            await bot.api.sendMessage(user.telegram_id, warningMessage, { parse_mode: 'HTML' });
          } catch (sendError) {
            console.error(`Не вдалося надіслати попередження ${user.telegram_id}:`, sendError.message);
          }
        } else {
          // Second strike — block the channel
          console.log(`🔴 [${user.telegram_id}] Повторне порушення (warnings: ${currentWarnings}), блокуємо канал: ${violations.join(', ')}`);
          await usersDb.updateChannelStatus(user.telegram_id, 'blocked');
          await usersDb.resetChannelGuardWarnings(user.telegram_id);

          const blockMessage =
            `⚠️ <b>Виявлено зміни в каналі "${user.channel_title}"</b>\n\n` +
            `Ви змінили ${violations.join('/')} каналу, що заборонено\n` +
            `правилами використання СвітлоБот.\n\n` +
            `🔴 <b>Моніторинг зупинено.</b>\n\n` +
            `Щоб відновити роботу, перейдіть в:\n` +
            `Налаштування → Канал → Підключити канал`;

          try {
            await bot.api.sendMessage(user.telegram_id, blockMessage, { parse_mode: 'HTML' });
          } catch (sendError) {
            console.error(`Не вдалося надіслати повідомлення ${user.telegram_id}:`, sendError.message);
          }

          console.log(`🔴 Канал користувача ${user.telegram_id} заблоковано`);
        }
      }
    } else {
      // No violations — reset warning counter if it was incremented
      if (user.channel_guard_warnings > 0) {
        await usersDb.resetChannelGuardWarnings(user.telegram_id);
        console.log(`[${user.telegram_id}] Порушень не знайдено, лічильник попереджень скинуто`);
      }
    }

  } catch (error) {
    // If channel is not accessible (deleted, bot removed, etc.), we don't block it
    // Just log the error
    console.error(`Не вдалося перевірити канал ${user.channel_id}:`, error.message);
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
      console.log('✅ Всі існуючі канали налаштовані правильно');
      return;
    }

    console.log(`⚠️ Знайдено ${users.length} каналів без правильного брендування`);

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
          console.log(`[${user.telegram_id}] Не вдалося перевірити канал: ${error.message}`);
          continue;
        }

        if (!needsMigration) {
          // Channel is actually properly configured, just update database
          console.log(`[${user.telegram_id}] Канал вже правильно налаштований, оновлюємо БД`);
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

        await bot.api.sendMessage(user.telegram_id, message, { parse_mode: 'HTML' });
        console.log(`📧 Надіслано повідомлення про міграцію користувачу ${user.telegram_id}`);
      } catch (error) {
        console.error(`Помилка надсилання повідомлення користувачу ${user.telegram_id}:`, error.message);
      }
    }

    console.log('✅ Міграція існуючих користувачів завершена');
  } catch (error) {
    console.error('Помилка при перевірці існуючих користувачів:', error);
  }
}

module.exports = {
  initChannelGuard,
  verifyAllChannels,
  checkExistingUsers,
};
