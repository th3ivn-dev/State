const { safeQuery } = require('./db');
const { createLogger } = require('../utils/logger');

const logger = createLogger('AdminRoutersDb');

async function getAdminRouter(adminTelegramId) {
  try {
    const result = await safeQuery(
      'SELECT * FROM admin_routers WHERE admin_telegram_id = $1',
      [adminTelegramId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error(`Error getting admin router for ${adminTelegramId}:`, { error: error.message });
    return null;
  }
}

async function setAdminRouterIP(adminTelegramId, ip, port = 80) {
  try {
    await safeQuery(
      `INSERT INTO admin_routers (admin_telegram_id, router_ip, router_port, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT(admin_telegram_id) DO UPDATE SET
         router_ip = EXCLUDED.router_ip,
         router_port = EXCLUDED.router_port,
         updated_at = NOW()`,
      [adminTelegramId, ip, port]
    );
    return true;
  } catch (error) {
    logger.error(`Error setting admin router IP for ${adminTelegramId}:`, { error: error.message });
    return false;
  }
}

async function updateAdminRouterState(adminTelegramId, state) {
  try {
    await safeQuery(
      `UPDATE admin_routers SET
         last_state = $2,
         last_change_at = NOW(),
         last_check_at = NOW(),
         updated_at = NOW()
       WHERE admin_telegram_id = $1`,
      [adminTelegramId, state]
    );
    return true;
  } catch (error) {
    logger.error(`Error updating admin router state for ${adminTelegramId}:`, { error: error.message });
    return false;
  }
}

async function updateAdminRouterCheckTime(adminTelegramId) {
  try {
    await safeQuery(
      `UPDATE admin_routers SET
         last_check_at = NOW(),
         updated_at = NOW()
       WHERE admin_telegram_id = $1`,
      [adminTelegramId]
    );
    return true;
  } catch (error) {
    logger.error(`Error updating admin router check time for ${adminTelegramId}:`, { error: error.message });
    return false;
  }
}

async function toggleAdminRouterNotifications(adminTelegramId) {
  try {
    const result = await safeQuery(
      `UPDATE admin_routers SET
         notifications_on = NOT notifications_on,
         updated_at = NOW()
       WHERE admin_telegram_id = $1
       RETURNING notifications_on`,
      [adminTelegramId]
    );
    return result.rows.length > 0 ? result.rows[0].notifications_on : null;
  } catch (error) {
    logger.error(`Error toggling admin router notifications for ${adminTelegramId}:`, { error: error.message });
    return null;
  }
}

async function addAdminRouterEvent(adminTelegramId, eventType, durationMinutes = null) {
  try {
    await safeQuery(
      `INSERT INTO admin_router_history (admin_telegram_id, event_type, duration_minutes)
       VALUES ($1, $2, $3)`,
      [adminTelegramId, eventType, durationMinutes]
    );
    return true;
  } catch (error) {
    logger.error(`Error adding admin router event for ${adminTelegramId}:`, { error: error.message });
    return false;
  }
}

async function getAdminRouterHistory(adminTelegramId, limit = 5) {
  try {
    const result = await safeQuery(
      `SELECT * FROM admin_router_history
       WHERE admin_telegram_id = $1
       ORDER BY event_at DESC
       LIMIT $2`,
      [adminTelegramId, limit]
    );
    return result.rows;
  } catch (error) {
    logger.error(`Error getting admin router history for ${adminTelegramId}:`, { error: error.message });
    return [];
  }
}

async function getAdminRouterStats(adminTelegramId, hours = 24) {
  try {
    const result = await safeQuery(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'offline') as offline_count,
         SUM(duration_minutes) FILTER (WHERE event_type = 'offline') as total_offline_minutes,
         MAX(duration_minutes) FILTER (WHERE event_type = 'offline') as longest_offline_minutes,
         AVG(duration_minutes) FILTER (WHERE event_type = 'offline') as avg_offline_minutes
       FROM admin_router_history
       WHERE admin_telegram_id = $1
         AND event_at >= NOW() - INTERVAL '1 hour' * $2`,
      [adminTelegramId, hours]
    );

    if (result.rows.length > 0) {
      const stats = result.rows[0];
      return {
        offline_count: parseInt(stats.offline_count) || 0,
        total_offline_minutes: parseInt(stats.total_offline_minutes) || 0,
        longest_offline_minutes: parseInt(stats.longest_offline_minutes) || 0,
        avg_offline_minutes: parseFloat(stats.avg_offline_minutes) || 0,
      };
    }

    return {
      offline_count: 0,
      total_offline_minutes: 0,
      longest_offline_minutes: 0,
      avg_offline_minutes: 0,
    };
  } catch (error) {
    logger.error(`Error getting admin router stats for ${adminTelegramId}:`, { error: error.message });
    return {
      offline_count: 0,
      total_offline_minutes: 0,
      longest_offline_minutes: 0,
      avg_offline_minutes: 0,
    };
  }
}

async function getAllConfiguredAdminRouters() {
  try {
    const result = await safeQuery(
      `SELECT * FROM admin_routers
       WHERE router_ip IS NOT NULL`
    );
    return result.rows;
  } catch (error) {
    logger.error('Error getting all configured admin routers:', { error: error.message });
    return [];
  }
}

module.exports = {
  getAdminRouter,
  setAdminRouterIP,
  updateAdminRouterState,
  updateAdminRouterCheckTime,
  toggleAdminRouterNotifications,
  addAdminRouterEvent,
  getAdminRouterHistory,
  getAdminRouterStats,
  getAllConfiguredAdminRouters,
};
