/**
 * Metrics Collector
 *
 * Collects and aggregates metrics from all system levels:
 * - System level (process, memory, uptime)
 * - Application level (errors, state transitions)
 * - Business level (users, channels, IPs, publications)
 * - UX level (user behavior, cancel rates, timeouts)
 */

const { getHealthStatus, getMemoryStats } = require('../utils/healthCheck');
const usersDb = require('../database/users');
const { getSetting } = require('../database/db');
const { createLogger } = require('../utils/logger');

const logger = createLogger('MetricsCollector');

class MetricsCollector {
  constructor() {
    // Metrics storage
    this.metrics = {
      system: {},
      application: {},
      business: {},
      ux: {},
      ip: {},
      channel: {}
    };

    // Error tracking
    this.errors = [];
    this.errorCounts = new Map(); // Error signature -> count
    this.lastErrorTime = new Map(); // Error signature -> timestamp

    // State transitions tracking
    this.stateTransitions = [];

    // UX metrics tracking
    this.uxEvents = {
      cancel: 0,
      timeout: 0,
      retry: 0,
      quickClicks: 0,
      abort: 0
    };

    // IP monitoring tracking
    this.ipEvents = {
      offlineToOnline: 0,
      unstableCount: 0,
      debounceCount: 0
    };

    // Channel tracking
    this.channelEvents = {
      adminRightsLost: 0,
      publishErrors: 0,
      messageDeleted: 0
    };

    // Startup metrics
    this.startTime = Date.now();
    this.restartCount = 0;
  }

  /**
   * Collect system level metrics
   * @returns {Object} System metrics
   */
  collectSystemMetrics() {
    const health = getHealthStatus();
    const memory = getMemoryStats();

    this.metrics.system = {
      uptime: health.uptime,
      uptimeFormatted: health.uptimeFormatted,
      memory: {
        heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
        heapUsedPercent: memory.heapUsedPercent,
        rssMB: Math.round(memory.rss / 1024 / 1024)
      },
      process: {
        pid: process.pid,
        nodeVersion: process.version
      },
      restartCount: this.restartCount,
      timestamp: new Date().toISOString()
    };

    return this.metrics.system;
  }

  /**
   * Collect application level metrics
   * @returns {Object} Application metrics
   */
  async collectApplicationMetrics() {
    const isPaused = await getSetting('bot_paused', '0') === '1';
    const scheduleInterval = await getSetting('schedule_check_interval', '60');

    this.metrics.application = {
      botPaused: isPaused,
      scheduleInterval: parseInt(scheduleInterval, 10),
      errorCount: this.errors.length,
      uniqueErrors: this.errorCounts.size,
      recentErrors: this.getRecentErrors(10),
      stateTransitionCount: this.stateTransitions.length,
      recentTransitions: this.getRecentTransitions(10),
      timestamp: new Date().toISOString()
    };

    return this.metrics.application;
  }

  /**
   * Collect business level metrics
   * @returns {Object} Business metrics
   */
  async collectBusinessMetrics() {
    try {
      const stats = await usersDb.getUserStats();
      const allUsersForChannels = await usersDb.getAllUsers();
      const usersWithChannels = allUsersForChannels.filter(u => u.channel_id).length;
      const usersWithIPs = allUsersForChannels.filter(u => u.router_ip).length;

      // Calculate DAU (active in last 24 hours) and WAU (active in last 7 days)
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const weekMs = 7 * dayMs;

      const allUsers = await usersDb.getAllUsers();
      const dau = allUsers.filter(u => {
        if (!u.updated_at) return false;
        const lastActive = new Date(u.updated_at).getTime();
        return (now - lastActive) < dayMs;
      }).length;

      const wau = allUsers.filter(u => {
        if (!u.updated_at) return false;
        const lastActive = new Date(u.updated_at).getTime();
        return (now - lastActive) < weekMs;
      }).length;

      this.metrics.business = {
        totalUsers: stats.total,
        activeUsers: stats.active,
        dau: dau,
        wau: wau,
        channelsConnected: usersWithChannels,
        ipsMonitored: usersWithIPs,
        timestamp: new Date().toISOString()
      };

      return this.metrics.business;
    } catch (error) {
      logger.error('Error collecting business metrics', { error: error.message });
      return this.metrics.business;
    }
  }

  /**
   * Collect UX level metrics
   * @returns {Object} UX metrics
   */
  collectUXMetrics() {
    this.metrics.ux = {
      ...this.uxEvents,
      timestamp: new Date().toISOString()
    };

    return this.metrics.ux;
  }

  /**
   * Collect IP monitoring metrics
   * @returns {Object} IP metrics
   */
  collectIPMetrics() {
    this.metrics.ip = {
      ...this.ipEvents,
      timestamp: new Date().toISOString()
    };

    return this.metrics.ip;
  }

  /**
   * Collect channel metrics
   * @returns {Object} Channel metrics
   */
  collectChannelMetrics() {
    this.metrics.channel = {
      ...this.channelEvents,
      timestamp: new Date().toISOString()
    };

    return this.metrics.channel;
  }

  /**
   * Collect all metrics
   * @returns {Object} All metrics
   */
  async collectAllMetrics() {
    return {
      system: this.collectSystemMetrics(),
      application: await this.collectApplicationMetrics(),
      business: await this.collectBusinessMetrics(),
      ux: this.collectUXMetrics(),
      ip: this.collectIPMetrics(),
      channel: this.collectChannelMetrics()
    };
  }

