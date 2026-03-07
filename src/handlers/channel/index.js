const usersDb = require('../../database/users');
const { safeAnswerCallbackQuery } = require('../../utils/errorHandler');

const {
  setConversationState,
  clearConversationState,
  restoreConversationStates,
  CALLBACKS_WITH_CUSTOM_ANSWER,
} = require('./helpers');

const { handleChannel, handleSetChannel, handleCancelChannel, handleForwardedMessage } = require('./commands');
const { handleConversation } = require('./conversation');
const { handleConnectCallbacks } = require('./connect');
const { handleBrandingCallbacks } = require('./branding');
const { handleSettingsCallbacks } = require('./settings');
const { handleFormatCallbacks } = require('./format');
const { handlePauseCallbacks } = require('./pause');
const { handleTestCallbacks } = require('./test');

// Handle callback for channel operations
async function handleChannelCallback(bot, query) {
  const chatId = query.message.chat.id;
  const telegramId = String(query.from.id);
  const data = query.data;

  // Skip early answer for callbacks that need custom popup messages
  if (!CALLBACKS_WITH_CUSTOM_ANSWER.includes(data)) {
    await bot.api.answerCallbackQuery(query.id).catch(() => {});
  }

  try {
    const user = await usersDb.getUserByTelegramId(telegramId);

    // Route to connect sub-handler
    if (
      data === 'channel_connect' ||
      data.startsWith('channel_confirm_') ||
      data.startsWith('connect_channel_') ||
      data.startsWith('replace_channel_') ||
      data === 'keep_current_channel' ||
      data === 'cancel_channel_connect'
    ) {
      if (await handleConnectCallbacks(bot, query, data, chatId, telegramId, user)) return;
    }

    // Route to branding sub-handler
    if (
      data === 'channel_edit_title' ||
      data === 'channel_edit_description' ||
      data === 'channel_add_desc' ||
      data === 'channel_skip_desc'
    ) {
      if (await handleBrandingCallbacks(bot, query, data, chatId, telegramId, user)) return;
    }

    // Route to settings sub-handler
    if (
      data === 'channel_info' ||
      data === 'channel_disable' ||
      data === 'channel_disable_confirm' ||
      data === 'channel_format' ||
      data === 'format_menu'
    ) {
      if (await handleSettingsCallbacks(bot, query, data, chatId, telegramId, user)) return;
    }

    // Route to pause sub-handler
    if (
      data === 'channel_pause' ||
      data === 'channel_pause_confirm' ||
      data === 'channel_resume' ||
      data === 'channel_resume_confirm'
    ) {
      if (await handlePauseCallbacks(bot, query, data, chatId, telegramId, user)) return;
    }

    // Route to test sub-handler
    if (
      data === 'channel_test' ||
      data === 'test_schedule' ||
      data === 'test_power_on' ||
      data === 'test_power_off' ||
      data === 'test_custom'
    ) {
      if (await handleTestCallbacks(bot, query, data, chatId, telegramId, user)) return;
    }

    // Route to format sub-handler
    if (data.startsWith('format_')) {
      if (await handleFormatCallbacks(bot, query, data, chatId, telegramId, user)) return;
    }

  } catch (error) {
    console.error('Помилка в handleChannelCallback:', error);
    await safeAnswerCallbackQuery(bot, query.id, { text: '😅 Щось пішло не так. Спробуйте ще раз!' });
  }
}

module.exports = {
  handleChannel,
  handleSetChannel,
  handleConversation,
  handleChannelCallback,
  handleCancelChannel,
  handleForwardedMessage,
  setConversationState, // Export for admin.js
  restoreConversationStates,
  clearConversationState, // Export for /start cleanup
};
