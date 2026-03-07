const { pool } = require('../db');
const logger = require('../../utils/logger');

// Оновити налаштування сповіщень
async function updateUserAlertSettings(telegramId, settings) {
  try {
    const fields = [];
    const values = [];

    if (settings.notifyBeforeOff !== undefined) {
      values.push(settings.notifyBeforeOff);
      fields.push(`notify_before_off = $${values.length}`);
    }

    if (settings.notifyBeforeOn !== undefined) {
      values.push(settings.notifyBeforeOn);
      fields.push(`notify_before_on = $${values.length}`);
    }

    if (settings.alertsOffEnabled !== undefined) {
      values.push(settings.alertsOffEnabled ? true : false);
      fields.push(`alerts_off_enabled = $${values.length}`);
    }

    if (settings.alertsOnEnabled !== undefined) {
      values.push(settings.alertsOnEnabled ? true : false);
      fields.push(`alerts_on_enabled = $${values.length}`);
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
    logger.error('Error in updateUserAlertSettings', { error: error.message });
    return false;
  }
}

// Оновити налаштування формату користувача
async function updateUserFormatSettings(telegramId, settings) {
  try {
    const fields = [];
    const values = [];

    if (settings.scheduleCaption !== undefined) {
      values.push(settings.scheduleCaption);
      fields.push(`schedule_caption = $${values.length}`);
    }

    if (settings.periodFormat !== undefined) {
      values.push(settings.periodFormat);
      fields.push(`period_format = $${values.length}`);
    }

    if (settings.powerOffText !== undefined) {
      values.push(settings.powerOffText);
      fields.push(`power_off_text = $${values.length}`);
    }

    if (settings.powerOnText !== undefined) {
      values.push(settings.powerOnText);
      fields.push(`power_on_text = $${values.length}`);
    }

    if (settings.deleteOldMessage !== undefined) {
      values.push(settings.deleteOldMessage ? true : false);
      fields.push(`delete_old_message = $${values.length}`);
    }

    if (settings.pictureOnly !== undefined) {
      values.push(settings.pictureOnly ? true : false);
      fields.push(`picture_only = $${values.length}`);
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
    logger.error('Error in updateUserFormatSettings', { error: error.message });
    return false;
  }
}

// Отримати налаштування формату користувача
async function getUserFormatSettings(telegramId) {
  try {
    const result = await pool.query(`
      SELECT schedule_caption, period_format, power_off_text, power_on_text, 
             delete_old_message, picture_only, last_schedule_message_id
      FROM users WHERE telegram_id = $1
    `, [telegramId]);
    return result.rows[0];
  } catch (error) {
    logger.error('Error in getUserFormatSettings', { error: error.message });
    return null;
  }
}

// Оновити налаштування куди публікувати сповіщення про світло
async function updateUserPowerNotifyTarget(telegramId, target) {
  try {
    // target: 'bot' | 'channel' | 'both'
    const result = await pool.query(`
      UPDATE users 
      SET power_notify_target = $1, updated_at = NOW()
      WHERE telegram_id = $2
    `, [target, telegramId]);

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in updateUserPowerNotifyTarget', { error: error.message });
    return false;
  }
}

// Оновити стан попереджень про графік
async function updateScheduleAlertEnabled(telegramId, enabled) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET schedule_alert_enabled = $1, updated_at = NOW()
      WHERE telegram_id = $2
    `, [enabled ? true : false, telegramId]);

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in updateScheduleAlertEnabled', { error: error.message });
    return false;
  }
}

// Оновити час попередження про графік (у хвилинах)
async function updateScheduleAlertMinutes(telegramId, minutes) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET schedule_alert_minutes = $1, updated_at = NOW()
      WHERE telegram_id = $2
    `, [minutes, telegramId]);

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in updateScheduleAlertMinutes', { error: error.message });
    return false;
  }
}

// Оновити куди надсилати попередження про графік
async function updateScheduleAlertTarget(telegramId, target) {
  try {
    // target: 'bot', 'channel', 'both'
    const result = await pool.query(`
      UPDATE users 
      SET schedule_alert_target = $1, updated_at = NOW()
      WHERE telegram_id = $2
    `, [target, telegramId]);

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in updateScheduleAlertTarget', { error: error.message });
    return false;
  }
}

// Оновити всі налаштування попереджень про графік
async function updateUserScheduleAlertSettings(telegramId, settings) {
  try {
    const fields = [];
    const values = [];

    if (settings.scheduleAlertEnabled !== undefined) {
      values.push(settings.scheduleAlertEnabled ? true : false);
      fields.push(`schedule_alert_enabled = $${values.length}`);
    }

    if (settings.scheduleAlertMinutes !== undefined) {
      values.push(settings.scheduleAlertMinutes);
      fields.push(`schedule_alert_minutes = $${values.length}`);
    }

    if (settings.scheduleAlertTarget !== undefined) {
      values.push(settings.scheduleAlertTarget);
      fields.push(`schedule_alert_target = $${values.length}`);
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
    logger.error('Error in updateUserScheduleAlertSettings', { error: error.message });
    return false;
  }
}

// Update notification settings for a user
async function updateNotificationSettings(telegramId, updates) {
  try {
    const allowedFields = [
      'notify_schedule_changes', 'notify_remind_off', 'notify_fact_off',
      'notify_remind_on', 'notify_fact_on',
      'remind_15m', 'remind_30m', 'remind_1h',
      'notify_schedule_target', 'notify_remind_target', 'notify_power_target',
    ];

    const fields = [];
    const values = [];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        values.push(updates[field]);
        fields.push(`${field} = $${values.length}`);
      }
    }

    if (fields.length === 0) return false;

    fields.push('updated_at = NOW()');
    values.push(telegramId);

    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE telegram_id = $${values.length}`,
      values
    );
    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in updateNotificationSettings', { error: error.message });
    return false;
  }
}

// Update auto-cleanup settings for a user
async function updateCleanupSettings(telegramId, updates) {
  try {
    const allowedFields = ['auto_delete_commands', 'auto_delete_bot_messages'];
    const fields = [];
    const values = [];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        values.push(updates[field]);
        fields.push(`${field} = $${values.length}`);
      }
    }

    if (fields.length === 0) return false;

    fields.push('updated_at = NOW()');
    values.push(telegramId);

    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE telegram_id = $${values.length}`,
      values
    );
    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in updateCleanupSettings', { error: error.message });
    return false;
  }
}

module.exports = {
  updateUserAlertSettings,
  updateUserFormatSettings,
  getUserFormatSettings,
  updateUserPowerNotifyTarget,
  updateScheduleAlertEnabled,
  updateScheduleAlertMinutes,
  updateScheduleAlertTarget,
  updateUserScheduleAlertSettings,
  updateNotificationSettings,
  updateCleanupSettings,
};
