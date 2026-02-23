const usersDb = require('../../database/users');
const { getMainMenu } = require('../../keyboards/inline');
const { getState, setState, clearState } = require('../../state/stateManager');

// Helper functions to manage IP setup states (now using centralized state manager)
async function setIpSetupState(telegramId, data) {
  // Don't persist timeout handlers - they contain function references
  const { warningTimeout, finalTimeout, timeout, ...persistData } = data;
  await setState('ipSetup', telegramId, persistData);
}

function getIpSetupState(telegramId) {
  return getState('ipSetup', telegramId);
}

async function clearIpSetupState(telegramId) {
  const state = getState('ipSetup', telegramId);
  if (state) {
    // Очищаємо таймери перед видаленням
    if (state.warningTimeout) clearTimeout(state.warningTimeout);
    if (state.finalTimeout) clearTimeout(state.finalTimeout);
    if (state.timeout) clearTimeout(state.timeout);
  }
  await clearState('ipSetup', telegramId);
}

// Helper function to send main menu
async function sendMainMenu(bot, chatId, telegramId) {
  const user = await usersDb.getUserByTelegramId(telegramId);

  let botStatus = 'active';
  if (!user.channel_id) {
    botStatus = 'no_channel';
  } else if (!user.is_active) {
    botStatus = 'paused';
  }
  const channelPaused = user.channel_paused === true;

  await bot.api.sendMessage(
    chatId,
    '🏠 <b>Головне меню</b>',
    {
      parse_mode: 'HTML',
      ...getMainMenu(botStatus, channelPaused),
    }
  ).catch(() => {});
}

/**
 * Відновити IP setup стани з БД при запуску бота
 * NOTE: This is now handled by centralized state manager, kept for backward compatibility
 */
function restoreIpSetupStates() {
  // State restoration is now handled by initStateManager()
  console.log('✅ IP setup states restored by centralized state manager');
}

// Build the alerts message in tree format
function buildAlertsMessage(isActive, currentTarget) {
  const targetLabels = {
    'bot': '📱 Тільки в бот',
    'channel': '📺 Тільки в канал',
    'both': '📱📺 В бот і канал'
  };
  let message = `🔔 <b>Сповіщення</b>\n\n`;
  message += `Статус: <b>${isActive ? '✅ Увімкнено' : '❌ Вимкнено'}</b>\n`;
  if (isActive) {
    message += `Куди: <b>${targetLabels[currentTarget]}</b>\n`;
    message += '\n';
    message += `Ви отримуєте:\n`;
    message += `• Зміни графіка\n`;
    message += `• Фактичні відключення`;
  } else {
    message += '\n';
    message += `Увімкніть сповіщення щоб отримувати\nінформацію про зміни графіка та\nфактичні відключення.`;
  }
  return message;
}

// IP address and domain validation function
function isValidIPorDomain(input) {
  const trimmed = input.trim();

  if (trimmed.includes(' ')) {
    return { valid: false, error: 'Адреса не може містити пробіли' };
  }

  // Розділяємо на хост і порт
  let host = trimmed;
  let port = null;

  // Перевіряємо чи є порт (останній :число)
  const portMatch = trimmed.match(/^(.+):(\d+)$/);
  if (portMatch) {
    host = portMatch[1];
    port = parseInt(portMatch[2], 10);

    if (isNaN(port) || port < 1 || port > 65535) {
      return { valid: false, error: 'Порт має бути від 1 до 65535' };
    }
  }

  // Перевірка IPv4
  const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipMatch = host.match(ipRegex);

  if (ipMatch) {
    // Валідація октетів
    for (let i = 1; i <= 4; i++) {
      const num = parseInt(ipMatch[i], 10);
      if (isNaN(num) || num < 0 || num > 255) {
        return { valid: false, error: 'Кожне число в IP-адресі має бути від 0 до 255' };
      }
    }
    return { valid: true, address: trimmed, host, port, type: 'ip' };
  }

  // Перевірка доменного імені (DDNS)
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

  if (domainRegex.test(host)) {
    return { valid: true, address: trimmed, host, port, type: 'domain' };
  }

  return { valid: false, error: 'Невірний формат. Введіть IP-адресу або доменне імʼя.\n\nПриклади:\n• 89.167.32.1\n• 89.167.32.1:80\n• myhome.ddns.net' };
}

module.exports = {
  setIpSetupState,
  getIpSetupState,
  clearIpSetupState,
  sendMainMenu,
  restoreIpSetupStates,
  buildAlertsMessage,
  isValidIPorDomain,
};
