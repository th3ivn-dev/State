const { pool } = require('../db');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('UserJoins');

/**
 * LEFT JOIN users з усіма 4 satellite-таблицями.
 * Повертає flat об'єкт для зворотної сумісності з SELECT * FROM users.
 * @param {string} telegramId
 * @returns {Object|null}
 */
async function getUserFullProfile(telegramId) {
  try {
    const result = await pool.query(
      `SELECT u.*,
        uns.notify_before_off         AS ns_notify_before_off,
        uns.notify_before_on          AS ns_notify_before_on,
        uns.alerts_off_enabled        AS ns_alerts_off_enabled,
        uns.alerts_on_enabled         AS ns_alerts_on_enabled,
        uns.power_notify_target       AS ns_power_notify_target,
        uns.schedule_alert_enabled    AS ns_schedule_alert_enabled,
        uns.schedule_alert_minutes    AS ns_schedule_alert_minutes,
        uns.schedule_alert_target     AS ns_schedule_alert_target,
        uns.notify_schedule_changes   AS ns_notify_schedule_changes,
        uns.notify_remind_off         AS ns_notify_remind_off,
        uns.notify_fact_off           AS ns_notify_fact_off,
        uns.notify_remind_on          AS ns_notify_remind_on,
        uns.notify_fact_on            AS ns_notify_fact_on,
        uns.remind_15m                AS ns_remind_15m,
        uns.remind_30m                AS ns_remind_30m,
        uns.remind_1h                 AS ns_remind_1h,
        uns.notify_schedule_target    AS ns_notify_schedule_target,
        uns.notify_remind_target      AS ns_notify_remind_target,
        uns.notify_power_target       AS ns_notify_power_target,
        uns.auto_delete_commands      AS ns_auto_delete_commands,
        uns.auto_delete_bot_messages  AS ns_auto_delete_bot_messages,
        ucc.channel_id                AS cc_channel_id,
        ucc.channel_title             AS cc_channel_title,
        ucc.channel_description       AS cc_channel_description,
        ucc.channel_photo_file_id     AS cc_channel_photo_file_id,
        ucc.channel_user_title        AS cc_channel_user_title,
        ucc.channel_user_description  AS cc_channel_user_description,
        ucc.channel_status            AS cc_channel_status,
        ucc.channel_paused            AS cc_channel_paused,
        ucc.channel_branding_updated_at AS cc_channel_branding_updated_at,
        ucc.last_published_hash       AS cc_last_published_hash,
        ucc.last_post_id              AS cc_last_post_id,
        ucc.schedule_caption          AS cc_schedule_caption,
        ucc.period_format             AS cc_period_format,
        ucc.power_off_text            AS cc_power_off_text,
        ucc.power_on_text             AS cc_power_on_text,
        ucc.delete_old_message        AS cc_delete_old_message,
        ucc.picture_only              AS cc_picture_only,
        ucc.ch_notify_schedule        AS cc_ch_notify_schedule,
        ucc.ch_notify_remind_off      AS cc_ch_notify_remind_off,
        ucc.ch_notify_remind_on       AS cc_ch_notify_remind_on,
        ucc.ch_notify_fact_off        AS cc_ch_notify_fact_off,
        ucc.ch_notify_fact_on         AS cc_ch_notify_fact_on,
        ucc.ch_remind_15m             AS cc_ch_remind_15m,
        ucc.ch_remind_30m             AS cc_ch_remind_30m,
        ucc.ch_remind_1h              AS cc_ch_remind_1h,
        upt.power_state               AS pt_power_state,
        upt.power_changed_at          AS pt_power_changed_at,
        upt.pending_power_state       AS pt_pending_power_state,
        upt.pending_power_change_at   AS pt_pending_power_change_at,
        upt.last_power_state          AS pt_last_power_state,
        upt.last_power_change         AS pt_last_power_change,
        upt.power_on_duration         AS pt_power_on_duration,
        upt.last_alert_off_period     AS pt_last_alert_off_period,
        upt.last_alert_on_period      AS pt_last_alert_on_period,
        upt.alert_off_message_id      AS pt_alert_off_message_id,
        upt.alert_on_message_id       AS pt_alert_on_message_id,
        umt.last_schedule_message_id  AS mt_last_schedule_message_id,
        umt.last_bot_keyboard_message_id AS mt_last_bot_keyboard_message_id,
        umt.last_reminder_message_id  AS mt_last_reminder_message_id,
        umt.last_start_message_id     AS mt_last_start_message_id,
        umt.last_settings_message_id  AS mt_last_settings_message_id,
        umt.last_timer_message_id     AS mt_last_timer_message_id,
        umt.last_menu_message_id      AS mt_last_menu_message_id
      FROM users u
      LEFT JOIN user_notification_settings uns ON uns.user_id = u.id
      LEFT JOIN user_channel_config ucc ON ucc.user_id = u.id
      LEFT JOIN user_power_tracking upt ON upt.user_id = u.id
      LEFT JOIN user_message_tracking umt ON umt.user_id = u.id
      WHERE u.telegram_id = $1`,
      [telegramId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('getUserFullProfile failed', { telegramId, error: error.message });
    return null;
  }
}

/**
 * JOIN users з user_notification_settings.
 * Повертає flat об'єкт для зворотної сумісності.
 * @param {string} telegramId
 * @returns {Object|null}
 */
async function getUserWithNotifications(telegramId) {
  try {
    const result = await pool.query(
      `SELECT u.*,
        uns.notify_before_off, uns.notify_before_on,
        uns.alerts_off_enabled, uns.alerts_on_enabled,
        uns.power_notify_target, uns.schedule_alert_enabled,
        uns.schedule_alert_minutes, uns.schedule_alert_target,
        uns.notify_schedule_changes, uns.notify_remind_off,
        uns.notify_fact_off, uns.notify_remind_on, uns.notify_fact_on,
        uns.remind_15m, uns.remind_30m, uns.remind_1h,
        uns.notify_schedule_target, uns.notify_remind_target,
        uns.notify_power_target, uns.auto_delete_commands,
        uns.auto_delete_bot_messages
      FROM users u
      LEFT JOIN user_notification_settings uns ON uns.user_id = u.id
      WHERE u.telegram_id = $1`,
      [telegramId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('getUserWithNotifications failed', { telegramId, error: error.message });
    return null;
  }
}

/**
 * JOIN users з user_channel_config.
 * Повертає flat об'єкт для зворотної сумісності.
 * @param {string} telegramId
 * @returns {Object|null}
 */
async function getUserWithChannel(telegramId) {
  try {
    const result = await pool.query(
      `SELECT u.*,
        ucc.channel_id, ucc.channel_title, ucc.channel_description,
        ucc.channel_photo_file_id, ucc.channel_user_title, ucc.channel_user_description,
        ucc.channel_status, ucc.channel_paused, ucc.channel_branding_updated_at,
        ucc.last_published_hash, ucc.last_post_id, ucc.schedule_caption,
        ucc.period_format, ucc.power_off_text, ucc.power_on_text,
        ucc.delete_old_message, ucc.picture_only,
        ucc.ch_notify_schedule, ucc.ch_notify_remind_off, ucc.ch_notify_remind_on,
        ucc.ch_notify_fact_off, ucc.ch_notify_fact_on,
        ucc.ch_remind_15m, ucc.ch_remind_30m, ucc.ch_remind_1h
      FROM users u
      LEFT JOIN user_channel_config ucc ON ucc.user_id = u.id
      WHERE u.telegram_id = $1`,
      [telegramId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('getUserWithChannel failed', { telegramId, error: error.message });
    return null;
  }
}

/**
 * JOIN users з user_power_tracking.
 * Повертає flat об'єкт для зворотної сумісності.
 * @param {string} telegramId
 * @returns {Object|null}
 */
async function getUserWithPowerState(telegramId) {
  try {
    const result = await pool.query(
      `SELECT u.*,
        upt.power_state, upt.power_changed_at,
        upt.pending_power_state, upt.pending_power_change_at,
        upt.last_power_state, upt.last_power_change, upt.power_on_duration,
        upt.last_alert_off_period, upt.last_alert_on_period,
        upt.alert_off_message_id, upt.alert_on_message_id
      FROM users u
      LEFT JOIN user_power_tracking upt ON upt.user_id = u.id
      WHERE u.telegram_id = $1`,
      [telegramId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('getUserWithPowerState failed', { telegramId, error: error.message });
    return null;
  }
}

/**
 * JOIN users з user_message_tracking.
 * Повертає flat об'єкт для зворотної сумісності.
 * @param {string} telegramId
 * @returns {Object|null}
 */
async function getUserWithMessages(telegramId) {
  try {
    const result = await pool.query(
      `SELECT u.*,
        umt.last_schedule_message_id, umt.last_bot_keyboard_message_id,
        umt.last_reminder_message_id, umt.last_start_message_id,
        umt.last_settings_message_id, umt.last_timer_message_id,
        umt.last_menu_message_id
      FROM users u
      LEFT JOIN user_message_tracking umt ON umt.user_id = u.id
      WHERE u.telegram_id = $1`,
      [telegramId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('getUserWithMessages failed', { telegramId, error: error.message });
    return null;
  }
}

module.exports = {
  getUserFullProfile,
  getUserWithNotifications,
  getUserWithChannel,
  getUserWithPowerState,
  getUserWithMessages,
};
