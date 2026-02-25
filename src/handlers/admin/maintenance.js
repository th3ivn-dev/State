const { getMaintenanceKeyboard } = require('../../keyboards/inline');
const { getSetting, setSetting } = require('../../database/db');
const { safeEditMessageText, safeSendMessage, safeDeleteMessage } = require('../../utils/errorHandler');
const { isAdmin, formatExactDuration } = require('../../utils');
const config = require('../../config');
const { clearState, getState, setState } = require('../../state/stateManager');
const usersDb = require('../../database/users');

// In-memory cache for maintenance mode
let maintenanceCache = { enabled: false, message: '', lastCheck: 0 };
const MAINTENANCE_CACHE_TTL = 30000; // 30 seconds

async function isMaintenanceMode() {
  const now = Date.now();
  if (now - maintenanceCache.lastCheck < MAINTENANCE_CACHE_TTL) {
    return maintenanceCache;
  }
  const enabled = await getSetting('maintenance_mode', '0') === '1';
  const message = await getSetting('maintenance_message', '⚙️ Ведуться технічні роботи.\nСпробуйте пізніше.');
  maintenanceCache = { enabled, message, lastCheck: now };
  return maintenanceCache;
}

function updateMaintenanceCache(enabled, message) {
  maintenanceCache = { enabled, message, lastCheck: Date.now() };
}

// Helper to build maintenance screen text
function buildMaintenanceText(enabled, message, startedAt) {
  let text = '🔧 <b>Технічні роботи</b>\n\n';
  text += `Статус: <b>${enabled ? '✅ УВІМКНЕНО' : '❌ Вимкнено'}</b>\n\n`;
  if (enabled) {
    text += '⚠️ Бот зараз недоступний для\nзвичайних користувачів!\n\n';
    if (startedAt) {
      const elapsedMinutes = (Date.now() - Number(startedAt)) / 60000;
      text += `⏱ Тривалість: ${formatExactDuration(elapsedMinutes)}\n`;
    }
  } else {
    text += 'Коли увімкнено — бот відповідає\n';
    text += 'ВСІМ користувачам:\n';
    text += `"${message}"\n\n`;
    text += 'Адміни продовжують працювати\nяк звичайно.\n';
  }
  return text;
}

// Show maintenance status screen
async function showMaintenanceScreen(bot, chatId, messageId) {
  const enabled = await getSetting('maintenance_mode', '0') === '1';
  const message = await getSetting('maintenance_message', '⚙️ Ведуться технічні роботи.\nСпробуйте пізніше.');
  const startedAt = enabled ? await getSetting('maintenance_started_at', null) : null;

  await safeEditMessageText(bot, buildMaintenanceText(enabled, message, startedAt), {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'HTML',
    reply_markup: getMaintenanceKeyboard(enabled).reply_markup,
  });
}

