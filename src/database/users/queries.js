const { pool, safeQuery } = require('../db');
const logger = require('../../utils/logger');

// Отримати всіх користувачів по регіону
async function getUsersByRegion(region) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE region = $1 AND is_active = TRUE', [region]);
    return result.rows;
  } catch (error) {
    logger.error('Error in getUsersByRegion:', error.message);
    return [];
  }
}

// Lightweight projection for scheduler — fetches only the columns
// required by checkUserSchedule / publishScheduleWithPhoto.
// Avoids transferring large text fields (descriptions, branding) for every user.
const SCHEDULER_COLUMNS = [
  'id', 'telegram_id', 'region', 'queue',
  'last_hash', 'last_published_hash',
  'channel_id', 'channel_paused', 'channel_status',
  'power_notify_target', 'router_ip', 'created_at',
  'today_snapshot_hash', 'tomorrow_snapshot_hash', 'tomorrow_published_date',
  'schedule_caption', 'period_format', 'power_off_text', 'power_on_text',
  'delete_old_message', 'picture_only',
  'last_schedule_message_id', 'last_post_id',
].join(', ');

async function getUsersByRegionForScheduler(region) {
  try {
    const result = await safeQuery(
      `SELECT ${SCHEDULER_COLUMNS} FROM users WHERE region = $1 AND is_active = TRUE`,
      [region]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error in getUsersByRegionForScheduler:', error.message);
    return [];
  }
}

// Отримати всіх активних користувачів
async function getAllActiveUsers() {
  try {
    const result = await pool.query('SELECT * FROM users WHERE is_active = TRUE');
    return result.rows;
  } catch (error) {
    logger.error('Error in getAllActiveUsers:', error.message);
    return [];
  }
}

// Отримати всіх користувачів
async function getAllUsers() {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    return result.rows;
  } catch (error) {
    logger.error('Error in getAllUsers:', error.message);
    return [];
  }
}

// Отримати останніх N користувачів
async function getRecentUsers(limit = 20) {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC LIMIT $1', [limit]);
    return result.rows;
  } catch (error) {
    logger.error('Error in getRecentUsers:', error.message);
    return [];
  }
}

// Отримати всіх користувачів з налаштованим router_ip
async function getUsersWithRouterIp() {
  try {
    const result = await pool.query("SELECT * FROM users WHERE router_ip IS NOT NULL AND router_ip != '' AND is_active = TRUE");
    return result.rows;
  } catch (error) {
    logger.error('Помилка getUsersWithRouterIp:', error.message);
    return [];
  }
}

// Отримати всіх активних користувачів з каналами
async function getUsersWithActiveChannels() {
  try {
    const result = await pool.query(`
      SELECT * FROM users 
      WHERE channel_id IS NOT NULL 
      AND is_active = TRUE 
      AND channel_status = 'active'
    `);
    return result.rows;
  } catch (error) {
    logger.error('Error in getUsersWithActiveChannels:', error.message);
    return [];
  }
}

// Отримати всіх користувачів з каналами для перевірки
async function getUsersWithChannelsForVerification() {
  try {
    const result = await pool.query(`
      SELECT * FROM users 
      WHERE channel_id IS NOT NULL 
      AND channel_title IS NOT NULL
      AND is_active = TRUE
    `);
    return result.rows;
  } catch (error) {
    logger.error('Error in getUsersWithChannelsForVerification:', error.message);
    return [];
  }
}

// NEW: Get all active users grouped by region+queue (for scheduler optimization)
async function getActiveUsersByRegionQueue() {
  try {
    const result = await pool.query(`
      SELECT * FROM users 
      WHERE is_active = TRUE 
      ORDER BY region, queue
    `);

    // Group by region+queue
    const groups = {};
    for (const user of result.rows) {
      const key = `${user.region}_${user.queue}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(user);
    }
    return groups;
  } catch (error) {
    logger.error('Error in getActiveUsersByRegionQueue:', error.message);
    return {};
  }
}

// Get active users with reminders enabled (for schedule reminder scheduler)
async function getActiveUsersWithReminders() {
  try {
    const result = await pool.query(`
      SELECT * FROM users
      WHERE is_active = TRUE
        AND (notify_remind_off = TRUE OR notify_fact_off = TRUE OR notify_remind_on = TRUE OR notify_fact_on = TRUE)
        AND region IS NOT NULL
        AND queue IS NOT NULL
    `);
    return result.rows;
  } catch (error) {
    logger.error('Error in getActiveUsersWithReminders:', error.message);
    return [];
  }
}

// Cursor-based pagination for bulk operations (broadcast, maintenance).
// Yields pages of `pageSize` users ordered by id. Prevents loading 500K rows into memory.
async function* paginateActiveUsers(pageSize = 500) {
  let lastId = 0;
  while (true) {
    const result = await safeQuery(
      'SELECT id, telegram_id FROM users WHERE is_active = TRUE AND id > $1 ORDER BY id LIMIT $2',
      [lastId, pageSize]
    );
    if (result.rows.length === 0) break;
    yield result.rows;
    lastId = result.rows[result.rows.length - 1].id;
    if (result.rows.length < pageSize) break;
  }
}

module.exports = {
  getUsersByRegion,
  getUsersByRegionForScheduler,
  getAllActiveUsers,
  getAllUsers,
  getRecentUsers,
  getUsersWithRouterIp,
  getUsersWithActiveChannels,
  getUsersWithChannelsForVerification,
  getActiveUsersByRegionQueue,
  getActiveUsersWithReminders,
  paginateActiveUsers,
  SCHEDULER_COLUMNS,
};
