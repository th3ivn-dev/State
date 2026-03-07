/**
 * Notification sender for power state changes.
 * Builds and delivers Telegram messages when power goes on or off.
 */

const usersDb = require('../database/users');
const { addOutageRecord } = require('../statistics');
const { formatExactDuration, formatTime } = require('../utils');
const { formatTemplate } = require('../formatter');
const { isTelegramUserInactiveError } = require('../utils/errorHandler');
const logger = require('../utils/logger').createLogger('PowerMonitor');
const { getNextScheduledTime } = require('./scheduler');

// Minimum interval between notifications for the same user (prevents spam)
const NOTIFICATION_COOLDOWN_MS = 60 * 1000; // 60 seconds

// Lazy-loaded metrics collector (optional monitoring module)
let metricsCollector = null;
try {
  metricsCollector = require('../monitoring/metricsCollector');
} catch (_e) {
  // Monitoring not available yet, will work without it
}

// Telegram bot instance — set by startPowerMonitoring via setBot()
let bot = null;

/**
 * Provide the bot instance used to send Telegram messages.
 * Must be called before handlePowerStateChange is invoked.
 * @param {object} botInstance - Grammy bot instance
 */
function setBot(botInstance) {
  bot = botInstance;
}

/**
 * Handle a confirmed power state change for a user.
 * Builds a notification message and sends it to the user and/or their channel.
 *
 * @param {Object} user              - User record from the database
 * @param {string} newState          - 'on' | 'off'
 * @param {string} oldState          - Previous stable state
 * @param {Object} userState         - In-memory state object for the user
 * @param {*}      _originalChangeTime - Unused; kept for API compatibility
 */
