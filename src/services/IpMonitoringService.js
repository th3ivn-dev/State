/**
 * IP Monitoring Service
 *
 * Handles IP monitoring business logic.
 * Separates ping/availability checking from notification logic.
 *
 * Responsibilities:
 * - IP/domain validation
 * - Availability checking (ping)
 * - State management for monitoring
 * - Debounce logic
 */

class IpMonitoringService {
  /**
   * Validate IP address or domain
   * @param {string} input - IP address or domain
   * @returns {object} Validation result { valid, error, normalized }
   */
  validateIpOrDomain(input) {
    const trimmed = input.trim();

    // Check for spaces
    if (trimmed.includes(' ')) {
      return {
        valid: false,
        error: 'IP address or domain cannot contain spaces'
      };
    }

    // Extract host and port
    let host = trimmed;
    let port = null;

    const portMatch = trimmed.match(/^(.+):(\d+)$/);
    if (portMatch) {
      host = portMatch[1];
      port = parseInt(portMatch[2], 10);

      if (port < 1 || port > 65535) {
        return {
          valid: false,
          error: 'Port must be between 1 and 65535'
        };
      }
    }

    // Validate IP address
    const ipPattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (ipPattern.test(host)) {
      return {
        valid: true,
        normalized: port ? `${host}:${port}` : host,
        type: 'ip',
        host,
        port
      };
    }

    // Validate domain
    const domainPattern = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
    if (domainPattern.test(host)) {
      return {
        valid: true,
        normalized: port ? `${host}:${port}` : host,
        type: 'domain',
        host,
        port
      };
    }

    return {
      valid: false,
      error: 'Invalid IP address or domain format'
    };
  }

  /**
   * Check if router is available
   * @param {string} address - IP address or domain (with optional port)
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {boolean} True if available, false otherwise
   */
  async checkAvailability(address, timeoutMs = 10000) {
    if (!address) {
      return null;
    }

    // Parse address
    let host = address;
    let port = 80;

    const portMatch = address.match(/^(.+):(\d+)$/);
    if (portMatch) {
      host = portMatch[1];
      port = parseInt(portMatch[2], 10);
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`http://${host}:${port}`, {
          signal: controller.signal,
          method: 'HEAD'
        });
        return true; // Available
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      return false; // Not available
    }
  }

  /**
   * Calculate debounce state
   * @param {object} currentState - Current monitoring state
   * @param {boolean} isAvailable - Current availability
   * @param {number} debounceSeconds - Debounce time in seconds
   * @returns {object} Debounce calculation result
   */
  calculateDebounceState(currentState, isAvailable, debounceSeconds) {
    const now = Date.now();
    const newState = isAvailable ? 'on' : 'off';

    // First check
    if (currentState.isFirstCheck) {
      return {
        shouldNotify: false,
        newStateData: {
          currentState: newState,
          lastChangeAt: now,
          consecutiveChecks: 1,
          isFirstCheck: false,
          lastStableState: newState,
          lastStableAt: now
        }
      };
    }

    // No change
    if (currentState.currentState === newState) {
      return {
        shouldNotify: false,
        newStateData: {
          ...currentState,
          consecutiveChecks: currentState.consecutiveChecks + 1
        }
      };
    }

    // State changed - check debounce
    const isPending = currentState.pendingState === newState;

    if (!isPending) {
      // Start new pending state
      return {
        shouldNotify: false,
        newStateData: {
          ...currentState,
          pendingState: newState,
          pendingStateTime: now,
          switchCount: (currentState.switchCount || 0) + 1
        }
      };
    }

    // Check if debounce period has passed
    const debounceMs = debounceSeconds * 1000;
    const pendingDuration = now - currentState.pendingStateTime;

    if (pendingDuration >= debounceMs) {
      // Debounce period passed - confirm change
      return {
        shouldNotify: true,
        newStateData: {
          currentState: newState,
          lastChangeAt: now,
          consecutiveChecks: 1,
          isFirstCheck: false,
          pendingState: null,
          pendingStateTime: null,
          switchCount: 0,
          lastStableState: newState,
          lastStableAt: now
        },
        previousState: currentState.currentState,
        newState: newState
      };
    }

    // Still within debounce period
    return {
      shouldNotify: false,
      newStateData: currentState
    };
  }

  /**
   * Get monitoring state summary
   * @param {object} state - Monitoring state
   * @returns {object} Summary
   */
  getStateSummary(state) {
    if (!state || state.isFirstCheck) {
      return {
        status: 'initializing',
        current: null,
        stable: false
      };
    }

    return {
      status: state.currentState,
      current: state.currentState,
      stable: !state.pendingState,
      pending: state.pendingState,
      lastChange: state.lastChangeAt,
      uptime: state.currentState === 'on'
        ? Date.now() - state.lastChangeAt
        : null
    };
  }
}

// Export singleton instance
module.exports = new IpMonitoringService();
