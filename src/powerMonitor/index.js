/**
 * Entry point for the power monitoring subsystem.
 * Starts/stops the periodic monitoring loop and re-exports the full public API
 * so that any `require('./powerMonitor')` or `require('./powerMonitor/index')`
 * resolves to the same interface as the original monolithic file.
 */

const usersDb = require('../database/users');
const { getSetting } = require('../database/db');
const logger = require('../utils/logger').createLogger('PowerMonitor');

const {
  saveAllUserStates,
  restoreUserStates,
  saveUserStateToDb,
  getUserIpStatus,
  getPowerState,
  updatePowerState,
  resetPowerMonitor,
} = require('./state');

const { getNextScheduledTime } = require('./scheduler');
const { setBot, handlePowerStateChange } = require('./notifier');
const { checkRouterAvailability, calculateCheckInterval, checkAllUsers } = require('./detector');

let monitoringInterval = null;
let periodicSaveInterval = null;

/**
 * Start the power monitoring loop.
 * @param {object} botInstance - Grammy bot instance used to send Telegram messages
 */
async function startPowerMonitoring(botInstance) {
  if (monitoringInterval) {
    logger.warn('Power monitoring already running, skipping');
    return;
  }

  // Share the bot instance with the notifier
  setBot(botInstance);

  const users = await usersDb.getUsersWithRouterIp();
  const userCount = users ? users.length : 0;

  const adminInterval = await getSetting('power_check_interval', null);
  const adminIntervalNum = parseInt(adminInterval, 10) || 0;

  let checkInterval;
  let intervalMode;

  if (adminIntervalNum > 0) {
    checkInterval = adminIntervalNum;
    intervalMode = 'admin';
  } else {
    checkInterval = calculateCheckInterval(userCount);
    intervalMode = 'dynamic';
  }

  const debounceMinutes = parseInt(await getSetting('power_debounce_minutes', '5'), 10);
  const debounceText = debounceMinutes === 0
    ? 'вимкнено (миттєві сповіщення)'
    : `${debounceMinutes} хв (очікування стабільного стану)`;

  logger.info('⚡ Запуск системи моніторингу живлення...');
  logger.info(`   Користувачів з IP: ${userCount}`);

  if (intervalMode === 'admin') {
    logger.info(`   Інтервал перевірки: ${checkInterval}с (встановлено адміном)`);
  } else {
    logger.info(`   Інтервал перевірки: ${checkInterval}с (динамічний, на основі ${userCount} користувачів)`);
  }

  logger.info(`   Макс. одночасних пінгів: ${require('../constants/timeouts').POWER_MAX_CONCURRENT_PINGS}`);
  logger.info(`   Таймаут пінга: ${require('../constants/timeouts').POWER_PING_TIMEOUT_MS}мс`);
  logger.info(`   Debounce: ${debounceText}`);

  // Restore persisted states in the background (does not block startup)
  restoreUserStates().catch(error => {
    logger.error('Помилка відновлення станів', { error });
  });

  monitoringInterval = setInterval(async () => {
    await checkAllUsers();
  }, checkInterval * 1000);

  periodicSaveInterval = setInterval(async () => {
    await saveAllUserStates();
  }, 5 * 60 * 1000);

  // Run the first check immediately
  checkAllUsers();

  logger.success('✅ Система моніторингу живлення запущена');
}

// Stop the monitoring loop and the periodic state-save interval
function stopPowerMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    logger.info('⚡ Моніторинг живлення зупинено');
  }
  if (periodicSaveInterval) {
    clearInterval(periodicSaveInterval);
    periodicSaveInterval = null;
    logger.info('💾 Періодичне збереження станів зупинено');
  }
}

module.exports = {
  // Lifecycle
  startPowerMonitoring,
  stopPowerMonitoring,

  // Detection
  checkRouterAvailability,

  // Scheduling / schedule look-ahead
  getNextScheduledTime,

  // Notification
  handlePowerStateChange,

  // State persistence
  saveUserStateToDb,
  saveAllUserStates,
  restoreUserStates,

  // State queries
  getUserIpStatus,

  // Backward-compatibility stubs
  getPowerState,
  updatePowerState,
  resetPowerMonitor,
};
