/**
 * Обробка необроблених помилок процесу та helper для 409 Conflict
 */

/**
 * Перевіряє чи помилка є 409 Conflict (очікувана при редеплої polling)
 * @param {*} error
 * @returns {boolean}
 */
function is409ConflictError(error) {
  if (!error) return false;
  if (error.error_code === 409) return true;
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('409') && (msg.includes('Conflict') || msg.includes('terminated by other getUpdates request'));
}

/**
 * Реєструє обробники необроблених помилок процесу
 * @param {object} bot - Grammy bot instance
 * @param {{ monitoringManager: object, notifyAdminsAboutError: Function }} deps
 */
function setupErrorHandlers(bot, { monitoringManager, notifyAdminsAboutError }) {
  process.on('uncaughtException', (error) => {
    // 409 Conflict is expected during redeploy (old instance still polling) — skip silently
    if (is409ConflictError(error)) {
      console.warn('⚠️ 409 Conflict при polling — очікувана помилка при редеплої, ігнорується');
      return;
    }
    console.error('❌ Необроблена помилка:', error);
    // Track error in monitoring system
    try {
      const metricsCollector = monitoringManager.getMetricsCollector();
      metricsCollector.trackError(error, { context: 'uncaughtException' });
    } catch (_e) {
      // Monitoring may not be initialized yet
    }
    // Notify admins about the error
    notifyAdminsAboutError(bot, error, 'uncaughtException');
    // Do not shutdown on uncaughtException to keep bot running
    // Only critical errors that would corrupt state should trigger shutdown
    // The error is logged and tracked — the bot continues operating
  });

  process.on('unhandledRejection', (reason, _promise) => {
    // 409 Conflict is expected during redeploy (old instance still polling) — skip silently
    if (is409ConflictError(reason)) {
      console.warn('⚠️ 409 Conflict при старті polling — очікувана помилка при редеплої, ігнорується...');
      return;
    }
    console.error('❌ Необроблене відхилення промісу:', reason);
    const error = reason instanceof Error ? reason : new Error(String(reason));
    // Track error in monitoring system
    try {
      const metricsCollector = monitoringManager.getMetricsCollector();
      metricsCollector.trackError(error, { context: 'unhandledRejection' });
    } catch (_e) {
      // Monitoring may not be initialized yet
    }
    // Notify admins about the error
    notifyAdminsAboutError(bot, error, 'unhandledRejection');
  });
}

module.exports = { is409ConflictError, setupErrorHandlers };
