const { pool } = require('./pool');
const logger = require('../utils/logger');

// ===============================
// Pending Channels Management Functions
// ===============================

/**
 * Зберегти pending channel
 */
async function savePendingChannel(channelId, channelUsername, channelTitle, telegramId) {
  try {
    await pool.query(`
      INSERT INTO pending_channels (channel_id, channel_username, channel_title, telegram_id, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT(channel_id) DO UPDATE SET
        channel_username = EXCLUDED.channel_username,
        channel_title = EXCLUDED.channel_title,
        telegram_id = EXCLUDED.telegram_id,
        created_at = NOW()
    `, [channelId, channelUsername, channelTitle, telegramId]);
    return true;
  } catch (error) {
    logger.error('Error saving pending channel', { channelId, error });
    return false;
  }
}

/**
 * Отримати pending channel
 */
async function getPendingChannel(channelId) {
  try {
    const result = await pool.query(`SELECT * FROM pending_channels WHERE channel_id = $1`, [channelId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Error getting pending channel', { channelId, error });
    return null;
  }
}

/**
 * Видалити pending channel
 */
async function deletePendingChannel(channelId) {
  try {
    await pool.query(`DELETE FROM pending_channels WHERE channel_id = $1`, [channelId]);
    return true;
  } catch (error) {
    logger.error('Error deleting pending channel', { channelId, error });
    return false;
  }
}

/**
 * Отримати всі pending channels
 */
async function getAllPendingChannels() {
  try {
    const result = await pool.query(`SELECT * FROM pending_channels`);
    return result.rows;
  } catch (error) {
    logger.error('Error getting all pending channels:', error);
    return [];
  }
}

module.exports = { savePendingChannel, getPendingChannel, deletePendingChannel, getAllPendingChannels };
