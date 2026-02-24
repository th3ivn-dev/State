/**
 * Graceful shutdown — закриває всі ресурси по черзі
 */

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
  } = deps;

  let isShuttingDown = false;

  return async function shutdown(signal) {
    if (isShuttingDown) {
      console.log('⏳ Завершення вже виконується...');
      return;
    }
    isShuttingDown = true;

    console.log(`\n⏳ Отримано ${signal}, завершую роботу...`);

    // Force-kill timeout to prevent hanging shutdown
    const forceKillTimer = setTimeout(() => {
      console.error('❌ Shutdown timed out, force exiting...');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceKillTimer.unref(); // Don't keep process alive just for this timer

    try {
      // 1. Зупиняємо прийом повідомлень
      if (config.USE_WEBHOOK) {
        await bot.api.deleteWebhook().catch((error) => {
          console.error('⚠️  Помилка при видаленні webhook:', error.message);
        });
        console.log('✅ Webhook видалено');
      } else {
        // Stop runner if it was started (polling mode), otherwise fall back to bot.stop()
        const runner = getRunner();
        if (runner) {
          await runner.stop();
        } else {
          await bot.stop();
        }
        console.log('✅ Polling зупинено');
      }

      // 2. Drain message queue (wait for pending messages)
      await messageQueue.drain();
      console.log('✅ Message queue drained');

      // 3. Зупиняємо scheduler manager
      schedulerManager.stop();
      console.log('✅ Scheduler manager зупинено');

      // 4. Зупиняємо state manager cleanup
      stopCleanup();
      console.log('✅ State manager зупинено');

      // 5. Зупиняємо cache cleanup
      stopCacheCleanup();
      console.log('✅ Cache cleanup зупинено');

      // 5.1 Зупиняємо bot cleanup interval
      stopBotCleanup();
      console.log('✅ Bot cleanup зупинено');

      // 6. Зупиняємо систему моніторингу
      monitoringManager.stop();
      console.log('✅ Система моніторингу зупинена');

      // 7. Зупиняємо моніторинг живлення
      stopPowerMonitoring();
      console.log('✅ Моніторинг живлення зупинено');

      // 7.1 Зупиняємо моніторинг роутерів адміністраторів
      stopAdminRouterMonitoring();
      console.log('✅ Моніторинг роутерів адміністраторів зупинено');

      // 8. Зберігаємо всі стани користувачів
      await saveAllUserStates();
      console.log('✅ Стани користувачів збережено');

      // 9. Зупиняємо health check server
      stopHealthCheck();
      console.log('✅ Health check server stopped');

      // 10. Зупиняємо pool metrics logging
      stopPoolMetricsLogging();
      console.log('✅ Pool metrics logging stopped');

      // 11. Закриваємо базу даних коректно
      await closeDatabase();

      clearTimeout(forceKillTimer);
      console.log('👋 Бот завершив роботу');
      process.exit(0);
    } catch (error) {
      console.error('❌ Помилка при завершенні:', error);
      clearTimeout(forceKillTimer);
      process.exit(1);
    }
  };
}

module.exports = { createShutdownHandler };
