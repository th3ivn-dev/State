const { Bot } = require(‘grammy’);
const { hydrate } = require(’@grammyjs/hydrate’);
const { autoRetry } = require(’@grammyjs/auto-retry’);
const config = require(’./config’);
const { pendingChannels, setPendingChannel, removePendingChannel, restorePendingChannels } = require(’./state/pendingChannels’);
const { createLogger } = require(’./utils/logger’);

const logger = createLogger(‘Bot’);

// Import handlers
const { handleStart, handleWizardCallback, isInWizard, getWizardState, setWizardState } = require(’./handlers/start’);
const { handleSchedule, handleNext, handleTimer } = require(’./handlers/schedule’);
const { handleSettings, handleSettingsCallback, handleIpConversation } = require(’./handlers/settings’);
const {
handleAdmin,
handleAdminCallback,
handleStats,
handleSystem,
handleBroadcast,
handleSetInterval,
handleSetDebounce,
handleGetDebounce,
handleMonitoring,
handleSetAlertChannel,
handleAdminReply,
handleAdminRouterIpConversation,
handleAdminSupportUrlConversation,
handleMaintenanceConversation
} = require(’./handlers/admin’);
const { isMaintenanceMode } = require(’./handlers/admin/maintenance’);
const {
handleChannel,
handleConversation,
handleChannelCallback,
handleCancelChannel
} = require(’./handlers/channel’);
const { handleFeedbackCallback, handleFeedbackMessage, getSupportButton } = require(’./handlers/feedback’);
const { handleRegionRequestCallback, handleRegionRequestMessage } = require(’./handlers/regionRequest’);
const {
handleMenuSchedule,
handleMenuTimer,
handleMenuStats,
handleMenuHelp,
handleMenuSettings,
handleBackToMain,
handleHelpHowto,
handleHelpFaq,
handleTimerCallback,
handleStatsCallback,
handleScheduleRefresh,
handleMyQueues,
} = require(’./handlers/menu’);
const { escapeHtml, isAdmin } = require(’./utils’);
const { safeAnswerCallbackQuery, safeDeleteMessage, safeSendMessage, isTelegramUserInactiveError } = require(’./utils/errorHandler’);
const { MAX_INSTRUCTION_MESSAGES_MAP_SIZE, MAX_PENDING_CHANNELS_MAP_SIZE, PENDING_CHANNEL_CLEANUP_INTERVAL_MS } = require(’./constants/timeouts’);
const { notifyAdminsAboutError } = require(’./utils/adminNotifier’);
const usersDb = require(’./database/users’);
const { checkPauseForChannelActions } = require(’./utils/guards’);

// Store channel instruction message IDs (для видалення старих інструкцій)
const channelInstructionMessages = new Map();

// ─── Callback Router ──────────────────────────────────────────────────────────

// Exact-match callbacks → handler functions
const exactCallbackHandlers = new Map([
[‘menu_schedule’,           (bot, q) => handleMenuSchedule(bot, q)],
[‘schedule_refresh’,        (bot, q) => handleScheduleRefresh(bot, q)],
[‘my_queues’,               (bot, q) => handleMyQueues(bot, q)],
[‘menu_timer’,              (bot, q) => handleMenuTimer(bot, q)],
[‘menu_stats’,              (bot, q) => handleMenuStats(bot, q)],
[‘menu_help’,               (bot, q) => handleMenuHelp(bot, q)],
[‘menu_settings’,           (bot, q) => handleMenuSettings(bot, q)],
[‘back_to_main’,            (bot, q) => handleBackToMain(bot, q)],
[‘help_howto’,              (bot, q) => handleHelpHowto(bot, q)],
[‘help_faq’,                (bot, q) => handleHelpFaq(bot, q)],
[‘confirm_setup’,           (bot, q) => handleWizardCallback(bot, q)],
[‘back_to_region’,          (bot, q) => handleWizardCallback(bot, q)],
[‘restore_profile’,         (bot, q) => handleWizardCallback(bot, q)],
[‘create_new_profile’,      (bot, q) => handleWizardCallback(bot, q)],
[‘wizard_notify_bot’,       (bot, q) => handleWizardCallback(bot, q)],
[‘wizard_notify_channel’,   (bot, q) => handleWizardCallback(bot, q)],
[‘wizard_notify_back’,      (bot, q) => handleWizardCallback(bot, q)],
[‘channel_reconnect’,       (bot, q) => handleSettingsCallback(bot, q)],
[‘confirm_deactivate’,      (bot, q) => handleSettingsCallback(bot, q)],
[‘confirm_delete_data’,     (bot, q) => handleSettingsCallback(bot, q)],
[‘delete_data_step2’,       (bot, q) => handleSettingsCallback(bot, q)],
[‘back_to_settings’,        (bot, q) => handleSettingsCallback(bot, q)],
[‘cancel_channel_connect’,  (bot, q) => handleChannelCallback(bot, q)],
[‘keep_current_channel’,    (bot, q) => handleChannelCallback(bot, q)],
]);

