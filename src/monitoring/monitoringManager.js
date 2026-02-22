/**
 * Monitoring Manager
 * 
 * Central hub for monitoring and alerting system
 * Coordinates metrics collection, alert generation, and health checks
 */

const metricsCollector = require('./metricsCollector');
const { alertManager, ALERT_LEVELS, ALERT_TYPES } = require('./alertManager');
const { createLogger } = require('../utils/logger');
const { checkHealth } = require('../utils/healthCheck');

const logger = createLogger('MonitoringManager');

class MonitoringManager {
  constructor() {
    this.isInitialized = false;
    this.monitoringInterval = null;
    this.alertDeliveryBot = null;
    
    // Monitoring configuration
    this.config = {
      checkIntervalMinutes: 5, // How often to run health checks
      errorSpikeThreshold: 10, // Errors per 5 minutes
      errorSpikeWindow: 5, // Minutes
      repeatedErrorThreshold: 5, // Repeated error count
      memoryThresholdMB: 500, // Memory warning threshold
      maxUptimeDays: 7, // Uptime warning threshold
    };
  }

  /**
   * Initialize monitoring manager
   * @param {Object} bot - Telegram bot instance
   * @param {Object} options - Configuration options
   */
  init(bot, options = {}) {
    if (this.isInitialized) {
      logger.warn('Monitoring manager already initialized');
      return;
    }
    
    this.alertDeliveryBot = bot;
    
    // Merge configuration
    this.config = { ...this.config, ...options };
    
    // Set up alert delivery
    alertManager.setDeliveryCallback(this.deliverAlert.bind(this));
    
    this.isInitialized = true;
    logger.info('Monitoring manager initialized', this.config);
  }

