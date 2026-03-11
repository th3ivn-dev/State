const { pool, safeQuery } = require('../db');

// Отримати всіх користувачів по регіону
async function getUsersByRegion(region) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE region = $1 AND is_active = TRUE', [region]);
    return result.rows;
  } catch (error) {
    console.error('Error in getUsersByRegion:', error.message);
    return [];
  }
}

async function getUsersByRegionForScheduler(region) {
  try {
    const result = await safeQuery(
      `SELECT
        u.id, u.telegram_id, u.region, u.queue,
        u.last_hash, u.router_ip, u.created_at, u.is_active,
        u.today_snapshot_hash, u.tomorrow_snapshot_hash, u.tomorrow_published_date,
        ucc.channel_id, ucc.channel_paused, ucc.channel_status,
        ucc.last_published_hash, ucc.last_post_id,
        ucc.schedule_caption, ucc.period_format, ucc.power_off_text, ucc.power_on_text,
        ucc.delete_old_message, ucc.picture_only,
        ucc.ch_notify_schedule,
        umt.last_schedule_message_id, umt.last_bot_keyboard_message_id
      FROM users u
      LEFT JOIN user_channel_config ucc ON ucc.user_id = u.id
      LEFT JOIN user_message_tracking umt ON umt.user_id = u.id
      WHERE u.region = $1 AND u.is_active = TRUE`,
      [region]
    );
    return result.rows;
  } catch (error) {
    console.error('Error in getUsersByRegionForScheduler:', error.message);
    return [];
  }
}

// Отримати всіх активних користувачів
async function getAllActiveUsers() {
  try {
    const result = await pool.query('SELECT * FROM users WHERE is_active = TRUE');
    return result.rows;
  } catch (error) {
    console.error('Error in getAllActiveUsers:', error.message);
    return [];
  }
}

// Отримати всіх користувачів
async function getAllUsers() {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    return result.rows;
  } catch (error) {
    console.error('Error in getAllUsers:', error.message);
    return [];
  }
}

// Отримати останніх N користувачів
async function getRecentUsers(limit = 20) {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC LIMIT $1', [limit]);
    return result.rows;
  } catch (error) {
    console.error('Error in getRecentUsers:', error.message);
    return [];
  }
}

// Отримати всіх користувачів з налаштованим router_ip
async function getUsersWithRouterIp() {
  try {
    const result = await pool.query("SELECT * FROM users WHERE router_ip IS NOT NULL AND router_ip != '' AND is_active = TRUE");
    return result.rows;
  } catch (error) {
    console.error('Помилка getUsersWithRouterIp:', error.message);
    return [];
  }
}

// Отримати всіх активних користувачів з каналами
async function getUsersWithActiveChannels() {
  try {
    const result = await pool.query(`
      SELECT u.*, ucc.channel_id, ucc.channel_title, ucc.channel_description,
        ucc.channel_photo_file_id, ucc.channel_user_title, ucc.channel_user_description,
        ucc.channel_status, ucc.channel_paused, ucc.channel_branding_updated_at,
        ucc.last_published_hash, ucc.last_post_id,
        ucc.schedule_caption, ucc.period_format, ucc.power_off_text, ucc.power_on_text,
        ucc.delete_old_message, ucc.picture_only,
        ucc.ch_notify_schedule, ucc.ch_notify_remind_off, ucc.ch_notify_remind_on,
        ucc.ch_notify_fact_off, ucc.ch_notify_fact_on,
        ucc.ch_remind_15m, ucc.ch_remind_30m, ucc.ch_remind_1h
      FROM users u
      INNER JOIN user_channel_config ucc ON ucc.user_id = u.id
      WHERE ucc.channel_id IS NOT NULL
        AND u.is_active = TRUE
        AND ucc.channel_status = 'active'
    `);
    return result.rows;
  } catch (error) {
    console.error('Error in getUsersWithActiveChannels:', error.message);
    return [];
  }
}

// Отримати всіх користувачів з каналами для перевірки
async function getUsersWithChannelsForVerification() {
  try {
    const result = await pool.query(`
      SELECT u.*, ucc.channel_id, ucc.channel_title, ucc.channel_description,
        ucc.channel_photo_file_id, ucc.channel_user_title, ucc.channel_user_description,
        ucc.channel_status, ucc.channel_paused, ucc.channel_branding_updated_at,
        ucc.last_published_hash, ucc.last_post_id,
        ucc.schedule_caption, ucc.period_format, ucc.power_off_text, ucc.power_on_text,
        ucc.delete_old_message, ucc.picture_only,
        ucc.ch_notify_schedule, ucc.ch_notify_remind_off, ucc.ch_notify_remind_on,
        ucc.ch_notify_fact_off, ucc.ch_notify_fact_on,
        ucc.ch_remind_15m, ucc.ch_remind_30m, ucc.ch_remind_1h
      FROM users u
      INNER JOIN user_channel_config ucc ON ucc.user_id = u.id
      WHERE ucc.channel_id IS NOT NULL
        AND ucc.channel_title IS NOT NULL
        AND u.is_active = TRUE
    `);
    return result.rows;
  } catch (error) {
    console.error('Error in getUsersWithChannelsForVerification:', error.message);
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
    console.error('Error in getActiveUsersByRegionQueue:', error.message);
    return {};
  }
}

// Get active users with reminders enabled (for schedule reminder scheduler)
async function getActiveUsersWithReminders() {
  try {
    const result = await pool.query(`
      SELECT u.id, u.telegram_id, u.region, u.queue, u.router_ip, u.created_at, u.is_active,
        uns.notify_remind_off, uns.notify_fact_off, uns.notify_remind_on, uns.notify_fact_on,
        uns.remind_15m, uns.remind_30m, uns.remind_1h,
        uns.notify_remind_target,
        ucc.channel_id,
        ucc.ch_notify_remind_off, ucc.ch_notify_remind_on,
        ucc.ch_notify_fact_off, ucc.ch_notify_fact_on,
        ucc.ch_remind_15m, ucc.ch_remind_30m, ucc.ch_remind_1h,
        umt.last_reminder_message_id, umt.last_channel_reminder_message_id
      FROM users u
      LEFT JOIN user_notification_settings uns ON uns.user_id = u.id
      LEFT JOIN user_channel_config ucc ON ucc.user_id = u.id
      LEFT JOIN user_message_tracking umt ON umt.user_id = u.id
      WHERE u.is_active = TRUE
        AND (
          uns.notify_remind_off = TRUE OR uns.notify_fact_off = TRUE
          OR uns.notify_remind_on = TRUE OR uns.notify_fact_on = TRUE
        )
        AND u.region IS NOT NULL
        AND u.queue IS NOT NULL
    `);
    return result.rows;
  } catch (error) {
    console.error('Error in getActiveUsersWithReminders:', error.message);
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
};