// Prefix-match callbacks → handler functions (порядок важливий — специфічніші спочатку)
const prefixCallbackHandlers = [
[‘region_request_’,         (bot, q) => handleRegionRequestCallback(bot, q)],
[‘region_’,                 (bot, q) => handleWizardCallback(bot, q)],
[‘queue_’,                  (bot, q) => handleWizardCallback(bot, q)],
[‘wizard_channel_confirm_’, (bot, q) => handleWizardCallback(bot, q)],
[‘timer_’,                  (bot, q, data) => handleTimerCallback(bot, q, data)],
[‘stats_’,                  (bot, q, data) => handleStatsCallback(bot, q, data)],
[‘settings_’,               (bot, q) => handleSettingsCallback(bot, q)],
[‘alert_’,                  (bot, q) => handleSettingsCallback(bot, q)],
[‘ip_’,                     (bot, q) => handleSettingsCallback(bot, q)],
[‘notify_target_’,          (bot, q) => handleSettingsCallback(bot, q)],
[‘notif_’,                  (bot, q) => handleSettingsCallback(bot, q)],
[‘cleanup_’,                (bot, q) => handleSettingsCallback(bot, q)],
[‘schedule_alert_’,         (bot, q) => handleSettingsCallback(bot, q)],
[‘feedback_’,               (bot, q) => handleFeedbackCallback(bot, q)],
[‘admin_’,                  (bot, q) => handleAdminCallback(bot, q)],
[‘pause_’,                  (bot, q) => handleAdminCallback(bot, q)],
[‘debounce_’,               (bot, q) => handleAdminCallback(bot, q)],
[‘growth_’,                 (bot, q) => handleAdminCallback(bot, q)],
[‘maintenance_’,            (bot, q) => handleAdminCallback(bot, q)],
[‘channel_’,                (bot, q) => handleChannelCallback(bot, q)],
[‘brand_’,                  (bot, q) => handleChannelCallback(bot, q)],
[‘test_’,                   (bot, q) => handleChannelCallback(bot, q)],
[‘format_’,                 (bot, q) => handleChannelCallback(bot, q)],
[‘connect_channel_’,        (bot, q) => handleChannelCallback(bot, q)],
[‘replace_channel_’,        (bot, q) => handleChannelCallback(bot, q)],
];

/**

- Знайти обробник для callback data
  */
  function resolveCallbackHandler(data) {
  if (exactCallbackHandlers.has(data)) return exactCallbackHandlers.get(data);
  const entry = prefixCallbackHandlers.find(([prefix]) => data.startsWith(prefix));
  return entry ? entry[1] : null;
  }

// ─── my_chat_member helpers ───────────────────────────────────────────────────

