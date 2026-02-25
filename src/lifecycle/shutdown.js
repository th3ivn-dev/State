/**
 * Graceful shutdown — закриває всі ресурси по черзі
 */

const logger = require('../logger').child({ module: 'shutdown' });
const SHUTDOWN_TIMEOUT_MS = 15000; // Force-kill after 15 seconds

/**
 * Створює функцію graceful shutdown із захистом від подвійного виклику
 * @param {object} bot - Grammy bot instance
 * @param {{
 *   getRunner: Function,
 *   config: object,
 *   messageQueue: object,
 *   schedulerManager: object,
 *   stopCleanup: Function,
 *   stopCacheCleanup: Function,
 *   stopBotCleanup: Function,
 *   monitoringManager: object,
 *   stopPowerMonitoring: Function,
 *   stopAdminRouterMonitoring: Function,
 *   saveAllUserStates: Function,
 *   stopHealthCheck: Function,
 *   stopPoolMetricsLogging: Function,
 *   closeDatabase: Function,
 *   stopRateLimit: Function,
 * }} deps
 * @returns {Function} async shutdown(signal)
 */
function createShutdownHandler(bot, deps) {
  const {
    getRunner,
    config,
    messageQueue,
    schedulerManager,
    stopCleanup,
    stopCacheCleanup,
    stopBotCleanup,
    monitoringManager,
    stopPowerMonitoring,
    stopAdminRouterMonitoring,
    saveAllUserStates,
    stopHealthCheck,
    stopPoolMetricsLogging,
    closeDatabase,
    stopRateLimit,
  } = deps;

  let isShuttingDown = false;

  return async function shutdown(signal) {
    if (isShuttingDown) {
      logger.info('⏳ Завершення вже виконується...');
      return;
    }
    isShuttingDown = true;

    logger.info(`\n⏳ Отримано ${signal}, завершую роботу...`);

    // Force-kill timeout to prevent hanging shutdown
    const forceKillTimer = setTimeout(() => {
      logger.error('❌ Shutdown timed out, force exiting...');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceKillTimer.unref(); // Don't keep process alive just for this timer

    try {
      // 1. Зупиняємо прийом повідомлень
      if (config.USE_WEBHOOK) {
        await bot.api.deleteWebhook().catch((error) => {
          logger.error({ err: error }, '⚠️  Помилка при видаленні webhook');
        });
        logger.info('✅ Webhook видалено');
      } else {
        // Stop runner if it was started (polling mode), otherwise fall back to bot.stop()
        const runner = getRunner();
        if (runner) {
          await runner.stop();
        } else {
          await bot.stop();
        }
        logger.info('✅ Polling зупинено');
      }

      // 2. Drain message queue (wait for pending messages)
      await messageQueue.drain();
      logger.info('✅ Message queue drained');

      // 3. Зупиняємо scheduler manager
      schedulerManager.stop();
      logger.info('✅ Scheduler manager зупинено');

      // 4. Зупиняємо state manager cleanup
      stopCleanup();
      logger.info('✅ State manager зупинено');

      // 5. Зупиняємо cache cleanup
      stopCacheCleanup();
      logger.info('✅ Cache cleanup зупинено');

      // 5.1 Зупиняємо rate limiter
      stopRateLimit();
      logger.info('✅ Rate limiter зупинено');

      // 5.2 Зупиняємо bot cleanup interval
      stopBotCleanup();
      logger.info('✅ Bot cleanup зупинено');

      // 6. Зупиняємо систему моніторингу
      monitoringManager.stop();
      logger.info('✅ Система моніторингу зупинена');

      // 7. Зупиняємо моніторинг живлення
      stopPowerMonitoring();
      logger.info('✅ Моніторинг живлення зупинено');

      // 7.1 Зупиняємо моніторинг роутерів адміністраторів
      stopAdminRouterMonitoring();
      logger.info('✅ Моніторинг роутерів адміністраторів зупинено');

      // 8. Зберігаємо всі стани користувачів
      await saveAllUserStates();
      logger.info('✅ Стани користувачів збережено');

      // 9. Зупиняємо health check server
      stopHealthCheck();
      logger.info('✅ Health check server stopped');

      // 10. Зупиняємо pool metrics logging
      stopPoolMetricsLogging();
      logger.info('✅ Pool metrics logging stopped');

      // 11. Закриваємо базу даних коректно
      await closeDatabase();

      clearTimeout(forceKillTimer);
      logger.info('👋 Бот завершив роботу');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, '❌ Помилка при завершенні');
      clearTimeout(forceKillTimer);
      process.exit(1);
    }
  };
}

module.exports = { createShutdownHandler };
