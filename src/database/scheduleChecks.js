const { safeQuery } = require('./db');
const { createLogger } = require('../utils/logger');

const logger = createLogger('ScheduleChecksDb');

async function updateScheduleCheckTime(region, queue) {
  try {
    const result = await safeQuery(`
      INSERT INTO schedule_checks (region, queue, last_checked_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (region, queue)
      DO UPDATE SET last_checked_at = NOW()
      RETURNING last_checked_at
    `, [region, queue]);
    return result.rows[0].last_checked_at;
  } catch (error) {
    logger.error('Error updating schedule check time:', { error: error.message, region, queue });
    throw error;
  }
}

async function getScheduleCheckTime(region, queue) {
  try {
    const result = await safeQuery(`
      SELECT last_checked_at FROM schedule_checks
      WHERE region = $1 AND queue = $2
    `, [region, queue]);
    if (result.rows.length > 0 && result.rows[0].last_checked_at) {
      return Math.floor(new Date(result.rows[0].last_checked_at).getTime() / 1000);
    }
    return Math.floor(Date.now() / 1000);
  } catch (error) {
    logger.error('Error getting schedule check time:', { error: error.message, region, queue });
    return Math.floor(Date.now() / 1000);
  }
}

module.exports = {
  updateScheduleCheckTime,
  getScheduleCheckTime,
};
