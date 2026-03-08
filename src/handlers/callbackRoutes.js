const { CallbackRouter } = require('../utils/CallbackRouter');

// Import all handlers (same imports that bot.js currently has)
const { handleWizardCallback } = require('./start');
const { handleSettingsCallback } = require('./settings');
const { handleAdminCallback } = require('./admin');
const { handleChannelCallback } = require('./channel');
const { handleFeedbackCallback } = require('./feedback');
const { handleRegionRequestCallback } = require('./regionRequest');
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
  handleScheduleRefresh,
  handleMyQueues,
} = require('./menu');

/**
 * Build the main callback router for bot.js
 * ORDER MATTERS — more specific prefixes must come before less specific ones.
 * e.g. 'region_request_' must be before 'region_'
 */
function createCallbackRouter() {
  return new CallbackRouter()
    // Region requests — MUST be before region_ to avoid conflict
    .prefix('region_request_', (bot, query) => handleRegionRequestCallback(bot, query))

    // Wizard callbacks (region selection, queue, setup)
    .prefix(['region_', 'queue_', 'wizard_channel_confirm_'], (bot, query) => handleWizardCallback(bot, query))
    .exact(['confirm_setup', 'back_to_region', 'restore_profile', 'create_new_profile',
            'wizard_notify_bot', 'wizard_notify_channel', 'wizard_notify_back'], (bot, query) => handleWizardCallback(bot, query))

    // Menu callbacks
    .exact('menu_schedule', (bot, query) => handleMenuSchedule(bot, query))
    .exact('schedule_refresh', (bot, query) => handleScheduleRefresh(bot, query))
    .exact('my_queues', (bot, query) => handleMyQueues(bot, query))
    .exact('menu_timer', (bot, query) => handleMenuTimer(bot, query))
    .exact('menu_stats', (bot, query) => handleMenuStats(bot, query))
    .exact('menu_help', (bot, query) => handleMenuHelp(bot, query))
    .exact('menu_settings', (bot, query) => handleMenuSettings(bot, query))
    .exact('back_to_main', (bot, query) => handleBackToMain(bot, query))

    // Timer & stats from channel inline buttons
    .prefix('timer_', (bot, query, data) => handleTimerCallback(bot, query, data))
    .prefix('stats_', (bot, query, data) => handleStatsCallback(bot, query, data))

    // Settings callbacks
    .on(
      (d) => d.startsWith('settings_') ||
             d.startsWith('alert_') ||
             d.startsWith('ip_') ||
             d.startsWith('notify_target_') ||
             d.startsWith('notif_') ||
             d.startsWith('cleanup_') ||
             d.startsWith('schedule_alert_') ||
             d === 'channel_reconnect' ||
             d === 'confirm_deactivate' ||
             d === 'confirm_delete_data' ||
             d === 'delete_data_step2' ||
             d === 'back_to_settings',
      (bot, query) => handleSettingsCallback(bot, query)
    )

    // Feedback callbacks
    .prefix('feedback_', (bot, query) => handleFeedbackCallback(bot, query))

    // Admin callbacks (including pause mode, debounce, growth, and maintenance)
    .on(
      (d) => d.startsWith('admin_') ||
             d.startsWith('pause_') ||
             d.startsWith('debounce_') ||
             d.startsWith('growth_') ||
             d.startsWith('maintenance_'),
      (bot, query) => handleAdminCallback(bot, query)
    )

    // Channel callbacks (including auto-connect, test, and format)
    .on(
      (d) => d.startsWith('channel_') ||
             d.startsWith('brand_') ||
             d.startsWith('test_') ||
             d.startsWith('format_') ||
             d.startsWith('connect_channel_') ||
             d.startsWith('replace_channel_') ||
             d === 'cancel_channel_connect' ||
             d === 'keep_current_channel',
      (bot, query) => handleChannelCallback(bot, query)
    )

    // Help callbacks
    .exact(['help_howto', 'help_faq'], (bot, query) => {
      const data = query.data;
      if (data === 'help_howto') return handleHelpHowto(bot, query);
      return handleHelpFaq(bot, query);
    });
}

module.exports = { createCallbackRouter };
