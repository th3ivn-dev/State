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
const { restorePendingChannels } = require('../bot');
const { restoreWizardStates } = require('../handlers/start');
const { restoreConversationStates } = require('../handlers/channel');
const { restoreIpSetupStates } = require('../handlers/settings');
const { initStateManager } = require('../state/stateManager');
const { monitoringManager } = require('../monitoring/monitoringManager');
const { startHealthCheck } = require('../healthcheck');
const messageQueue = require('../utils/messageQueue');
const { notifyAdminsAboutError } = require('../utils/adminNotifier');
const { startAdminRouterMonitoring } = require('../adminRouterMonitor');
const { is409ConflictError } = require('./errors');

/**
 * Виконує повну послідовність ініціалізації бота
 * @param {object} bot - Grammy bot instance
 * @returns {Promise<{ runner: object|null }>}
 */
async function initializeAll(bot) {
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
  let runner = null;
  if (!config.USE_WEBHOOK) {
    // Use @grammyjs/runner for parallel update processing
    runner = run(bot);
    console.log('✅ Polling запущено (runner)');
    runner.task().catch(err => {
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

  return { runner };
}

module.exports = { initializeAll };
