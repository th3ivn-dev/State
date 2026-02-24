const { isAdmin, formatUptime } = require('../../utils');
const config = require('../../config');
const pool = require('../../database/db');
const { getSetting } = require('../../database/db');
const { safeSendMessage, safeEditMessageText } = require('../../utils/errorHandler');
const { getDashboardKeyboard } = require('../../keyboards/inline');
const logger = require('../../logger').child({ module: 'dashboard' });

/**
 * Format current time in Kyiv timezone
 */
function formatKyivTime() {
  return new Date().toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Collect all dashboard metrics
 */
async function collectMetrics() {
  const uptime = process.uptime();
  const mem = process.memoryUsage();
  const ramMB = Math.round(mem.heapUsed / 1024 / 1024);

  let totalUsers = 'N/A';
  let activeUsers = 'N/A';
  let newToday = 'N/A';
  let newThisWeek = 'N/A';
  let totalChannels = 'N/A';
  let ipMonitoring = 'N/A';

  try {
    const r1 = await pool.query('SELECT COUNT(*) FROM users');
    totalUsers = parseInt(r1.rows[0].count, 10);
  } catch (_e) { /* table may not exist */ }

  try {
    const r2 = await pool.query("SELECT COUNT(*) FROM users WHERE is_active = true");
    activeUsers = parseInt(r2.rows[0].count, 10);
  } catch (_e) { /* table may not exist */ }

  try {
    const r3 = await pool.query("SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE");
    newToday = parseInt(r3.rows[0].count, 10);
  } catch (_e) { /* table may not exist */ }

  try {
    const r4 = await pool.query("SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'");
    newThisWeek = parseInt(r4.rows[0].count, 10);
  } catch (_e) { /* table may not exist */ }

  try {
    const r5 = await pool.query('SELECT COUNT(*) FROM channels');
    totalChannels = parseInt(r5.rows[0].count, 10);
  } catch (_e) { /* table may not exist */ }

  try {
    const r6 = await pool.query('SELECT COUNT(*) FROM admin_routers WHERE router_ip IS NOT NULL');
    ipMonitoring = parseInt(r6.rows[0].count, 10);
  } catch (_e) { /* table may not exist */ }

  let isPaused = false;
  try {
    isPaused = await getSetting('bot_paused', '0') === '1';
  } catch (_e) { /* ignore */ }

  return { uptime, ramMB, totalUsers, activeUsers, newToday, newThisWeek, totalChannels, ipMonitoring, isPaused };
}

/**
 * Build dashboard message text
 */
function buildDashboardMessage(metrics) {
  const { uptime, ramMB, totalUsers, activeUsers, newToday, newThisWeek, totalChannels, ipMonitoring, isPaused } = metrics;
  const statusIcon = isPaused ? '⏸️' : '✅';
  const statusText = isPaused ? 'Бот на паузі' : 'Бот працює';

  let msg = '📊 <b>DASHBOARD — Есвітло v2</b>\n';
  msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  msg += `${statusIcon} Статус: ${statusText}\n`;
  msg += `⏱️ Uptime: ${formatUptime(uptime)}\n`;
  msg += `💾 RAM: ${ramMB}MB\n\n`;

  msg += '👥 <b>КОРИСТУВАЧІ</b>\n';
  msg += `├─ Всього:           ${totalUsers}\n`;
  msg += `├─ Активних:         ${activeUsers}\n`;
  msg += `├─ Нових сьогодні:   +${newToday}\n`;
  msg += `└─ Нових за тиждень: +${newThisWeek}\n\n`;

  msg += '📡 <b>ІНФРАСТРУКТУРА</b>\n';
  msg += `├─ Каналів:          ${totalChannels}\n`;
  msg += `└─ IP моніторинг:    ${ipMonitoring}\n\n`;

  msg += `⏱️ Оновлено: ${formatKyivTime()}`;
  return msg;
}

/**
 * Handler for /dashboard command
 */
async function handleDashboard(bot, msg) {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  if (!isAdmin(userId, config.adminIds, config.ownerId)) {
    await safeSendMessage(bot, chatId, '❓ Невідома команда. Використовуйте /start для початку.');
    return;
  }

  try {
    const metrics = await collectMetrics();
    const message = buildDashboardMessage(metrics);

    await safeSendMessage(bot, chatId, message, {
      parse_mode: 'HTML',
      ...getDashboardKeyboard(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Помилка в handleDashboard');
    await safeSendMessage(bot, chatId, '❌ Виникла помилка.');
  }
}

/**
 * Ukrainian day names
 */
const UA_DAYS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/**
 * Build a text bar chart (max 12 blocks)
 */
function buildBar(value, max) {
  if (max === 0) return '░░░░░░░░░░░░';
  const filled = Math.round((value / max) * 12);
  return '█'.repeat(filled) + '░'.repeat(12 - filled);
}

/**
 * Handle inline keyboard callbacks for dashboard
 */
async function handleDashboardCallback(bot, query, chatId, userId, data) {
  if (data === 'admin_dashboard' || data === 'dashboard_refresh') {
    try {
      const metrics = await collectMetrics();
      const message = buildDashboardMessage(metrics);

      await safeEditMessageText(bot, message, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getDashboardKeyboard().reply_markup,
      });
    } catch (error) {
      logger.error({ err: error }, 'Помилка оновлення dashboard');
    }
    return;
  }

  if (data === 'dashboard_weekly') {
    try {
      // Get daily new user counts for last 7 days
      let dailyRows = [];
      try {
        const res = await pool.query(
          `SELECT DATE(created_at) as day, COUNT(*) as new_users
           FROM users
           WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
           GROUP BY DATE(created_at)
           ORDER BY day`
        );
        dailyRows = res.rows;
      } catch (_e) { /* table may not exist */ }

      // Get cumulative totals per day for last 7 days
      let cumulativeRows = [];
      try {
        const res = await pool.query(
          `SELECT d.day, COUNT(u.id) as total
           FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') as d(day)
           LEFT JOIN users u ON DATE(u.created_at) <= d.day
           GROUP BY d.day
           ORDER BY d.day`
        );
        cumulativeRows = res.rows;
      } catch (_e) { /* table may not exist */ }

      // Build a map of day -> new_users
      const dailyMap = {};
      for (const row of dailyRows) {
        const key = new Date(row.day).toISOString().slice(0, 10);
        dailyMap[key] = parseInt(row.new_users, 10);
      }

      // Build last 7 days array
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d);
      }

      const values = days.map(d => {
        const key = d.toISOString().slice(0, 10);
        return dailyMap[key] || 0;
      });

      const maxVal = Math.max(...values, 1);

      let msg = '📈 <b>Тренд користувачів (7 днів)</b>\n';
      msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

      days.forEach((d, i) => {
        const dayName = UA_DAYS[d.getDay()];
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const bar = buildBar(values[i], maxVal);
        msg += `${dayName} ${dd}.${mm}: ${bar} ${values[i]}\n`;
      });

      // Growth summary
      if (cumulativeRows.length >= 2) {
        const first = parseInt(cumulativeRows[0].total, 10);
        const last = parseInt(cumulativeRows[cumulativeRows.length - 1].total, 10);
        const diff = last - first;
        const pct = first > 0 ? ((diff / first) * 100).toFixed(1) : '0.0';
        msg += `\n📊 Загальний ріст: +${diff} (+${pct}%)`;
      }

      await safeEditMessageText(bot, msg, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getDashboardKeyboard().reply_markup,
      });
    } catch (error) {
      logger.error({ err: error }, 'Помилка в dashboard_weekly');
    }
    return;
  }

  if (data === 'dashboard_errors') {
    try {
      let msg = '⚠️ <b>Останні помилки</b>\n';
      msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

      let errors = null;
      let monitoringAvailable = false;
      try {
        const { monitoringManager } = require('../../monitoring/monitoringManager');
        if (monitoringManager && monitoringManager.isInitialized) {
          const metricsCollector = require('../../monitoring/metricsCollector');
          errors = metricsCollector.getRecentErrors ? metricsCollector.getRecentErrors(10) : null;
          monitoringAvailable = true;
        }
      } catch (_e) { /* monitoring module unavailable */ }

      if (!monitoringAvailable) {
        msg += 'Система моніторингу помилок не налаштована';
      } else if (!errors || errors.length === 0) {
        msg += 'Помилок не знайдено ✅';
      } else {
        errors.forEach((err, i) => {
          const time = new Date(err.timestamp).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
          msg += `${i + 1}. <code>${err.message || 'Unknown'}</code>\n`;
          msg += `   ${time}\n\n`;
        });
      }

      await safeEditMessageText(bot, msg, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getDashboardKeyboard().reply_markup,
      });
    } catch (error) {
      logger.error({ err: error }, 'Помилка в dashboard_errors');
    }
    return;
  }

  if (data === 'dashboard_activity') {
    try {
      let newUsers24h = 'N/A';
      let newChannels24h = 'N/A';

      try {
        const r1 = await pool.query("SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '24 hours'");
        newUsers24h = parseInt(r1.rows[0].count, 10);
      } catch (_e) { /* table may not exist */ }

      try {
        const r2 = await pool.query("SELECT COUNT(*) FROM channels WHERE created_at >= NOW() - INTERVAL '24 hours'");
        newChannels24h = parseInt(r2.rows[0].count, 10);
      } catch (_e) { /* table may not exist */ }

      let msg = '📊 <b>Активність за 24 години</b>\n';
      msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
      msg += `👥 Нових користувачів: ${newUsers24h}\n`;
      msg += `📡 Підключено каналів: ${newChannels24h}\n\n`;
      msg += `⏱️ Оновлено: ${formatKyivTime()}`;

      await safeEditMessageText(bot, msg, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getDashboardKeyboard().reply_markup,
      });
    } catch (error) {
      logger.error({ err: error }, 'Помилка в dashboard_activity');
    }
    return;
  }
}

module.exports = { handleDashboard, handleDashboardCallback };
