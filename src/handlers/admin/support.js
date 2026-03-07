const { getAdminSupportKeyboard } = require('../../keyboards/inline');
const { getSetting, setSetting } = require('../../database/db');
const { safeSendMessage, safeEditMessageText, safeDeleteMessage } = require('../../utils/errorHandler');
const { isAdmin } = require('../../utils');
const config = require('../../config');
const { clearState, getState, setState } = require('../../state/stateManager');

// Helper function to display support settings screen
async function showSupportSettingsScreen(bot, chatId, messageId) {
  const mode = await getSetting('support_mode', 'channel');
  const url = await getSetting('support_channel_url', 'https://t.me/Voltyk_news?direct');

  const modeText = mode === 'channel' ? 'Через канал ✅' : 'Через бот (тікети) ✅';
  const urlDisplay = mode === 'channel' ? url.replace('https://', '') : 'не використовується';

  let message = '📞 <b>Режим підтримки</b>\n\n';
  message += 'Куди перенаправляти користувачів при зверненні в підтримку:\n\n';
  message += `Поточний режим: ${modeText}\n`;
  message += `Посилання: ${urlDisplay}`;

  await safeEditMessageText(bot, message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'HTML',
    ...getAdminSupportKeyboard(mode, url),
  });
}

// Callback handler for support settings callbacks
async function handleSupportCallback(bot, query, chatId, userId, data) {
  if (data === 'admin_support') {
    await showSupportSettingsScreen(bot, chatId, query.message.message_id);
    return;
  }

  if (data === 'admin_support_channel') {
    await setSetting('support_mode', 'channel');
    await showSupportSettingsScreen(bot, chatId, query.message.message_id);
    return;
  }

  if (data === 'admin_support_bot') {
    await setSetting('support_mode', 'bot');
    await showSupportSettingsScreen(bot, chatId, query.message.message_id);
    return;
  }

  if (data === 'admin_support_edit_url') {
    const currentUrl = await getSetting('support_channel_url', 'https://t.me/Voltyk_news?direct');

    await setState('conversation', userId, {
      state: 'waiting_for_support_url',
      messageId: query.message.message_id,
    });

    await safeEditMessageText(bot,
      `✏️ <b>Введіть нове посилання</b>\n\n` +
      `Посилання має починатися з https://t.me/\n\n` +
      `Поточне посилання: ${currentUrl}`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Скасувати', callback_data: 'admin_support' }]
          ]
        }
      }
    );
    return;
  }
}

/**
 * Handle admin support URL conversation
 */
async function handleAdminSupportUrlConversation(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);
  const text = msg.text;

  // Check if admin
  if (!isAdmin(telegramId, config.adminIds, config.ownerId)) {
    return false;
  }

  // Check conversation state
  const state = getState('conversation', telegramId);
  if (!state || state.state !== 'waiting_for_support_url') {
    return false;
  }

  try {
    // Validate URL
    if (!text || !text.startsWith('https://t.me/')) {
      await safeSendMessage(bot, chatId, '❌ Посилання має починатися з https://t.me/\n\nСпробуйте ще раз:');
      return true;
    }

    // Save support URL
    await setSetting('support_channel_url', text);
    await clearState('conversation', telegramId);

    // Show confirmation and return to support settings
    const mode = await getSetting('support_mode', 'channel');
    const url = await getSetting('support_channel_url', 'https://t.me/Voltyk_news?direct');

    // Delete the original message with the edit state
    if (state.messageId) {
      await safeDeleteMessage(bot, chatId, state.messageId);
    }

    // Show success message then support settings screen
    let message = '✅ <b>Посилання збережено!</b>\n\n';
    message += '📞 <b>Режим підтримки</b>\n\n';
    message += 'Куди перенаправляти користувачів при зверненні в підтримку:\n\n';

    const modeText = mode === 'channel' ? 'Через канал ✅' : 'Через бот (тікети) ✅';
    const urlDisplay = mode === 'channel' ? url.replace('https://', '') : 'не використовується';
    message += `Поточний режим: ${modeText}\n`;
    message += `Посилання: ${urlDisplay}`;

    // Send new message with support settings
    await safeSendMessage(bot, chatId, message, {
      parse_mode: 'HTML',
      ...getAdminSupportKeyboard(mode, url),
    });

    return true;
  } catch (error) {
    console.error('Помилка в handleAdminSupportUrlConversation:', error);
    // Don't clear state on error - let user retry
    await safeSendMessage(bot, chatId, '❌ Виникла помилка при збереженні посилання. Спробуйте ще раз:');
    return true;
  }
}

module.exports = {
  handleSupportCallback,
  handleAdminSupportUrlConversation,
};