  /**
   * Start monitoring
   */
  async start() {
    if (!this.isInitialized) {
      throw new Error('Monitoring manager not initialized');
    }
    
    if (this.monitoringInterval) {
      logger.warn('Monitoring already running');
      return;
    }
    
    // Track start as state transition
    metricsCollector.trackStateTransition('monitoring_start', {
      timestamp: new Date().toISOString()
    });
    
    // Run initial health check
    await this.runHealthCheck();
    
    // Schedule periodic health checks
    const intervalMs = this.config.checkIntervalMinutes * 60 * 1000;
    this.monitoringInterval = setInterval(() => {
      this.runHealthCheck().catch(err => logger.error('Health check failed', { error: err.message }));
    }, intervalMs);
    
    logger.info('Monitoring started', { 
      intervalMinutes: this.config.checkIntervalMinutes 
    });
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      
      // Track stop as state transition
      metricsCollector.trackStateTransition('monitoring_stop', {
        timestamp: new Date().toISOString()
      });
      
      logger.info('Monitoring stopped');
    }
  }

  /**
   * Run comprehensive health check
   */
  async runHealthCheck() {
    try {
      logger.debug('Running health check...');
      
      // Collect all metrics
      const metrics = await metricsCollector.collectAllMetrics();
      
      // Check system health
      this.checkSystemHealth(metrics.system);
      
      // Check application health
      this.checkApplicationHealth(metrics.application);
      
      // Check business health
      this.checkBusinessHealth(metrics.business);
      
      // Check UX health
      this.checkUXHealth(metrics.ux);
      
      // Check IP monitoring health
      this.checkIPHealth(metrics.ip);
      
      // Check channel health
      this.checkChannelHealth(metrics.channel);
      
      logger.debug('Health check completed');
    } catch (error) {
      logger.error('Error during health check', { error: error.message });
      metricsCollector.trackError(error, { context: 'health_check' });
    }
  }

  /**
   * Check system level health
   * @param {Object} systemMetrics - System metrics
   */
  checkSystemHealth(systemMetrics) {
    // Check memory usage
    if (systemMetrics.memory.heapUsedMB > this.config.memoryThresholdMB) {
      alertManager.generateAlert(
        ALERT_TYPES.SYSTEM,
        ALERT_LEVELS.WARN,
        'Високе використання памʼяті',
        `Поточне використання: ${systemMetrics.memory.heapUsedMB}MB (${systemMetrics.memory.heapUsedPercent}%)`,
        {
          heapUsedMB: systemMetrics.memory.heapUsedMB,
          heapTotalMB: systemMetrics.memory.heapTotalMB,
          rssMB: systemMetrics.memory.rssMB
        },
        'Розгляньте можливість перезапуску або оптимізації'
      );
    }
    
    // Check uptime
    const uptimeDays = systemMetrics.uptime / (24 * 60 * 60);
    if (uptimeDays > this.config.maxUptimeDays) {
      alertManager.generateAlert(
        ALERT_TYPES.SYSTEM,
        ALERT_LEVELS.INFO,
        'Довгий uptime',
        `Бот працює ${systemMetrics.uptimeFormatted} без перезапуску`,
        {
          uptimeDays: Math.round(uptimeDays),
          uptime: systemMetrics.uptimeFormatted
        },
        'Рекомендується періодичний перезапуск для підтримки стабільності'
      );
    }
  }

  /**
   * Check application level health
   * @param {Object} appMetrics - Application metrics
   */
  checkApplicationHealth(appMetrics) {
    // Check for error spikes
    const errorSpike = metricsCollector.checkErrorSpike(
      this.config.errorSpikeThreshold,
      this.config.errorSpikeWindow
    );
    
    if (errorSpike.hasSpike) {
      alertManager.generateAlert(
        ALERT_TYPES.APPLICATION,
        ALERT_LEVELS.CRITICAL,
        'Сплеск помилок',
        `${errorSpike.errorCount} помилок за ${errorSpike.windowMinutes} хвилин`,
        {
          errorCount: errorSpike.errorCount,
          threshold: errorSpike.threshold,
          windowMinutes: errorSpike.windowMinutes
        },
        'Перевірте логи та розгляньте увімкнення режиму паузи'
      );
    }
    
    // Check for repeated errors
    const repeatedErrors = metricsCollector.checkRepeatedErrors(
      this.config.repeatedErrorThreshold
    );
    
    if (repeatedErrors.length > 0) {
      for (const err of repeatedErrors.slice(0, 3)) { // Limit to 3 alerts
        alertManager.generateAlert(
          ALERT_TYPES.APPLICATION,
          ALERT_LEVELS.WARN,
          'Повторювана помилка',
          `Помилка "${err.signature}" виникла ${err.count} разів`,
          {
            signature: err.signature,
            count: err.count,
            lastOccurrence: new Date(err.lastOccurrence).toISOString()
          },
          'Розслідуйте причину та виправте'
        );
      }
    }
    
    // Check if bot is paused
    if (appMetrics.botPaused) {
      logger.info('Bot is in pause mode');
    }
  }

  /**
   * Check business level health
   * @param {Object} businessMetrics - Business metrics
   */
  checkBusinessHealth(businessMetrics) {
    // Check for sudden drop in active users
    if (businessMetrics.dau > 0 && businessMetrics.activeUsers === 0) {
      alertManager.generateAlert(
        ALERT_TYPES.BUSINESS,
        ALERT_LEVELS.CRITICAL,
        'Відсутні активні користувачі',
        'Жодного активного користувача не знайдено',
        {
          totalUsers: businessMetrics.totalUsers,
          dau: businessMetrics.dau
        },
        'Перевірте підключення до Telegram API та стан бота'
      );
    }
    
    // Log business metrics periodically
    logger.debug('Business metrics', businessMetrics);
  }

  /**
   * Check UX level health
   * @param {Object} uxMetrics - UX metrics
   */
  checkUXHealth(uxMetrics) {
    // Check for high cancel/abort rate
    const totalInteractions = uxMetrics.cancel + uxMetrics.abort + uxMetrics.timeout;
    
    if (totalInteractions > 10) {
      const abortRate = (uxMetrics.abort / totalInteractions) * 100;
      const cancelRate = (uxMetrics.cancel / totalInteractions) * 100;
      
      if (abortRate > 30) {
        alertManager.generateAlert(
          ALERT_TYPES.UX,
          ALERT_LEVELS.WARN,
          'Високий рівень скасувань (abort)',
          `${abortRate.toFixed(1)}% користувачів скасовують дії`,
          {
            abortCount: uxMetrics.abort,
            totalInteractions,
            abortRate: abortRate.toFixed(1) + '%'
          },
          'Перевірте UX wizard flows та зробіть їх простішими'
        );
      }
      
      if (cancelRate > 40) {
        alertManager.generateAlert(
          ALERT_TYPES.UX,
          ALERT_LEVELS.INFO,
          'Високий рівень скасувань (cancel)',
          `${cancelRate.toFixed(1)}% користувачів натискають Cancel`,
          {
            cancelCount: uxMetrics.cancel,
            totalInteractions,
            cancelRate: cancelRate.toFixed(1) + '%'
          },
          'Можливо, користувачі не розуміють інтерфейс'
        );
      }
    }
  }

  /**
   * Check IP monitoring health
   * @param {Object} ipMetrics - IP metrics
   */
  checkIPHealth(ipMetrics) {
    // Check for mass offline events
    if (ipMetrics.offlineToOnline > 100) {
      alertManager.generateAlert(
        ALERT_TYPES.IP,
        ALERT_LEVELS.WARN,
        'Масові OFFLINE → ONLINE переходи',
        `${ipMetrics.offlineToOnline} переходів виявлено`,
        {
          offlineToOnline: ipMetrics.offlineToOnline,
          unstableCount: ipMetrics.unstableCount
        },
        'Можлива глобальна проблема з електропостачанням'
      );
    }
    
    // Check for excessive debounce
    if (ipMetrics.debounceCount > 50) {
      alertManager.generateAlert(
        ALERT_TYPES.IP,
        ALERT_LEVELS.INFO,
        'Багато debounce подій',
        `${ipMetrics.debounceCount} debounce подій`,
        {
          debounceCount: ipMetrics.debounceCount
        },
        'IP моніторинг працює коректно, але є нестабільність'
      );
    }
  }

  /**
   * Check channel health
   * @param {Object} channelMetrics - Channel metrics
   */
  checkChannelHealth(channelMetrics) {
    // Check for admin rights loss
    if (channelMetrics.adminRightsLost > 0) {
      alertManager.generateAlert(
        ALERT_TYPES.CHANNEL,
        ALERT_LEVELS.CRITICAL,
        'Втрачено права адміністратора',
        `${channelMetrics.adminRightsLost} каналів втратили права`,
        {
          adminRightsLost: channelMetrics.adminRightsLost
        },
        'Зверніться до власників каналів для відновлення прав'
      );
    }
    
    // Check for publish errors
    if (channelMetrics.publishErrors > 10) {
      alertManager.generateAlert(
        ALERT_TYPES.CHANNEL,
        ALERT_LEVELS.WARN,
        'Помилки публікації в канали',
        `${channelMetrics.publishErrors} помилок публікації`,
        {
          publishErrors: channelMetrics.publishErrors
        },
        'Перевірте підключення до Telegram та права доступу'
      );
    }
  }

  /**
   * Deliver alert via Telegram
   * @param {String} formattedAlert - Formatted alert message
   * @param {Object} alert - Raw alert object
   */
  async deliverAlert(formattedAlert, alert) {
    if (!this.alertDeliveryBot) {
      logger.warn('Alert delivery bot not configured');
      return;
    }
    
    const alertChannelId = alertManager.config.alertChannelId;
    
    if (!alertChannelId) {
      // No alert channel configured, just log
      logger.info('Alert generated (no channel configured)', { alert });
      return;
    }
    
    try {
      await this.alertDeliveryBot.api.sendMessage(alertChannelId, formattedAlert, {
        parse_mode: 'HTML'
      });
      logger.debug('Alert delivered', { channel: alertChannelId, level: alert.level });
    } catch (error) {
      logger.error('Failed to deliver alert', { 
        error: error.message, 
        alertChannelId 
      });
    }
  }

  /**
   * Get monitoring status
   * @returns {Object} Monitoring status
   */
  async getStatus() {
    return {
      isInitialized: this.isInitialized,
      isRunning: this.monitoringInterval !== null,
      config: this.config,
      alertsSummary: alertManager.getAlertsSummary(),
      metrics: await metricsCollector.collectAllMetrics()
    };
  }

  /**
   * Configure alert channel
   * @param {String} channelId - Telegram channel ID for alerts
   */
  setAlertChannel(channelId) {
    alertManager.config.alertChannelId = channelId;
    alertManager.saveConfig();
    logger.info('Alert channel configured', { channelId });
  }

  /**
   * Get metrics collector
   * @returns {Object} Metrics collector instance
   */
  getMetricsCollector() {
    return metricsCollector;
  }

  /**
   * Get alert manager
   * @returns {Object} Alert manager instance
   */
  getAlertManager() {
    return alertManager;
  }
}

// Singleton instance
const monitoringManager = new MonitoringManager();

module.exports = {
  monitoringManager,
  ALERT_LEVELS,
  ALERT_TYPES
};
