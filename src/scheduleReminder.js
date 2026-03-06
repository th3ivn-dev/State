/**
 * Schedule Reminder Scheduler
 *
 * Checks every minute if any user needs a reminder notification about
 * upcoming power outages or restorations, and sends appropriate messages.
 *
 * Supports 5 notification types:
 *  1. Reminder before power-off (X minutes warning)
 *  2. Fact: power went off (at scheduled time)
 *  3. Reminder before power-on (X minutes warning)
 *  4. Fact: power came back (more outages today)
 *  5. Fact: power came back (last outage of the day)
 */

const { fetchScheduleData } = require('./api');
const { parseScheduleForQueue } = require('./parser');
const { REGIONS } = require('./constants/regions');
const usersDb = require('./database/users');
const { safeSendMessage } = require('./utils/errorHandler');
const { MAX_SENT_REMINDERS_MAP_SIZE } = require('./constants/timeouts');

// In-memory tracking of already-sent reminders (cleared daily, bounded)
// Key: `${telegramId}:${eventType}:${eventTimeIso}`
const sentReminders = new Map();

let reminderInterval = null;

/**
 * Format a time object (Date) as HH:MM
 */
function formatTime(date) {
  if (!date) return '?';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Calculate duration in hours between two Date objects, formatted nicely.
 */
function formatDuration(start, end) {
  if (!start || !end) return '?';
  const diffMs = end - start;
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  if (hours === 0) return `${minutes} хв`;
  if (minutes === 0) return `${hours} год`;
  return `${hours} год ${minutes} хв`;
}

/**
 * Get all today's outage events that end after now
 */
function getTodayFutureEvents(scheduleData) {
  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return (scheduleData.events || []).filter(e => e.end > now && e.start <= todayEnd);
}

/**
 * Find the next outage event (start > now) today
 */
function getNextOutage(scheduleData) {
  const now = new Date();
  return (scheduleData.events || [])
    .filter(e => e.start > now)
    .sort((a, b) => a.start - b.start)[0] || null;
}

/**
 * Build message text for a given notification type.
 * @param {string} type - 'remind_off' | 'fact_off' | 'remind_on' | 'fact_on'
 * @param {object} event - current outage event {start, end}
 * @param {object} scheduleData - full schedule
 * @param {string} regionName - human-readable region name
 * @param {string} queue - queue string e.g. "3.1"
 * @param {number} minutesBefore - minutes before event (for reminders)
 */
function buildNotificationText(type, event, scheduleData, regionName, queue, minutesBefore) {
  const duration = formatDuration(event.start, event.end);
  const location = `🌍 ${regionName} · Черга ${queue}`;
  const period = `📋 ${formatTime(event.start)} – ${formatTime(event.end)} (${duration})`;

  if (type === 'remind_off') {
    return `⚠️ <b>Відключення через ${minutesBefore} хвилин</b>\n\n` +
      `${location}\n${period}\n💡 Увімкнення о ${formatTime(event.end)}`;
  }

  if (type === 'fact_off') {
    return `⚠️ <b>Світло відключено за графіком о ${formatTime(event.start)}</b>\n\n` +
      `${location}\n${period}\n💡 Увімкнення за графіком о ${formatTime(event.end)}`;
  }

  if (type === 'remind_on') {
    const nextOff = getNextOutage(scheduleData);
    const nextLine = nextOff
      ? `⚠️ Наступне відключення о ${formatTime(nextOff.start)}`
      : `🌙 Більше відключень сьогодні немає`;
    return `⚡️ <b>Увімкнення через ${minutesBefore} хвилин</b>\n\n` +
      `${location}\n${period}\n${nextLine}`;
  }

  if (type === 'fact_on') {
    const futureEvents = getTodayFutureEvents(scheduleData);
    // futureEvents includes current ended outage if still "today" - filter outages that start after now
    const nextOff = futureEvents.filter(e => e.start > new Date())[0] || null;
    const nextLine = nextOff
      ? `⚠️ Наступне відключення за графіком о ${formatTime(nextOff.start)}`
      : `🌙 Більше відключень сьогодні немає`;
    return `⚡️ <b>Світло увімкнено за графіком о ${formatTime(event.end)}</b>\n\n` +
      `${location}\n${period}\n${nextLine}`;
  }

  return '';
}

/**
 * Send a notification to user (bot and/or channel depending on target setting)
 */
async function sendNotification(bot, user, text) {
  const target = user.notify_remind_target || 'bot';

  if (target === 'bot' || target === 'both') {
    await safeSendMessage(bot, user.telegram_id, text, { parse_mode: 'HTML' });
  }

  if ((target === 'channel' || target === 'both') && user.channel_id) {
    await safeSendMessage(bot, user.channel_id, text, { parse_mode: 'HTML' });
  }
}

/**
 * Main check function — called every minute
 */
async function checkReminders(bot) {
  try {
    const users = await usersDb.getActiveUsersWithReminders();
    if (!users || users.length === 0) return;

    const now = new Date();
    const nowMin = now.getMinutes() + now.getHours() * 60;

    // Group users by region+queue to avoid redundant API calls
    const groups = new Map();
    for (const user of users) {
      if (!user.region || !user.queue) continue;
      const key = `${user.region}:${user.queue}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(user);
    }

    for (const [key, groupUsers] of groups) {
      const [region, queue] = key.split(':');
      let rawData;
      try {
        rawData = await fetchScheduleData(region);
      } catch (_e) {
        continue;
      }
      if (!rawData) continue;

      const scheduleData = parseScheduleForQueue(rawData, queue);
      if (!scheduleData || !scheduleData.hasData) continue;

      const regionName = REGIONS[region]?.name || region;

      for (const user of groupUsers) {
        const telegramId = user.telegram_id;

        // Determine which reminder times are enabled
        const reminderMinutes = [];
        if (user.remind_15m !== false) reminderMinutes.push(15);
        if (user.remind_30m === true) reminderMinutes.push(30);
        if (user.remind_1h === true) reminderMinutes.push(60);

        const events = scheduleData.events || [];

        for (const event of events) {
          const offMin = event.start.getHours() * 60 + event.start.getMinutes();
          const onMin = event.end.getHours() * 60 + event.end.getMinutes();
          const offKey = `${event.start.toISOString()}`;
          const onKey = `${event.end.toISOString()}`;

          // Reminder before power-off
          if (user.notify_remind_off !== false) {
            for (const mins of reminderMinutes) {
              if (nowMin === offMin - mins && event.start > now) {
                const rKey = `${telegramId}:remind_off:${offKey}:${mins}`;
                if (!sentReminders.has(rKey)) {
                  sentReminders.set(rKey, Date.now());
                  const text = buildNotificationText('remind_off', event, scheduleData, regionName, queue, mins);
                  await sendNotification(bot, user, text);
                }
              }
            }
          }

          // Fact: power went off
          if (user.notify_fact_off !== false) {
            if (nowMin === offMin) {
              // Check if we're at the exact minute of the outage start
              const factKey = `${telegramId}:fact_off:${offKey}`;
              if (!sentReminders.has(factKey)) {
                sentReminders.set(factKey, Date.now());
                const text = buildNotificationText('fact_off', event, scheduleData, regionName, queue, 0);
                await sendNotification(bot, user, text);
              }
            }
          }

          // Reminder before power-on
          if (user.notify_remind_on !== false) {
            for (const mins of reminderMinutes) {
              if (nowMin === onMin - mins && event.end > now) {
                const rKey = `${telegramId}:remind_on:${onKey}:${mins}`;
                if (!sentReminders.has(rKey)) {
                  sentReminders.set(rKey, Date.now());
                  const text = buildNotificationText('remind_on', event, scheduleData, regionName, queue, mins);
                  await sendNotification(bot, user, text);
                }
              }
            }
          }

          // Fact: power came back
          if (user.notify_fact_on !== false) {
            if (nowMin === onMin) {
              const factKey = `${telegramId}:fact_on:${onKey}`;
              if (!sentReminders.has(factKey)) {
                sentReminders.set(factKey, Date.now());
                const text = buildNotificationText('fact_on', event, scheduleData, regionName, queue, 0);
                await sendNotification(bot, user, text);
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ scheduleReminder error:', error.message);
  }
}

/**
 * Clear old sent reminders and enforce size limit
 */
function clearOldReminders() {
  const oneDayAgo = Date.now() - 86400000;
  for (const [key, ts] of sentReminders) {
    if (ts < oneDayAgo) sentReminders.delete(key);
  }
  // Enforce hard size limit to prevent memory leaks at 50K+ users
  if (sentReminders.size > MAX_SENT_REMINDERS_MAP_SIZE) {
    const excess = sentReminders.size - MAX_SENT_REMINDERS_MAP_SIZE;
    const keys = Array.from(sentReminders.keys()).slice(0, excess);
    keys.forEach(k => sentReminders.delete(k));
    console.log(`🧹 Очищено ${excess} старих записів sentReminders (ліміт ${MAX_SENT_REMINDERS_MAP_SIZE})`);
  }
}

/**
 * Start the reminder scheduler
 */
function startReminderScheduler(bot) {
  if (reminderInterval) return; // Already running

  // Run every minute
  reminderInterval = setInterval(() => {
    checkReminders(bot);
  }, 60000);

  // Clear old reminders once a day
  setInterval(clearOldReminders, 86400000);

  console.log('✅ Schedule reminder scheduler started');
}

/**
 * Stop the reminder scheduler
 */
function stopReminderScheduler() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    console.log('✅ Schedule reminder scheduler stopped');
  }
}

module.exports = {
  startReminderScheduler,
  stopReminderScheduler,
};
