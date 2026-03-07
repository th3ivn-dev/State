const { pool } = require('../db');
const logger = require('../../utils/logger');

// Оновити регіон та чергу користувача
async function updateUserRegionQueue(telegramId, region, queue) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET region = $1, queue = $2, updated_at = NOW()
      WHERE telegram_id = $3
    `, [region, queue, telegramId]);

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in updateUserRegionQueue', { error.message });
    return false;
  }
}

// Оновити регіон та чергу користувача і скинути хеші
async function updateUserRegionAndQueue(telegramId, region, queue) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET region = $1, 
          queue = $2, 
          last_hash = NULL, 
          last_published_hash = NULL,
          updated_at = NOW()
      WHERE telegram_id = $3
    `, [region, queue, telegramId]);

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in updateUserRegionAndQueue', { error.message });
    return false;
  }
}

// Оновити last_post_id користувача
async function updateUserPostId(id, postId) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET last_post_id = $1, updated_at = NOW()
      WHERE id = $2
    `, [postId, id]);

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in updateUserPostId', { error.message });
    return false;
  }
}

// Оновити router_ip користувача
async function updateUserRouterIp(telegramId, routerIp) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET router_ip = $1, updated_at = NOW()
      WHERE telegram_id = $2
    `, [routerIp, telegramId]);

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in updateUserRouterIp', { error.message });
    return false;
  }
}

// Оновити ID останнього повідомлення з графіком
async function updateLastScheduleMessageId(telegramId, messageId) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET last_schedule_message_id = $1, updated_at = NOW()
      WHERE telegram_id = $2
    `, [messageId, telegramId]);

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in updateLastScheduleMessageId', { error.message });
    return false;
  }
}

module.exports = {
  updateUserRegionQueue,
  updateUserRegionAndQueue,
  updateUserPostId,
  updateUserRouterIp,
  updateLastScheduleMessageId,
};
