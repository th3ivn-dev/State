/**
 * Alert Manager
 *
 * Manages alert generation, escalation, and delivery
 * Implements alert fatigue protection through debouncing and grouping
 */

const { createLogger } = require('../utils/logger');
const { getSetting, setSetting } = require('../database/db');

const logger = createLogger('AlertManager');

// Alert levels
const ALERT_LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  CRITICAL: 'CRITICAL'
};

// Alert types
const ALERT_TYPES = {
  SYSTEM: 'system',
  APPLICATION: 'application',
  BUSINESS: 'business',
  UX: 'ux',
  IP: 'ip',
  CHANNEL: 'channel'
};

class AlertManager {
  constructor() {
    // Alert history
    this.alerts = [];

    // Alert debounce tracking
    this.lastAlertTime = new Map(); // Alert signature -> timestamp
    this.alertCounts = new Map(); // Alert signature -> count

    // Configuration
    this.config = {
      debounceMinutes: 15, // Don't repeat same alert within this time
      maxAlertsPerHour: 20, // Maximum alerts per hour
      escalationThreshold: 3, // Escalate after this many occurrences
      alertChannelId: null, // Telegram channel for alerts
      webhookUrl: null // Alternative webhook URL
    };

    // Load configuration from database (async, but constructor can't await)
    this.loadConfig().catch(err => logger.error('Failed to load config in constructor', { error: err.message }));

    // Alert delivery callback
    this.deliveryCallback = null;
  }

  /**
   * Load configuration from database
   */
  async loadConfig() {
    try {
      this.config.debounceMinutes = parseInt(await getSetting('alert_debounce_minutes', '15'), 10);
      this.config.maxAlertsPerHour = parseInt(await getSetting('alert_max_per_hour', '20'), 10);
      this.config.escalationThreshold = parseInt(await getSetting('alert_escalation_threshold', '3'), 10);
      this.config.alertChannelId = await getSetting('alert_channel_id', null);
      this.config.webhookUrl = await getSetting('alert_webhook_url', null);
    } catch (error) {
      logger.error('Error loading alert config', { error: error.message });
    }
  }

  /**
   * Save configuration to database
   */
  async saveConfig() {
    try {
      await setSetting('alert_debounce_minutes', String(this.config.debounceMinutes));
      await setSetting('alert_max_per_hour', String(this.config.maxAlertsPerHour));
      await setSetting('alert_escalation_threshold', String(this.config.escalationThreshold));
      if (this.config.alertChannelId) {
        await setSetting('alert_channel_id', this.config.alertChannelId);
      }
      if (this.config.webhookUrl) {
        await setSetting('alert_webhook_url', this.config.webhookUrl);
      }
    } catch (error) {
      logger.error('Error saving alert config', { error: error.message });
    }
  }

  /**
   * Set alert delivery callback
   * @param {Function} callback - Function to call for alert delivery
   */
  setDeliveryCallback(callback) {
    this.deliveryCallback = callback;
  }

