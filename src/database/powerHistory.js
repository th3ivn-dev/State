const { pool } = require('./db');

/**
 * Додати запис про подію зміни стану живлення
 * @param {number} userId - ID користувача
 * @param {string} eventType - Тип події: 'power_on' або 'power_off'
 * @param {number} timestamp - Unix timestamp події
 * @param {number} durationSeconds - Тривалість попереднього стану в секундах
 */
async function addPowerEvent(userId, eventType, timestamp, durationSeconds = null) {
  try {
    await pool.query(`
      INSERT INTO power_history (user_id, event_type, timestamp, duration_seconds)
      VALUES ($1, $2, $3, $4)
    `, [userId, eventType, timestamp, durationSeconds]);
    return true;
  } catch (error) {
    console.error('Error adding power event:', error);
    return false;
  }
}

/**
 * Отримати історію подій для користувача
 * @param {number} userId - ID користувача
 * @param {number} limit - Максимальна кількість записів
 */
async function getPowerHistory(userId, limit = 100) {
  try {
    const result = await pool.query(`
      SELECT * FROM power_history
      WHERE user_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `, [userId, limit]);

    return result.rows;
  } catch (error) {
    console.error('Error getting power history:', error);
    return [];
  }
}

/**
 * Отримати історію подій за період
 * @param {number} userId - ID користувача
 * @param {number} startTimestamp - Початковий timestamp
 * @param {number} endTimestamp - Кінцевий timestamp
 */
async function getPowerHistoryByPeriod(userId, startTimestamp, endTimestamp) {
  try {
    const result = await pool.query(`
      SELECT * FROM power_history
      WHERE user_id = $1 AND timestamp >= $2 AND timestamp <= $3
      ORDER BY timestamp ASC
    `, [userId, startTimestamp, endTimestamp]);

    return result.rows;
  } catch (error) {
    console.error('Error getting power history by period:', error);
    return [];
  }
}

/**
 * Очистити стару історію (старше N днів)
 * @param {number} daysToKeep - Кількість днів для збереження
 */
async function cleanupOldHistory(daysToKeep = 30) {
  try {
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - (daysToKeep * 24 * 60 * 60);

    const result = await pool.query(`
      DELETE FROM power_history
      WHERE timestamp < $1
    `, [cutoffTimestamp]);

    const deletedCount = result.rowCount || 0;
    console.log(`Видалено ${deletedCount} старих записів з power_history`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up old history:', error);
    return 0;
  }
}

module.exports = {
  addPowerEvent,
  getPowerHistory,
  getPowerHistoryByPeriod,
  cleanupOldHistory,
};
