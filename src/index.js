#!/usr/bin/env node

const bot = require('./bot');
const { restorePendingChannels, stopBotCleanup } = require('./bot');
const { initScheduler, schedulerManager } = require('./scheduler');
const { startReminderScheduler, stopReminderScheduler } = require('./scheduleReminder');
const { startPowerMonitoring, stopPowerMonitoring, saveAllUserStates } = require('./powerMonitor');
const { initChannelGuard, checkExistingUsers } = require('./channelGuard');
const { formatInterval } = require('./utils');
const config = require('./config');
const { initializeDatabase, runMigrations, cleanupOldStates, checkPoolHealth, startPoolMetricsLogging } = require('./database/db');
const settingsCache = require('./utils/settingsCache');
const { initStateManager, stopCleanup } = require('./state/stateManager');
const { monitoringManager } = require('./monitoring/monitoringManager');
const { startHealthCheck, stopHealthCheck } = require('./healthcheck');
const messageQueue = require('./utils/messageQueue');
const { notifyAdminsAboutError } = require('./utils/adminNotifier');
const { initWorker, closeQueue } = require('./queue/notificationsQueue');
const { initBroadcastWorker, closeBroadcastQueue } = require('./queue/broadcastQueue');
const { closePhotoCache } = require('./queue/photoCache');
const { startMetricsLogging, stopMetricsLogging } = require('./monitoring/systemMetrics');

// Флаг для запобігання подвійного завершення
let isShuttingDown = false;

// Головна async функція для запуску
async function main() {
  console.log('🚀 Запуск СвітлоБот...');
  console.log(`📍 Timezone: ${config.timezone}`);

  // КРИТИЧНО: Ініціалізація та міграція бази даних перед запуском
  await initializeDatabase();
  await runMigrations();

  // Read schedule interval from database for logging (via settings cache)
  const intervalStr = await settingsCache.get('schedule_check_interval', '60');
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

  // Запуск periodic system metrics logging
  startMetricsLogging();

  messageQueue.init(bot);
  initWorker(bot);
  initBroadcastWorker(bot);

  // State restoration — initStateManager handles wizard/conversation/ipSetup
  await Promise.all([
    initStateManager(),
    restorePendingChannels(),
    cleanupOldStates(),
  ]);

  // Init all background subsystems in parallel (they are independent)
  await Promise.all([
    initScheduler(bot),
    startPowerMonitoring(bot),
    (async () => {
      const { startAdminRouterMonitoring } = require('./adminRouterMonitor');
      await startAdminRouterMonitoring(bot);
    })(),
  ]);

  initChannelGuard(bot);
  startReminderScheduler(bot);

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

  // Запуск health check server
  startHealthCheck(bot, config.HEALTH_PORT);

  // Check existing users for migration (run once on startup)
  setTimeout(() => {
    checkExistingUsers(bot);
  }, 5000); // Wait 5 seconds after startup

  // Memory watchdog — triggers graceful shutdown if heap grows dangerously large.
  // Railway will OOM-kill without warning; we prefer a controlled restart.
  const HEAP_LIMIT_MB = parseInt(process.env.HEAP_LIMIT_MB || '450', 10);
  const memoryWatchdog = setInterval(() => {
    const heapMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    if (heapMB > HEAP_LIMIT_MB) {
      console.error(`🚨 Heap ${heapMB}MB > ${HEAP_LIMIT_MB}MB limit — triggering graceful restart`);
      notifyAdminsAboutError(bot, new Error(`Heap limit exceeded: ${heapMB}MB`), 'memoryWatchdog');
      clearInterval(memoryWatchdog);
      shutdown('MEMORY_LIMIT');
    }
  }, 60_000);
  memoryWatchdog.unref();

  console.log('✨ Бот успішно запущено та готовий до роботи!');
}

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
    // NOTE: Do NOT delete webhook during shutdown — the new container has already
    // registered its own webhook via setWebhook(). Deleting it here would cause
    // a race condition where the old container removes the new container's webhook,
    // leaving the bot unable to receive updates.
    console.log('ℹ️ Webhook залишено (новий інстанс перереєструє автоматично)');

    // 2. Drain message queue (wait for pending messages)
    await messageQueue.drain();
    console.log('✅ Message queue drained');

    // 2.1 Закриваємо notifications queue (BullMQ)
    await closeQueue();
    console.log('✅ Notifications queue закрито');

    // 2.2 Закриваємо broadcast queue (BullMQ)
    await closeBroadcastQueue();
    console.log('✅ Broadcast queue закрито');

    // 2.3 Закриваємо photo cache
    try {
      await closePhotoCache();
    } catch (_e) { /* ignore */ }
    console.log('✅ Photo cache закрито');

    // 3. Зупиняємо scheduler manager
    schedulerManager.stop();
    console.log('✅ Scheduler manager зупинено');

    // 3.1 Зупиняємо планувальник нагадувань
    stopReminderScheduler();

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

    // Зупиняємо system metrics logging
    stopMetricsLogging();
    console.log('✅ System metrics logging stopped');

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

// Track consecutive uncaught exceptions — shut down if they happen too fast
let uncaughtCount = 0;
let uncaughtResetTimer = null;
const MAX_UNCAUGHT_PER_MINUTE = 10;

process.on('uncaughtException', (error) => {
  console.error('❌ Необроблена помилка:', error);

  try {
    const metricsCollector = monitoringManager.getMetricsCollector();
    metricsCollector.trackError(error, { context: 'uncaughtException' });
  } catch (_e) {
    // Monitoring may not be initialized yet
  }

  notifyAdminsAboutError(bot, error, 'uncaughtException');

  uncaughtCount++;
  if (!uncaughtResetTimer) {
    uncaughtResetTimer = setTimeout(() => { uncaughtCount = 0; uncaughtResetTimer = null; }, 60_000);
    uncaughtResetTimer.unref();
  }

  // If exceptions are cascading, the process is likely in a corrupted state
  if (uncaughtCount >= MAX_UNCAUGHT_PER_MINUTE) {
    console.error(`🚨 ${uncaughtCount} uncaughtExceptions in 1 min — shutting down`);
    shutdown('EXCEPTION_CASCADE');
  }
});

process.on('unhandledRejection', (reason, _promise) => {
  console.error('❌ Необроблене відхилення промісу:', reason);
  // Track error in monitoring system
  try {
    const metricsCollector = monitoringManager.getMetricsCollector();
    const error = reason instanceof Error ? reason : new Error(String(reason));
    metricsCollector.trackError(error, { context: 'unhandledRejection' });
  } catch (_e) {
    // Monitoring may not be initialized yet
  }
  // Notify admins about the error
  const error = reason instanceof Error ? reason : new Error(String(reason));
  notifyAdminsAboutError(bot, error, 'unhandledRejection');
});
