const { pool } = require('./pool');

// Міграція: додавання нових полів для існуючих БД
async function runMigrations() {
  const { SCHEMA_VERSION } = require('../constants/timeouts');

  // Skip migrations if schema is already at current version
  try {
    const versionResult = await pool.query(
      "SELECT value FROM settings WHERE key = 'schema_version'"
    );
    if (versionResult.rows.length > 0) {
      const dbVersion = parseInt(versionResult.rows[0].value, 10);
      if (dbVersion >= SCHEMA_VERSION) {
        console.log(`✅ Міграція: схема актуальна (v${dbVersion})`);
        return;
      }
      console.log(`🔄 Міграція: оновлення v${dbVersion} → v${SCHEMA_VERSION}...`);
    } else {
      console.log('🔄 Запуск міграції бази даних (перша версія)...');
    }
  } catch (_e) {
    console.log('🔄 Запуск міграції бази даних...');
  }

  const client = await pool.connect();

  try {
    const newColumns = [
      { name: 'power_state', type: 'TEXT' },
      { name: 'power_changed_at', type: 'TIMESTAMPTZ' },
      { name: 'pending_power_state', type: 'TEXT' },
      { name: 'pending_power_change_at', type: 'TIMESTAMPTZ' },
      { name: 'last_power_state', type: 'TEXT' },
      { name: 'last_power_change', type: 'INTEGER' },
      { name: 'power_on_duration', type: 'INTEGER' },
      { name: 'last_alert_off_period', type: 'TEXT' },
      { name: 'last_alert_on_period', type: 'TEXT' },
      { name: 'alert_off_message_id', type: 'INTEGER' },
      { name: 'alert_on_message_id', type: 'INTEGER' },
      { name: 'router_ip', type: 'TEXT' },
      { name: 'migration_notified', type: 'INTEGER DEFAULT 0' },
      { name: 'notify_before_off', type: 'INTEGER DEFAULT 15' },
      { name: 'notify_before_on', type: 'INTEGER DEFAULT 15' },
      { name: 'alerts_off_enabled', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'alerts_on_enabled', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'last_published_hash', type: 'TEXT' },
      { name: 'channel_title', type: 'TEXT' },
      { name: 'channel_description', type: 'TEXT' },
      { name: 'channel_photo_file_id', type: 'TEXT' },
      { name: 'channel_user_title', type: 'TEXT' },
      { name: 'channel_user_description', type: 'TEXT' },
      { name: 'channel_status', type: "TEXT DEFAULT 'active'" },
      { name: 'schedule_caption', type: 'TEXT DEFAULT NULL' },
      { name: 'period_format', type: 'TEXT DEFAULT NULL' },
      { name: 'power_off_text', type: 'TEXT DEFAULT NULL' },
      { name: 'power_on_text', type: 'TEXT DEFAULT NULL' },
      { name: 'delete_old_message', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'picture_only', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'last_schedule_message_id', type: 'INTEGER DEFAULT NULL' },
      { name: 'channel_paused', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'power_notify_target', type: "TEXT DEFAULT 'both'" },
      { name: 'schedule_alert_enabled', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'schedule_alert_minutes', type: 'INTEGER DEFAULT 15' },
      { name: 'schedule_alert_target', type: "TEXT DEFAULT 'both'" },
      { name: 'last_start_message_id', type: 'INTEGER' },
      { name: 'last_settings_message_id', type: 'INTEGER' },
      { name: 'last_timer_message_id', type: 'INTEGER' },
      { name: 'channel_branding_updated_at', type: 'TIMESTAMP' },
      { name: 'last_menu_message_id', type: 'INTEGER' },
      // Notification toggles
      { name: 'notify_schedule_changes', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'notify_remind_off', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'notify_fact_off', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'notify_remind_on', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'notify_fact_on', type: 'BOOLEAN DEFAULT TRUE' },
      // Reminder times (multi-select)
      { name: 'remind_15m', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'remind_30m', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'remind_1h', type: 'BOOLEAN DEFAULT FALSE' },
      // Per-type notification targets
      { name: 'notify_schedule_target', type: "TEXT DEFAULT 'bot'" },
      { name: 'notify_remind_target', type: "TEXT DEFAULT 'bot'" },
      { name: 'notify_power_target', type: "TEXT DEFAULT 'bot'" },
      // Auto-cleanup
      { name: 'auto_delete_commands', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'auto_delete_bot_messages', type: 'BOOLEAN DEFAULT FALSE' },
      // Message ID tracking
      { name: 'last_bot_keyboard_message_id', type: 'BIGINT DEFAULT NULL' },
      { name: 'last_reminder_message_id', type: 'BIGINT DEFAULT NULL' },
      // Channel-independent notification settings
      { name: 'ch_notify_schedule', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'ch_notify_remind_off', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'ch_notify_remind_on', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'ch_notify_fact_off', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'ch_notify_fact_on', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'ch_remind_15m', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'ch_remind_30m', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'ch_remind_1h', type: 'BOOLEAN DEFAULT FALSE' },
      // Channel reminder message tracking
      { name: 'last_channel_reminder_message_id', type: 'BIGINT DEFAULT NULL' },
    ];

    let addedCount = 0;
    for (const col of newColumns) {
      try {
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        console.log(`✅ Перевірено колонку: ${col.name}`);
        addedCount++;
      } catch (error) {
        if (!error.message.includes('already exists')) {
          console.error(`⚠️ Помилка при додаванні колонки ${col.name}:`, error.message);
        }
      }
    }

    // Add last_notification_at column to user_power_states table
    try {
      await client.query(`
        ALTER TABLE user_power_states 
        ADD COLUMN IF NOT EXISTS last_notification_at TIMESTAMP
      `);
      console.log(`✅ Перевірено колонку user_power_states.last_notification_at`);
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error(`⚠️ Помилка при додаванні колонки last_notification_at:`, error.message);
      }
    }

    // Migrate power_changed_at to TIMESTAMPTZ if it is still stored as TEXT or TIMESTAMP
    try {
      await client.query(`
        ALTER TABLE users 
        ALTER COLUMN power_changed_at TYPE TIMESTAMPTZ 
        USING power_changed_at::TIMESTAMPTZ
      `);
      console.log('✅ Мігровано power_changed_at -> TIMESTAMPTZ');
    } catch (error) {
      // Column may already be TIMESTAMPTZ — that is fine
      if (!error.message.toLowerCase().includes('already')) {
        console.error('⚠️ Помилка міграції power_changed_at:', error.message);
      }
    }

    // Scale indexes — created here (after migrations add all columns)
    const scaleIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_active_region ON users(region) WHERE is_active = TRUE',
      'CREATE INDEX IF NOT EXISTS idx_users_router_ip_active ON users(id) WHERE router_ip IS NOT NULL AND router_ip != \'\' AND is_active = TRUE',
      'CREATE INDEX IF NOT EXISTS idx_users_active_channel ON users(id) WHERE channel_id IS NOT NULL AND is_active = TRUE AND channel_status = \'active\'',
      'CREATE INDEX IF NOT EXISTS idx_users_reminders ON users(region, queue) WHERE is_active = TRUE AND (notify_remind_off = TRUE OR notify_fact_off = TRUE OR notify_remind_on = TRUE OR notify_fact_on = TRUE)',
      'CREATE INDEX IF NOT EXISTS idx_users_created_at_desc ON users(created_at DESC)',
    ];
    for (const ddl of scaleIndexes) {
      try {
        await client.query(ddl);
      } catch (idxErr) {
        console.warn(`⚠️ Index creation skipped: ${idxErr.message}`);
      }
    }

    // Store schema version so subsequent startups skip this block
    try {
      await client.query(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', $1, NOW())
        ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `, [String(SCHEMA_VERSION)]);
    } catch (vErr) {
      console.error('⚠️ Не вдалося зберегти schema_version:', vErr.message);
    }

    // Migration v6: create normalized satellite tables and copy data from users
    const normalizationTables = [
      `CREATE TABLE IF NOT EXISTS user_notification_settings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        notify_before_off INTEGER DEFAULT 15,
        notify_before_on INTEGER DEFAULT 15,
        alerts_off_enabled BOOLEAN DEFAULT TRUE,
        alerts_on_enabled BOOLEAN DEFAULT TRUE,
        power_notify_target TEXT DEFAULT 'both',
        schedule_alert_enabled BOOLEAN DEFAULT TRUE,
        schedule_alert_minutes INTEGER DEFAULT 15,
        schedule_alert_target TEXT DEFAULT 'both',
        notify_schedule_changes BOOLEAN DEFAULT TRUE,
        notify_remind_off BOOLEAN DEFAULT TRUE,
        notify_fact_off BOOLEAN DEFAULT TRUE,
        notify_remind_on BOOLEAN DEFAULT TRUE,
        notify_fact_on BOOLEAN DEFAULT TRUE,
        remind_15m BOOLEAN DEFAULT TRUE,
        remind_30m BOOLEAN DEFAULT FALSE,
        remind_1h BOOLEAN DEFAULT FALSE,
        notify_schedule_target TEXT DEFAULT 'bot',
        notify_remind_target TEXT DEFAULT 'bot',
        notify_power_target TEXT DEFAULT 'bot',
        auto_delete_commands BOOLEAN DEFAULT FALSE,
        auto_delete_bot_messages BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_notif_settings_user_id ON user_notification_settings(user_id)`,
      `CREATE TABLE IF NOT EXISTS user_channel_config (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        channel_id TEXT,
        channel_title TEXT,
        channel_description TEXT,
        channel_photo_file_id TEXT,
        channel_user_title TEXT,
        channel_user_description TEXT,
        channel_status TEXT DEFAULT 'active',
        channel_paused BOOLEAN DEFAULT FALSE,
        channel_branding_updated_at TIMESTAMP,
        last_published_hash TEXT,
        last_post_id INTEGER,
        schedule_caption TEXT DEFAULT NULL,
        period_format TEXT DEFAULT NULL,
        power_off_text TEXT DEFAULT NULL,
        power_on_text TEXT DEFAULT NULL,
        delete_old_message BOOLEAN DEFAULT FALSE,
        picture_only BOOLEAN DEFAULT FALSE,
        ch_notify_schedule BOOLEAN DEFAULT TRUE,
        ch_notify_remind_off BOOLEAN DEFAULT TRUE,
        ch_notify_remind_on BOOLEAN DEFAULT TRUE,
        ch_notify_fact_off BOOLEAN DEFAULT TRUE,
        ch_notify_fact_on BOOLEAN DEFAULT TRUE,
        ch_remind_15m BOOLEAN DEFAULT TRUE,
        ch_remind_30m BOOLEAN DEFAULT FALSE,
        ch_remind_1h BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_channel_config_user_id ON user_channel_config(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_channel_config_channel_id ON user_channel_config(channel_id)`,
      `CREATE TABLE IF NOT EXISTS user_power_tracking (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        power_state TEXT,
        power_changed_at TIMESTAMPTZ,
        pending_power_state TEXT,
        pending_power_change_at TIMESTAMPTZ,
        last_power_state TEXT,
        last_power_change INTEGER,
        power_on_duration INTEGER,
        last_alert_off_period TEXT,
        last_alert_on_period TEXT,
        alert_off_message_id INTEGER,
        alert_on_message_id INTEGER,
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_power_tracking_user_id ON user_power_tracking(user_id)`,
      `CREATE TABLE IF NOT EXISTS user_message_tracking (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        last_schedule_message_id INTEGER DEFAULT NULL,
        last_bot_keyboard_message_id BIGINT DEFAULT NULL,
        last_reminder_message_id BIGINT DEFAULT NULL,
        last_channel_reminder_message_id BIGINT DEFAULT NULL,
        last_start_message_id INTEGER,
        last_settings_message_id INTEGER,
        last_timer_message_id INTEGER,
        last_menu_message_id INTEGER,
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_msg_tracking_user_id ON user_message_tracking(user_id)`,
    ];

    for (const ddl of normalizationTables) {
      try {
        await client.query(ddl);
      } catch (ddlErr) {
        console.warn(`⚠️ Normalization DDL skipped: ${ddlErr.message}`);
      }
    }

    // Copy existing data from users into the satellite tables (no overwrites)
    const dataCopies = [
      `INSERT INTO user_notification_settings (
        user_id, notify_before_off, notify_before_on, alerts_off_enabled, alerts_on_enabled,
        power_notify_target, schedule_alert_enabled, schedule_alert_minutes, schedule_alert_target,
        notify_schedule_changes, notify_remind_off, notify_fact_off, notify_remind_on, notify_fact_on,
        remind_15m, remind_30m, remind_1h, notify_schedule_target, notify_remind_target,
        notify_power_target, auto_delete_commands, auto_delete_bot_messages
      )
      SELECT
        id,
        COALESCE(notify_before_off, 15),
        COALESCE(notify_before_on, 15),
        COALESCE(alerts_off_enabled, TRUE),
        COALESCE(alerts_on_enabled, TRUE),
        COALESCE(power_notify_target, 'both'),
        COALESCE(schedule_alert_enabled, TRUE),
        COALESCE(schedule_alert_minutes, 15),
        COALESCE(schedule_alert_target, 'both'),
        COALESCE(notify_schedule_changes, TRUE),
        COALESCE(notify_remind_off, TRUE),
        COALESCE(notify_fact_off, TRUE),
        COALESCE(notify_remind_on, TRUE),
        COALESCE(notify_fact_on, TRUE),
        COALESCE(remind_15m, TRUE),
        COALESCE(remind_30m, FALSE),
        COALESCE(remind_1h, FALSE),
        COALESCE(notify_schedule_target, 'bot'),
        COALESCE(notify_remind_target, 'bot'),
        COALESCE(notify_power_target, 'bot'),
        COALESCE(auto_delete_commands, FALSE),
        COALESCE(auto_delete_bot_messages, FALSE)
      FROM users
      ON CONFLICT DO NOTHING`,
      `INSERT INTO user_channel_config (
        user_id, channel_id, channel_title, channel_description, channel_photo_file_id,
        channel_user_title, channel_user_description, channel_status, channel_paused,
        channel_branding_updated_at, last_published_hash, last_post_id, schedule_caption,
        period_format, power_off_text, power_on_text, delete_old_message, picture_only,
        ch_notify_schedule, ch_notify_remind_off, ch_notify_remind_on, ch_notify_fact_off,
        ch_notify_fact_on, ch_remind_15m, ch_remind_30m, ch_remind_1h
      )
      SELECT
        id, channel_id, channel_title, channel_description, channel_photo_file_id,
        channel_user_title, channel_user_description,
        COALESCE(channel_status, 'active'),
        COALESCE(channel_paused, FALSE),
        channel_branding_updated_at, last_published_hash, last_post_id, schedule_caption,
        period_format, power_off_text, power_on_text,
        COALESCE(delete_old_message, FALSE),
        COALESCE(picture_only, FALSE),
        COALESCE(ch_notify_schedule, TRUE),
        COALESCE(ch_notify_remind_off, TRUE),
        COALESCE(ch_notify_remind_on, TRUE),
        COALESCE(ch_notify_fact_off, TRUE),
        COALESCE(ch_notify_fact_on, TRUE),
        COALESCE(ch_remind_15m, TRUE),
        COALESCE(ch_remind_30m, FALSE),
        COALESCE(ch_remind_1h, FALSE)
      FROM users
      ON CONFLICT DO NOTHING`,
      `INSERT INTO user_power_tracking (
        user_id, power_state, power_changed_at, pending_power_state, pending_power_change_at,
        last_power_state, last_power_change, power_on_duration, last_alert_off_period,
        last_alert_on_period, alert_off_message_id, alert_on_message_id
      )
      SELECT
        id, power_state, power_changed_at, pending_power_state, pending_power_change_at,
        last_power_state, last_power_change, power_on_duration, last_alert_off_period,
        last_alert_on_period, alert_off_message_id, alert_on_message_id
      FROM users
      ON CONFLICT DO NOTHING`,
      `INSERT INTO user_message_tracking (
        user_id, last_schedule_message_id, last_bot_keyboard_message_id, last_reminder_message_id,
        last_channel_reminder_message_id,
        last_start_message_id, last_settings_message_id, last_timer_message_id, last_menu_message_id
      )
      SELECT
        id, last_schedule_message_id, last_bot_keyboard_message_id, last_reminder_message_id,
        last_channel_reminder_message_id,
        last_start_message_id, last_settings_message_id, last_timer_message_id, last_menu_message_id
      FROM users
      ON CONFLICT DO NOTHING`,
    ];

    for (const dml of dataCopies) {
      try {
        const res = await client.query(dml);
        console.log(`✅ Normalization data copy: ${res.rowCount} rows inserted`);
      } catch (dmlErr) {
        console.warn(`⚠️ Normalization data copy skipped: ${dmlErr.message}`);
      }
    }

    // Ensure last_channel_reminder_message_id exists in user_message_tracking
    // (may be missing if the table was created by schema.js before this column was added)
    try {
      await client.query(`ALTER TABLE user_message_tracking ADD COLUMN IF NOT EXISTS last_channel_reminder_message_id BIGINT DEFAULT NULL`);
    } catch (e) {
      console.warn(`⚠️ Could not add last_channel_reminder_message_id to user_message_tracking: ${e.message}`);
    }

    console.log(`✅ Міграція завершена (v${SCHEMA_VERSION}): перевірено ${addedCount} колонок`);
  } catch (error) {
    console.error('❌ Помилка міграції:', error);
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
