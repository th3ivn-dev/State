/**
 * Pause Log Management
 * Tracks pause/resume events for audit and history
 */

const { pool } = require('./db');

/**
 * Add a pause event to the log
 */
async function logPauseEvent(adminId, eventType, pauseType = null, message = null, reason = null) {
  try {
    await pool.query(`
      INSERT INTO pause_log (admin_id, event_type, pause_type, message, reason, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [adminId, eventType, pauseType, message, reason]);
    return true;
  } catch (error) {
    console.error('Error logging pause event:', error);
    return false;
  }
}

/**
 * Get recent pause events
 */
async function getPauseLog(limit = 20) {
  try {
    const result = await pool.query(`
      SELECT * FROM pause_log
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  } catch (error) {
    console.error('Error getting pause log:', error);
    return [];
  }
}

/**
 * Get pause log statistics
 */
async function getPauseLogStats() {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_events,
        SUM(CASE WHEN event_type = 'pause' THEN 1 ELSE 0 END) as pause_count,
        SUM(CASE WHEN event_type = 'resume' THEN 1 ELSE 0 END) as resume_count,
        MAX(created_at) as last_event_at
      FROM pause_log
    `);

    return result.rows[0] || { total_events: 0, pause_count: 0, resume_count: 0, last_event_at: null };
  } catch (error) {
    console.error('Error getting pause log stats:', error);
    return { total_events: 0, pause_count: 0, resume_count: 0, last_event_at: null };
  }
}

/**
 * Clean old pause log entries (older than 30 days)
 */
async function cleanOldPauseLog() {
  try {
    const result = await pool.query(`
      DELETE FROM pause_log
      WHERE created_at < NOW() - INTERVAL '30 days'
    `);

    const deletedCount = result.rowCount || 0;
    console.log(`🧹 Cleaned ${deletedCount} old pause log entries`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning pause log:', error);
    return 0;
  }
}

module.exports = {
  logPauseEvent,
  getPauseLog,
  getPauseLogStats,
  cleanOldPauseLog,
};
