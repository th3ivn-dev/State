#!/usr/bin/env node

const bot = require('./bot');
const { stopBotCleanup } = require('./bot');
const { schedulerManager } = require('./scheduler');
const { stopPowerMonitoring, saveAllUserStates } = require('./powerMonitor');
const config = require('./config');
const { stopPoolMetricsLogging, closeDatabase } = require('./database/db');
const { stopCleanup } = require('./state/stateManager');
const { monitoringManager } = require('./monitoring/monitoringManager');
const { stopHealthCheck } = require('./healthcheck');
const messageQueue = require('./utils/messageQueue');
const { notifyAdminsAboutError } = require('./utils/adminNotifier');
const { stopCacheCleanup } = require('./api');
const { stopAdminRouterMonitoring } = require('./adminRouterMonitor');
const { initializeAll } = require('./lifecycle/startup');
const { createShutdownHandler } = require('./lifecycle/shutdown');
const { setupErrorHandlers } = require('./lifecycle/errors');

// Головна async функція для запуску
async function main() {
  const { runner } = await initializeAll(bot);

  const shutdown = createShutdownHandler(bot, {
    getRunner: () => runner,
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
  });

  // Обробка сигналів завершення
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Реєстрація обробників необроблених помилок
  setupErrorHandlers(bot, { monitoringManager, notifyAdminsAboutError });
}

// Запуск з обробкою помилок
main().catch(error => {
  console.error('❌ Критична помилка запуску:', error);
  process.exit(1);
});
