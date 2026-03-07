const crypto = require('crypto');

// Визначити тип оновлення графіка з snapshot logic
function getUpdateTypeV2(previousSchedule, currentSchedule, userSnapshots) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  // Get tomorrow date string (YYYY-MM-DD)
  const tomorrowDateStr = tomorrowStart.toISOString().split('T')[0];

  // Split events into today and tomorrow
  const currentTodayEvents = currentSchedule.events ? currentSchedule.events.filter(event => {
    const eventStart = new Date(event.start);
    return eventStart >= todayStart && eventStart < tomorrowStart;
  }) : [];

  const currentTomorrowEvents = currentSchedule.events ? currentSchedule.events.filter(event => {
    const eventStart = new Date(event.start);
    return eventStart >= tomorrowStart && eventStart < tomorrowEnd;
  }) : [];

  // Calculate hashes for today and tomorrow using helper
  const todayHash = calculateScheduleHash(currentTodayEvents);
  const tomorrowHash = calculateScheduleHash(currentTomorrowEvents);

  // Check if snapshots changed
  const todayChanged = userSnapshots?.today_snapshot_hash !== todayHash;
  const tomorrowChanged = userSnapshots?.tomorrow_snapshot_hash !== tomorrowHash;

  // Check if tomorrow was already published for this date
  const tomorrowAlreadyPublished = userSnapshots?.tomorrow_published_date === tomorrowDateStr;

  // Determine if tomorrow just appeared (new data and wasn't published for this date)
  const tomorrowAppeared = currentTomorrowEvents.length > 0 &&
                          tomorrowChanged &&
                          !tomorrowAlreadyPublished;

  return {
    todayChanged,
    tomorrowChanged,
    tomorrowAppeared,
    todayHash,
    tomorrowHash,
    tomorrowDateStr,
    hasTomorrow: currentTomorrowEvents.length > 0,
  };
}

// Helper function to calculate schedule hash
// NOTE: This hash is used for FINE deduplication in publish.js
// It hashes the parsed events (MD5) to determine if the actual schedule changed.
// This is separate from utils.calculateHash which uses SHA-256 on raw API data.
// The dual-hash strategy is intentional:
// - utils.calculateHash (SHA-256, raw API) → coarse change detection in scheduler.js
// - this function (MD5, parsed events) → fine deduplication to prevent redundant publications
function calculateScheduleHash(events) {
  // Normalize events to prevent hash instability from Date serialization
  const normalized = events.map(e => ({
    start: new Date(e.start).getTime(),
    end: new Date(e.end).getTime(),
    isPossible: e.isPossible,
    type: e.type,
  }));
  return crypto.createHash('md5').update(JSON.stringify(normalized)).digest('hex');
}

module.exports = {
  calculateScheduleHash,
  getUpdateTypeV2,
};
