const usersDb = require('../database/users');
const { safeDeleteMessage } = require('../utils/errorHandler');

function autoDeleteCommandsMiddleware(bot) {
  return async (ctx, next) => {
    await next();
    // After processing: if it's a command message and user has auto_delete_commands enabled, delete it
    if (ctx.message?.text?.startsWith('/') && ctx.from) {
      try {
        const telegramId = String(ctx.from.id);
        const user = await usersDb.getUserByTelegramId(telegramId);
        if (user?.auto_delete_commands) {
          await safeDeleteMessage(bot, ctx.message.chat.id, ctx.message.message_id);
        }
      } catch (_e) {
        // Non-critical, ignore errors
      }
    }
  };
}

module.exports = { autoDeleteCommandsMiddleware };
