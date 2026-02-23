const usersDb = require('../../database/users');
const { REGIONS } = require('../../constants/regions');
const { getState, setState, clearState, hasState } = require('../../state/stateManager');
const { getSupportButton } = require('../feedback');
const config = require('../../config');

// Constants imported from channel.js for consistency
const PENDING_CHANNEL_EXPIRATION_MS = 30 * 60 * 1000; // 30 minutes
const CHANNEL_NAME_PREFIX = 'СвітлоБот ⚡️ ';

// News channel subscription message configuration
const NEWS_CHANNEL_MESSAGE = {
  text: '📢 <b>Підпишіться на канал оновлень</b>\nЩоб не пропустити нові функції та важливі зміни:',
  options: {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📢 Новини/Оновлення', url: 'https://t.me/Voltyk_news' }]
      ]
    }
  }
};

// Development phase warning text
const DEVELOPMENT_WARNING = 
  '⚠️ Бот знаходиться в активній фазі розробки.\n\n' +
  'Наразі підтримуються такі регіони:\n' +
  '• Київ\n' +
  '• Київщина\n' +
  '• Дніпропетровщина\n' +
  '• Одещина\n\n' +
  'Якщо вашого регіону немає — ви можете запропонувати його додати.';

// Helper function to check if user is in wizard
function isInWizard(telegramId) {
  const state = getState('wizard', telegramId);
  return !!(state && state.step);
}

// Helper functions to manage wizard state (now using centralized state manager)
async function setWizardState(telegramId, data) {
  await setState('wizard', telegramId, data);
}

function getWizardState(telegramId) {
  return getState('wizard', telegramId);
}

async function clearWizardState(telegramId) {
  await clearState('wizard', telegramId);
}

/**
 * Відновити wizard стани з БД при запуску бота
 * NOTE: This is now handled by centralized state manager, kept for backward compatibility
 */
function restoreWizardStates() {
  // State restoration is now handled by initStateManager()
  console.log('✅ Wizard states restored by centralized state manager');
}

// Helper function to create pause mode keyboard
async function createPauseKeyboard(showSupport) {
  const buttons = [];
  
  if (showSupport) {
    const supportButton = await getSupportButton();
    buttons.push([supportButton]);
  }
  
  buttons.push([{ text: '← Назад', callback_data: 'wizard_notify_back' }]);
  
  return { inline_keyboard: buttons };
}

// Helper function to notify admins about new user
async function notifyAdminsAboutNewUser(bot, telegramId, username, region, queue) {
  try {
    
    const stats = await usersDb.getUserStats();
    const regionName = REGIONS[region]?.name || region;
    
    const message = 
      `🆕 <b>Новий користувач!</b>\n\n` +
      `👤 ${username ? '@' + username : 'без username'} (ID: <code>${telegramId}</code>)\n` +
      `🏙 Регіон: ${regionName}\n` +
      `⚡ Черга: ${queue}\n` +
      `📅 ${new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })}\n\n` +
      `📊 Всього користувачів: ${stats.total}`;
    
    // Надсилаємо всім адмінам
    const allAdmins = [...config.adminIds];
    if (config.ownerId && !allAdmins.includes(config.ownerId)) {
      allAdmins.push(config.ownerId);
    }
    
    for (const adminId of allAdmins) {
      try {
        await bot.api.sendMessage(adminId, message, { parse_mode: 'HTML' });
      } catch (error) {
        // Ігноруємо помилки (адмін може мати заблоковані повідомлення)
      }
    }
  } catch (error) {
    console.error('Помилка сповіщення адмінів про нового користувача:', error);
  }
}

module.exports = {
  PENDING_CHANNEL_EXPIRATION_MS,
  CHANNEL_NAME_PREFIX,
  NEWS_CHANNEL_MESSAGE,
  DEVELOPMENT_WARNING,
  isInWizard,
  setWizardState,
  getWizardState,
  clearWizardState,
  restoreWizardStates,
  createPauseKeyboard,
  notifyAdminsAboutNewUser,
};
