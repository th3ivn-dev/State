#!/usr/bin/env node

const bot = require('./bot');
const { restorePendingChannels, stopBotCleanup } = require('./bot');
const { run } = require('@grammyjs/runner');
const { initScheduler, schedulerManager } = require('./scheduler');
const { startPowerMonitoring, stopPowerMonitoring, saveAllUserStates } = require('./powerMonitor');
const { initChannelGuard, checkExistingUsers } = require('./channelGuard');
const { formatInterval } = require('./utils');
const config = require('./config');
const { initializeDatabase, runMigrations, cleanupOldStates, checkPoolHealth, startPoolMetricsLogging, getSetting } = require('./database/db');
const { restoreWizardStates } = require('./handlers/start');
const { restoreConversationStates } = require('./handlers/channel');
const { restoreIpSetupStates } = require('./handlers/settings');
const { initStateManager, stopCleanup } = require('./state/stateManager');
const { monitoringManager } = require('./monitoring/monitoringManager');
const { startHealthCheck, stopHealthCheck } = require('./healthcheck');
const messageQueue = require('./utils/messageQueue');
const { notifyAdminsAboutError } = require('./utils/adminNotifier');

// Флаг для запобігання подвійного завершення
let isShuttingDown = false;

// Active runner instance (used when running in polling mode via @grammyjs/runner)
let activeRunner = null;

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

// Головна async функція для запуску
async function main() {
  console.log('🚀 Запуск СвітлоБот...');
  console.log(`📍 Timezone: ${config.timezone}`);
  
  // КРИТИЧНО: Ініціалізація та міграція бази даних перед запуском
  await initializeDatabase();
  await runMigrations();
  
  // Read schedule interval from database for logging
  const intervalStr = await getSetting('schedule_check_interval', '60');
  let checkIntervalSeconds = parseInt(intervalStr, 10);
  
  // Validate the interval
  if (isNaN(checkIntervalSeconds) || checkIntervalSeconds < 1) {
    console.warn(`⚠️ Invalid schedule_check_interval "${intervalStr}", using default 60 seconds`);
    checkIntervalSeconds = 60;
  }
  
  console.log(`📊 Перевірка графіків: кожні ${formatInterval(checkIntervalSeconds)}`);
  console.log(`💾 База даних: PostgreSQL`);
  
  // Перевірка здоров'я пулу підключень
  await checkPoolHealth();
  
  // Запуск логування метрик пулу
  startPoolMetricsLogging();

  // Ініціалізація message queue
  messageQueue.init(bot);
  
  // Ініціалізація централізованого state manager
  await initStateManager();

  // Legacy state restoration calls - can be removed once state manager migration is complete
  // These are now handled by initStateManager() but kept for backward compatibility
  console.log('🔄 Відновлення станів...');
  await restorePendingChannels(); // TODO: Migrate to state manager
  restoreWizardStates(); // Handled by state manager
  restoreConversationStates(); // Handled by state manager
  restoreIpSetupStates(); // Handled by state manager

  // Очистка старих станів (старше 24 годин)
  await cleanupOldStates();

  // Ініціалізація планувальника
  await initScheduler(bot);

  // Ініціалізація захисту каналів
  initChannelGuard(bot);

  // Ініціалізація моніторингу живлення
  await startPowerMonitoring(bot);

  // Ініціалізація моніторингу роутерів адміністраторів
  const { startAdminRouterMonitoring } = require('./adminRouterMonitor');
  await startAdminRouterMonitoring(bot);

  // Ініціалізація системи моніторингу та алертів
  console.log('🔎 Ініціалізація системи моніторингу...');
  monitoringManager.init(bot, {
    checkIntervalMinutes: 5,
    errorSpikeThreshold: 10,
    errorSpikeWindow: 5,
    repeatedErrorThreshold: 5,
    memoryThresholdMB: 500,
    maxUptimeDays: 7
  });
  await monitoringManager.start();
  console.log('✅ Система моніторингу запущена');
  
  // Ініціалізація бота (отримання botInfo для bot.options.id)
  await bot.init();
  console.log(`🤖 Bot info: @${bot.botInfo.username}`);

  // Start polling if not webhook mode
  if (!config.USE_WEBHOOK) {
    // Use @grammyjs/runner for parallel update processing
    activeRunner = run(bot);
    console.log('✅ Polling запущено (runner)');
    activeRunner.task().catch(err => {
      if (is409ConflictError(err)) {
        console.warn('⚠️ 409 Conflict при polling — очікувана помилка при редеплої, стара інстанція ще не завершилась');
      } else {
        console.error('❌ Помилка при старті polling:', err);
        notifyAdminsAboutError(bot, err, 'polling');
      }
    });
  }

  // Запуск health check server
  startHealthCheck(bot, config.HEALTH_PORT);

  // Check existing users for migration (run once on startup)
  setTimeout(() => {
    checkExistingUsers(bot);
  }, 5000); // Wait 5 seconds after startup
  
  console.log('✨ Бот успішно запущено та готовий до роботи!');
}

// Запуск з обробкою помилок
main().catch(error => {
  console.error('❌ Критична помилка запуску:', error);
  process.exit(1);
});

// Graceful shutdown з захистом від подвійного виклику
const SHUTDOWN_TIMEOUT_MS = 15000; // Force-kill after 15 seconds

const shutdown = async (signal) => {
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
      if (activeRunner) {
        await activeRunner.stop();
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
    const { stopCacheCleanup } = require('./api');
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
    const { stopAdminRouterMonitoring } = require('./adminRouterMonitor');
    stopAdminRouterMonitoring();
    console.log('✅ Моніторинг роутерів адміністраторів зупинено');
    
    // 8. Зберігаємо всі стани користувачів
    await saveAllUserStates();
    console.log('✅ Стани користувачів збережено');
    
    // 9. Зупиняємо health check server
    stopHealthCheck();
    console.log('✅ Health check server stopped');
    
    // 10. Зупиняємо pool metrics logging
    const { stopPoolMetricsLogging } = require('./database/db');
    stopPoolMetricsLogging();
    console.log('✅ Pool metrics logging stopped');
    
    // 11. Закриваємо базу даних коректно
    const { closeDatabase } = require('./database/db');
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

// Обробка сигналів завершення
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Обробка необроблених помилок
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
  } catch (e) {
    // Monitoring may not be initialized yet
  }
  // Notify admins about the error
  notifyAdminsAboutError(bot, error, 'uncaughtException');
  // Do not shutdown on uncaughtException to keep bot running
  // Only critical errors that would corrupt state should trigger shutdown
  // The error is logged and tracked — the bot continues operating
});

process.on('unhandledRejection', (reason, promise) => {
  // 409 Conflict is expected during redeploy (old instance still polling) — skip silently
  if (is409ConflictError(reason)) {
    console.warn('⚠️ 409 Conflict при старті polling — очікувана помилка при редеплої, ігнорується...');
    return;
  }
  console.error('❌ Необроблене відхилення промісу:', reason);
  // Track error in monitoring system
  try {
    const metricsCollector = monitoringManager.getMetricsCollector();
    const error = reason instanceof Error ? reason : new Error(String(reason));
    metricsCollector.trackError(error, { context: 'unhandledRejection' });
  } catch (e) {
    // Monitoring may not be initialized yet
  }
  // Notify admins about the error
  const error = reason instanceof Error ? reason : new Error(String(reason));
  notifyAdminsAboutError(bot, error, 'unhandledRejection');
});
