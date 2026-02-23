/**
 * Pending State Manager
 *
 * Specialized manager for handling pending/temporary states that require:
 * - Timeouts
 * - Cancellation
 * - Automatic cleanup
 *
 * Examples: wizard flows, channel connections, IP setup
 */

const { setState, getState, clearState, hasState } = require('./stateManager');

/**
 * Create a pending state with timeout
 * @param {string} stateType - Type of state
 * @param {string} userId - User identifier
 * @param {object} data - State data
 * @param {number} timeoutMs - Timeout in milliseconds (optional)
 * @param {function} onTimeout - Callback to execute on timeout (optional)
 * @returns {object} Timer reference that can be used to cancel
 */
async function createPendingState(stateType, userId, data, timeoutMs = null, onTimeout = null) {
  let timer = null;

  // Set up timeout if specified
  if (timeoutMs && onTimeout) {
    timer = setTimeout(async () => {
      await onTimeout(userId);
      await clearState(stateType, userId);
    }, timeoutMs);
  }

  // Store the state with timer reference
  const stateData = {
    ...data,
    _timer: timer,
    _timeoutMs: timeoutMs,
    _createdAt: Date.now()
  };

  await setState(stateType, userId, stateData);

  return { timer };
}

/**
 * Cancel a pending state and clear its timeout
 * @param {string} stateType - Type of state
 * @param {string} userId - User identifier
 */
async function cancelPendingState(stateType, userId) {
  const state = getState(stateType, userId);

  if (state && state._timer) {
    clearTimeout(state._timer);
  }

  await clearState(stateType, userId);
}

/**
 * Update a pending state without resetting the timeout
 * @param {string} stateType - Type of state
 * @param {string} userId - User identifier
 * @param {object} updates - Data to merge into existing state
 */
async function updatePendingState(stateType, userId, updates) {
  const currentState = getState(stateType, userId);

  if (!currentState) {
    throw new Error(`No pending state found for ${userId} of type ${stateType}`);
  }

  // Merge updates while preserving timer and metadata
  const updatedState = {
    ...currentState,
    ...updates,
    _timer: currentState._timer,
    _timeoutMs: currentState._timeoutMs,
    _createdAt: currentState._createdAt
  };

  await setState(stateType, userId, updatedState);
}

/**
 * Get remaining time for a pending state
 * @param {string} stateType - Type of state
 * @param {string} userId - User identifier
 * @returns {number|null} Remaining time in milliseconds, or null if no timeout
 */
function getRemainingTime(stateType, userId) {
  const state = getState(stateType, userId);

  if (!state || !state._timeoutMs || !state._createdAt) {
    return null;
  }

  const elapsed = Date.now() - state._createdAt;
  const remaining = state._timeoutMs - elapsed;

  return Math.max(0, remaining);
}

/**
 * Check if a pending state has expired
 * @param {string} stateType - Type of state
 * @param {string} userId - User identifier
 * @returns {boolean} True if expired or doesn't exist
 */
function isPendingStateExpired(stateType, userId) {
  const remaining = getRemainingTime(stateType, userId);

  if (remaining === null) {
    return false; // No timeout means it doesn't expire
  }

  return remaining <= 0;
}

/**
 * Extend timeout for a pending state
 *
 * NOTE: This function extends the internal timeout tracking but cannot
 * recreate the actual timeout callback since it wasn't stored.
 * For proper timeout extension, you'll need to:
 * 1. Cancel the current state
 * 2. Create a new pending state with the new timeout
 *
 * @param {string} stateType - Type of state
 * @param {string} userId - User identifier
 * @param {number} additionalMs - Additional milliseconds to add
 * @deprecated Use cancelPendingState + createPendingState instead
 */
async function extendPendingState(stateType, userId, additionalMs) {
  const state = getState(stateType, userId);

  if (!state) {
    throw new Error(`No pending state found for ${userId} of type ${stateType}`);
  }

  // Clear existing timer
  if (state._timer) {
    clearTimeout(state._timer);
  }

  // Update timeout tracking only
  // NOTE: Cannot recreate callback - use cancel + create instead
  const remaining = getRemainingTime(stateType, userId) || 0;
  state._timeoutMs = remaining + additionalMs;
  state._createdAt = Date.now();

  await setState(stateType, userId, state);
}

module.exports = {
  createPendingState,
  cancelPendingState,
  updatePendingState,
  getRemainingTime,
  isPendingStateExpired,
  extendPendingState
};