/**

- Запит на підключення нового каналу
  */
  async function promptConnectChannel(bot, userId, channelId, channelTitle) {
  await safeSendMessage(
  bot, userId,
  `✅ Канал знайдено: "<b>${escapeHtml(channelTitle)}</b>"\n\nВикористовувати його для сповіщень?`,
  {
  parse_mode: ‘HTML’,
  reply_markup: {
  inline_keyboard: [
  [{ text: ‘✅ Так, підключити’, callback_data: `connect_channel_${channelId}` }],
  [{ text: ‘❌ Ні’, callback_data: ‘cancel_channel_connect’ }]
  ]
  }
  }
  );
  }

/**

- Запит на заміну існуючого каналу
  */
  async function promptReplaceChannel(bot, userId, channelId, newChannelTitle, currentChannelTitle) {
  const currentTitle = currentChannelTitle || ‘Поточний канал’;
  await safeSendMessage(
  bot, userId,
  `✅ Ви додали мене в канал "<b>${escapeHtml(newChannelTitle)}</b>"!\n\n` +
  `⚠️ У вас вже підключений канал "<b>${escapeHtml(currentTitle)}</b>".\n` +
  `Замінити на новий?`,
  {
  parse_mode: ‘HTML’,
  reply_markup: {
  inline_keyboard: [
  [{ text: ‘✅ Так, замінити’, callback_data: `replace_channel_${channelId}` }],
  [{ text: ‘❌ Залишити поточний’, callback_data: ‘keep_current_channel’ }]
  ]
  }
  }
  );
  }

/**

- Обробка wizard channel_setup при додаванні бота до каналу
  */
  async function handleWizardChannelSetup(bot, userId, channelId, channelTitle, wizardState) {
  if (wizardState.lastMessageId) {
  await safeDeleteMessage(bot, userId, wizardState.lastMessageId);
  }

await setPendingChannel(channelId, {
channelId,
channelUsername: null,
channelTitle,
telegramId: userId,
timestamp: Date.now()
});

const confirmMessage = await safeSendMessage(
bot, userId,
`✅ Канал знайдено: "<b>${escapeHtml(channelTitle)}</b>"\n\nВикористовувати його для сповіщень?`,
{
parse_mode: ‘HTML’,
reply_markup: {
inline_keyboard: [
[{ text: ‘✅ Так, підключити’, callback_data: `wizard_channel_confirm_${channelId}` }],
[{ text: ‘❌ Ні’, callback_data: ‘wizard_channel_cancel’ }]
]
}
}
);

setWizardState(userId, {
…wizardState,
lastMessageId: confirmMessage?.message_id,
pendingChannelId: channelId
});
}

/**

- Обробка події: бота додали як адміністратора до каналу
  */
  async function handleBotAddedToChannel(bot, update) {
  const { chat, from } = update;
  const userId = String(from.id);
  const channelId = String(chat.id);
  const channelTitle = chat.title || ‘Без назви’;
  const channelUsername = chat.username ? `@${chat.username}` : channelTitle;

// Перевірка режиму паузи
const pauseCheck = await checkPauseForChannelActions();
if (pauseCheck.blocked) {
await safeSendMessage(bot, userId, pauseCheck.message, { parse_mode: ‘HTML’ });
return;
}

// Канал вже підключений до іншого користувача
const existingUser = await usersDb.getUserByChannelId(channelId);
if (existingUser && existingUser.telegram_id !== userId) {
logger.info(`Channel ${channelId} already connected to user ${existingUser.telegram_id}`);
await safeSendMessage(
bot, userId,
‘⚠️ <b>Канал вже підключений</b>\n\n’ +
`Канал "${escapeHtml(channelTitle)}" вже підключено до іншого користувача.\n\n` +
‘Кожен канал може бути підключений тільки до одного облікового запису.\n\n’ +
‘Якщо це ваш канал — зверніться до підтримки.’,
{ parse_mode: ‘HTML’ }
);
return;
}

// Користувач в wizard на етапі channel_setup
if (isInWizard(userId)) {
const wizardState = getWizardState(userId);
if (wizardState?.step === ‘channel_setup’) {
await handleWizardChannelSetup(bot, userId, channelId, channelTitle, wizardState);
logger.info(`Bot added to channel during wizard: ${channelUsername} (${channelId}) by user ${userId}`);
return;
}
}

// Видалити старе повідомлення з інструкцією якщо є
const lastInstructionMessageId = channelInstructionMessages.get(userId);
if (lastInstructionMessageId) {
await safeDeleteMessage(bot, userId, lastInstructionMessageId);
channelInstructionMessages.delete(userId);
logger.info(`Deleted instruction message ${lastInstructionMessageId} for user ${userId}`);
}

// Зберегти pending channel
await setPendingChannel(channelId, {
channelId,
channelUsername,
channelTitle: chat.title,
telegramId: userId,
timestamp: Date.now()
});

// Запитати користувача про підключення або заміну каналу
const user = await usersDb.getUserByTelegramId(userId);
if (user?.channel_id) {
await promptReplaceChannel(bot, userId, channelId, channelTitle, user.channel_title);
} else {
await promptConnectChannel(bot, userId, channelId, channelTitle);
}

logger.info(`Bot added as admin to channel: ${channelUsername} (${channelId}) by user ${userId}`);
}

