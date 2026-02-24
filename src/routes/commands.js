const { handleStart } = require('../handlers/start');
const { handleSchedule, handleNext, handleTimer } = require('../handlers/schedule');
const { handleSettings } = require('../handlers/settings');
const {
  handleAdmin,
  handleStats,
  handleSystem,
  handleBroadcast,
  handleSetInterval,
  handleSetDebounce,
  handleGetDebounce,
  handleMonitoring,
  handleSetAlertChannel,
  handleDashboard,
} = require('../handlers/admin');
const { handleChannel, handleCancelChannel } = require('../handlers/channel');

/**
 * Register all command handlers on the bot instance.
 * @param {import('grammy').Bot} bot
 */
function registerCommands(bot) {
  bot.command('start', (ctx) => handleStart(bot, ctx.message));
  bot.command('schedule', (ctx) => handleSchedule(bot, ctx.message));
  bot.command('next', (ctx) => handleNext(bot, ctx.message));
  bot.command('timer', (ctx) => handleTimer(bot, ctx.message));
  bot.command('settings', (ctx) => handleSettings(bot, ctx.message));
  bot.command('channel', (ctx) => handleChannel(bot, ctx.message));
  bot.command('cancel', (ctx) => handleCancelChannel(bot, ctx.message));
  bot.command('admin', (ctx) => handleAdmin(bot, ctx.message));
  bot.command('dashboard', (ctx) => handleDashboard(bot, ctx.message));
  bot.command('stats', (ctx) => handleStats(bot, ctx.message));
  bot.command('system', (ctx) => handleSystem(bot, ctx.message));
  bot.command('monitoring', (ctx) => handleMonitoring(bot, ctx.message));
  bot.command('setalertchannel', (ctx) => {
    const match = [null, ctx.match];
    handleSetAlertChannel(bot, ctx.message, match);
  });
  bot.command('broadcast', (ctx) => {
    const match = [null, ctx.match];
    handleBroadcast(bot, ctx.message, match);
  });
  bot.command('setinterval', (ctx) => {
    const match = [null, ctx.match];
    handleSetInterval(bot, ctx.message, match);
  });
  bot.command('setdebounce', (ctx) => {
    const match = [null, ctx.match];
    handleSetDebounce(bot, ctx.message, match);
  });
  bot.command('getdebounce', (ctx) => handleGetDebounce(bot, ctx.message));
}

module.exports = { registerCommands };
