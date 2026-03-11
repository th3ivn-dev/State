const cron = require('node-cron');
const usersDb = require('./database/users');
const { cleanOldSchedules } = require('./database/scheduleHistory');
const {
  CHANNEL_GUARD_BATCH_SIZE,
  CHANNEL_GUARD_DELAY_BETWEEN_BATCHES_MS,
  CHANNEL_GUARD_DELAY_BETWEEN_REQUESTS_MS,
  CHANNEL_GUARD_RETRY_ATTEMPTS,
  CHANNEL_GUARD_RETRY_BASE_DELAY_MS,
  CHANNEL_GUARD_BRANDING_GRACE_HOURS,
  CHANNEL_GUARD_CRON,
} = require('./constants/timeouts');

let bot = null;

/**
 * Normalizes text for reliable comparison.
 * Telegram API may trim, collapse whitespace, or alter line breaks
 * compared to what was originally set, so we normalize before comparing.
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeText(text) {
  return (text || '').trim().replace(/\s+/g, ' ');
}

/**
 * Returns a promise that resolves after the specified delay.
 * @param {number} ms - Delay in milliseconds
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries an async function with exponential backoff.
 * Retries on transient errors (network, 429, 5xx). Does NOT retry on permanent errors (chat not found, bot kicked, etc.).
 * @param {Function} fn - Async function to execute
 * @param {number} [maxRetries=CHANNEL_GUARD_RETRY_ATTEMPTS] - Maximum retry attempts
 * @param {number} [baseDelay=CHANNEL_GUARD_RETRY_BASE_DELAY_MS] - Base delay in ms
 * @returns {Promise<*>} - Result of fn()
 */
async function retryWithBackoff(fn, maxRetries = CHANNEL_GUARD_RETRY_ATTEMPTS, baseDelay = CHANNEL_GUARD_RETRY_BASE_DELAY_MS) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRetryable = error.error_code === 429
        || error.error_code >= 500
        || error.code === 'ECONNRESET'
        || error.code === 'ETIMEDOUT'
        || error.code === 'ENOTFOUND';

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      const retryAfter = error.parameters?.retry_after
        ? error.parameters.retry_after * 1000
        : baseDelay * Math.pow(2, attempt);

      console.log(`[retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${retryAfter}ms...`);
      await delay(retryAfter);
    }
  }
}

/**
 * Initializes the channel guard module.
 * Schedules a daily cron job to verify channel branding compliance
 * and a separate cron job for schedule history cleanup.
 * @param {Object} botInstance - Grammy bot instance
 */
function initChannelGuard(botInstance) {
  bot = botInstance;
  console.log('🛡️ Ініціалізація захисту каналів...');

  // Schedule daily check
  cron.schedule(CHANNEL_GUARD_CRON, async () => {
    console.log('🔍 Виконання щоденної перевірки каналів...');
    await verifyAllChannels();
  });

  // Separate cron for schedule history cleanup
  cron.schedule('30 3 * * *', async () => {
    console.log('🧹 Очищення старої історії графіків...');
    await cleanOldSchedules();
  });

  console.log('✅ Захист каналів запущено (перевірка щодня о 03:00)');
}

/**
 * Verifies all channels for branding compliance.
 * Processes channels in batches to respect Telegram rate limits
 * and collects run statistics.
 * @returns {Promise<void>}
 */
async function verifyAllChannels() {
  try {
    const users = await usersDb.getUsersWithChannelsForVerification();

    if (users.length === 0) {
      console.log('ℹ️ Немає каналів для перевірки');
      return;
    }

    console.log(`🔍 Перевірка ${users.length} каналів...`);

    const stats = { checked: 0, warnings: 0, blocked: 0, fileIdUpdated: 0, errors: 0, skipped: 0 };

    // Process in batches to respect Telegram rate limits
    for (let i = 0; i < users.length; i += CHANNEL_GUARD_BATCH_SIZE) {
      const batch = users.slice(i, i + CHANNEL_GUARD_BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (user) => {
          await delay(CHANNEL_GUARD_DELAY_BETWEEN_REQUESTS_MS * batch.indexOf(user));
          return verifyChannelBranding(user, stats);
        })
      );

      for (const result of results) {
        if (result.status === 'rejected') {
          stats.errors++;
          console.error('Неочікувана помилка в batch:', result.reason?.message || result.reason);
        }
      }

      // Pause between batches
      if (i + CHANNEL_GUARD_BATCH_SIZE < users.length) {
        await delay(CHANNEL_GUARD_DELAY_BETWEEN_BATCHES_MS);
      }
    }

    console.log(
      `📊 Перевірка завершена: ${stats.checked} перевірено, ` +
      `${stats.warnings} попереджень, ${stats.blocked} заблоковано, ` +
      `${stats.fileIdUpdated} file_id оновлено, ${stats.skipped} пропущено, ` +
      `${stats.errors} помилок`
    );
  } catch (error) {
    console.error('Помилка при перевірці каналів:', error);
  }
}

