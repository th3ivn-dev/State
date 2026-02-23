const { safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { notifyAdminsAboutError } = require('../../utils/adminNotifier');
const { getWizardState, isInWizard, setWizardState, clearWizardState, restoreWizardStates } = require('./helpers');
const { handleStart, startWizard } = require('./command');
const { handleRegionCallback } = require('./region');
const { handleNotifyCallback } = require('./notify');

// Обробник callback query для wizard
async function handleWizardCallback(bot, query) {
  const chatId = query.message.chat.id;
  const telegramId = String(query.from.id);
  const data = query.data;
  
  await bot.api.answerCallbackQuery(query.id).catch(() => {});
  
  try {
    const state = getWizardState(telegramId) || { step: 'region' };
    
    // Route to region/queue/confirm/back handlers
    if (await handleRegionCallback(bot, query, chatId, telegramId, data, state)) {
      return;
    }
    
    // Route to notify/channel handlers
    if (await handleNotifyCallback(bot, query, chatId, telegramId, data, state)) {
      return;
    }
    
  } catch (error) {
    // Sanitize state for logging - only log non-sensitive fields
    const state = getWizardState(telegramId);
    const sanitizedState = state ? {
      step: state.step,
      region: state.region,
      queue: state.queue,
      mode: state.mode,
    } : null;
    console.error('Помилка в handleWizardCallback:', error, 'data:', data, 'state:', sanitizedState);
    notifyAdminsAboutError(bot, error, 'handleWizardCallback');
    await safeAnswerCallbackQuery(bot, query.id, { text: '😅 Щось пішло не так. Спробуйте ще раз!' });
  }
}

module.exports = {
  handleStart,
  handleWizardCallback,
  startWizard,
  isInWizard,
  getWizardState,
  setWizardState,
  clearWizardState,
  restoreWizardStates,
};
