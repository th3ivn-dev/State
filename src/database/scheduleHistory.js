const { safeQuery, pool } = require('./db');
const { createLogger } = require('../utils/logger');

const logger = createLogger('ScheduleHistoryDb');

/**
 * Add a schedule to history
 * Keeps only one schedule per day per user (latest version)
 */
async function addScheduleToHistory(userId, region, queue, scheduleData, hash) {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Delete any existing schedule for today before inserting new one
    const today = new Date().toISOString().split('T')[0];
    await client.query(`
      DELETE FROM schedule_history
      WHERE user_id = $1 AND DATE(created_at) = $2
    `, [userId, today]);

    // Insert new schedule
    await client.query(`
      INSERT INTO schedule_history (user_id, region, queue, schedule_data, hash, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [userId, region, queue, JSON.stringify(scheduleData), hash]);

    await client.query('COMMIT');
    return true;
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    logger.error('Error adding schedule to history:', { error: error.message });
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Get the last schedule for a user
 */
async function getLastSchedule(userId) {
  try {
    const result = await safeQuery(`
      SELECT * FROM schedule_history
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId]);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      row.schedule_data = JSON.parse(row.schedule_data);
      return row;
    }

    return null;
  } catch (error) {
    logger.error('Error getting last schedule:', { error: error.message });
    return null;
  }
}

/**
 * Get the previous schedule (second to last) for a user
 */
async function getPreviousSchedule(userId) {
  try {
    const result = await safeQuery(`
      SELECT * FROM schedule_history
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1 OFFSET 1
    `, [userId]);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      row.schedule_data = JSON.parse(row.schedule_data);
      return row;
    }

    return null;
  } catch (error) {
    logger.error('Error getting previous schedule:', { error: error.message });
    return null;
  }
}

/**
 * Clean old schedule history (older than 7 days)
 * This is called by cron at 03:00
 */
async function cleanOldSchedules() {
  try {
    const result = await safeQuery(`
      DELETE FROM schedule_history
      WHERE created_at < NOW() - INTERVAL '7 days'
    `);

    const deletedCount = result.rowCount || 0;
    if (deletedCount > 0) {
      logger.info(`🧹 Видалено ${deletedCount} старих записів з schedule_history`);
    }
    return deletedCount;
  } catch (error) {
    logger.error('Error cleaning old schedules:', { error: error.message });
    return 0;
  }
}

/**
 * Get schedule history for a user
 */
async function getScheduleHistory(userId, limit = 10) {
  try {
    const result = await safeQuery(`
      SELECT * FROM schedule_history
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);

    return result.rows.map(row => {
      row.schedule_data = JSON.parse(row.schedule_data);
      return row;
    });
  } catch (error) {
    logger.error('Error getting schedule history:', { error: error.message });
    return [];
  }
}

/**
 * Get schedule count for a user
 */
async function getScheduleCount(userId) {
  try {
    const result = await safeQuery(`
      SELECT COUNT(*) as count FROM schedule_history
      WHERE user_id = $1
    `, [userId]);

    return parseInt(result.rows[0].count);
  } catch (error) {
    logger.error('Error getting schedule count:', { error: error.message });
    return 0;
  }
}

/**
 * Delete all schedule history for a user
 */
async function deleteUserScheduleHistory(userId) {
  try {
    const result = await safeQuery(`
      DELETE FROM schedule_history
      WHERE user_id = $1
    `, [userId]);

    return result.rowCount || 0;
  } catch (error) {
    logger.error('Error deleting user schedule history:', { error: error.message });
    return 0;
  }
}

module.exports = {
  addScheduleToHistory,
  getLastSchedule,
  getPreviousSchedule,
  cleanOldSchedules,
  getScheduleHistory,
  getScheduleCount,
  deleteUserScheduleHistory,
};
