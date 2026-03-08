const { safeAnswerCallbackQuery, safeEditMessageText, safeDeleteMessage } = require('../../utils/errorHandler');
const { notifyAdminsAboutError } = require('../../utils/adminNotifier');
const { getWizardState, isInWizard, setWizardState, clearWizardState, restoreWizardStates } = require('./helpers');
const { handleStart, startWizard } = require('./command');
const { handleRegionCallback } = require('./region');
const { handleNotifyCallback } = require('./notify');
const { getRegionKeyboard, getQueueKeyboard, getWizardNotifyTargetKeyboard, getConfirmKeyboard } = require('../../keyboards/inline');
const { REGIONS } = require('../../constants/regions');
const { getBotUsername, getChannelConnectionInstructions } = require('../../utils');
const { clearIpSetupState } = require('../settings');
const { clearConversationState } = require('../channel');
const { clearRegionRequestState } = require('../regionRequest');
const { clearFeedbackState } = require('../feedback');

// Обробник callback query для wizard
async function handleWizardCallback(bot, query) {
  const chatId = query.message.chat.id;
  const telegramId = String(query.from.id);
  const data = query.data;

  await bot.api.answerCallbackQuery(query.id).catch(() => {});

  try {
    const state = getWizardState(telegramId) || { step: 'region' };

    // Відновити wizard з поточного кроку
    if (data === 'wizard_resume') {
      const messageId = query.message.message_id;
      const step = state.step;

      if (step === 'queue' && state.region) {
        await safeEditMessageText(bot,
          `✅ Регіон: ${REGIONS[state.region]?.name || state.region}\n\n` +
          `⚡ Крок 2 із 3 — Оберіть свою чергу:`,
          {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: getQueueKeyboard(state.region, 1).reply_markup,
          }
        );
        return;
      }

      if (step === 'notify_target' && state.queue) {
        await safeEditMessageText(bot,
          `✅ Черга: ${state.queue}\n\n` +
          `📬 Крок 3 із 3 — Куди надсилати сповіщення?\n\n` +
          `📱 <b>У цьому боті</b>\n` +
          `Сповіщення приходитимуть прямо в цей чат\n\n` +
          `📺 <b>У Telegram-каналі</b>\n` +
          `Бот публікуватиме у ваш канал\n` +
          `(потрібно додати бота як адміністратора)`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getWizardNotifyTargetKeyboard().reply_markup,
          }
        );
        return;
      }

      if (step === 'confirm' && state.region && state.queue) {
        const region = REGIONS[state.region]?.name || state.region;
        await safeEditMessageText(bot,
          `✅ Налаштування:\n\n` +
          `📍 Регіон: ${region}\n` +
          `⚡️ Черга: ${state.queue}\n\n` +
          `Підтвердіть налаштування:`,
          {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: getConfirmKeyboard().reply_markup,
          }
        );
        return;
      }

      if (step === 'channel_setup') {
        const botUsername = await getBotUsername(bot);
        await safeEditMessageText(bot,
          getChannelConnectionInstructions(botUsername),
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Перевірити', callback_data: 'wizard_notify_channel' }],
                [{ text: '← Назад', callback_data: 'wizard_notify_back' }]
              ]
            }
          }
        );
        return;
      }

      // Fallback for 'region' step or corrupted state — show region selection
      await setWizardState(telegramId, { ...state, step: 'region' });
      await safeEditMessageText(bot,
        '📍 Крок 1 із 3 — Оберіть свій регіон:',
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: getRegionKeyboard().reply_markup,
        }
      );
      return;
    }

    // Перезапустити wizard з початку
    if (data === 'wizard_restart') {
      const username = query.from.username || query.from.first_name;
      const messageId = query.message.message_id;

      await clearWizardState(telegramId);
      await clearIpSetupState(telegramId);
      await clearConversationState(telegramId);
      await clearRegionRequestState(telegramId);
      await clearFeedbackState(telegramId);

      await safeDeleteMessage(bot, chatId, messageId);
      await startWizard(bot, chatId, telegramId, username, 'new');
      return;
    }

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
