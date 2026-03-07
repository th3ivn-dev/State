const { pool } = require('./pool');
const logger = require('../utils/logger');

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
      logger.info('🧹 Очищено старих станів: user_states, pending_channels', { statesDeleted, channelsDeleted });
    }

    return true;
  } catch (error) {
    logger.error('Error cleaning up old states', { error });
    return false;
  }
}

module.exports = { cleanupOldStates };
