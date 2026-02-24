const { handleWizardCallback } = require('../handlers/start');
const { handleSettingsCallback } = require('../handlers/settings');
const { handleAdminCallback } = require('../handlers/admin');
const { handleChannelCallback } = require('../handlers/channel');
const { handleFeedbackCallback } = require('../handlers/feedback');
const { handleRegionRequestCallback } = require('../handlers/regionRequest');
const {
  handleMenuSchedule,
  handleMenuTimer,
  handleMenuStats,
  handleMenuHelp,
  handleMenuSettings,
  handleBackToMain,
  handleHelpHowto,
  handleHelpFaq,
  handleTimerCallback,
  handleStatsCallback,
} = require('../handlers/menu');
const { safeAnswerCallbackQuery } = require('../utils/errorHandler');
const { notifyAdminsAboutError } = require('../utils/adminNotifier');
const logger = require('../logger').child({ module: 'callbacks' });

// Exact match routes: callback_data → handler(bot, query)
const exactRoutes = new Map([
  ['menu_schedule', (bot, query) => handleMenuSchedule(bot, query)],
  ['menu_timer', (bot, query) => handleMenuTimer(bot, query)],
  ['menu_stats', (bot, query) => handleMenuStats(bot, query)],
  ['menu_help', (bot, query) => handleMenuHelp(bot, query)],
  ['menu_settings', (bot, query) => handleMenuSettings(bot, query)],
  ['back_to_main', (bot, query) => handleBackToMain(bot, query)],
  ['confirm_setup', (bot, query) => handleWizardCallback(bot, query)],
  ['back_to_region', (bot, query) => handleWizardCallback(bot, query)],
  ['restore_profile', (bot, query) => handleWizardCallback(bot, query)],
  ['create_new_profile', (bot, query) => handleWizardCallback(bot, query)],
  ['wizard_notify_bot', (bot, query) => handleWizardCallback(bot, query)],
  ['wizard_notify_channel', (bot, query) => handleWizardCallback(bot, query)],
  ['wizard_notify_back', (bot, query) => handleWizardCallback(bot, query)],
  ['channel_reconnect', (bot, query) => handleSettingsCallback(bot, query)],
  ['confirm_deactivate', (bot, query) => handleSettingsCallback(bot, query)],
  ['confirm_delete_data', (bot, query) => handleSettingsCallback(bot, query)],
  ['delete_data_step2', (bot, query) => handleSettingsCallback(bot, query)],
  ['back_to_settings', (bot, query) => handleSettingsCallback(bot, query)],
  ['cancel_channel_connect', (bot, query) => handleChannelCallback(bot, query)],
  ['keep_current_channel', (bot, query) => handleChannelCallback(bot, query)],
  ['help_howto', (bot, query) => handleHelpHowto(bot, query)],
  ['help_faq', (bot, query) => handleHelpFaq(bot, query)],
]);

// Prefix match routes (ordered — first match wins; region_request_ must precede region_)
// All handlers receive (bot, query, data) for a consistent signature.
const prefixRoutes = [
  { prefix: 'region_request_', handler: (bot, query, _data) => handleRegionRequestCallback(bot, query) },
  { prefix: 'region_', handler: (bot, query, _data) => handleWizardCallback(bot, query) },
  { prefix: 'queue_', handler: (bot, query, _data) => handleWizardCallback(bot, query) },
  { prefix: 'wizard_channel_confirm_', handler: (bot, query, _data) => handleWizardCallback(bot, query) },
  // Inline button callbacks from channel schedule messages (include user_id, e.g. timer_123)
  { prefix: 'timer_', handler: (bot, query, data) => handleTimerCallback(bot, query, data) },
  { prefix: 'stats_', handler: (bot, query, data) => handleStatsCallback(bot, query, data) },
  { prefix: 'settings_', handler: (bot, query, _data) => handleSettingsCallback(bot, query) },
  { prefix: 'alert_', handler: (bot, query, _data) => handleSettingsCallback(bot, query) },
  { prefix: 'ip_', handler: (bot, query, _data) => handleSettingsCallback(bot, query) },
  { prefix: 'notify_target_', handler: (bot, query, _data) => handleSettingsCallback(bot, query) },
  { prefix: 'schedule_alert_', handler: (bot, query, _data) => handleSettingsCallback(bot, query) },
  { prefix: 'feedback_', handler: (bot, query, _data) => handleFeedbackCallback(bot, query) },
  { prefix: 'admin_', handler: (bot, query, _data) => handleAdminCallback(bot, query) },
  { prefix: 'pause_', handler: (bot, query, _data) => handleAdminCallback(bot, query) },
  { prefix: 'debounce_', handler: (bot, query, _data) => handleAdminCallback(bot, query) },
  { prefix: 'growth_', handler: (bot, query, _data) => handleAdminCallback(bot, query) },
  { prefix: 'dashboard_', handler: (bot, query, _data) => handleAdminCallback(bot, query) },
  { prefix: 'channel_', handler: (bot, query, _data) => handleChannelCallback(bot, query) },
  { prefix: 'brand_', handler: (bot, query, _data) => handleChannelCallback(bot, query) },
  { prefix: 'test_', handler: (bot, query, _data) => handleChannelCallback(bot, query) },
  { prefix: 'format_', handler: (bot, query, _data) => handleChannelCallback(bot, query) },
  { prefix: 'connect_channel_', handler: (bot, query, _data) => handleChannelCallback(bot, query) },
  { prefix: 'replace_channel_', handler: (bot, query, _data) => handleChannelCallback(bot, query) },
];

/**
 * Register the callback_query:data handler on the bot instance.
 * @param {import('grammy').Bot} bot
 */
function registerCallbacks(bot) {
  bot.on('callback_query:data', async (ctx) => {
    const query = ctx.callbackQuery;
    const data = query.data;

    try {
      // Check exact matches first
      const exactHandler = exactRoutes.get(data);
      if (exactHandler) {
        await exactHandler(bot, query);
        return;
      }

      // Check prefix matches in order (first match wins)
      for (const { prefix, handler } of prefixRoutes) {
        if (data.startsWith(prefix)) {
          await handler(bot, query, data);
          return;
        }
      }

      // Default: just acknowledge
      await bot.api.answerCallbackQuery(query.id);

    } catch (error) {
      logger.error({ err: error }, 'Помилка обробки callback query');
      notifyAdminsAboutError(bot, error, `callback_query: ${data}`);
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Виникла помилка',
        show_alert: false
      });
    }
  });
}

module.exports = { registerCallbacks };
