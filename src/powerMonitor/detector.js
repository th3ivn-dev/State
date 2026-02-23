/**
 * Power outage detector.
 * Pings routers to determine whether power is available, applies debounce logic,
 * and drives the per-user state machine.
 */

const config = require('../config');
const usersDb = require('../database/users');
const { getSetting } = require('../database/db');
const {
  POWER_MAX_CONCURRENT_PINGS,
  POWER_PING_TIMEOUT_MS
} = require('../constants/timeouts');
const logger = require('../utils/logger').createLogger('PowerMonitor');
const { getUserState } = require('./state');
const { handlePowerStateChange } = require('./notifier');

// Minimum stabilisation delay used when debounce is set to 0
// (protects against flapping without adding a full debounce window)
const MIN_STABILIZATION_MS = 30 * 1000; // 30 seconds

// Guard against overlapping checkAllUsers calls
let isCheckingAllUsers = false;

/**
 * Check whether the router at the given address is reachable.
 * Returns true (power on), false (power off), or null (monitoring disabled).
 * @param {string|null} routerAddress - Override address; falls back to config.ROUTER_HOST
 */
async function checkRouterAvailability(routerAddress = null) {
  const addressToCheck = routerAddress || config.ROUTER_HOST;

  if (!addressToCheck) {
    return null; // Monitoring disabled
  }

  let host = addressToCheck;
  let port = config.ROUTER_PORT || 80;

  const portMatch = addressToCheck.match(/^(.+):(\d+)$/);
  if (portMatch) {
    host = portMatch[1];
    port = parseInt(portMatch[2], 10);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), POWER_PING_TIMEOUT_MS);

    await fetch(`http://${host}:${port}`, {
      signal: controller.signal,
      method: 'HEAD'
    });

    clearTimeout(timeout);
    return true; // Router reachable → power is on
  } catch (_error) {
    return false; // Router unreachable → power is off
  }
}

/**
 * Return a check-interval (in seconds) appropriate for the number of monitored users.
 * @param {number} userCount
 */
function calculateCheckInterval(userCount) {
  if (userCount < 50) {
    return 2;
  } else if (userCount < 200) {
    return 5;
  } else if (userCount < 1000) {
    return 10;
  } else {
    return 30;
  }
}

/**
 * Run one power-availability check for a single user and advance their state machine.
 * Applies debounce logic: a state change is only confirmed after it has been stable
 * for the configured debounce window.
 * @param {Object} user - User record from the database
 */
async function checkUserPower(user) {
  try {
    const isAvailable = await checkRouterAvailability(user.router_ip);

    const userState = getUserState(user.telegram_id);

    userState.lastPingTime = new Date().toISOString();
    userState.lastPingSuccess = isAvailable !== null;

    if (isAvailable === null) {
      return; // Cannot check
    }

    const newState = isAvailable ? 'on' : 'off';

    // First check: seed state from the DB record
    if (userState.isFirstCheck) {
      if (user.power_state && user.power_changed_at) {
        userState.currentState = user.power_state;
        userState.lastStableState = user.power_state;
        if (!userState.lastStableAt) {
          userState.lastStableAt = new Date(user.power_changed_at).toISOString();
        }
        userState.isFirstCheck = false;
        console.log(`User ${user.id}: Відновлено стан з БД: ${user.power_state} з ${user.power_changed_at}`);
      } else {
        userState.currentState = newState;
        userState.lastStableState = newState;
        userState.lastStableAt = null;
        userState.isFirstCheck = false;
        userState.consecutiveChecks = 0;

        await usersDb.updateUserPowerState(user.telegram_id, newState);
      }
      return;
    }

    // State unchanged — nothing to do
    if (userState.currentState === newState) {
      userState.consecutiveChecks = 0;

      if (userState.pendingState !== null && userState.pendingState !== newState) {
        console.log(`User ${user.id}: Скасування pending стану ${userState.pendingState} -> повернення до ${newState}`);

        if (userState.debounceTimer) {
          clearTimeout(userState.debounceTimer);
          userState.debounceTimer = null;
        }

        userState.switchCount++;

        userState.pendingState = null;
        userState.pendingStateTime = null;
        await usersDb.clearPendingPowerChange(user.telegram_id);
      }

      return;
    }

    // State is different from the current stable state
    if (userState.pendingState === newState) {
      // Already waiting for this state to stabilise — do nothing
      return;
    }

    // Cancel any existing debounce timer
    if (userState.debounceTimer) {
      clearTimeout(userState.debounceTimer);
      userState.debounceTimer = null;
    }

    if (userState.pendingState === null) {
      userState.instabilityStart = new Date().toISOString();
      userState.switchCount = 1;
      console.log(`User ${user.id}: Початок нестабільності, перемикання з ${userState.currentState} на ${newState}`);
    } else {
      userState.switchCount++;
      console.log(`User ${user.id}: Перемикання #${userState.switchCount} на ${newState}`);
    }

    userState.pendingState = newState;
    userState.pendingStateTime = new Date().toISOString();
    await usersDb.setPendingPowerChange(user.telegram_id, newState);

    const debounceMinutes = parseInt(await getSetting('power_debounce_minutes', '5'), 10);

    let debounceMs;
    if (debounceMinutes === 0) {
      debounceMs = MIN_STABILIZATION_MS;
      console.log(`User ${user.id}: Debounce=0, використання мінімальної затримки 30с для захисту від флаппінгу`);
    } else {
      debounceMs = debounceMinutes * 60 * 1000;
      console.log(`User ${user.id}: Очікування стабільності ${newState} протягом ${debounceMinutes} хв`);
    }

    userState.debounceTimer = setTimeout(async () => {
      console.log(`User ${user.id}: Debounce завершено, підтвердження стану ${newState}`);

      const oldState = userState.currentState;

      userState.currentState = newState;
      userState.consecutiveChecks = 0;
      userState.debounceTimer = null;
      userState.pendingState = null;
      userState.pendingStateTime = null;

      await handlePowerStateChange(user, newState, oldState, userState);
    }, debounceMs);

  } catch (error) {
    console.error(`Помилка перевірки живлення для користувача ${user.telegram_id}:`, error.message);
  }
}

/**
 * Check all users that have a router IP configured.
 * Runs up to POWER_MAX_CONCURRENT_PINGS pings in parallel.
 */
async function checkAllUsers() {
  if (isCheckingAllUsers) {
    logger.debug('checkAllUsers already running, skipping');
    return;
  }
  isCheckingAllUsers = true;

  try {
    const users = await usersDb.getUsersWithRouterIp();

    if (!users || users.length === 0) {
      return;
    }

    logger.debug(`Перевірка ${users.length} користувачів з обмеженням ${POWER_MAX_CONCURRENT_PINGS} одночасних пінгів`);

    const results = [];
    let index = 0;

    const worker = async () => {
      while (index < users.length) {
        const user = users[index++];
        await checkUserPower(user);
      }
    };

    const workerCount = Math.min(POWER_MAX_CONCURRENT_PINGS, users.length);
    for (let i = 0; i < workerCount; i++) {
      results.push(worker());
    }

    await Promise.all(results);

  } catch (error) {
    logger.error('Помилка при перевірці користувачів', { error: error.message });
  } finally {
    isCheckingAllUsers = false;
  }
}

module.exports = {
  checkRouterAvailability,
  calculateCheckInterval,
  checkUserPower,
  checkAllUsers,
};
