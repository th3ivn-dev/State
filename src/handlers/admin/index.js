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
    if (data.startsWith('admin_ticket')) {
      await handleTicketsCallback(bot, query, chatId, userId, data);
    } else if (data.startsWith('admin_interval') || data.startsWith('admin_schedule_') || data.startsWith('admin_ip_')) {
      await handleIntervalsCallback(bot, query, chatId, userId, data);
    } else if (data === 'admin_pause' || data.startsWith('pause_') || data === 'admin_debounce' || data.startsWith('debounce_set_')) {
      await handlePauseCallback(bot, query, chatId, userId, data);
    } else if (data === 'admin_growth' || data.startsWith('growth_')) {
      await handleGrowthCallback(bot, query, chatId, userId, data);
    } else if (data.startsWith('admin_router')) {
      await handleRouterCallback(bot, query, chatId, userId, data);
    } else if (data.startsWith('admin_support')) {
      await handleSupportCallback(bot, query, chatId, userId, data);
    } else if (data.startsWith('admin_clear_db') || data.startsWith('admin_restart')) {
      await handleDatabaseCallback(bot, query, chatId, userId, data);
    } else {
      // commands/core: admin_stats, admin_users*, admin_broadcast, admin_system, admin_menu, noop
      await handleCommandsCallback(bot, query, chatId, userId, data);
    }
  } catch (error) {
    console.error('Помилка в handleAdminCallback:', error);
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
};