/**

- Обробка події: бота видалили з каналу
  */
  async function handleBotRemovedFromChannel(bot, update) {
  const { chat, from } = update;
  const userId = String(from.id);
  const channelId = String(chat.id);
  const channelTitle = chat.title || ‘Без назви’;

logger.info(`Bot removed from channel: ${channelTitle} (${channelId})`);

await removePendingChannel(channelId);

// Оновити wizard якщо користувач зараз в ньому
if (isInWizard(userId)) {
const wizardState = getWizardState(userId);
if (wizardState?.pendingChannelId === channelId && wizardState.lastMessageId) {
try {
await bot.api.editMessageText(
userId,
wizardState.lastMessageId,
`❌ <b>Бота видалено з каналу</b>\n\n` +
`Канал "${escapeHtml(channelTitle)}" більше недоступний.\n\n` +
`Щоб підключити канал, додайте бота як адміністратора.`,
{
parse_mode: ‘HTML’,
reply_markup: {
inline_keyboard: [
[{ text: ‘← Назад’, callback_data: ‘wizard_notify_back’ }]
]
}
}
);
} catch (e) {
logger.warn(‘Could not update wizard message after bot removal:’, { error: e.message });
}
setWizardState(userId, { …wizardState, pendingChannelId: null });
}
}

// Якщо це був підключений канал — сповістити і очистити
const user = await usersDb.getUserByTelegramId(userId);
if (user && String(user.channel_id) === channelId) {
await safeSendMessage(
bot, userId,
`⚠️ Мене видалили з каналу "<b>${escapeHtml(channelTitle)}</b>".\n\n` +
`Сповіщення в цей канал більше не надсилатимуться.`,
{ parse_mode: ‘HTML’ }
);
await usersDb.updateUser(userId, { channel_id: null, channel_title: null });
}
}

// ─── Автоочистка ──────────────────────────────────────────────────────────────

const botCleanupInterval = setInterval(() => {
const oneHourAgo = Date.now() - PENDING_CHANNEL_CLEANUP_INTERVAL_MS;

for (const [key, value] of pendingChannels.entries()) {
if (value?.timestamp && value.timestamp < oneHourAgo) pendingChannels.delete(key);
}

if (pendingChannels.size >= MAX_PENDING_CHANNELS_MAP_SIZE) {
const toDelete = pendingChannels.size - MAX_PENDING_CHANNELS_MAP_SIZE;
Array.from(pendingChannels.keys()).slice(0, toDelete).forEach(k => pendingChannels.delete(k));
logger.info(`🧹 Очищено ${toDelete} старих pending channels (перевищено ліміт ${MAX_PENDING_CHANNELS_MAP_SIZE})`);
}

if (channelInstructionMessages.size >= MAX_INSTRUCTION_MESSAGES_MAP_SIZE) {
const toDelete = channelInstructionMessages.size - MAX_INSTRUCTION_MESSAGES_MAP_SIZE;
Array.from(channelInstructionMessages.keys()).slice(0, toDelete).forEach(k => channelInstructionMessages.delete(k));
logger.info(`🧹 Очищено ${toDelete} старих instruction messages (перевищено ліміт ${MAX_INSTRUCTION_MESSAGES_MAP_SIZE})`);
}
}, PENDING_CHANNEL_CLEANUP_INTERVAL_MS);

