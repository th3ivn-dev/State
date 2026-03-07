const { pool } = require('../db');
const logger = require('../../utils/logger');

// Оновити стан живлення користувача
async function updateUserPowerState(telegramId, state) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET power_state = $1, power_changed_at = NOW(), updated_at = NOW()
      WHERE telegram_id = $2
    `, [state, telegramId]);

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in updateUserPowerState', { error: error.message });
    return false;
  }
}

// Атомарно оновити стан живлення і повернути тривалість попереднього стану
async function changePowerStateAndGetDuration(telegramId, newState) {
  try {
    const result = await pool.query(`
      WITH old_state AS (
        SELECT power_changed_at AS old_changed_at
        FROM users 
        WHERE telegram_id = $2
      )
      UPDATE users 
      SET 
        power_state = $1, 
        power_changed_at = COALESCE(pending_power_change_at, NOW()),
        pending_power_state = NULL,
        pending_power_change_at = NULL,
        updated_at = NOW()
      WHERE telegram_id = $2
      RETURNING 
        power_changed_at,
        EXTRACT(EPOCH FROM (power_changed_at - (SELECT old_changed_at FROM old_state))) / 60 AS duration_minutes
    `, [newState, telegramId]);

    return result.rows[0];
  } catch (error) {
    logger.error('Error in changePowerStateAndGetDuration', { error: error.message });
    return null;
  }
}

// Зберегти pending стан живлення в БД
async function setPendingPowerChange(telegramId, pendingState) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET pending_power_state = $1, pending_power_change_at = NOW(), updated_at = NOW()
      WHERE telegram_id = $2
      RETURNING pending_power_change_at
    `, [pendingState, telegramId]);
    return result.rows[0];
  } catch (error) {
    logger.error('Error in setPendingPowerChange', { error: error.message });
    return null;
  }
}

// Очистити pending стан живлення в БД
async function clearPendingPowerChange(telegramId) {
  try {
    await pool.query(`
      UPDATE users 
      SET pending_power_state = NULL, pending_power_change_at = NULL, updated_at = NOW()
      WHERE telegram_id = $1
    `, [telegramId]);
  } catch (error) {
    logger.error('Error in clearPendingPowerChange', { error: error.message });
  }
}

module.exports = {
  updateUserPowerState,
  changePowerStateAndGetDuration,
  setPendingPowerChange,
  clearPendingPowerChange,
};
