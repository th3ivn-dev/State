/**
 * Ініціалізація всіх підсистем бота
 */

const { run } = require('@grammyjs/runner');
const { initScheduler, schedulerManager } = require('../scheduler');
const { startPowerMonitoring } = require('../powerMonitor');
const { initChannelGuard, checkExistingUsers } = require('../channelGuard');
const { formatInterval } = require('../utils');
const config = require('../config');
const { initializeDatabase, runMigrations, cleanupOldStates, checkPoolHealth, startPoolMetricsLogging, getSetting } = require('../database/db');
const { restorePendingChannels } = require('../channels/pendingStore');
const { initStateManager } = require('../state/stateManager');
const { monitoringManager } = require('../monitoring/monitoringManager');
const { startHealthCheck } = require('../healthcheck');
const messageQueue = require('../utils/messageQueue');
const { notifyAdminsAboutError } = require('../utils/adminNotifier');
const { startAdminRouterMonitoring } = require('../adminRouterMonitor');
const { is409ConflictError } = require('./errors');
const logger = require('../logger').child({ module: 'startup' });

/**
 * Виконує повну послідовність ініціалізації бота
 * @param {object} bot - Grammy bot instance
 * @returns {Promise<{ runner: object|null }>}
 */
async function initializeAll(bot) {
  logger.info('🚀 Запуск СвітлоБот...');
  logger.info(`📍 Timezone: ${config.timezone}`);

  // КРИТИЧНО: Ініціалізація та міграція бази даних перед запуском
  await initializeDatabase();
  await runMigrations();

  // Read schedule interval from database for logging
  const intervalStr = await getSetting('schedule_check_interval', '60');
  let checkIntervalSeconds = parseInt(intervalStr, 10);

  // Validate the interval
  if (isNaN(checkIntervalSeconds) || checkIntervalSeconds < 1) {
    logger.warn(`⚠️ Invalid schedule_check_interval "${intervalStr}", using default 60 seconds`);
    checkIntervalSeconds = 60;
  }

  logger.info(`📊 Перевірка графіків: кожні ${formatInterval(checkIntervalSeconds)}`);
  logger.info(`💾 База даних: PostgreSQL`);

  // Перевірка здоров'я пулу підключень
  await checkPoolHealth();

  // Запуск логування метрик пулу
  startPoolMetricsLogging();

  // Ініціалізація message queue
  messageQueue.init(bot);

  // Ініціалізація централізованого state manager
  await initStateManager();

  // Restore pending channels (state manager handles wizard/conversation/IP setup states)
  logger.info('🔄 Відновлення станів...');
  await restorePendingChannels(); // TODO: Migrate to state manager

  // Очистка старих станів (старше 24 годин)
  await cleanupOldStates();

  // Ініціалізація планувальника
  await initScheduler(bot);

  // Ініціалізація захисту каналів
  initChannelGuard(bot);

  // Ініціалізація моніторингу живлення
  await startPowerMonitoring(bot);

  // Ініціалізація моніторингу роутерів адміністраторів
  await startAdminRouterMonitoring(bot);

  // Ініціалізація системи моніторингу та алертів
  logger.info('🔎 Ініціалізація системи моніторингу...');
  monitoringManager.init(bot, {
    checkIntervalMinutes: 5,
    errorSpikeThreshold: 10,
    errorSpikeWindow: 5,
    repeatedErrorThreshold: 5,
    memoryThresholdMB: 500,
    maxUptimeDays: 7
  });
  await monitoringManager.start();
  logger.info('✅ Система моніторингу запущена');

  // Ініціалізація бота (отримання botInfo для bot.options.id)
  await bot.init();
  logger.info(`🤖 Bot info: @${bot.botInfo.username}`);

  // Start polling if not webhook mode
  let runner = null;
  if (!config.USE_WEBHOOK) {
    // Use @grammyjs/runner for parallel update processing
    runner = run(bot);
    logger.info('✅ Polling запущено (runner)');
    runner.task().catch(err => {
      if (is409ConflictError(err)) {
        logger.warn('⚠️ 409 Conflict при polling — очікувана помилка при редеплої, стара інстанція ще не завершилась');
      } else {
        logger.error({ err: err }, '❌ Помилка при старті polling');
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

  logger.info('✨ Бот успішно запущено та готовий до роботи!');

  return { runner };
}

module.exports = { initializeAll };
