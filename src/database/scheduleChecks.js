const { pool } = require('./db');

/**
 * Update (or insert) the last_checked_at time for a region+queue pair.
 * Returns the exact timestamp that was stored in the database.
 * @param {string} region
 * @param {string} queue
 * @returns {Promise<Date>} The stored last_checked_at timestamp
 */
async function updateScheduleCheckTime(region, queue) {
  const result = await pool.query(`
    INSERT INTO schedule_checks (region, queue, last_checked_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (region, queue)
    DO UPDATE SET last_checked_at = NOW()
    RETURNING last_checked_at
  `, [region, queue]);
  return result.rows[0].last_checked_at;
}

/**
 * Get the last time the bot checked the schedule for a region+queue pair
 * @param {string} region
 * @param {string} queue
 * @returns {Promise<Date|null>}
 */
async function getScheduleCheckTime(region, queue) {
  const result = await pool.query(`
    SELECT last_checked_at FROM schedule_checks
    WHERE region = $1 AND queue = $2
  `, [region, queue]);
  return result.rows[0]?.last_checked_at || null;
}

module.exports = {
  updateScheduleCheckTime,
  getScheduleCheckTime,
};