// Callback handler for maintenance callbacks
async function handleMaintenanceCallback(bot, query, chatId, userId, data) {
  if (data === 'admin_maintenance') {
    await showMaintenanceScreen(bot, chatId, query.message.message_id);
    return;
  }

  if (data === 'maintenance_toggle') {
    const currentEnabled = await getSetting('maintenance_mode', '0') === '1';
    const newEnabled = !currentEnabled;
    const message = await getSetting('maintenance_message', '⚙️ Ведуться технічні роботи.\nСпробуйте пізніше.');

    let startedAt = null;
    let durationText = null;

    if (newEnabled) {
      // Store start time before enabling
      startedAt = String(Date.now());
      await setSetting('maintenance_started_at', startedAt);
      await setSetting('maintenance_mode', '1');
    } else {
      // Calculate duration before clearing
      const savedStartedAt = await getSetting('maintenance_started_at', null);
      if (savedStartedAt) {
        const elapsedMinutes = (Date.now() - Number(savedStartedAt)) / 60000;
        durationText = formatExactDuration(elapsedMinutes);
      }
      await setSetting('maintenance_mode', '0');
      await setSetting('maintenance_started_at', '');
    }

    // Update cache immediately
    updateMaintenanceCache(newEnabled, message);

    // Update admin screen immediately
    await safeEditMessageText(bot, buildMaintenanceText(newEnabled, message, startedAt), {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getMaintenanceKeyboard(newEnabled).reply_markup,
    });

    // Broadcast to all users in background
    (async () => {
      try {
        const users = await usersDb.getAllActiveUsers();
        let broadcastText;
        if (newEnabled) {
          broadcastText =
            `⚙️ <b>Технічні роботи</b>\n\n` +
            `Зараз проводяться планові технічні роботи.\n` +
            `Бот тимчасово недоступний.\n\n` +
            `Ми повідомимо, коли все буде готово! 🔔`;
        } else {
          broadcastText =
            `✅ <b>Технічні роботи завершено!</b>\n\n` +
            `Бот знову працює в нормальному режимі.\n` +
            (durationText ? `Тривалість робіт: ${durationText}\n\n` : '\n') +
            `Дякуємо за терпіння! ⚡`;
        }

        let sent = 0;
        const broadcastOptions = { parse_mode: 'HTML' };
        if (!newEnabled) {
          broadcastOptions.reply_markup = {
            inline_keyboard: [
              [{ text: '⤴ Меню', callback_data: 'back_to_main' }]
            ]
          };
        }

        for (const user of users) {
          const result = await safeSendMessage(bot, user.telegram_id, broadcastText, broadcastOptions);
          if (result) sent++;
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        await safeSendMessage(bot, chatId,
          `📤 Сповіщення надіслано: ${sent} з ${users.length} користувачів`,
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        console.error('Помилка масової розсилки maintenance:', err);
      }
    })();

    return;
  }

  if (data === 'maintenance_edit_message') {
    const currentMessage = await getSetting('maintenance_message', '⚙️ Ведуться технічні роботи.\nСпробуйте пізніше.');

    await setState('conversation', userId, {
      state: 'waiting_for_maintenance_message',
      messageId: query.message.message_id,
    });

    await safeEditMessageText(bot,
      `✏️ <b>Змінити повідомлення тех. робіт</b>\n\n` +
      `Поточне повідомлення:\n"${currentMessage}"\n\n` +
      `Введіть нове повідомлення:`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Скасувати', callback_data: 'admin_maintenance' }]
          ]
        }
      }
    );
    return;
  }
}

// Handle maintenance message conversation
async function handleMaintenanceConversation(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);
  const text = msg.text;

  // Check if admin
  if (!isAdmin(telegramId, config.adminIds, config.ownerId)) {
    return false;
  }

  // Check conversation state
  const state = getState('conversation', telegramId);
  if (!state || state.state !== 'waiting_for_maintenance_message') {
    return false;
  }

  try {
    if (!text) {
      return false;
    }

    // Save maintenance message
    await setSetting('maintenance_message', text);
    await clearState('conversation', telegramId);

    // Update cache immediately
    const enabled = await getSetting('maintenance_mode', '0') === '1';
    updateMaintenanceCache(enabled, text);

    // Delete the original message with the edit prompt
    if (state.messageId) {
      await safeDeleteMessage(bot, chatId, state.messageId);
    }

    // Show confirmation and return to maintenance screen
    let message = '✅ <b>Повідомлення збережено!</b>\n\n';
    message += buildMaintenanceText(enabled, text);

    await safeSendMessage(bot, chatId, message, {
      parse_mode: 'HTML',
      reply_markup: getMaintenanceKeyboard(enabled).reply_markup,
    });

    return true;
  } catch (error) {
    console.error('Помилка в handleMaintenanceConversation:', error);
    await safeSendMessage(bot, chatId, '❌ Виникла помилка при збереженні. Спробуйте ще раз:');
    return true;
  }
}

module.exports = {
  handleMaintenanceCallback,
  handleMaintenanceConversation,
  isMaintenanceMode,
  updateMaintenanceCache,
};
