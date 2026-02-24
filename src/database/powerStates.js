/**
 * Power States Database Operations
 * Збереження та відновлення станів моніторингу живлення
 */

const { pool } = require('./db');

/**
 * Зберегти стан моніторингу користувача (upsert)
 * @param {number} userId - Telegram ID користувача
 * @param {Object} stateData - Об'єкт стану користувача
 * @returns {Promise<boolean>}
 */
async function savePowerState(userId, stateData) {
  try {
    await pool.query(`
      INSERT INTO user_power_states 
      (telegram_id, current_state, pending_state, pending_state_time, 
       last_stable_state, last_stable_at, instability_start, switch_count, 
       last_notification_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT(telegram_id) DO UPDATE SET
        current_state = EXCLUDED.current_state,
        pending_state = EXCLUDED.pending_state,
        pending_state_time = EXCLUDED.pending_state_time,
        last_stable_state = EXCLUDED.last_stable_state,
        last_stable_at = EXCLUDED.last_stable_at,
        instability_start = EXCLUDED.instability_start,
        switch_count = EXCLUDED.switch_count,
        last_notification_at = EXCLUDED.last_notification_at,
        updated_at = NOW()
    `, [
      userId,
      stateData.currentState,
      stateData.pendingState,
      stateData.pendingStateTime,
      stateData.lastStableState,
      stateData.lastStableAt,
      stateData.instabilityStart,
      stateData.switchCount || 0,
      stateData.lastNotificationAt
    ]);
    return true;
  } catch (error) {
    console.error(`Помилка збереження стану користувача ${userId}:`, error.message);
    return false;
  }
}

/**
 * Отримати всі нещодавні стани (оновлені протягом 1 години)
 * @returns {Promise<Array>}
 */
async function getRecentPowerStates() {
  try {
    const result = await pool.query(`
      SELECT * FROM user_power_states 
      WHERE updated_at > NOW() - INTERVAL '1 hour'
    `);
    return result.rows;
  } catch (error) {
    console.error('Помилка отримання станів:', error.message);
    return [];
  }
}

module.exports = {
  savePowerState,
  getRecentPowerStates,
};