  /**
   * Track error occurrence
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   */
  trackError(error, context = {}) {
    const errorSignature = `${error.name}:${error.message}`;
    const errorData = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    };

    // Add to errors list
    this.errors.push(errorData);

    // Update error counts
    const currentCount = this.errorCounts.get(errorSignature) || 0;
    this.errorCounts.set(errorSignature, currentCount + 1);
    this.lastErrorTime.set(errorSignature, Date.now());

    // Keep only last 1000 errors
    if (this.errors.length > 1000) {
      this.errors = this.errors.slice(-1000);
    }

    // Keep errorCounts/lastErrorTime Maps bounded (max 500 unique signatures)
    if (this.errorCounts.size > 500) {
      // Remove oldest entries based on lastErrorTime
      const sortedEntries = [...this.lastErrorTime.entries()]
        .sort((a, b) => a[1] - b[1]);
      const toDelete = this.errorCounts.size - 500;
      for (let i = 0; i < toDelete; i++) {
        const key = sortedEntries[i][0];
        this.errorCounts.delete(key);
        this.lastErrorTime.delete(key);
      }
    }

    logger.error('Error tracked', {
      error: error.message,
      count: currentCount + 1,
      context
    });
  }

  /**
   * Track state transition
   * @param {String} transition - Transition type (e.g., 'scheduler_start', 'pause_on')
   * @param {Object} data - Additional data
   */
  trackStateTransition(transition, data = {}) {
    const transitionData = {
      transition,
      data,
      timestamp: new Date().toISOString()
    };

    this.stateTransitions.push(transitionData);

    // Keep only last 1000 transitions
    if (this.stateTransitions.length > 1000) {
      this.stateTransitions = this.stateTransitions.slice(-1000);
    }

    logger.info('State transition tracked', { transition, data });
  }

  /**
   * Track UX event
   * @param {String} eventType - Event type (cancel, timeout, retry, quickClicks, abort)
   */
  trackUXEvent(eventType) {
    if (this.uxEvents.hasOwnProperty(eventType)) {
      this.uxEvents[eventType]++;
      logger.debug('UX event tracked', { eventType, count: this.uxEvents[eventType] });
    }
  }

  /**
   * Track IP event
   * @param {String} eventType - Event type (offlineToOnline, unstableCount, debounceCount)
   */
  trackIPEvent(eventType) {
    if (this.ipEvents.hasOwnProperty(eventType)) {
      this.ipEvents[eventType]++;
      logger.debug('IP event tracked', { eventType, count: this.ipEvents[eventType] });
    }
  }

  /**
   * Track channel event
   * @param {String} eventType - Event type (adminRightsLost, publishErrors, messageDeleted)
   */
  trackChannelEvent(eventType) {
    if (this.channelEvents.hasOwnProperty(eventType)) {
      this.channelEvents[eventType]++;
      logger.debug('Channel event tracked', { eventType, count: this.channelEvents[eventType] });
    }
  }

  /**
   * Get recent errors
   * @param {Number} count - Number of errors to retrieve
   * @returns {Array} Recent errors
   */
  getRecentErrors(count = 10) {
    return this.errors.slice(-count);
  }

  /**
   * Get recent state transitions
   * @param {Number} count - Number of transitions to retrieve
   * @returns {Array} Recent transitions
   */
  getRecentTransitions(count = 10) {
    return this.stateTransitions.slice(-count);
  }

  /**
   * Check for error spikes
   * @param {Number} threshold - Error count threshold
   * @param {Number} windowMinutes - Time window in minutes
   * @returns {Object} Spike detection result
   */
  checkErrorSpike(threshold = 10, windowMinutes = 5) {
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;

    const recentErrors = this.errors.filter(err => {
      const errorTime = new Date(err.timestamp).getTime();
      return (now - errorTime) < windowMs;
    });

    const hasSpike = recentErrors.length >= threshold;

    return {
      hasSpike,
      errorCount: recentErrors.length,
      threshold,
      windowMinutes,
      errors: hasSpike ? recentErrors : []
    };
  }

  /**
   * Check for repeated errors
   * @param {Number} threshold - Repeat count threshold
   * @returns {Array} Repeated errors
   */
  checkRepeatedErrors(threshold = 5) {
    const repeatedErrors = [];

    for (const [signature, count] of this.errorCounts.entries()) {
      if (count >= threshold) {
        repeatedErrors.push({
          signature,
          count,
          lastOccurrence: this.lastErrorTime.get(signature)
        });
      }
    }

    return repeatedErrors;
  }

  /**
   * Reset metrics (for testing or periodic reset)
   */
  reset() {
    this.errors = [];
    this.errorCounts.clear();
    this.lastErrorTime.clear();
    this.stateTransitions = [];

    this.uxEvents = {
      cancel: 0,
      timeout: 0,
      retry: 0,
      quickClicks: 0,
      abort: 0
    };

    this.ipEvents = {
      offlineToOnline: 0,
      unstableCount: 0,
      debounceCount: 0
    };

    this.channelEvents = {
      adminRightsLost: 0,
      publishErrors: 0,
      messageDeleted: 0
    };

    logger.info('Metrics reset');
  }
}

// Singleton instance
const metricsCollector = new MetricsCollector();

module.exports = metricsCollector;
