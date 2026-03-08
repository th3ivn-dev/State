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
      { name: 'last_reminder_message_id', type: 'BIGINT DEFAULT NULL' }
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

    console.log(`✅ Міграція завершена (v${SCHEMA_VERSION}): перевірено ${addedCount} колонок`);
  } catch (error) {
    console.error('❌ Помилка міграції:', error);
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
