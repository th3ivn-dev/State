const { pool } = require('./pool');

// Міграція: додавання нових полів для існуючих БД
async function runMigrations() {
  console.log('🔄 Запуск міграції бази даних...');
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
      { name: 'last_menu_message_id', type: 'INTEGER' }
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

    console.log(`✅ Міграція завершена: перевірено ${addedCount} колонок`);
  } catch (error) {
    console.error('❌ Помилка міграції:', error);
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
