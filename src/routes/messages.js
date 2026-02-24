const {
  handleAdminReply,
  handleAdminRouterIpConversation,
  handleAdminSupportUrlConversation,
} = require('../handlers/admin');
const { handleIpConversation } = require('../handlers/settings');
const { handleConversation } = require('../handlers/channel');
const { handleFeedbackMessage, getSupportButton } = require('../handlers/feedback');
const { handleRegionRequestMessage } = require('../handlers/regionRequest');
const { notifyAdminsAboutError } = require('../utils/adminNotifier');
const logger = require('../logger').child({ module: 'messages' });

/**
 * Register the message handler on the bot instance.
 * @param {import('grammy').Bot} bot
 */
function registerMessages(bot) {
  bot.on('message', async (ctx) => {
    const msg = ctx.message;
    const chatId = msg.chat.id;
    const text = msg.text;

    // Handle text commands first (if text is present and starts with /)
    if (text && text.startsWith('/')) {
      // List of known commands
      const knownCommands = [
        '/start', '/schedule', '/next', '/timer', '/settings',
        '/channel', '/cancel', '/admin', '/dashboard', '/stats', '/system',
        '/monitoring', '/setalertchannel',
        '/broadcast', '/setinterval', '/setdebounce', '/getdebounce'
      ];

      // Extract command without parameters
      const command = text.split(' ')[0].toLowerCase();

      // If it's not a known command, show error
      if (!knownCommands.includes(command)) {
        await bot.api.sendMessage(
          chatId,
          '❓ Команда не розпізнана.\n\nОберіть дію:',
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '⤴ Меню', callback_data: 'back_to_main' }],
                [{ text: '📢 Новини', url: 'https://t.me/Voltyk_news' }],
                [{ text: '💬 Обговорення', url: 'https://t.me/voltyk_chat' }]
              ]
            }
          }
        );
      }
      return;
    }

    try {
      // Main menu buttons are now handled via inline keyboard callbacks
      // Keeping only conversation handlers for IP setup, channel setup, feedback, and region requests

      // Handle admin ticket replies first (before other handlers)
      const adminReplyHandled = await handleAdminReply(bot, msg);
      if (adminReplyHandled) return;

      // Try feedback conversation first (handles text, photo, video)
      const feedbackHandled = await handleFeedbackMessage(bot, msg);
      if (feedbackHandled) return;

      // Try region request conversation (handles text only)
      const regionRequestHandled = await handleRegionRequestMessage(bot, msg);
      if (regionRequestHandled) return;

      // Try IP setup conversation (handles text only)
      const ipHandled = await handleIpConversation(bot, msg);
      if (ipHandled) return;

      // Try admin router IP setup conversation (handles text only)
      const adminRouterIpHandled = await handleAdminRouterIpConversation(bot, msg);
      if (adminRouterIpHandled) return;

      // Try admin support URL conversation (handles text only)
      const adminSupportUrlHandled = await handleAdminSupportUrlConversation(bot, msg);
      if (adminSupportUrlHandled) return;

      // Handle channel conversation (handles text only)
      const channelHandled = await handleConversation(bot, msg);
      if (channelHandled) return;

      // If message was not handled by any conversation - show fallback message (only for text)
      if (text) {
        const supportButton = await getSupportButton();
        await bot.api.sendMessage(
          chatId,
          '❓ Команда не розпізнана.\n\nОберіть дію:',
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '⤴ Меню', callback_data: 'back_to_main' }],
                [supportButton]
              ]
            }
          }
        );
      }

    } catch (error) {
      logger.error({ err: error }, 'Помилка обробки повідомлення');
      notifyAdminsAboutError(bot, error, 'message handler');
    }
  });
}

module.exports = { registerMessages };