// Graceful shutdown
process.on(‘SIGTERM’, () => clearInterval(botCleanupInterval));
process.on(‘SIGINT’,  () => clearInterval(botCleanupInterval));

// ─── Bot instance ─────────────────────────────────────────────────────────────

const bot = new Bot(config.botToken);

logger.info(‘🤖 Telegram Bot ініціалізовано (режим: Webhook)’);

bot.use(hydrate());

bot.api.config.use(autoRetry({
maxRetryAttempts: 3,
maxDelaySeconds: 10,
}));

// Compatibility shim для bot.options.id що використовується в хендлерах
bot.options = {};
Object.defineProperty(bot.options, ‘id’, {
get() { return bot.botInfo?.id; },
set(_val) { /* grammY manages this */ }
});

// ─── Middleware ───────────────────────────────────────────────────────────────

// Maintenance mode
bot.use(async (ctx, next) => {
const maintenance = await isMaintenanceMode();
if (maintenance.enabled) {
const userId = String(ctx.from?.id);
if (!isAdmin(userId, config.adminIds, config.ownerId)) {
if (ctx.callbackQuery) {
await ctx.answerCallbackQuery({ text: maintenance.message, show_alert: true }).catch(() => {});
} else {
await ctx.reply(maintenance.message, { parse_mode: ‘HTML’ }).catch(() => {});
}
return;
}
}
await next();
});

// Авто-видалення команд
bot.use(async (ctx, next) => {
await next();
if (ctx.message?.text?.startsWith(’/’) && ctx.from) {
try {
const user = await usersDb.getUserByTelegramId(String(ctx.from.id));
if (user?.auto_delete_commands) {
await safeDeleteMessage(bot, ctx.message.chat.id, ctx.message.message_id);
}
} catch (_e) { /* Non-critical */ }
}
});

// ─── Command handlers ─────────────────────────────────────────────────────────

bot.command(‘start’,           (ctx) => handleStart(bot, ctx.message));
bot.command(‘schedule’,        (ctx) => handleSchedule(bot, ctx.message));
bot.command(‘next’,            (ctx) => handleNext(bot, ctx.message));
bot.command(‘timer’,           (ctx) => handleTimer(bot, ctx.message));
bot.command(‘settings’,        (ctx) => handleSettings(bot, ctx.message));
bot.command(‘channel’,         (ctx) => handleChannel(bot, ctx.message));
bot.command(‘cancel’,          (ctx) => handleCancelChannel(bot, ctx.message));
bot.command(‘admin’,           (ctx) => handleAdmin(bot, ctx.message));
bot.command(‘stats’,           (ctx) => handleStats(bot, ctx.message));
bot.command(‘system’,          (ctx) => handleSystem(bot, ctx.message));
bot.command(‘monitoring’,      (ctx) => handleMonitoring(bot, ctx.message));
bot.command(‘getdebounce’,     (ctx) => handleGetDebounce(bot, ctx.message));
bot.command(‘setalertchannel’, (ctx) => handleSetAlertChannel(bot, ctx.message, [null, ctx.match]));
bot.command(‘broadcast’,       (ctx) => handleBroadcast(bot, ctx.message, [null, ctx.match]));
bot.command(‘setinterval’,     (ctx) => handleSetInterval(bot, ctx.message, [null, ctx.match]));
bot.command(‘setdebounce’,     (ctx) => handleSetDebounce(bot, ctx.message, [null, ctx.match]));

// ─── Message handler ──────────────────────────────────────────────────────────

