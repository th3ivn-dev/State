const { safeQuery } = require('./db');
const { createLogger } = require('../utils/logger');

const logger = createLogger('PowerHistoryDb');

async function addPowerEvent(userId, eventType, timestamp, durationSeconds = null) {
  try {
    await safeQuery(`
      INSERT INTO power_history (user_id, event_type, timestamp, duration_seconds)
      VALUES ($1, $2, $3, $4)
    `, [userId, eventType, timestamp, durationSeconds]);
    return true;
  } catch (error) {
    logger.error('Error adding power event:', { error: error.message });
    return false;
  }
}

async function getPowerHistory(userId, limit = 100) {
  try {
    const result = await safeQuery(`
      SELECT * FROM power_history
      WHERE user_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `, [userId, limit]);
    return result.rows;
  } catch (error) {
    logger.error('Error getting power history:', { error: error.message });
    return [];
  }
}

async function getPowerHistoryByPeriod(userId, startTimestamp, endTimestamp) {
  try {
    const result = await safeQuery(`
      SELECT * FROM power_history
      WHERE user_id = $1 AND timestamp >= $2 AND timestamp <= $3
      ORDER BY timestamp ASC
    `, [userId, startTimestamp, endTimestamp]);
    return result.rows;
  } catch (error) {
    logger.error('Error getting power history by period:', { error: error.message });
    return [];
  }
}

async function cleanupOldHistory(daysToKeep = 30) {
  try {
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - (daysToKeep * 24 * 60 * 60);
    const result = await safeQuery(`
      DELETE FROM power_history
      WHERE timestamp < $1
    `, [cutoffTimestamp]);
    const deletedCount = result.rowCount || 0;
    logger.info(`Видалено ${deletedCount} старих записів з power_history`);
    return deletedCount;
  } catch (error) {
    logger.error('Error cleaning up old history:', { error: error.message });
    return 0;
  }
}

module.exports = {
  addPowerEvent,
  getPowerHistory,
  getPowerHistoryByPeriod,
  cleanupOldHistory,
};
