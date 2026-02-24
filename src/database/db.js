// Barrel файл — ре-експорт усього для backward compatibility
const { pool, checkPoolHealth, startPoolMetricsLogging, stopPoolMetricsLogging, closeDatabase } = require('./pool');
const { initializeDatabase } = require('./schema');
const { runMigrations } = require('./migrations');
const { getSetting, setSetting } = require('./settings');
const { saveUserState, getUserState, deleteUserState, getAllUserStates, cleanupOldStates } = require('./userStates');
const { savePendingChannel, getPendingChannel, deletePendingChannel, getAllPendingChannels } = require('./pendingChannels');

// Зберігаємо backward compatibility: module.exports = pool (для require('./db').query(...))
module.exports = pool;
module.exports.pool = pool;
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
