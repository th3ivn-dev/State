const { pool } = require('./pool');
const logger = require('../utils/logger');

// Helper functions for settings table
async function getSetting(key, defaultValue = null) {
  try {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    return result.rows.length > 0 ? result.rows[0].value : defaultValue;
  } catch (error) {
    logger.error('Error getting setting', { key, error });
    return defaultValue;
  }
}

async function setSetting(key, value) {
  try {
    await pool.query(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT(key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
    `, [key, String(value)]);
    return true;
  } catch (error) {
    logger.error('Error setting', { key, error });
    return false;
  }
}

module.exports = { getSetting, setSetting };
