const { pool } = require('../db');

// Отримати статистику користувачів
async function getUserStats() {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = TRUE) as active,
        COUNT(*) FILTER (WHERE channel_id IS NOT NULL) as with_channels
      FROM users
    `);

    const byRegionResult = await pool.query(`
      SELECT region, COUNT(*) as count 
      FROM users WHERE is_active = TRUE 
      GROUP BY region
    `);

    return {
      total: parseInt(result.rows[0].total, 10),
      active: parseInt(result.rows[0].active, 10),
      withChannels: parseInt(result.rows[0].with_channels, 10),
      byRegion: byRegionResult.rows,
    };
  } catch (error) {
    console.error('Error in getUserStats:', error.message);
    return { total: 0, active: 0, withChannels: 0, byRegion: [] };
  }
}

// NEW: Get user count for health check
async function getUserCount() {
  try {
    const result = await pool.query('SELECT COUNT(*) as count FROM users WHERE is_active = TRUE');
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    console.error('Error in getUserCount:', error.message);
    return 0;
  }
}

module.exports = {
  getUserStats,
  getUserCount,
};
