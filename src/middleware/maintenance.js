const { isMaintenanceMode } = require('../handlers/admin/maintenance');
const { isAdmin } = require('../utils');
const config = require('../config');

function maintenanceMiddleware() {
  return async (ctx, next) => {
    const maintenance = await isMaintenanceMode();
    if (maintenance.enabled) {
      const userId = String(ctx.from?.id);
      if (!isAdmin(userId, config.adminIds, config.ownerId)) {
        if (ctx.callbackQuery) {
          await ctx.answerCallbackQuery({ text: maintenance.message, show_alert: true }).catch(() => {});
        } else {
          await ctx.reply(maintenance.message).catch(() => {});
        }
        return;
      }
    }
    await next();
  };
}

module.exports = { maintenanceMiddleware };
