const { pool, safeQuery } = require('../db');
const logger = require('../../utils/logger');

// Створити нового користувача
async function createUser(telegramId, username, region, queue) {
  try {
    const result = await pool.query(`
      INSERT INTO users (telegram_id, username, region, queue)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [telegramId, username, region, queue]);

    return result.rows[0].id;
  } catch (error) {
    logger.error('Помилка створення користувача', { error.message });
    throw error;
  }
}

// Зберегти користувача (створити або оновити через upsert)
async function saveUser(telegramId, username, region, queue) {
  try {
    const result = await pool.query(`
      INSERT INTO users (telegram_id, username, region, queue)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (telegram_id) 
      DO UPDATE SET 
        username = EXCLUDED.username,
        region = EXCLUDED.region,
        queue = EXCLUDED.queue,
        updated_at = NOW()
      RETURNING id
    `, [telegramId, username, region, queue]);

    return result.rows[0].id;
  } catch (error) {
    logger.error('Помилка збереження користувача', { error.message });
    throw error;
  }
}

// Отримати користувача по telegram_id (uses safeQuery for connection resilience)
async function getUserByTelegramId(telegramId) {
  try {
    const result = await safeQuery('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
    return result.rows[0];
  } catch (error) {
    logger.error('Error getting user by telegram_id', { error.message });
    throw error;
  }
}

// Отримати користувача по ID
async function getUserById(id) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0];
  } catch (error) {
    logger.error('Error getting user by id', { error.message });
    throw error;
  }
}

// Отримати користувача по channel_id
async function getUserByChannelId(channelId) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE channel_id = $1', [channelId]);
    return result.rows[0];
  } catch (error) {
    logger.error('Error getting user by channel_id', { error.message });
    throw error;
  }
}

// Активувати/деактивувати користувача
async function setUserActive(telegramId, isActive) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET is_active = $1, updated_at = NOW()
      WHERE telegram_id = $2
    `, [isActive ? true : false, telegramId]);

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in setUserActive', { error.message });
    return false;
  }
}

// Видалити користувача
async function deleteUser(telegramId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramId]);
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    const userId = userResult.rows[0].id;

    await client.query('DELETE FROM outage_history WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM power_history WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM schedule_history WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error deleting user', { error.message });
    return false;
  } finally {
    client.release();
  }
}

// Оновити ID повідомлень (для авто-видалення попередніх повідомлень)
async function updateUser(telegramId, updates) {
  try {
    const fields = [];
    const values = [];

    if (updates.last_start_message_id !== undefined) {
      values.push(updates.last_start_message_id);
      fields.push(`last_start_message_id = $${values.length}`);
    }

    if (updates.last_settings_message_id !== undefined) {
      values.push(updates.last_settings_message_id);
      fields.push(`last_settings_message_id = $${values.length}`);
    }

    if (updates.last_schedule_message_id !== undefined) {
      values.push(updates.last_schedule_message_id);
      fields.push(`last_schedule_message_id = $${values.length}`);
    }

    if (updates.last_timer_message_id !== undefined) {
      values.push(updates.last_timer_message_id);
      fields.push(`last_timer_message_id = $${values.length}`);
    }

    if (updates.last_menu_message_id !== undefined) {
      values.push(updates.last_menu_message_id);
      fields.push(`last_menu_message_id = $${values.length}`);
    }

    if (updates.channel_id !== undefined) {
      values.push(updates.channel_id);
      fields.push(`channel_id = $${values.length}`);
    }

    if (updates.channel_title !== undefined) {
      values.push(updates.channel_title);
      fields.push(`channel_title = $${values.length}`);
    }

    if (updates.channel_description !== undefined) {
      values.push(updates.channel_description);
      fields.push(`channel_description = $${values.length}`);
    }

    if (updates.channel_photo_file_id !== undefined) {
      values.push(updates.channel_photo_file_id);
      fields.push(`channel_photo_file_id = $${values.length}`);
    }

    if (updates.channel_user_title !== undefined) {
      values.push(updates.channel_user_title);
      fields.push(`channel_user_title = $${values.length}`);
    }

    if (updates.channel_user_description !== undefined) {
      values.push(updates.channel_user_description);
      fields.push(`channel_user_description = $${values.length}`);
    }

    if (updates.channel_status !== undefined) {
      values.push(updates.channel_status);
      fields.push(`channel_status = $${values.length}`);
    }

    if (updates.channel_paused !== undefined) {
      values.push(updates.channel_paused ? true : false);
      fields.push(`channel_paused = $${values.length}`);
    }

    if (updates.last_published_hash !== undefined) {
      values.push(updates.last_published_hash);
      fields.push(`last_published_hash = $${values.length}`);
    }

    if (updates.last_post_id !== undefined) {
      values.push(updates.last_post_id);
      fields.push(`last_post_id = $${values.length}`);
    }

    if (updates.last_hash !== undefined) {
      values.push(updates.last_hash);
      fields.push(`last_hash = $${values.length}`);
    }

    if (updates.router_ip !== undefined) {
      values.push(updates.router_ip);
      fields.push(`router_ip = $${values.length}`);
    }

    if (updates.notify_before_off !== undefined) {
      values.push(updates.notify_before_off);
      fields.push(`notify_before_off = $${values.length}`);
    }

    if (updates.notify_before_on !== undefined) {
      values.push(updates.notify_before_on);
      fields.push(`notify_before_on = $${values.length}`);
    }

    if (updates.alerts_off_enabled !== undefined) {
      values.push(updates.alerts_off_enabled ? true : false);
      fields.push(`alerts_off_enabled = $${values.length}`);
    }

    if (updates.alerts_on_enabled !== undefined) {
      values.push(updates.alerts_on_enabled ? true : false);
      fields.push(`alerts_on_enabled = $${values.length}`);
    }

    if (updates.is_active !== undefined) {
      values.push(updates.is_active ? true : false);
      fields.push(`is_active = $${values.length}`);
    }

    if (updates.power_notify_target !== undefined) {
      values.push(updates.power_notify_target);
      fields.push(`power_notify_target = $${values.length}`);
    }

    if (fields.length === 0) return false;

    fields.push('updated_at = NOW()');
    values.push(telegramId);

    const result = await pool.query(`
      UPDATE users 
      SET ${fields.join(', ')}
      WHERE telegram_id = $${values.length}
    `, values);

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in updateUser', { error.message });
    return false;
  }
}

module.exports = {
  createUser,
  saveUser,
  getUserByTelegramId,
  getUserById,
  getUserByChannelId,
  deleteUser,
  setUserActive,
  updateUser,
};