  /**
   * Generate alert
   * @param {String} type - Alert type (from ALERT_TYPES)
   * @param {String} level - Alert level (from ALERT_LEVELS)
   * @param {String} title - Alert title
   * @param {String} message - Alert message
   * @param {Object} data - Additional data
   * @param {String} action - Recommended action
   * @returns {Object|null} Alert object or null if suppressed
   */
  generateAlert(type, level, title, message, data = {}, action = null) {
    // Create alert signature for deduplication
    const signature = `${type}:${title}`;

    // Check if alert should be suppressed due to debouncing
    if (this.shouldSuppress(signature)) {
      logger.debug('Alert suppressed (debounce)', { signature });
      return null;
    }

    // Check if we've hit the max alerts per hour
    if (this.isOverRateLimit()) {
      logger.warn('Alert suppressed (rate limit)', { signature });
      return null;
    }

    // Check for escalation
    const alertCount = this.alertCounts.get(signature) || 0;
    const escalatedLevel = this.escalateLevel(level, alertCount);

    // Create alert object
    const alert = {
      type,
      level: escalatedLevel,
      title,
      message,
      data,
      action,
      timestamp: new Date().toISOString(),
      signature,
      occurrenceCount: alertCount + 1
    };

    // Update tracking
    this.alerts.push(alert);
    this.lastAlertTime.set(signature, Date.now());
    this.alertCounts.set(signature, alertCount + 1);

    // Keep only last 1000 alerts
    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-1000);
    }

    // Log alert
    logger[level.toLowerCase() === 'critical' ? 'error' : level.toLowerCase()](
      `Alert: ${title}`,
      { type, level: escalatedLevel, message, data }
    );

    // Deliver alert
    this.deliverAlert(alert);

    return alert;
  }

  /**
   * Check if alert should be suppressed due to debouncing
   * @param {String} signature - Alert signature
   * @returns {Boolean} True if should suppress
   */
  shouldSuppress(signature) {
    const lastTime = this.lastAlertTime.get(signature);
    if (!lastTime) return false;

    const now = Date.now();
    const debounceMs = this.config.debounceMinutes * 60 * 1000;

    return (now - lastTime) < debounceMs;
  }

  /**
   * Check if alert rate limit is exceeded
   * @returns {Boolean} True if over rate limit
   */
  isOverRateLimit() {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;

    const recentAlerts = this.alerts.filter(alert => {
      const alertTime = new Date(alert.timestamp).getTime();
      return (now - alertTime) < hourMs;
    });

    return recentAlerts.length >= this.config.maxAlertsPerHour;
  }

  /**
   * Escalate alert level based on occurrence count
   * @param {String} level - Current level
   * @param {Number} count - Occurrence count
   * @returns {String} Escalated level
   */
  escalateLevel(level, count) {
    if (count >= this.config.escalationThreshold) {
      if (level === ALERT_LEVELS.INFO) {
        return ALERT_LEVELS.WARN;
      } else if (level === ALERT_LEVELS.WARN) {
        return ALERT_LEVELS.CRITICAL;
      }
    }
    return level;
  }

  /**
   * Deliver alert to configured channels
   * @param {Object} alert - Alert object
   */
  async deliverAlert(alert) {
    const formattedAlert = this.formatAlert(alert);

    // Call delivery callback if set
    if (this.deliveryCallback) {
      try {
        await this.deliveryCallback(formattedAlert, alert);
      } catch (error) {
        logger.error('Error in delivery callback', { error: error.message });
      }
    }

    // Additional delivery methods can be added here (webhook, etc.)
  }

  /**
   * Format alert for display
   * @param {Object} alert - Alert object
   * @returns {String} Formatted alert message
   */
  formatAlert(alert) {
    const levelEmoji = {
      [ALERT_LEVELS.INFO]: 'ℹ️',
      [ALERT_LEVELS.WARN]: '⚠️',
      [ALERT_LEVELS.CRITICAL]: '🚨'
    }[alert.level] || 'ℹ️';

    const typeEmoji = {
      [ALERT_TYPES.SYSTEM]: '💻',
      [ALERT_TYPES.APPLICATION]: '⚙️',
      [ALERT_TYPES.BUSINESS]: '📊',
      [ALERT_TYPES.UX]: '👤',
      [ALERT_TYPES.IP]: '🌐',
      [ALERT_TYPES.CHANNEL]: '📺'
    }[alert.type] || '🔔';

    let message = `${levelEmoji} <b>${alert.level}</b> ${typeEmoji} <b>${alert.title}</b>\n\n`;
    message += `${alert.message}\n`;

    if (alert.occurrenceCount > 1) {
      message += `\n🔄 Повторення: ${alert.occurrenceCount} разів\n`;
    }

    if (Object.keys(alert.data).length > 0) {
      message += '\n<b>Деталі:</b>\n';
      for (const [key, value] of Object.entries(alert.data)) {
        message += `• ${key}: ${value}\n`;
      }
    }

    if (alert.action) {
      message += `\n💡 <b>Дія:</b> ${alert.action}\n`;
    }

    message += `\n⏰ ${new Date(alert.timestamp).toLocaleString('uk-UA')}`;

    return message;
  }

  /**
   * Get recent alerts
   * @param {Number} count - Number of alerts to retrieve
   * @param {String} level - Filter by level (optional)
   * @returns {Array} Recent alerts
   */
  getRecentAlerts(count = 10, level = null) {
    let filtered = this.alerts;

    if (level) {
      filtered = filtered.filter(alert => alert.level === level);
    }

    return filtered.slice(-count);
  }

  /**
   * Get alerts summary
   * @returns {Object} Summary of alerts
   */
  getAlertsSummary() {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    const dayMs = 24 * hourMs;

    const lastHour = this.alerts.filter(a => {
      const t = new Date(a.timestamp).getTime();
      return (now - t) < hourMs;
    });

    const lastDay = this.alerts.filter(a => {
      const t = new Date(a.timestamp).getTime();
      return (now - t) < dayMs;
    });

    const byLevel = {
      [ALERT_LEVELS.INFO]: lastDay.filter(a => a.level === ALERT_LEVELS.INFO).length,
      [ALERT_LEVELS.WARN]: lastDay.filter(a => a.level === ALERT_LEVELS.WARN).length,
      [ALERT_LEVELS.CRITICAL]: lastDay.filter(a => a.level === ALERT_LEVELS.CRITICAL).length
    };

    return {
      total: this.alerts.length,
      lastHour: lastHour.length,
      lastDay: lastDay.length,
      byLevel,
      recentCritical: this.getRecentAlerts(5, ALERT_LEVELS.CRITICAL)
    };
  }

  /**
   * Clear old alerts
   * @param {Number} olderThanDays - Clear alerts older than this many days
   */
  clearOldAlerts(olderThanDays = 7) {
    const now = Date.now();
    const cutoffMs = olderThanDays * 24 * 60 * 60 * 1000;

    this.alerts = this.alerts.filter(alert => {
      const alertTime = new Date(alert.timestamp).getTime();
      return (now - alertTime) < cutoffMs;
    });

    logger.info('Old alerts cleared', { olderThanDays, remaining: this.alerts.length });
  }

  /**
   * Reset alert manager (for testing)
   */
  reset() {
    this.alerts = [];
    this.lastAlertTime.clear();
    this.alertCounts.clear();
    logger.info('Alert manager reset');
  }
}

// Singleton instance
const alertManager = new AlertManager();

module.exports = {
  alertManager,
  ALERT_LEVELS,
  ALERT_TYPES
};
