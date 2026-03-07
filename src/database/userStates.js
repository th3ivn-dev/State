const { pool } = require('./pool');
const logger = require('../utils/logger');

// ===============================
// User States Management Functions
// ===============================

/**
 * Зберегти стан користувача
 */
async function saveUserState(telegramId, stateType, stateData) {
  try {
    await pool.query(`
      INSERT INTO user_states (telegram_id, state_type, state_data, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT(telegram_id, state_type) DO UPDATE SET
        state_data = EXCLUDED.state_data,
        updated_at = NOW()
    `, [telegramId, stateType, JSON.stringify(stateData)]);
    return true;
  } catch (error) {
    logger.error('Error saving user state for', { stateType, telegramId, error });
    return false;
  }
}

/**
 * Отримати стан користувача
 */
async function getUserState(telegramId, stateType) {
  try {
    const result = await pool.query(`
      SELECT state_data FROM user_states 
      WHERE telegram_id = $1 AND state_type = $2
    `, [telegramId, stateType]);
    return result.rows.length > 0 ? JSON.parse(result.rows[0].state_data) : null;
  } catch (error) {
    logger.error('Error getting user state for', { stateType, telegramId, error });
    return null;
  }
}

/**
 * Видалити стан користувача
 */
async function deleteUserState(telegramId, stateType) {
  try {
    await pool.query(`
      DELETE FROM user_states WHERE telegram_id = $1 AND state_type = $2
    `, [telegramId, stateType]);
    return true;
  } catch (error) {
    logger.error('Error deleting user state for', { stateType, telegramId, error });
    return false;
  }
}

/**
 * Отримати всі стани певного типу (для відновлення при запуску)
 */
async function getAllUserStates(stateType) {
  try {
    const result = await pool.query(`
      SELECT telegram_id, state_data FROM user_states WHERE state_type = $1
    `, [stateType]);
    return result.rows;
  } catch (error) {
    logger.error('Error getting all user states of type', { stateType, error });
    return [];
  }
}

module.exports = { saveUserState, getUserState, deleteUserState, getAllUserStates };
