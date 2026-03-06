/**
 * Circuit Breaker — prevents cascading failures when an external
 * dependency (GitHub API, DB, etc.) is unavailable.
 *
 * States:
 *   CLOSED  → requests pass through normally
 *   OPEN    → requests are immediately rejected (fast-fail)
 *   HALF_OPEN → a single probe request is allowed through
 *
 * Transitions:
 *   CLOSED  → OPEN       when `failureThreshold` consecutive failures are recorded
 *   OPEN    → HALF_OPEN  after `resetTimeoutMs` elapses
 *   HALF_OPEN → CLOSED   if the probe request succeeds
 *   HALF_OPEN → OPEN     if the probe request fails
 */

const { createLogger } = require('./logger');

const STATE = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeoutMs = options.resetTimeoutMs || 60_000;
    this.state = STATE.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.logger = createLogger(`CircuitBreaker:${name}`);
  }

  async execute(fn) {
    if (this.state === STATE.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = STATE.HALF_OPEN;
        this.logger.info('Перехід у HALF_OPEN — спроба відновлення');
      } else {
        throw new CircuitOpenError(this.name);
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }

  _onSuccess() {
    if (this.state === STATE.HALF_OPEN) {
      this.logger.info('Відновлено — CLOSED');
    }
    this.failureCount = 0;
    this.state = STATE.CLOSED;
  }

  _onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = STATE.OPEN;
      this.logger.warn(`OPEN після ${this.failureCount} послідовних помилок — fast-fail на ${this.resetTimeoutMs / 1000}с`);
    }
  }

  isOpen() {
    return this.state === STATE.OPEN;
  }

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
    };
  }
}

class CircuitOpenError extends Error {
  constructor(name) {
    super(`Circuit breaker "${name}" is OPEN — request rejected`);
    this.name = 'CircuitOpenError';
    this.circuitName = name;
  }
}

module.exports = { CircuitBreaker, CircuitOpenError, STATE };