/**
 * Verifies branding compliance for a single channel.
 * Implements a two-strike warning system: first violation sends a warning,
 * second consecutive violation blocks the channel.
 * @param {Object} user - User object with channel configuration
 * @param {Object} stats - Mutable statistics object for tracking run results
 * @returns {Promise<void>}
 */
async function verifyChannelBranding(user, stats) {
  // Skip already blocked channels
  if (user.channel_status === 'blocked') {
    stats.skipped++;
    return;
  }

  try {
    // Get current channel info
    const chatInfo = await retryWithBackoff(() => bot.api.getChat(user.channel_id));

    stats.checked++;

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
        stats.fileIdUpdated++;
        console.log(`[${user.telegram_id}] Photo file_id оновлено в БД (Telegram regeneration)`);
      } catch (updateError) {
        console.error(`[${user.telegram_id}] Не вдалося оновити photo file_id:`, updateError.message);
      }
    }

    // If violations found, check if change was made through bot recently
    if (violations.length > 0) {
      let shouldBlock = true;

      // Check if change was made through bot recently
      if (user.channel_branding_updated_at) {
        const updatedAt = new Date(user.channel_branding_updated_at);
        const now = new Date();
        const hoursSinceUpdate = (now - updatedAt) / (1000 * 60 * 60);

        // If change was made within grace period through bot, don't block
        if (hoursSinceUpdate < CHANNEL_GUARD_BRANDING_GRACE_HOURS) {
          console.log(`[${user.telegram_id}] Зміна була зроблена через бота ${hoursSinceUpdate.toFixed(1)} годин тому - пропускаємо`);
          shouldBlock = false;
          stats.skipped++;
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
            await retryWithBackoff(() => bot.api.sendMessage(user.telegram_id, warningMessage, { parse_mode: 'HTML' }));
          } catch (sendError) {
            console.error(`Не вдалося надіслати попередження ${user.telegram_id}:`, sendError.message);
          }

          stats.warnings++;
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
            await retryWithBackoff(() => bot.api.sendMessage(user.telegram_id, blockMessage, { parse_mode: 'HTML' }));
          } catch (sendError) {
            console.error(`Не вдалося надіслати повідомлення ${user.telegram_id}:`, sendError.message);
          }

          stats.blocked++;
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
    stats.errors++;
    // If channel is not accessible (deleted, bot removed, etc.), we don't block it
    // Just log the error
    console.error(`Не вдалося перевірити канал ${user.channel_id}:`, error.message);
  }
}

/**
 * Checks existing users for channels that need migration to standardized branding.
 * Blocks non-compliant channels and sends migration notifications.
 * @param {Object} botInstance - Grammy bot instance
 * @returns {Promise<void>}
 */
async function checkExistingUsers(botInstance) {
  bot = botInstance;

  try {
    // Get all users with channels but without proper branding
    // Also exclude users who have already been notified (migration_notified = 1)
    const users = await usersDb.getUsersForMigrationCheck();

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
          const chatInfo = await retryWithBackoff(() => bot.api.getChat(user.channel_id));
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
        await usersDb.markMigrationNotified(user.telegram_id);

        // Send migration notification
        const message =
          `⚠️ <b>Оновлення СвітлоБот!</b>\n\n` +
          `Тепер всі канали мають використовувати стандартний формат:\n` +
          `• Назва: СвітлоБот ⚡️ {ваша назва}\n` +
          `• Фото: стандартне фото СвітлоБот\n\n` +
          `🔴 <b>Моніторинг вашого каналу зупинено.</b>\n\n` +
          `Щоб продовжити роботу, перейдіть в:\n` +
          `Налаштування → Канал → Підключити канал`;

        await retryWithBackoff(() => bot.api.sendMessage(user.telegram_id, message, { parse_mode: 'HTML' }));
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
