const { pool } = require('./pool');
const dbCache = require('../../utils/dbCache');

// Helper functions for settings table with caching
async function getSetting(key, defaultValue = null) {
  try {
    // Check cache first
    const cacheKey = `setting:${key}`;
    const cached = dbCache.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Query database
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    const value = result.rows.length > 0 ? result.rows[0].value : defaultValue;

    // Cache for 60 seconds (settings rarely change)
    if (value !== null) {
      dbCache.set(cacheKey, value, 60);
    }

    return value;
  } catch (error) {
    console.error(`Error getting setting ${key}:`, error);
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

    // Invalidate cache
    const cacheKey = `setting:${key}`;
    dbCache.delete(cacheKey);

    return true;
  } catch (error) {
    console.error(`Error setting ${key}:`, error);
    return false;
  }
}

module.exports = {
  getSetting,
  setSetting,
};
