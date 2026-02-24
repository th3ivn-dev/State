const { pool } = require('./pool');

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
    console.error(`Error saving user state ${stateType} for ${telegramId}:`, error);
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
    console.error(`Error getting user state ${stateType} for ${telegramId}:`, error);
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
    console.error(`Error deleting user state ${stateType} for ${telegramId}:`, error);
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
    console.error(`Error getting all user states of type ${stateType}:`, error);
    return [];
  }
}

/**
 * Очистка старих станів (старше 24 годин)
 */
async function cleanupOldStates() {
  try {
    const statesResult = await pool.query(`DELETE FROM user_states WHERE updated_at < NOW() - INTERVAL '24 hours'`);
    const channelsResult = await pool.query(`DELETE FROM pending_channels WHERE created_at < NOW() - INTERVAL '24 hours'`);

    const statesDeleted = statesResult.rowCount || 0;
    const channelsDeleted = channelsResult.rowCount || 0;

    if (statesDeleted > 0 || channelsDeleted > 0) {
      console.log(`🧹 Очищено старих станів: ${statesDeleted} user_states, ${channelsDeleted} pending_channels`);
    }

    return true;
  } catch (error) {
    console.error('Error cleaning up old states:', error);
    return false;
  }
}

module.exports = {
  saveUserState,
  getUserState,
  deleteUserState,
  getAllUserStates,
  cleanupOldStates,
};
