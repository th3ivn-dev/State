const { pool } = require('../db');

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
    console.error('Error in updateUserRegionQueue:', error.message);
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
          updated_at = NOW()
      WHERE telegram_id = $3
    `, [region, queue, telegramId]);

    // Also reset last_published_hash in user_channel_config
    await pool.query(`
      UPDATE user_channel_config
      SET last_published_hash = NULL, updated_at = NOW()
      WHERE user_id = (SELECT id FROM users WHERE telegram_id = $1)
    `, [telegramId]);

    return result.rowCount > 0;
  } catch (error) {
    console.error('Error in updateUserRegionAndQueue:', error.message);
    return false;
  }
}

// Оновити last_post_id користувача
async function updateUserPostId(id, postId) {
  try {
    const result = await pool.query(`
      INSERT INTO user_channel_config (user_id, last_post_id, updated_at)
      VALUES ($2, $1, NOW())
      ON CONFLICT (user_id) DO UPDATE SET last_post_id = EXCLUDED.last_post_id, updated_at = NOW()
    `, [postId, id]);

    return result.rowCount > 0;
  } catch (error) {
    console.error('Error in updateUserPostId:', error.message);
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
    console.error('Error in updateUserRouterIp:', error.message);
    return false;
  }
}

// Оновити ID останнього повідомлення з графіком
async function updateLastScheduleMessageId(telegramId, messageId) {
  try {
    const result = await pool.query(`
      INSERT INTO user_message_tracking (user_id, last_schedule_message_id, updated_at)
      VALUES ((SELECT id FROM users WHERE telegram_id = $1), $2, NOW())
      ON CONFLICT (user_id) DO UPDATE
        SET last_schedule_message_id = EXCLUDED.last_schedule_message_id, updated_at = NOW()
    `, [telegramId, messageId]);

    return result.rowCount > 0;
  } catch (error) {
    console.error('Error in updateLastScheduleMessageId:', error.message);
    return false;
  }
}

// Оновити ID останнього повідомлення з клавіатурою в боті
async function updateLastBotKeyboardMessageId(telegramId, messageId) {
  try {
    const result = await pool.query(`
      INSERT INTO user_message_tracking (user_id, last_bot_keyboard_message_id, updated_at)
      VALUES ((SELECT id FROM users WHERE telegram_id = $1), $2, NOW())
      ON CONFLICT (user_id) DO UPDATE
        SET last_bot_keyboard_message_id = EXCLUDED.last_bot_keyboard_message_id, updated_at = NOW()
    `, [telegramId, messageId]);

    return result.rowCount > 0;
  } catch (error) {
    console.error('Error in updateLastBotKeyboardMessageId:', error.message);
    return false;
  }
}

// Оновити ID останнього нагадування
async function updateLastReminderMessageId(telegramId, messageId) {
  try {
    const result = await pool.query(`
      INSERT INTO user_message_tracking (user_id, last_reminder_message_id, updated_at)
      VALUES ((SELECT id FROM users WHERE telegram_id = $1), $2, NOW())
      ON CONFLICT (user_id) DO UPDATE
        SET last_reminder_message_id = EXCLUDED.last_reminder_message_id, updated_at = NOW()
    `, [telegramId, messageId]);

    return result.rowCount > 0;
  } catch (error) {
    console.error('Error in updateLastReminderMessageId:', error.message);
    return false;
  }
}

// Оновити ID останнього нагадування в каналі
async function updateLastChannelReminderMessageId(telegramId, messageId) {
  try {
    const result = await pool.query(`
      INSERT INTO user_message_tracking (user_id, last_channel_reminder_message_id, updated_at)
      VALUES ((SELECT id FROM users WHERE telegram_id = $1), $2, NOW())
      ON CONFLICT (user_id) DO UPDATE
        SET last_channel_reminder_message_id = EXCLUDED.last_channel_reminder_message_id, updated_at = NOW()
    `, [telegramId, messageId]);

    return result.rowCount > 0;
  } catch (error) {
    console.error('Error in updateLastChannelReminderMessageId:', error.message);
    return false;
  }
}

module.exports = {
  updateUserRegionQueue,
  updateUserRegionAndQueue,
  updateUserPostId,
  updateUserRouterIp,
  updateLastScheduleMessageId,
  updateLastBotKeyboardMessageId,
  updateLastReminderMessageId,
  updateLastChannelReminderMessageId,
};
