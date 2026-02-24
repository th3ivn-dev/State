const { isAdmin } = require('../../utils');
const config = require('../../config');
const { safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { notifyAdminsAboutError } = require('../../utils/adminNotifier');

const { handleCommandsCallback, handleAdmin, handleStats, handleUsers, handleBroadcast, handleSystem, handleSetInterval, handleSetDebounce, handleGetDebounce } = require('./commands');
const { handleTicketsCallback, handleAdminReply } = require('./tickets');
const { handleIntervalsCallback } = require('./intervals');
const { handlePauseCallback } = require('./pause');
const { handleGrowthCallback } = require('./growth');
const { handleRouterCallback, handleAdminRouterIpConversation } = require('./router');
const { handleSupportCallback, handleAdminSupportUrlConversation } = require('./support');
const { handleMonitoring, handleSetAlertChannel } = require('./monitoring');
const { handleDatabaseCallback } = require('./database');
const { handleDashboard, handleDashboardCallback } = require('./dashboard');
const logger = require('../../logger').child({ module: 'index' });

// Exact match routes for admin callbacks
const exactAdminRoutes = new Map([
  ['admin_pause', (bot, query, chatId, userId, data) => handlePauseCallback(bot, query, chatId, userId, data)],
  ['admin_debounce', (bot, query, chatId, userId, data) => handlePauseCallback(bot, query, chatId, userId, data)],
  ['admin_growth', (bot, query, chatId, userId, data) => handleGrowthCallback(bot, query, chatId, userId, data)],
  ['admin_dashboard', (bot, query, chatId, userId, data) => handleDashboardCallback(bot, query, chatId, userId, data)],
]);

// Prefix match routes for admin callbacks (ordered — first match wins)
const prefixAdminRoutes = [
  { prefix: 'admin_ticket', handler: (bot, query, chatId, userId, data) => handleTicketsCallback(bot, query, chatId, userId, data) },
  { prefix: 'admin_interval', handler: (bot, query, chatId, userId, data) => handleIntervalsCallback(bot, query, chatId, userId, data) },
  { prefix: 'admin_schedule_', handler: (bot, query, chatId, userId, data) => handleIntervalsCallback(bot, query, chatId, userId, data) },
  { prefix: 'admin_ip_', handler: (bot, query, chatId, userId, data) => handleIntervalsCallback(bot, query, chatId, userId, data) },
  { prefix: 'pause_', handler: (bot, query, chatId, userId, data) => handlePauseCallback(bot, query, chatId, userId, data) },
  { prefix: 'debounce_set_', handler: (bot, query, chatId, userId, data) => handlePauseCallback(bot, query, chatId, userId, data) },
  { prefix: 'growth_', handler: (bot, query, chatId, userId, data) => handleGrowthCallback(bot, query, chatId, userId, data) },
  { prefix: 'admin_router', handler: (bot, query, chatId, userId, data) => handleRouterCallback(bot, query, chatId, userId, data) },
  { prefix: 'admin_support', handler: (bot, query, chatId, userId, data) => handleSupportCallback(bot, query, chatId, userId, data) },
  { prefix: 'admin_clear_db', handler: (bot, query, chatId, userId, data) => handleDatabaseCallback(bot, query, chatId, userId, data) },
  { prefix: 'admin_restart', handler: (bot, query, chatId, userId, data) => handleDatabaseCallback(bot, query, chatId, userId, data) },
  { prefix: 'dashboard_', handler: (bot, query, chatId, userId, data) => handleDashboardCallback(bot, query, chatId, userId, data) },
];

// Main admin callback router
async function handleAdminCallback(bot, query) {
  const chatId = query.message.chat.id;
  const userId = String(query.from.id);
  const data = query.data;

  if (!isAdmin(userId, config.adminIds, config.ownerId)) {
    await safeAnswerCallbackQuery(bot, query.id, { text: '❌ Немає прав' });
    return;
  }

  // Answer callback query immediately to prevent timeout (after permission check)
  await bot.api.answerCallbackQuery(query.id).catch(() => {});

  try {
    // Check exact matches first
    const exactHandler = exactAdminRoutes.get(data);
    if (exactHandler) {
      await exactHandler(bot, query, chatId, userId, data);
      return;
    }

    // Check prefix matches in order (first match wins)
    for (const { prefix, handler } of prefixAdminRoutes) {
      if (data.startsWith(prefix)) {
        await handler(bot, query, chatId, userId, data);
        return;
      }
    }

    // Default: commands/core (admin_stats, admin_users*, admin_broadcast, admin_system, admin_menu, noop)
    await handleCommandsCallback(bot, query, chatId, userId, data);
  } catch (error) {
    logger.error({ err: error }, 'Помилка в handleAdminCallback');
    notifyAdminsAboutError(bot, error, 'handleAdminCallback');
    await safeAnswerCallbackQuery(bot, query.id, { text: '❌ Виникла помилка' });
  }
}

module.exports = {
  handleAdmin,
  handleStats,
  handleUsers,
  handleBroadcast,
  handleSystem,
  handleAdminCallback,
  handleSetInterval,
  handleSetDebounce,
  handleGetDebounce,
  handleMonitoring,
  handleSetAlertChannel,
  handleAdminReply,
  handleAdminRouterIpConversation,
  handleAdminSupportUrlConversation,
  handleDashboard,
};
