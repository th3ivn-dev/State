// Re-export all database modules for backward compatibility
const { pool, checkPoolHealth, startPoolMetricsLogging, stopPoolMetricsLogging, closeDatabase } = require('./pool');
const { safeQuery, RETRIABLE_CODES } = require('./safeQuery');
const { initializeDatabase } = require('./initialize');
const { runMigrations } = require('./migrations');
const { getSetting, setSetting } = require('./settings');
const {
  saveUserState,
  getUserState,
  deleteUserState,
  getAllUserStates,
  savePendingChannel,
  getPendingChannel,
  deletePendingChannel,
  getAllPendingChannels,
  cleanupOldStates,
} = require('./states');

// Export pool as both default and named export for backward compatibility
module.exports = pool;
module.exports.pool = pool;
module.exports.safeQuery = safeQuery;
module.exports.RETRIABLE_CODES = RETRIABLE_CODES;
module.exports.initializeDatabase = initializeDatabase;
module.exports.runMigrations = runMigrations;
module.exports.getSetting = getSetting;
module.exports.setSetting = setSetting;
module.exports.closeDatabase = closeDatabase;
module.exports.saveUserState = saveUserState;
module.exports.getUserState = getUserState;
module.exports.deleteUserState = deleteUserState;
module.exports.getAllUserStates = getAllUserStates;
module.exports.savePendingChannel = savePendingChannel;
module.exports.getPendingChannel = getPendingChannel;
module.exports.deletePendingChannel = deletePendingChannel;
module.exports.getAllPendingChannels = getAllPendingChannels;
module.exports.cleanupOldStates = cleanupOldStates;
module.exports.checkPoolHealth = checkPoolHealth;
module.exports.startPoolMetricsLogging = startPoolMetricsLogging;
module.exports.stopPoolMetricsLogging = stopPoolMetricsLogging;
