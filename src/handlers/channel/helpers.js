const path = require('path');
const usersDb = require('../../database/users');
const { getState, setState, clearState } = require('../../state/stateManager');

// Helper functions to manage conversation states (now using centralized state manager)
async function setConversationState(telegramId, data) {
  await setState('conversation', telegramId, data);
}

function getConversationState(telegramId) {
  return getState('conversation', telegramId);
}

async function clearConversationState(telegramId) {
  await clearState('conversation', telegramId);
}

function hasConversationState(telegramId) {
  return getState('conversation', telegramId) !== null;
}

/**
 * Відновити conversation стани з БД при запуску бота
 * NOTE: This is now handled by centralized state manager, kept for backward compatibility
 */
function restoreConversationStates() {
  // State restoration is now handled by initStateManager()
  console.log('✅ Conversation states restored by centralized state manager');
}

// Helper function to check if error is a Telegram "not modified" error
function isTelegramNotModifiedError(error) {
  const errorMessage = error.message || '';
  const errorDescription = error.response?.body?.description || '';
  return errorMessage.includes('is not modified') ||
         errorDescription.includes('is not modified');
}

// Helper function to generate channel welcome message
function getChannelWelcomeMessage(user) {
  const botLink = '<b><a href="https://t.me/VoltykBot">СвітлоБота</a></b>';

  let features = '• 📊 Графіки відключень';

  // Додаємо рядок про сповіщення світла тільки якщо IP налаштований
  if (user.router_ip) {
    features += '\n• ⚡ Сповіщення про стан світла';
  }

  const message =
    `👋 Цей канал підключено до ${botLink} — чат-бота для моніторингу світла.\n\n` +
    `Тут публікуватимуться:\n` +
    `${features}\n\n` +
    `Черга: ${user.queue}`;

  return message;
}

// Constants
const CHANNEL_NAME_PREFIX = 'СвітлоБот ⚡️ ';
const CHANNEL_DESCRIPTION_BASE = '⚡️ СвітлоБот — слідкує, щоб ви не слідкували.\n\n💬 Маєте ідеї або знайшли помилку?';
const PHOTO_PATH = path.join(__dirname, '../../../photo_for_channels.PNG.jpg');
const PENDING_CHANNEL_EXPIRATION_MS = 30 * 60 * 1000; // 30 minutes
const FORMAT_SETTINGS_MESSAGE = '📋 <b>Формат публікацій</b>\n\nНалаштуйте як бот публікуватиме повідомлення у ваш канал:';
const FORMAT_SCHEDULE_MESSAGE = '📊 <b>Графік відключень</b>\n\nНалаштуйте як виглядатиме пост з графіком у вашому каналі:';
const FORMAT_POWER_MESSAGE = '⚡ <b>Фактичний стан</b>\n\nНалаштуйте повідомлення які бот надсилає при зміні стану світла:';

// Default format values
const DEFAULT_SCHEDULE_CAPTION = 'Графік на {dd}, {dm} для черги {queue}';
const DEFAULT_PERIOD_FORMAT = '{s} - {f} ({h} год)';

// Helper function to get user format values with defaults
function getUserFormatDefaults(user) {
  return {
    caption: user.schedule_caption || DEFAULT_SCHEDULE_CAPTION,
    period: user.period_format || DEFAULT_PERIOD_FORMAT
  };
}

// Helper function to generate schedule text instruction keyboard
function getScheduleTextKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📝 Змінити підпис', callback_data: 'format_schedule_caption' }],
      [{ text: '⏰ Змінити формат часу', callback_data: 'format_schedule_periods' }],
      [{ text: '👁 Приклади', callback_data: 'format_schedule_examples' }],
      [{ text: '🔄 Скинути все до стандартних', callback_data: 'format_reset_all_schedule' }],
      [{ text: '← Назад', callback_data: 'format_schedule_settings' }],
    ]
  };
}

