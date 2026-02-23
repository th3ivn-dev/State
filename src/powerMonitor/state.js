/**
 * State management for power monitoring.
 * Manages per-user power state in memory and persists/restores it to/from PostgreSQL.
 */

const { pool } = require('../database/db');

// In-memory state store for all monitored users
const userStates = new Map();

// Normalise a PostgreSQL timestamp to a UTC ISO string (strips timezone offset)
function normalizeTimestamp(value) {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch (_e) {
    return null;
  }
}

// Get or create the state object for a user
function getUserState(userId) {
  if (!userStates.has(userId)) {
    userStates.set(userId, {
      currentState: null,
      lastChangeAt: null,
      consecutiveChecks: 0,
      isFirstCheck: true,
      pendingState: null,
      pendingStateTime: null,
      debounceTimer: null,
      instabilityStart: null,
      switchCount: 0,
      lastStableState: null,
      lastStableAt: null,
      lastPingTime: null,
      lastPingSuccess: null,
      lastNotificationAt: null,
    });
  }
  return userStates.get(userId);
}

// Clear all user states and cancel any pending debounce timers
function resetPowerMonitor() {
  userStates.forEach((state) => {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }
  });
  userStates.clear();
}

// Stub kept for backward compatibility with older callers
function getPowerState() {
  return {
    state: null,
    changedAt: null
  };
}

// Stub kept for backward compatibility with older callers
function updatePowerState(_isAvailable) {
  return { changed: false, state: null };
}

/**
 * Persist a single user's in-memory state to the user_power_states table.
 * Uses an upsert so that a missing row is created and an existing row is updated.
 * @param {number} userId - Telegram ID of the user
 * @param {Object} state  - In-memory state object for that user
 */
async function saveUserStateToDb(userId, state) {
  try {
    await pool.query(`
      INSERT INTO user_power_states 
      (telegram_id, current_state, pending_state, pending_state_time, 
       last_stable_state, last_stable_at, instability_start, switch_count, 
       last_notification_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT(telegram_id) DO UPDATE SET
        current_state = EXCLUDED.current_state,
        pending_state = EXCLUDED.pending_state,
        pending_state_time = EXCLUDED.pending_state_time,
        last_stable_state = EXCLUDED.last_stable_state,
        last_stable_at = EXCLUDED.last_stable_at,
        instability_start = EXCLUDED.instability_start,
        switch_count = EXCLUDED.switch_count,
        last_notification_at = EXCLUDED.last_notification_at,
        updated_at = NOW()
    `, [
      userId,
      state.currentState,
      state.pendingState,
      state.pendingStateTime,
      state.lastStableState,
      state.lastStableAt,
      state.instabilityStart,
      state.switchCount || 0,
      state.lastNotificationAt
    ]);
  } catch (error) {
    console.error(`Помилка збереження стану користувача ${userId}:`, error.message);
  }
}

// Persist all in-memory user states to the database (with a 10-second timeout)
async function saveAllUserStates() {
  const SAVE_TIMEOUT_MS = 10000;

  const savePromise = (async () => {
    let savedCount = 0;
    for (const [userId, state] of userStates) {
      await saveUserStateToDb(userId, state);
      savedCount++;
    }
    console.log(`💾 Збережено ${savedCount} станів користувачів`);
    return savedCount;
  })();

  try {
    return await Promise.race([
      savePromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('saveAllUserStates timed out')), SAVE_TIMEOUT_MS)
      )
    ]);
  } catch (error) {
    const isTimeout = error.message.includes('timed out');
    console.error(isTimeout
      ? `⏱️ Збереження станів перевищило таймаут (${SAVE_TIMEOUT_MS}мс)`
      : `Помилка збереження станів: ${error.message}`);
    return 0;
  }
}

// Restore user states from the database (rows updated within the last hour)
async function restoreUserStates() {
  try {
    const result = await pool.query(`
      SELECT * FROM user_power_states 
      WHERE updated_at > NOW() - INTERVAL '1 hour'
    `);

    for (const row of result.rows) {
      userStates.set(row.telegram_id, {
        currentState: row.current_state,
        pendingState: row.pending_state,
        pendingStateTime: normalizeTimestamp(row.pending_state_time),
        lastStableState: row.last_stable_state,
        lastStableAt: normalizeTimestamp(row.last_stable_at),
        instabilityStart: normalizeTimestamp(row.instability_start),
        switchCount: row.switch_count || 0,
        lastNotificationAt: normalizeTimestamp(row.last_notification_at),
        consecutiveChecks: 0,
        isFirstCheck: false,
        debounceTimer: null  // Timers are not restored
      });
    }

    console.log(`🔄 Відновлено ${result.rows.length} станів користувачів`);
    return result.rows.length;
  } catch (error) {
    console.error('Помилка відновлення станів:', error.message);
    return 0;
  }
}

// Return the IP monitoring status for a specific user
function getUserIpStatus(userId) {
  const userState = userStates.get(userId);
  if (!userState) {
    return {
      state: 'unknown',
      label: '⚪ Невідомо',
      lastPing: null,
      lastPingSuccess: null,
    };
  }

  const { getIpState, getIpStateLabel, formatLastPing } = require('../constants/ipStates');
  const state = getIpState(userState);

  return {
    state,
    label: getIpStateLabel(state),
    lastPing: userState.lastPingTime ? formatLastPing(userState.lastPingTime) : null,
    lastPingSuccess: userState.lastPingSuccess,
    currentState: userState.currentState,
    pendingState: userState.pendingState,
  };
}

module.exports = {
  userStates,
  normalizeTimestamp,
  getUserState,
  resetPowerMonitor,
  getPowerState,
  updatePowerState,
  saveUserStateToDb,
  saveAllUserStates,
  restoreUserStates,
  getUserIpStatus,
};
