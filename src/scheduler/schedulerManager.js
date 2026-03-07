/**
 * Scheduler Manager
 *
 * Centralized management of all scheduled tasks and background jobs.
 *
 * Responsibilities:
 * - Initialize all schedulers
 * - Lifecycle management (start, stop, restart)
 * - Prevent duplicate schedulers
 * - Idempotent start/stop operations
 *
 * Key Principles:
 * - Single source of truth for all scheduled tasks
 * - Safe restart without duplicates
 * - Clear separation from handlers
 */

const cron = require('node-cron');
const { formatInterval } = require('../utils');

// Get monitoring manager
let metricsCollector = null;
try {
  metricsCollector = require('../monitoring/metricsCollector');
} catch (_e) {
  // Monitoring not available yet, will work without it
}

class SchedulerManager {
  constructor() {
    // Track all active schedulers
    this.schedulers = {
      scheduleChecker: null,
      // Future schedulers can be added here
    };

    // Track intervals for non-cron tasks
    this.intervals = {
      scheduleChecker: null,
    };

    // Configuration
    this.config = {
      scheduleCheckInterval: null, // Will be set during init
    };

    // State
    this.isInitialized = false;
    this.isRunning = false;
  }

  /**
   * Initialize scheduler manager with configuration
   * @param {object} config - Configuration object
   * @param {number} config.checkIntervalSeconds - Schedule check interval in seconds
   */
  init(config) {
    if (this.isInitialized) {
      console.log('⚠️ Scheduler manager already initialized');
      return;
    }

    this.config.scheduleCheckInterval = config.checkIntervalSeconds;
    this.isInitialized = true;

    console.log('✅ Scheduler manager initialized');
  }

  /**
   * Start all schedulers
   * This operation is idempotent - safe to call multiple times
   * @param {object} dependencies - Dependencies needed by schedulers
   * @param {object} dependencies.bot - Bot instance
   * @param {function} dependencies.checkAllSchedules - Schedule checking function
   */
  start(dependencies) {
    if (!this.isInitialized) {
      throw new Error('Scheduler manager not initialized. Call init() first.');
    }

    if (this.isRunning) {
      console.log('⚠️ Schedulers already running');
      return;
    }

    console.log('🚀 Starting schedulers...');

    // Track scheduler start
    if (metricsCollector) {
      metricsCollector.trackStateTransition('scheduler_start', {
        interval: this.config.scheduleCheckInterval,
        timestamp: new Date().toISOString()
      });
    }

    // Start schedule checker
    this._startScheduleChecker(dependencies.checkAllSchedules);

    this.isRunning = true;
    console.log('✅ All schedulers started');
  }

  /**
   * Stop all schedulers
   * This operation is idempotent - safe to call multiple times
   */
  stop() {
    if (!this.isRunning) {
      console.log('⚠️ Schedulers not running');
      return;
    }

    console.log('🛑 Stopping schedulers...');

    // Track scheduler stop
    if (metricsCollector) {
      metricsCollector.trackStateTransition('scheduler_stop', {
        timestamp: new Date().toISOString()
      });
    }

    // Stop schedule checker
    this._stopScheduleChecker();

    this.isRunning = false;
    console.log('✅ All schedulers stopped');
  }

  /**
   * Restart all schedulers
   * @param {object} dependencies - Dependencies needed by schedulers
   */
  restart(dependencies) {
    console.log('🔄 Restarting schedulers...');
    this.stop();
    this.start(dependencies);
  }

  /**
   * Start schedule checker scheduler
   * @param {function} checkFunction - Function to call for checking schedules
   * @private
   */
  _startScheduleChecker(checkFunction) {
    const intervalSeconds = this.config.scheduleCheckInterval;

    console.log(`📅 Starting schedule checker (every ${formatInterval(intervalSeconds)})`);

    // If interval >= 60 seconds and divides evenly into 60, use cron
    if (intervalSeconds >= 60 && intervalSeconds % 60 === 0) {
      const intervalMinutes = intervalSeconds / 60;
      const cronExpression = `*/${intervalMinutes} * * * *`;

      this.schedulers.scheduleChecker = cron.schedule(cronExpression, async () => {
        console.log(`🔄 Schedule check triggered (every ${formatInterval(intervalSeconds)})`);
        try {
          await checkFunction();
        } catch (error) {
          console.error('❌ Error in schedule checker:', error);
          // Track error
          if (metricsCollector) {
            metricsCollector.trackError(error, { context: 'schedule_checker' });
          }
        }
      });
    } else {
      // For intervals < 60 seconds or not divisible by 60, use setInterval
      this.intervals.scheduleChecker = setInterval(async () => {
        console.log(`🔄 Schedule check triggered (every ${formatInterval(intervalSeconds)})`);
        try {
          await checkFunction();
        } catch (error) {
          console.error('❌ Error in schedule checker:', error);
          // Track error
          if (metricsCollector) {
            metricsCollector.trackError(error, { context: 'schedule_checker' });
          }
        }
      }, intervalSeconds * 1000);
    }

    console.log(`✅ Schedule checker started`);
  }

  /**
   * Stop schedule checker
   * @private
   */
  _stopScheduleChecker() {
    if (this.schedulers.scheduleChecker) {
      this.schedulers.scheduleChecker.stop();
      this.schedulers.scheduleChecker = null;
    }

    if (this.intervals.scheduleChecker) {
      clearInterval(this.intervals.scheduleChecker);
      this.intervals.scheduleChecker = null;
    }
  }

  /**
   * Get status of all schedulers
   * @returns {object} Status information
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      running: this.isRunning,
      schedulers: {
        scheduleChecker: {
          active: !!(this.schedulers.scheduleChecker || this.intervals.scheduleChecker),
          interval: this.config.scheduleCheckInterval,
        }
      }
    };
  }

  /**
   * Update schedule check interval
   * Requires restart to take effect
   * @param {number} seconds - New interval in seconds
   */
  updateScheduleCheckInterval(seconds) {
    if (seconds < 1) {
      throw new Error('Interval must be at least 1 second');
    }

    this.config.scheduleCheckInterval = seconds;
    console.log(`✅ Schedule check interval updated to ${formatInterval(seconds)}`);
    console.log('⚠️ Restart schedulers for changes to take effect');
  }
}

// Export singleton instance
module.exports = new SchedulerManager();