// Helper function to generate schedule text instruction screen message
function getScheduleTextInstructionMessage(currentCaption, currentPeriod) {
  return '📝 <b>Текст графіка</b>\n\n' +
    'Тут ви налаштовуєте підпис який буде під картинкою графіка у вашому каналі.\n\n' +
    '📌 <b>Підпис під графіком:</b>\n' +
    `<code>${currentCaption}</code>\n\n` +
    '📌 <b>Формат періодів відключень:</b>\n' +
    `<code>${currentPeriod}</code>\n\n` +
    '━━━━━━━━━━━━━━━\n\n' +
    '🔤 <b>Змінні для підпису:</b>\n' +
    '• {dd} — "сьогодні" або "завтра"\n' +
    '• {dm} — дата (14.02)\n' +
    '• {d} — повна дата (14.02.2026)\n' +
    '• {sdw} — Пн, Вт, Ср...\n' +
    '• {fdw} — Понеділок, Вівторок...\n' +
    '• {queue} — номер черги (3.1)\n' +
    '• {region} — назва регіону\n\n' +
    '🔤 <b>Змінні для формату часу:</b>\n' +
    '• {s} — початок (08:00)\n' +
    '• {f} — кінець (12:00)\n' +
    '• {h} — тривалість (4 год)\n\n' +
    '━━━━━━━━━━━━━━━\n\n' +
    'Що змінити?';
}

// Validation error types
const VALIDATION_ERROR_TYPES = {
  OCCUPIED: 'occupied',
  PERMISSIONS: 'permissions',
  API_ERROR: 'api_error'
};

// Helper function: Validate channel ownership and bot permissions
async function validateChannelConnection(bot, channelId, telegramId) {
  // Check if channel is already occupied by another user
  const existingUser = await usersDb.getUserByChannelId(channelId);
  if (existingUser && existingUser.telegram_id !== telegramId) {
    return {
      valid: false,
      error: VALIDATION_ERROR_TYPES.OCCUPIED,
      message: `⚠️ <b>Цей канал вже підключений.</b>\n\n` +
               `Якщо це ваш канал — зверніться до підтримки.`
    };
  }

  // Check bot permissions in the channel
  try {
    if (!bot.options.id) {
      const botInfo = await bot.api.getMe();
      bot.options.id = botInfo.id;
    }

    const botMember = await bot.api.getChatMember(channelId, bot.options.id);

    if (botMember.status !== 'administrator' || !botMember.can_post_messages || !botMember.can_change_info) {
      return {
        valid: false,
        error: VALIDATION_ERROR_TYPES.PERMISSIONS,
        message: '❌ <b>Недостатньо прав</b>\n\n' +
                 'Бот повинен мати права на:\n' +
                 '• Публікацію повідомлень\n' +
                 '• Редагування інформації каналу'
      };
    }
  } catch (error) {
    console.error('Error checking bot permissions:', error);
    return {
      valid: false,
      error: VALIDATION_ERROR_TYPES.API_ERROR,
      message: '😅 Щось пішло не так при перевірці прав'
    };
  }

  return { valid: true };
}

// Helper function: Remove pending channel by telegram ID
// Returns true if a channel was removed, false otherwise
function removePendingChannelByTelegramId(telegramId) {
  const { pendingChannels } = require('../../bot');
  for (const [channelId, pending] of pendingChannels.entries()) {
    if (pending.telegramId === telegramId) {
      pendingChannels.delete(channelId);
      return true;
    }
  }
  return false;
}

// Callbacks that need custom popup messages and should not get early answer
const CALLBACKS_WITH_CUSTOM_ANSWER = [
  'format_reset_caption',
  'format_reset_periods',
  'format_reset_power_off',
  'format_reset_power_on',
  'format_reset_all_schedule',
  'format_reset_all_power',
  'format_toggle_delete',
  'format_toggle_piconly',
  'channel_test',
  'test_schedule',
  'test_power_on',
  'test_power_off',
  'channel_info',
  'channel_disable_confirm',
  'channel_pause_confirm',
  'channel_resume_confirm',
];

module.exports = {
  setConversationState,
  getConversationState,
  clearConversationState,
  hasConversationState,
  restoreConversationStates,
  isTelegramNotModifiedError,
  getChannelWelcomeMessage,
  CHANNEL_NAME_PREFIX,
  CHANNEL_DESCRIPTION_BASE,
  PHOTO_PATH,
  PENDING_CHANNEL_EXPIRATION_MS,
  FORMAT_SETTINGS_MESSAGE,
  FORMAT_SCHEDULE_MESSAGE,
  FORMAT_POWER_MESSAGE,
  DEFAULT_SCHEDULE_CAPTION,
  DEFAULT_PERIOD_FORMAT,
  getUserFormatDefaults,
  getScheduleTextKeyboard,
  getScheduleTextInstructionMessage,
  VALIDATION_ERROR_TYPES,
  validateChannelConnection,
  removePendingChannelByTelegramId,
  CALLBACKS_WITH_CUSTOM_ANSWER,
};