bot.on(‘message’, async (ctx) => {
const msg = ctx.message;
const chatId = msg.chat.id;
const text = msg.text;

// Невідома команда
if (text?.startsWith(’/’)) {
const knownCommands = [
‘/start’, ‘/schedule’, ‘/next’, ‘/timer’, ‘/settings’,
‘/channel’, ‘/cancel’, ‘/admin’, ‘/stats’, ‘/system’,
‘/monitoring’, ‘/setalertchannel’,
‘/broadcast’, ‘/setinterval’, ‘/setdebounce’, ‘/getdebounce’
];
if (!knownCommands.includes(text.split(’ ’)[0].toLowerCase())) {
await bot.api.sendMessage(chatId, ‘❓ Команда не розпізнана.\n\nОберіть дію:’, {
parse_mode: ‘HTML’,
reply_markup: {
inline_keyboard: [
[{ text: ‘⤴ Меню’, callback_data: ‘back_to_main’ }],
[{ text: ‘📢 Новини’, url: ‘https://t.me/Voltyk_news’ }],
[{ text: ‘💬 Обговорення’, url: ‘https://t.me/voltyk_chat’ }]
]
}
});
}
return;
}

try {
if (await handleAdminReply(bot, msg)) return;
if (await handleMaintenanceConversation(bot, msg)) return;
if (await handleFeedbackMessage(bot, msg)) return;
if (await handleRegionRequestMessage(bot, msg)) return;
if (await handleIpConversation(bot, msg)) return;
if (await handleAdminRouterIpConversation(bot, msg)) return;
if (await handleAdminSupportUrlConversation(bot, msg)) return;
if (await handleConversation(bot, msg)) return;

```
if (text) {
  const supportButton = await getSupportButton();
  await bot.api.sendMessage(chatId, '❓ Команда не розпізнана.\n\nОберіть дію:', {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '⤴ Меню', callback_data: 'back_to_main' }],
        [supportButton]
      ]
    }
  });
}
```

} catch (error) {
logger.error(‘Помилка обробки повідомлення:’, { error: error.message });
notifyAdminsAboutError(bot, error, ‘message handler’);
}
});

// ─── Callback query handler ───────────────────────────────────────────────────

bot.on(‘callback_query:data’, async (ctx) => {
const query = ctx.callbackQuery;
const data = query.data;

try {
const handler = resolveCallbackHandler(data);
if (handler) {
await handler(bot, query, data);
} else {
await bot.api.answerCallbackQuery(query.id);
}
} catch (error) {
logger.error(‘Помилка обробки callback query:’, { error: error.message });
notifyAdminsAboutError(bot, error, `callback_query: ${data}`);
await safeAnswerCallbackQuery(bot, query.id, { text: ‘❌ Виникла помилка’, show_alert: false });
}
});

// ─── Error handler ────────────────────────────────────────────────────────────

bot.catch((err) => {
logger.error(‘Помилка бота:’, { error: err.message || String(err) });
notifyAdminsAboutError(bot, err.error || err, ‘bot error’);
});

// ─── my_chat_member ───────────────────────────────────────────────────────────

bot.on(‘my_chat_member’, async (ctx) => {
try {
const update = ctx.myChatMember;
if (update.chat.type !== ‘channel’) return;

```
const newStatus = update.new_chat_member.status;
const oldStatus = update.old_chat_member.status;

const isAdminAdded = newStatus === 'administrator' && oldStatus !== 'administrator';
const isRemoved    = (newStatus === 'left' || newStatus === 'kicked') &&
                     (oldStatus === 'administrator' || oldStatus === 'member');

if (isAdminAdded) await handleBotAddedToChannel(bot, update);
if (isRemoved)    await handleBotRemovedFromChannel(bot, update);
```

} catch (error) {
logger.error(‘Error in my_chat_member handler:’, { error: error.message });
}
});

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = bot;
module.exports.pendingChannels = pendingChannels;
module.exports.channelInstructionMessages = channelInstructionMessages;
module.exports.restorePendingChannels = restorePendingChannels;
module.exports.removePendingChannel = removePendingChannel;
module.exports.stopBotCleanup = function() {
clearInterval(botCleanupInterval);
};