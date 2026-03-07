const { pool } = require('./db');

/**
 * Add a schedule to history
 * Keeps only one schedule per day per user (latest version)
 */
async function addScheduleToHistory(userId, region, queue, scheduleData, hash) {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Delete any existing schedule for today before inserting new one
    const today = new Date().toISOString().split('T')[0];
    await client.query(`
      DELETE FROM schedule_history 
      WHERE user_id = $1 AND DATE(created_at) = $2
    `, [userId, today]);

    // Insert new schedule
    await client.query(`
      INSERT INTO schedule_history (user_id, region, queue, schedule_data, hash, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [userId, region, queue, JSON.stringify(scheduleData), hash]);

    await client.query('COMMIT');
    return true;
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Error adding schedule to history:', error);
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Get the last schedule for a user
 */
async function getLastSchedule(userId) {
  try {
    const result = await pool.query(`
      SELECT * FROM schedule_history
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId]);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      row.schedule_data = JSON.parse(row.schedule_data);
      return row;
    }

    return null;
  } catch (error) {
    console.error('Error getting last schedule:', error);
    return null;
  }
}

/**
 * Get the previous schedule (second to last) for a user
 */
async function getPreviousSchedule(userId) {
  try {
    const result = await pool.query(`
      SELECT * FROM schedule_history
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1 OFFSET 1
    `, [userId]);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      row.schedule_data = JSON.parse(row.schedule_data);
      return row;
    }

    return null;
  } catch (error) {
    console.error('Error getting previous schedule:', error);
    return null;
  }
}

/**
 * Clean old schedule history (older than 7 days)
 * This is called by cron at 03:00
 */
async function cleanOldSchedules() {
  try {
    const result = await pool.query(`
      DELETE FROM schedule_history
      WHERE created_at < NOW() - INTERVAL '7 days'
    `);

    const deletedCount = result.rowCount || 0;
    console.log(`🧹 Cleaned ${deletedCount} old schedule history records`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning old schedules:', error);
    return 0;
  }
}

/**
 * Compare two schedules and return changes
 * Returns: { added: [], removed: [], modified: [], summary: '' }
 */
function compareSchedules(oldSchedule, newSchedule) {
  const changes = {
    added: [],
    removed: [],
    modified: [],
    summary: ''
  };

  if (!oldSchedule || !oldSchedule.events || !newSchedule || !newSchedule.events) {
    return changes;
  }

  const oldEvents = oldSchedule.events || [];
  const newEvents = newSchedule.events || [];

  // Create maps for easier comparison
  const oldMap = new Map();
  oldEvents.forEach(event => {
    const key = `${event.start}_${event.end}`;
    oldMap.set(key, event);
  });

  const newMap = new Map();
  newEvents.forEach(event => {
    const key = `${event.start}_${event.end}`;
    newMap.set(key, event);
  });

  // Find added and modified events
  newEvents.forEach(newEvent => {
    const key = `${newEvent.start}_${newEvent.end}`;
    if (!oldMap.has(key)) {
      // Check if there's a similar event with different time
      const similarOld = oldEvents.find(old =>
        Math.abs(new Date(old.start) - new Date(newEvent.start)) < 3600000 // within 1 hour
      );

      if (similarOld) {
        changes.modified.push({ old: similarOld, new: newEvent });
      } else {
        changes.added.push(newEvent);
      }
    }
  });

  // Find removed events
  oldEvents.forEach(oldEvent => {
    const key = `${oldEvent.start}_${oldEvent.end}`;
    if (!newMap.has(key)) {
      // Check if it was modified rather than removed
      const wasModified = changes.modified.some(m => m.old === oldEvent);
      if (!wasModified) {
        changes.removed.push(oldEvent);
      }
    }
  });

  // Calculate total time change
  let totalChangeMinutes = 0;

  changes.added.forEach(event => {
    const duration = (new Date(event.end) - new Date(event.start)) / 60000;
    totalChangeMinutes += duration;
  });

  changes.removed.forEach(event => {
    const duration = (new Date(event.end) - new Date(event.start)) / 60000;
    totalChangeMinutes -= duration;
  });

  // Create summary
  const parts = [];

  if (changes.added.length > 0) {
    parts.push(`+${changes.added.length} період${changes.added.length === 1 ? '' : 'и'}`);
  }

  if (changes.removed.length > 0) {
    parts.push(`-${changes.removed.length} період${changes.removed.length === 1 ? '' : 'и'}`);
  }

  if (changes.modified.length > 0) {
    parts.push(`🔄 ${changes.modified.length} змінен${changes.modified.length === 1 ? 'о' : 'і'}`);
  }

  if (totalChangeMinutes !== 0) {
    const hours = Math.floor(Math.abs(totalChangeMinutes) / 60);
    const minutes = Math.abs(totalChangeMinutes) % 60;
    const sign = totalChangeMinutes > 0 ? '+' : '-';
    let timeStr = '';
    if (hours > 0) {
      timeStr = `${hours} год`;
      if (minutes > 0) timeStr += ` ${minutes} хв`;
    } else {
      timeStr = `${minutes} хв`;
    }
    parts.push(`${sign}${timeStr}`);
  }

  changes.summary = parts.join(', ');

  return changes;
}

module.exports = {
  addScheduleToHistory,
  getLastSchedule,
  getPreviousSchedule,
  cleanOldSchedules,
  compareSchedules,
};
