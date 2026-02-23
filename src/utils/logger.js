/**
 * Структуроване логування для бота
 * Підтримує різні рівні логування та форматування
 */

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

/**
 * Базова функція логування
 * @param {String} level - Рівень логування (error, warn, info, debug)
 * @param {String} message - Повідомлення для логування
 * @param {Object} data - Додаткові дані для логування
 */
function log(level, message, data = {}) {
  if (LOG_LEVELS[level] > currentLevel) return;

  const timestamp = new Date().toISOString();
  const prefix = {
    error: '❌',
    warn: '⚠️',
    info: 'ℹ️',
    debug: '🔍'
  }[level];

  const logMessage = `[${timestamp}] ${prefix} ${message}`;

  if (Object.keys(data).length > 0) {
    console[level === 'error' ? 'error' : 'log'](logMessage, data);
  } else {
    console[level === 'error' ? 'error' : 'log'](logMessage);
  }
}

/**
 * Логування помилки
 * @param {String} msg - Повідомлення про помилку
 * @param {Object} data - Додаткові дані
 */
function error(msg, data) {
  log('error', msg, data);
}

/**
 * Логування попередження
 * @param {String} msg - Повідомлення попередження
 * @param {Object} data - Додаткові дані
 */
function warn(msg, data) {
  log('warn', msg, data);
}

/**
 * Логування інформації
 * @param {String} msg - Інформаційне повідомлення
 * @param {Object} data - Додаткові дані
 */
function info(msg, data) {
  log('info', msg, data);
}

/**
 * Логування для налагодження
 * @param {String} msg - Повідомлення для налагодження
 * @param {Object} data - Додаткові дані
 */
function debug(msg, data) {
  log('debug', msg, data);
}

/**
 * Створює контекстний логгер з префіксом
 * @param {String} context - Контекст логування (наприклад, 'PowerMonitor', 'Scheduler')
 * @returns {Object} - Об'єкт з методами логування
 */
function createLogger(context) {
  return {
    error: (msg, data) => error(`[${context}] ${msg}`, data),
    warn: (msg, data) => warn(`[${context}] ${msg}`, data),
    info: (msg, data) => info(`[${context}] ${msg}`, data),
    debug: (msg, data) => debug(`[${context}] ${msg}`, data),
    success: (msg, data) => {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] ✅ [${context}] ${msg}`;
      if (data && Object.keys(data).length > 0) {
        console.log(logMessage, data);
      } else {
        console.log(logMessage);
      }
    },
    time: (label) => {
      const start = Date.now();
      return {
        end: (msg) => {
          const duration = Date.now() - start;
          const timestamp = new Date().toISOString();
          const logMessage = `[${timestamp}] ⏱️ [${context}] ${msg || label}: ${duration}ms`;
          console.log(logMessage);
          return duration;
        }
      };
    }
  };
}

module.exports = {
  error,
  warn,
  info,
  debug,
  createLogger
};