async function handlePowerStateChange(user, newState, oldState, userState, _originalChangeTime = null) {
  try {
    const now = new Date();

    // Track transition from offline → online
    if (metricsCollector) {
      if (oldState === 'off' && newState === 'on') {
        metricsCollector.trackIPEvent('offlineToOnline');
      }
    }

    // Enforce cooldown to prevent notification spam
    let shouldNotify = true;

    if (userState.lastNotificationAt) {
      const timeSinceLastNotification = now - new Date(userState.lastNotificationAt);
      if (timeSinceLastNotification < NOTIFICATION_COOLDOWN_MS) {
        shouldNotify = false;
        const remainingSeconds = Math.ceil((NOTIFICATION_COOLDOWN_MS - timeSinceLastNotification) / 1000);
        console.log(`User ${user.id}: Пропуск сповіщення через cooldown (залишилось ${remainingSeconds}с)`);
      }
    }

    // Atomically update the power state in the DB and return the previous duration
    const powerResult = await usersDb.changePowerStateAndGetDuration(user.telegram_id, newState);

    const changedAt = powerResult ? powerResult.power_changed_at : new Date().toISOString();
    const changeTime = new Date(changedAt);

    // Format how long the power was in the previous state
    let durationText = '';

    if (powerResult && powerResult.duration_minutes !== null) {
      const totalDurationMinutes = Math.floor(powerResult.duration_minutes);
      logger.debug(`User ${user.id}: Duration calc from PostgreSQL: ${totalDurationMinutes}min`);

      if (totalDurationMinutes < 1) {
        durationText = 'менше хвилини';
      } else {
        durationText = formatExactDuration(totalDurationMinutes);
      }
    }

    // Determine if the outage is planned according to the schedule
    const nextEvent = await getNextScheduledTime(user);
    const { fetchScheduleData } = require('../api');
    const { parseScheduleForQueue, isCurrentlyOff } = require('../parser');

    let isScheduledOutage = false;
    try {
      const data = await fetchScheduleData(user.region);
      const scheduleData = parseScheduleForQueue(data, user.queue);
      isScheduledOutage = isCurrentlyOff(scheduleData);
    } catch (error) {
      console.error('Error checking schedule:', error);
    }

    let scheduleText = '';

    if (newState === 'off') {
      // Show expected restoration time only for planned outages
      if (isScheduledOutage && nextEvent) {
        const eventTime = formatTime(nextEvent.time);
        if (nextEvent.type === 'power_on') {
          scheduleText = `\n🗓 Світло має з'явитися: <b>${eventTime}</b>`;
        } else if (nextEvent.endTime) {
          const endTime = formatTime(nextEvent.endTime);
          scheduleText = `\n🗓 Світло має з'явитися: <b>${endTime}</b>`;
        }
      } else {
        scheduleText = '\n⚠️ Позапланове відключення';
      }
    } else {
      // Show when the next planned outage will begin
      if (nextEvent && nextEvent.type === 'power_off') {
        if (nextEvent.endTime) {
          const eventTime = formatTime(nextEvent.time);
          const endTime = formatTime(nextEvent.endTime);
          scheduleText = `\n🗓 Наступне планове: <b>${eventTime} - ${endTime}</b>`;
        } else {
          const eventTime = formatTime(nextEvent.time);
          scheduleText = `\n🗓 Наступне планове: <b>${eventTime}</b>`;
        }
      }
    }

    // Build the notification message
    let message = '';
    const kyivTime = new Date(changeTime.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
    const timeStr = `${String(kyivTime.getHours()).padStart(2, '0')}:${String(kyivTime.getMinutes()).padStart(2, '0')}`;
    const dateStr = `${String(kyivTime.getDate()).padStart(2, '0')}.${String(kyivTime.getMonth() + 1).padStart(2, '0')}.${kyivTime.getFullYear()}`;

    if (newState === 'off') {
      if (user.power_off_text) {
        message = formatTemplate(user.power_off_text, {
          time: timeStr,
          date: dateStr,
          duration: durationText || ''
        });
      } else {
        message = `🔴 <b>${timeStr} Світло зникло</b>\n`;
        message += `🕓 Воно було ${durationText || '—'}`;
        message += scheduleText;
      }

      if (oldState === 'on' && userState.lastStableAt) {
        await addOutageRecord(user.id, userState.lastStableAt, changedAt);
      }
    } else {
      if (user.power_on_text) {
        message = formatTemplate(user.power_on_text, {
          time: timeStr,
          date: dateStr,
          duration: durationText || ''
        });
      } else {
        message = `🟢 <b>${timeStr} Світло з'явилося</b>\n`;
        message += `🕓 Його не було ${durationText || '—'}`;
        message += scheduleText;
      }
    }

    const notifyTarget = user.power_notify_target || 'both';

    if (shouldNotify) {
      // Send to the user's private chat
      if (notifyTarget === 'bot' || notifyTarget === 'both') {
        try {
          await bot.api.sendMessage(user.telegram_id, message, { parse_mode: 'HTML' });
          console.log(`📱 Повідомлення про зміну стану відправлено користувачу ${user.telegram_id}`);
        } catch (error) {
          if (isTelegramUserInactiveError(error)) {
            console.log(`ℹ️ Користувач ${user.telegram_id} заблокував бота або недоступний — сповіщення вимкнено`);
            await usersDb.setUserActive(user.telegram_id, false);
          } else {
            console.error(`Помилка відправки повідомлення користувачу ${user.telegram_id}:`, error.message);
          }
          if (metricsCollector) {
            metricsCollector.trackError(error, {
              context: 'power_notification',
              userId: user.telegram_id
            });
          }
        }
      }

      // Send to the user's channel if configured and different from their private chat
      if (user.channel_id && user.channel_id !== user.telegram_id && (notifyTarget === 'channel' || notifyTarget === 'both')) {
        if (user.channel_paused) {
          console.log(`Канал користувача ${user.telegram_id} зупинено, пропускаємо публікацію в канал`);
        } else {
          try {
            await bot.api.sendMessage(user.channel_id, message, { parse_mode: 'HTML' });
            console.log(`📢 Повідомлення про зміну стану відправлено в канал ${user.channel_id}`);
          } catch (error) {
            if (isTelegramUserInactiveError(error)) {
              console.log(`ℹ️ Канал ${user.channel_id} недоступний — публікацію пропущено`);
            } else {
              console.error(`Помилка відправки повідомлення в канал ${user.channel_id}:`, error.message);
            }
            if (metricsCollector) {
              metricsCollector.trackChannelEvent('publishErrors');
              metricsCollector.trackError(error, {
                context: 'channel_power_notification',
                channelId: user.channel_id
              });
            }
          }
        }
      }

      userState.lastNotificationAt = now.toISOString();
    }

    // Update stable-state bookkeeping
    userState.lastStableAt = changedAt;
    userState.lastStableState = newState;

    // Reset instability counters
    userState.instabilityStart = null;
    userState.switchCount = 0;

  } catch (error) {
    console.error('Error handling power state change:', error);
  }
}

module.exports = {
  setBot,
  handlePowerStateChange,
};
