const { pool } = require('./pool');
const logger = require('../utils/logger');

// Створення таблиць при ініціалізації
async function initializeDatabase() {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
      
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id TEXT UNIQUE NOT NULL,
        username TEXT,
        region TEXT NOT NULL,
        queue TEXT NOT NULL,
        channel_id TEXT,
        channel_title TEXT,
        channel_description TEXT,
        channel_photo_file_id TEXT,
        channel_user_title TEXT,
        channel_user_description TEXT,
        channel_status TEXT DEFAULT 'active',
        router_ip TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        migration_notified INTEGER DEFAULT 0,
        notify_before_off INTEGER DEFAULT 15,
        notify_before_on INTEGER DEFAULT 15,
        alerts_off_enabled BOOLEAN DEFAULT TRUE,
        alerts_on_enabled BOOLEAN DEFAULT TRUE,
        last_hash TEXT,
        last_published_hash TEXT,
        last_post_id INTEGER,
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
        today_snapshot_hash TEXT,
        tomorrow_snapshot_hash TEXT,
        tomorrow_published_date TEXT,
        schedule_caption TEXT DEFAULT NULL,
        period_format TEXT DEFAULT NULL,
        power_off_text TEXT DEFAULT NULL,
        power_on_text TEXT DEFAULT NULL,
        delete_old_message BOOLEAN DEFAULT FALSE,
        picture_only BOOLEAN DEFAULT FALSE,
        last_schedule_message_id INTEGER DEFAULT NULL,
        channel_paused BOOLEAN DEFAULT FALSE,
        power_notify_target TEXT DEFAULT 'both',
        schedule_alert_enabled BOOLEAN DEFAULT TRUE,
        schedule_alert_minutes INTEGER DEFAULT 15,
        schedule_alert_target TEXT DEFAULT 'both',
        last_start_message_id INTEGER,
        last_settings_message_id INTEGER,
        last_timer_message_id INTEGER,
        channel_branding_updated_at TIMESTAMP,
        last_menu_message_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_region_queue ON users(region, queue);
      CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_users_channel_id ON users(channel_id);

      CREATE TABLE IF NOT EXISTS outage_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        duration_minutes INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_user_id ON outage_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_start_time ON outage_history(start_time);

      CREATE TABLE IF NOT EXISTS power_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        duration_seconds INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_power_history_user_id ON power_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_power_history_timestamp ON power_history(timestamp);

      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

      CREATE TABLE IF NOT EXISTS schedule_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        region TEXT NOT NULL,
        queue TEXT NOT NULL,
        schedule_data TEXT NOT NULL,
        hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_schedule_user_id ON schedule_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_schedule_created_at ON schedule_history(created_at);

      CREATE TABLE IF NOT EXISTS user_power_states (
        telegram_id TEXT PRIMARY KEY,
        current_state TEXT,
        pending_state TEXT,
        pending_state_time TEXT,
        last_stable_state TEXT,
        last_stable_at TEXT,
        instability_start TEXT,
        switch_count INTEGER DEFAULT 0,
        last_notification_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_power_states_telegram_id ON user_power_states(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_power_states_updated_at ON user_power_states(updated_at);

      CREATE TABLE IF NOT EXISTS user_states (
        id SERIAL PRIMARY KEY,
        telegram_id TEXT NOT NULL,
        state_type TEXT NOT NULL,
        state_data TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(telegram_id, state_type)
      );

      CREATE INDEX IF NOT EXISTS idx_user_states_telegram_id ON user_states(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_user_states_type ON user_states(state_type);
      CREATE INDEX IF NOT EXISTS idx_user_states_updated_at ON user_states(updated_at);

      CREATE TABLE IF NOT EXISTS pending_channels (
        id SERIAL PRIMARY KEY,
        channel_id TEXT NOT NULL UNIQUE,
        channel_username TEXT,
        channel_title TEXT,
        telegram_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_pending_channels_id ON pending_channels(channel_id);
      CREATE INDEX IF NOT EXISTS idx_pending_channels_telegram_id ON pending_channels(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_pending_channels_created_at ON pending_channels(created_at);
      
      CREATE TABLE IF NOT EXISTS pause_log (
        id SERIAL PRIMARY KEY,
        admin_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        pause_type TEXT,
        message TEXT,
        reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_pause_log_created_at ON pause_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_pause_log_admin_id ON pause_log(admin_id);
      
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        telegram_id TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'feedback',
        status TEXT NOT NULL DEFAULT 'open',
        subject TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        closed_at TIMESTAMP,
        closed_by TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_tickets_telegram_id ON tickets(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_type ON tickets(type);
      CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
      
      CREATE TABLE IF NOT EXISTS ticket_messages (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        sender_type TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        message_type TEXT NOT NULL DEFAULT 'text',
        content TEXT,
        file_id TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);
      
      CREATE TABLE IF NOT EXISTS admin_routers (
        id SERIAL PRIMARY KEY,
        admin_telegram_id VARCHAR(255) NOT NULL UNIQUE,
        router_ip VARCHAR(255) DEFAULT NULL,
        router_port INTEGER DEFAULT 80,
        notifications_on BOOLEAN DEFAULT true,
        last_state VARCHAR(20) DEFAULT NULL,
        last_change_at TIMESTAMP DEFAULT NULL,
        last_check_at TIMESTAMP DEFAULT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_admin_routers_telegram_id ON admin_routers(admin_telegram_id);
      
      CREATE TABLE IF NOT EXISTS admin_router_history (
        id SERIAL PRIMARY KEY,
        admin_telegram_id VARCHAR(255) NOT NULL,
        event_type VARCHAR(20) NOT NULL,
        event_at TIMESTAMP DEFAULT NOW(),
        duration_minutes INTEGER DEFAULT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_admin_router_history_telegram_id ON admin_router_history(admin_telegram_id);
      CREATE INDEX IF NOT EXISTS idx_admin_router_history_event_at ON admin_router_history(event_at);
      
      CREATE TABLE IF NOT EXISTS schedule_checks (
        region VARCHAR(50) NOT NULL,
        queue VARCHAR(10) NOT NULL,
        last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (region, queue)
      );
    `);

    logger.info('✅ База даних ініціалізована');
  } catch (error) {
    logger.error('❌ Помилка ініціалізації бази даних:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { initializeDatabase };
