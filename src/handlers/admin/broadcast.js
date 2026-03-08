const { getState, setState, clearState } = require('../../state/stateManager');
const usersDb = require('../../database/users');
const ticketsDb = require('../../database/tickets');
const { isAdmin } = require('../../utils');
const config = require('../../config');
const {
  safeSendMessage,
  safeEditMessageText,
  safeDeleteMessage,
} = require('../../utils/errorHandler');
const {
  getAdminKeyboard,
  getBroadcastTextPromptKeyboard,
  getBroadcastAfterTextKeyboard,
  getBroadcastEmojiPromptKeyboard,
  getBroadcastButtonsMenuKeyboard,
  getBroadcastBotButtonsKeyboard,
  getBroadcastCommandButtonsKeyboard,
  getBroadcastPreviewKeyboard,
} = require('../../keyboards/inline');

// ─── HTML helpers ─────────────────────────────────────────────────────────────

/**
 * Sanitize common HTML issues in broadcast text:
 * - Trim whitespace inside closing tags (e.g. `</i >` → `</i>`)
 * - Close any unclosed tags in order
 */
function sanitizeBroadcastHtml(text) {
  if (!text) return text;
  // Trim whitespace inside closing tags
  let result = text.replace(/<\/\s*(\w+)\s*>/g, '</$1>');
  // Close unclosed tags (track opened tags and close them in reverse)
  const selfClosing = new Set(['br', 'hr', 'img', 'input']);
  const opened = [];
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  let m;
  while ((m = tagRe.exec(result)) !== null) {
    const full = m[0];
    const name = m[1].toLowerCase();
    if (selfClosing.has(name)) continue;
    if (full.startsWith('</')) {
      // closing tag — pop from stack
      const idx = opened.lastIndexOf(name);
      if (idx !== -1) opened.splice(idx, 1);
    } else if (!full.endsWith('/>')) {
      opened.push(name);
    }
  }
  // Append closing tags in reverse order
  for (let i = opened.length - 1; i >= 0; i--) {
    result += `</${opened[i]}>`;
  }
  return result;
}

/**
 * Validate HTML by test-sending to the admin and immediately deleting.
 * Returns null on success, or an error message string on failure.
 */
async function validateHtml(bot, chatId, text) {
  let testMsg = null;
  try {
    testMsg = await bot.api.sendMessage(chatId, text, { parse_mode: 'HTML' });
    return null; // valid
  } catch (err) {
    const desc = err.description || err.message || String(err);
    return desc;
  } finally {
    if (testMsg) {
      bot.api.deleteMessage(chatId, testMsg.message_id).catch(() => {});
    }
  }
}

// ─── Static data ──────────────────────────────────────────────────────────────

/** Rate-limit delay between individual message sends (Telegram allows ~30 msg/s per chat) */
const BROADCAST_THROTTLE_MS = 40;

/** Complete list of all callback-based bot buttons available for broadcast */
const BOT_BUTTONS = [
  // Main Menu
  { text: '📊 Графік', callback_data: 'menu_schedule', description: 'Показує графік відключень' },
  { text: '❓ Допомога', callback_data: 'menu_help', description: 'Показує меню допомоги' },
  { text: '📈 Статистика', callback_data: 'menu_stats', description: 'Показує меню статистики' },
  { text: '⏱ Таймер', callback_data: 'menu_timer', description: 'Показує таймер' },
  { text: '⚙️ Налаштування', callback_data: 'menu_settings', description: 'Показує налаштування' },
  { text: '⤴ Меню', callback_data: 'back_to_main', description: 'Повертає до головного меню' },
  // Schedule
  { text: '🔄 Оновити', callback_data: 'schedule_refresh', description: 'Оновлює графік' },
  { text: '🔀 Замінити', callback_data: 'my_queues', description: 'Змінити регіон/чергу' },
  // Help
  { text: '📖 Інструкція', callback_data: 'help_howto', description: 'Показує інструкцію' },
  { text: '❓ FAQ', callback_data: 'help_faq', description: 'Показує FAQ' },
  { text: '🏙 Запропонувати регіон', callback_data: 'region_request_start', description: 'Запропонувати новий регіон' },
  // Statistics
  { text: '⚡ Відключення за тиждень', callback_data: 'stats_week', description: 'Статистика відключень за тиждень' },
  { text: '📡 Статус пристрою', callback_data: 'stats_device', description: 'Статус пристрою' },
  { text: '⚙️ Мої налаштування', callback_data: 'stats_settings', description: 'Переглянути налаштування' },
  // Settings
  { text: '🌍 Регіон', callback_data: 'settings_region', description: 'Налаштування регіону' },
  { text: '🌐 IP', callback_data: 'settings_ip', description: 'Налаштування IP' },
  { text: '📺 Канал', callback_data: 'settings_channel', description: 'Налаштування каналу' },
  { text: '🔔 Сповіщення', callback_data: 'settings_alerts', description: 'Налаштування сповіщень' },
  { text: '🗑 Очищення', callback_data: 'settings_cleanup', description: 'Очищення даних' },
  { text: '🗑 Видалити мої дані', callback_data: 'settings_delete_data', description: 'Видалити дані користувача' },
  { text: '← До налаштувань', callback_data: 'back_to_settings', description: 'Повернутись до налаштувань' },
  // Channel
  { text: '✚ Підключити канал', callback_data: 'channel_connect', description: 'Підключити канал' },
  { text: 'ℹ️ Інфо', callback_data: 'channel_info', description: 'Інформація про канал' },
  { text: '🧪 Тест', callback_data: 'channel_test', description: 'Тестова публікація' },
  { text: '✏️ Формат', callback_data: 'channel_format', description: 'Налаштування формату' },
  { text: '⏸ Вимкнути', callback_data: 'channel_disable', description: 'Вимкнути канал' },
  { text: '⏸ Призупинити', callback_data: 'channel_pause', description: 'Тимчасово зупинити канал' },
  { text: '▶️ Відновити', callback_data: 'channel_resume', description: 'Відновити роботу каналу' },
  // Feedback
  { text: '⚒️ Підтримка', callback_data: 'feedback_start', description: 'Почати звернення до підтримки' },
  { text: '🐛 Баг', callback_data: 'feedback_type_bug', description: 'Повідомити про баг' },
  { text: '💡 Ідея', callback_data: 'feedback_type_idea', description: 'Запропонувати ідею' },
  { text: '💬 Інше', callback_data: 'feedback_type_other', description: 'Інше звернення' },
];

const BOT_BUTTONS_PER_PAGE = 5;

/** Command buttons that trigger bot commands when clicked */
const COMMAND_BUTTONS = [
  { text: '🏠 Головне меню', command: '/start', callback_data: 'broadcast_cmd_start', description: 'Перейти до головного меню' },
  { text: '📊 Графік', command: '/schedule', callback_data: 'broadcast_cmd_schedule', description: 'Показати графік' },
  { text: '❓ Допомога', command: '/help', callback_data: 'broadcast_cmd_help', description: 'Показати допомогу' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBroadcastState(userId) {
  return getState('broadcast', userId);
}

async function setBroadcastState(userId, data) {
  await setState('broadcast', userId, data, false);
}

async function clearBroadcastState(userId) {
  await clearState('broadcast', userId);
}

/** Build the inline_keyboard rows from the stored buttons array */
function buildMessageKeyboard(buttons) {
  if (!buttons || buttons.length === 0) return undefined;
  return {
    inline_keyboard: buttons.map((btn) => {
      if (btn.type === 'url') {
        return [{ text: btn.text, url: btn.url }];
      }
      // callback or command — both use callback_data
      return [{ text: btn.text, callback_data: btn.callback_data }];
    })
  };
}

/** Truncate text to maxLength, appending ellipsis if needed */
function truncateText(text, maxLength = 80) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '…' : text;
}

/** Show the buttons management screen (edit existing message) */
async function showButtonsMenu(bot, chatId, messageId, broadcastState) {
  const buttons = broadcastState.buttons || [];
  const textSnippet = broadcastState.text ? truncateText(broadcastState.text, 60) : '(порожній)';

  const header =
    `🔘 <b>Кнопки розсилки</b>\n\n` +
    `Текст: <i>${textSnippet}</i>\n` +
    `Кнопок: ${buttons.length}\n\n` +
    (buttons.length > 0
      ? 'Натисніть на кнопку щоб видалити її:'
      : 'Кнопок ще немає. Додайте за допомогою кнопок нижче:');

  await safeEditMessageText(bot, header, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'HTML',
    ...getBroadcastButtonsMenuKeyboard(buttons),
  });
}

// ─── Wizard entry point ───────────────────────────────────────────────────────

/**
 * Step 1: Admin clicks "📢 Розсилка" — start the broadcast wizard.
 * Edits the admin panel message to a text-input prompt.
 */
async function startBroadcastWizard(bot, query, chatId, userId) {
  const messageId = query.message.message_id;

  await setBroadcastState(userId, {
    state: 'waiting_for_broadcast_text',
    text: null,
    buttons: [],
    wizardMessageId: messageId,
  });

  await safeEditMessageText(bot,
    '📢 <b>Створити розсилку</b>\n\n' +
    'Введіть текст повідомлення, яке отримають всі активні користувачі.\n\n' +
    'Підтримується <b>HTML форматування</b>:\n' +
    '• <code>&lt;b&gt;жирний&lt;/b&gt;</code>\n' +
    '• <code>&lt;i&gt;курсив&lt;/i&gt;</code>\n' +
    '• <code>&lt;a href="..."&gt;посилання&lt;/a&gt;</code>\n' +
    '• <code>&lt;tg-emoji emoji-id="ID"&gt;🔥&lt;/tg-emoji&gt;</code>',
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      ...getBroadcastTextPromptKeyboard(),
    }
  );
}

// ─── Callback handler ─────────────────────────────────────────────────────────

/**
 * Handle all broadcast_ prefixed callbacks from the admin panel.
 */
async function handleBroadcastCallback(bot, query, chatId, userId, data) {
  const broadcastState = getBroadcastState(userId);

  // ── Cancel ────────────────────────────────────────────────────────────────
  if (data === 'broadcast_cancel') {
    await clearBroadcastState(userId);
    const openTicketsCount = await ticketsDb.getOpenTicketsCount();
    await safeEditMessageText(bot, '👨‍💼 <b>Адмін панель</b>\n\nОберіть опцію:', {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getAdminKeyboard(openTicketsCount).reply_markup,
    });
    return;
  }

  // ── Add emoji to text ─────────────────────────────────────────────────────
  if (data === 'broadcast_add_emoji') {
    if (!broadcastState) return;
    await setBroadcastState(userId, { ...broadcastState, state: 'waiting_for_emoji_id', wizardMessageId: query.message.message_id });

    await safeEditMessageText(bot,
      '😀 <b>Додати custom emoji</b>\n\n' +
      'Введіть ID emoji або весь тег у форматі:\n' +
      '<code>&lt;tg-emoji emoji-id="5210956306952758910"&gt;📊&lt;/tg-emoji&gt;</code>\n\n' +
      'Або просто emoji ID: <code>5210956306952758910</code>\n\n' +
      'Emoji буде додано в кінець тексту розсилки.',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        ...getBroadcastEmojiPromptKeyboard(),
      }
    );
    return;
  }

  // ── Edit text (go back to step 1) ─────────────────────────────────────────
  if (data === 'broadcast_edit_text') {
    if (!broadcastState) return;
    await setBroadcastState(userId, { ...broadcastState, state: 'waiting_for_broadcast_text', wizardMessageId: query.message.message_id });

    await safeEditMessageText(bot,
      '📢 <b>Редагувати текст розсилки</b>\n\n' +
      (broadcastState.text ? `Поточний текст:\n<i>${truncateText(broadcastState.text, 200)}</i>\n\n` : '') +
      'Введіть новий текст повідомлення:',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        ...getBroadcastTextPromptKeyboard(),
      }
    );
    return;
  }

  // ── Show buttons management menu ──────────────────────────────────────────
  if (data === 'broadcast_show_buttons') {
    if (!broadcastState || !broadcastState.text) return;
    await setBroadcastState(userId, { ...broadcastState, state: null, wizardMessageId: query.message.message_id });
    await showButtonsMenu(bot, chatId, query.message.message_id, { ...broadcastState, wizardMessageId: query.message.message_id });
    return;
  }

  // ── Add bot action button — show paginated list ───────────────────────────
  if (data === 'broadcast_add_btn_callback') {
    if (!broadcastState) return;
    await showBotButtonsPage(bot, chatId, query.message.message_id, 1);
    return;
  }

  // ── Navigate bot buttons pages ────────────────────────────────────────────
  if (data.startsWith('broadcast_bot_page_')) {
    const page = parseInt(data.replace('broadcast_bot_page_', ''), 10);
    if (isNaN(page) || page < 1) return;
    await showBotButtonsPage(bot, chatId, query.message.message_id, page);
    return;
  }

  // ── Select a bot action button from list ──────────────────────────────────
  if (data.startsWith('broadcast_bot_btn_')) {
    if (!broadcastState) return;
    const idx = parseInt(data.replace('broadcast_bot_btn_', ''), 10);
    const btnDef = BOT_BUTTONS[idx];
    if (!btnDef) return;

    const newButton = { type: 'callback', text: btnDef.text, callback_data: btnDef.callback_data };
    const updatedState = {
      ...broadcastState,
      buttons: [...(broadcastState.buttons || []), newButton],
      wizardMessageId: query.message.message_id,
    };
    await setBroadcastState(userId, updatedState);
    await showButtonsMenu(bot, chatId, query.message.message_id, updatedState);
    return;
  }

  // ── Add URL button — ask for button text ─────────────────────────────────
  if (data === 'broadcast_add_btn_url') {
    if (!broadcastState) return;
    await setBroadcastState(userId, {
      ...broadcastState,
      state: 'waiting_for_button_text',
      pendingButton: { type: 'url' },
      wizardMessageId: query.message.message_id,
    });

    await safeEditMessageText(bot,
      '🔗 <b>URL кнопка</b>\n\nВведіть текст кнопки:',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Скасувати', callback_data: 'broadcast_show_buttons' }]
          ]
        }
      }
    );
    return;
  }

  // ── Add command button — show list of commands ────────────────────────────
  if (data === 'broadcast_add_btn_cmd') {
    if (!broadcastState) return;
    const items = COMMAND_BUTTONS.map((b) => ({ text: b.text, description: b.description }));

    await safeEditMessageText(bot,
      '⌨️ <b>Кнопка команди</b>\n\nОберіть команду:',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        ...getBroadcastCommandButtonsKeyboard(items),
      }
    );
    return;
  }

  // ── Select a command button from list ─────────────────────────────────────
  if (data.startsWith('broadcast_cmd_btn_')) {
    if (!broadcastState) return;
    const idx = parseInt(data.replace('broadcast_cmd_btn_', ''), 10);
    const cmdDef = COMMAND_BUTTONS[idx];
    if (!cmdDef) return;

    await setBroadcastState(userId, {
      ...broadcastState,
      state: 'waiting_for_cmd_button_text',
      pendingButton: {
        type: 'command',
        command: cmdDef.command,
        callback_data: cmdDef.callback_data,
        defaultText: cmdDef.text,
      },
      wizardMessageId: query.message.message_id,
    });

    await safeEditMessageText(bot,
      `⌨️ <b>Кнопка команди: ${cmdDef.text}</b>\n\nВведіть текст кнопки або надішліть <code>.</code> щоб використати стандартний текст (<i>${cmdDef.text}</i>):`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Скасувати', callback_data: 'broadcast_show_buttons' }]
          ]
        }
      }
    );
    return;
  }

  // ── Remove button by index ─────────────────────────────────────────────────
  if (data.startsWith('broadcast_remove_btn_')) {
    if (!broadcastState) return;
    const idx = parseInt(data.replace('broadcast_remove_btn_', ''), 10);
    const buttons = [...(broadcastState.buttons || [])];
    if (idx >= 0 && idx < buttons.length) {
      buttons.splice(idx, 1);
    }
    const updatedState = { ...broadcastState, buttons, wizardMessageId: query.message.message_id };
    await setBroadcastState(userId, updatedState);
    await showButtonsMenu(bot, chatId, query.message.message_id, updatedState);
    return;
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  if (data === 'broadcast_preview') {
    if (!broadcastState || !broadcastState.text) return;
    await showPreview(bot, chatId, query.message.message_id, userId, broadcastState);
    return;
  }

  // ── Confirm send ──────────────────────────────────────────────────────────
  if (data === 'broadcast_confirm_send') {
    if (!broadcastState || !broadcastState.text) return;
    await executeBroadcast(bot, chatId, query.message.message_id, userId, broadcastState);
    return;
  }

  // ── Auto-fix HTML in preview (text already saved) ─────────────────────────
  if (data === 'broadcast_fix_html') {
    if (!broadcastState || !broadcastState.text) return;
    const fixed = sanitizeBroadcastHtml(broadcastState.text);
    const updatedState = { ...broadcastState, text: fixed };
    await setBroadcastState(userId, updatedState);
    await showPreview(bot, chatId, query.message.message_id, userId, updatedState);
    return;
  }

  // ── Auto-fix HTML during text input ──────────────────────────────────────
  if (data === 'broadcast_fix_html_text') {
    if (!broadcastState || !broadcastState.pendingText) return;
    const fixed = sanitizeBroadcastHtml(broadcastState.pendingText);
    const updatedState = { ...broadcastState, text: fixed, pendingText: null, state: null };
    await setBroadcastState(userId, updatedState);

    if (broadcastState.wizardMessageId) {
      await safeDeleteMessage(bot, chatId, broadcastState.wizardMessageId);
    }

    const snippet = truncateText(fixed, 80);
    const newMsg = await safeSendMessage(bot, chatId,
      `✅ <b>Текст виправлено та збережено!</b>\n\n<i>${snippet}</i>\n\nБажаєте додати custom emoji до тексту?`,
      {
        parse_mode: 'HTML',
        ...getBroadcastAfterTextKeyboard(),
      }
    );
    if (newMsg) {
      await setBroadcastState(userId, { ...updatedState, wizardMessageId: newMsg.message_id });
    }
    return;
  }

  // ── Cancel text input (keep wizard open at text input step) ──────────────
  if (data === 'broadcast_cancel_text_input') {
    if (!broadcastState) return;
    const cleanState = { ...broadcastState, pendingText: null, state: 'waiting_for_broadcast_text' };
    await setBroadcastState(userId, cleanState);
    await safeSendMessage(bot, chatId,
      '✏️ Введіть новий текст повідомлення:',
      getBroadcastTextPromptKeyboard()
    );
    return;
  }
}

// ─── Helper: paginated bot buttons page ───────────────────────────────────────

async function showBotButtonsPage(bot, chatId, messageId, page) {
  const totalPages = Math.ceil(BOT_BUTTONS.length / BOT_BUTTONS_PER_PAGE);
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * BOT_BUTTONS_PER_PAGE;
  const items = BOT_BUTTONS.slice(start, start + BOT_BUTTONS_PER_PAGE);

  await safeEditMessageText(bot,
    `➕ <b>Оберіть кнопку бота</b>\nСторінка ${safePage}/${totalPages}:`,
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      ...getBroadcastBotButtonsKeyboard(items, safePage, totalPages),
    }
  );
}

// ─── Helper: show preview ─────────────────────────────────────────────────────

async function showPreview(bot, chatId, messageId, userId, broadcastState) {
  const buttons = broadcastState.buttons || [];
  const broadcastText = `📢 <b>Повідомлення від адміністрації:</b>\n\n${broadcastState.text}`;

  // Validate the full broadcast text (as it will be sent to users) before showing preview
  const htmlError = await validateHtml(bot, chatId, broadcastText);
  if (htmlError) {
    const sanitized = sanitizeBroadcastHtml(broadcastState.text);
    const canFix = sanitized !== broadcastState.text;

    const errMsg = await safeSendMessage(bot, chatId,
      `❌ <b>Помилка HTML у тексті розсилки:</b>\n<code>${htmlError}</code>\n\n` +
      (canFix
        ? '⚠️ HTML може мати проблеми. Бажаєте автоматично виправити?'
        : 'Будь ласка, виправте HTML вручну та спробуйте знову.'),
      {
        parse_mode: 'HTML',
        reply_markup: canFix
          ? {
            inline_keyboard: [
              [{ text: '🔧 Виправити автоматично', callback_data: 'broadcast_fix_html' }],
              [{ text: '✏️ Редагувати вручну', callback_data: 'broadcast_edit_text' }],
              [{ text: '❌ Скасувати', callback_data: 'broadcast_cancel' }],
            ]
          }
          : {
            inline_keyboard: [
              [{ text: '✏️ Редагувати текст', callback_data: 'broadcast_edit_text' }],
              [{ text: '❌ Скасувати', callback_data: 'broadcast_cancel' }],
            ]
          },
      }
    );
    if (errMsg) {
      await setBroadcastState(userId, { ...broadcastState, wizardMessageId: errMsg.message_id });
    }
    return;
  }

  const previewHeader =
    '📢 <b>Попередній перегляд розсилки</b>\n' +
    '─────────────────────────\n';
  const previewFooter =
    '\n─────────────────────────\n' +
    `<i>Кнопок: ${buttons.length}</i>`;

  await setBroadcastState(userId, { ...broadcastState, state: 'preview', wizardMessageId: messageId });

  // Show preview text with the actual buttons the users will receive + confirm keyboard
  const previewText = previewHeader + (broadcastState.text || '') + previewFooter;

  await safeEditMessageText(bot, previewText, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'HTML',
    ...getBroadcastPreviewKeyboard(),
  });
}

// ─── Helper: send broadcast ───────────────────────────────────────────────────

async function executeBroadcast(bot, chatId, messageId, userId, broadcastState) {
  await clearBroadcastState(userId);

  const stats = await usersDb.getUserStats();
  const total = stats.active || 0;

  // Send initial progress message
  let progressMsg;
  try {
    progressMsg = await bot.api.sendMessage(
      chatId,
      `📤 Розсилка розпочата через BullMQ...\nВсього користувачів: ~${total}\n\n📤 Відправлено: 0/${total} (помилок: 0)`
    );
  } catch {
    progressMsg = null;
  }

  // Remove the wizard message
  await safeDeleteMessage(bot, chatId, messageId);

  const buttons = broadcastState.buttons || [];
  const msgOptions = {
    parse_mode: 'HTML',
  };
  if (buttons.length > 0) {
    msgOptions.reply_markup = buildMessageKeyboard(buttons);
  }

  const broadcastText = `📢 <b>Повідомлення від адміністрації:</b>\n\n${broadcastState.text}`;

  let usedBullMQ = false;
  try {
    const { runBroadcast } = require('../../queue/broadcastQueue');
    await runBroadcast(bot, chatId, progressMsg ? progressMsg.message_id : null, broadcastText, msgOptions, total);
    usedBullMQ = true;
  } catch (err) {
    // Redis/BullMQ unavailable — fall back to direct sending
    console.error('BullMQ broadcast unavailable, falling back to direct send:', err.message);
  }

  if (!usedBullMQ) {
    // Graceful degradation: direct send
    let sent = 0;
    let failed = 0;
    let lastProgressUpdate = Date.now();

    for await (const page of usersDb.paginateActiveUsers(500)) {
      for (const user of page) {
        const success = await sendWithRetry(bot, user.telegram_id, broadcastText, msgOptions);
        if (success) {
          sent++;
        } else {
          failed++;
        }

        if (progressMsg && Date.now() - lastProgressUpdate > 5000) {
          lastProgressUpdate = Date.now();
          bot.api.editMessageText(chatId, progressMsg.message_id,
            `📤 Відправлено: ${sent}/${total} (помилок: ${failed})`
          ).catch(() => {});
        }

        await new Promise(resolve => setTimeout(resolve, BROADCAST_THROTTLE_MS));
      }
    }

    const summary =
      `✅ <b>Розсилка завершена!</b>\n\n` +
      `📤 Відправлено: ${sent}\n` +
      `❌ Помилок: ${failed}`;

    if (progressMsg) {
      await bot.api.editMessageText(chatId, progressMsg.message_id, summary, { parse_mode: 'HTML' }).catch(() => {});
    } else {
      await safeSendMessage(bot, chatId, summary, { parse_mode: 'HTML' });
    }
  }
}

/**
 * Send a message with exponential-backoff retry on non-fatal errors.
 * Returns true if sent successfully, false if it ultimately failed.
 */
async function sendWithRetry(bot, telegramId, text, options, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await bot.api.sendMessage(telegramId, text, options);
      return true;
    } catch (error) {
      const msg = error.message || '';
      // Terminal errors — no point retrying
      if (msg.includes('bot was blocked') || msg.includes('chat not found') || msg.includes('user is deactivated')) {
        return false;
      }
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      } else {
        console.error(`Broadcast: failed to send to ${telegramId} after ${maxRetries + 1} attempts:`, msg);
        return false;
      }
    }
  }
  return false;
}

// ─── Text input handler ───────────────────────────────────────────────────────

/**
 * Handle text messages from admin during the broadcast wizard.
 * Called from bot.js message handler. Returns true if handled.
 */
async function handleBroadcastConversation(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);
  const text = msg.text;

  if (!isAdmin(telegramId, config.adminIds, config.ownerId)) {
    return false;
  }

  const broadcastState = getBroadcastState(telegramId);
  if (!broadcastState) return false;

  const { state: wizardStep, wizardMessageId } = broadcastState;

  // ── Waiting for broadcast message text ───────────────────────────────────
  if (wizardStep === 'waiting_for_broadcast_text') {
    if (!text || text.trim() === '') {
      await safeSendMessage(bot, chatId, '❌ Текст повідомлення не може бути порожнім. Введіть текст:');
      return true;
    }

    // Validate HTML before saving
    const testText = `📢 <b>Повідомлення від адміністрації:</b>\n\n${text.trim()}`;
    const htmlError = await validateHtml(bot, chatId, testText);
    if (htmlError) {
      const sanitized = sanitizeBroadcastHtml(text.trim());
      const canFix = sanitized !== text.trim();
      await safeSendMessage(bot, chatId,
        `❌ <b>Помилка HTML:</b>\n<code>${htmlError}</code>\n\n` +
        (canFix
          ? '⚠️ HTML може мати проблеми. Бажаєте автоматично виправити?'
          : 'Будь ласка, виправте HTML та введіть текст знову.'),
        {
          parse_mode: 'HTML',
          reply_markup: canFix
            ? {
              inline_keyboard: [
                [{ text: '🔧 Виправити та зберегти', callback_data: 'broadcast_fix_html_text' }],
                [{ text: '✏️ Ввести інший текст', callback_data: 'broadcast_cancel_text_input' }],
                [{ text: '❌ Скасувати розсилку', callback_data: 'broadcast_cancel' }],
              ]
            }
            : {
              inline_keyboard: [
                [{ text: '✏️ Ввести інший текст', callback_data: 'broadcast_cancel_text_input' }],
                [{ text: '❌ Скасувати розсилку', callback_data: 'broadcast_cancel' }],
              ]
            },
        }
      );
      // Temporarily save the raw (invalid) text so fix callback can access it
      await setBroadcastState(telegramId, {
        ...broadcastState,
        pendingText: text.trim(),
      });
      return true;
    }

    const updatedState = { ...broadcastState, text: text.trim(), state: null };
    await setBroadcastState(telegramId, updatedState);

    // Delete wizard message if possible and send a fresh step-2 message
    if (wizardMessageId) {
      await safeDeleteMessage(bot, chatId, wizardMessageId);
    }

    const snippet = truncateText(text, 80);
    const newMsg = await safeSendMessage(bot, chatId,
      `✅ <b>Текст збережено!</b>\n\n<i>${snippet}</i>\n\nБажаєте додати custom emoji до тексту?`,
      {
        parse_mode: 'HTML',
        ...getBroadcastAfterTextKeyboard(),
      }
    );
    if (newMsg) {
      await setBroadcastState(telegramId, { ...updatedState, wizardMessageId: newMsg.message_id });
    }
    return true;
  }

  // ── Waiting for emoji ID ─────────────────────────────────────────────────
  if (wizardStep === 'waiting_for_emoji_id') {
    if (!text || text.trim() === '') {
      await safeSendMessage(bot, chatId, '❌ Введіть emoji ID або тег. Спробуйте ще раз:');
      return true;
    }

    // Accept full tg-emoji tag or just the numeric ID
    let emojiId;
    const tagMatch = text.match(/emoji-id="(\d+)"/);
    if (tagMatch) {
      emojiId = tagMatch[1];
    } else if (/^\d+$/.test(text.trim())) {
      emojiId = text.trim();
    } else {
      await safeSendMessage(bot, chatId,
        '❌ Невірний формат. Введіть ID (числа) або повний тег:\n' +
        '<code>&lt;tg-emoji emoji-id="5210956306952758910"&gt;📊&lt;/tg-emoji&gt;</code>',
        { parse_mode: 'HTML' }
      );
      return true;
    }

    const emojiTag = `<tg-emoji emoji-id="${emojiId}">🔥</tg-emoji>`;
    const updatedText = (broadcastState.text || '') + ' ' + emojiTag;
    const updatedState = { ...broadcastState, text: updatedText, state: null };
    await setBroadcastState(telegramId, updatedState);

    if (wizardMessageId) {
      await safeDeleteMessage(bot, chatId, wizardMessageId);
    }

    const newMsg = await safeSendMessage(bot, chatId,
      `✅ <b>Emoji додано!</b>\n\nОновлений текст:\n<i>${truncateText(updatedText, 100)}</i>\n\nДодати ще кнопки?`,
      {
        parse_mode: 'HTML',
        ...getBroadcastButtonsMenuKeyboard(updatedState.buttons || []),
      }
    );
    if (newMsg) {
      await setBroadcastState(telegramId, { ...updatedState, wizardMessageId: newMsg.message_id });
    }
    return true;
  }

  // ── Waiting for URL button text ───────────────────────────────────────────
  if (wizardStep === 'waiting_for_button_text') {
    if (!text || text.trim() === '') {
      await safeSendMessage(bot, chatId, '❌ Текст кнопки не може бути порожнім. Введіть текст:');
      return true;
    }

    const updatedState = {
      ...broadcastState,
      state: 'waiting_for_button_url',
      pendingButton: { ...broadcastState.pendingButton, text: text.trim() },
    };
    await setBroadcastState(telegramId, updatedState);

    if (wizardMessageId) {
      await safeDeleteMessage(bot, chatId, wizardMessageId);
    }

    const newMsg = await safeSendMessage(bot, chatId,
      `🔗 <b>URL кнопка</b>\n\nТекст кнопки: <b>${text.trim()}</b>\n\nТепер введіть URL (має починатися з https:// або http://):`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Скасувати', callback_data: 'broadcast_show_buttons' }]
          ]
        }
      }
    );
    if (newMsg) {
      await setBroadcastState(telegramId, { ...updatedState, wizardMessageId: newMsg.message_id });
    }
    return true;
  }

  // ── Waiting for URL button URL ────────────────────────────────────────────
  if (wizardStep === 'waiting_for_button_url') {
    if (!text || (!text.trim().startsWith('https://') && !text.trim().startsWith('http://'))) {
      await safeSendMessage(bot, chatId, '❌ URL має починатися з https:// або http://. Спробуйте ще раз:');
      return true;
    }

    const pending = broadcastState.pendingButton;
    const newButton = { type: 'url', text: pending.text, url: text.trim() };
    const updatedState = {
      ...broadcastState,
      state: null,
      pendingButton: null,
      buttons: [...(broadcastState.buttons || []), newButton],
    };
    await setBroadcastState(telegramId, updatedState);

    if (wizardMessageId) {
      await safeDeleteMessage(bot, chatId, wizardMessageId);
    }

    const newMsg = await safeSendMessage(bot, chatId,
      `✅ <b>URL кнопка додана!</b>`,
      {
        parse_mode: 'HTML',
        ...getBroadcastButtonsMenuKeyboard(updatedState.buttons),
      }
    );
    if (newMsg) {
      await setBroadcastState(telegramId, { ...updatedState, wizardMessageId: newMsg.message_id });
    }
    return true;
  }

  // ── Waiting for command button text ───────────────────────────────────────
  if (wizardStep === 'waiting_for_cmd_button_text') {
    const pending = broadcastState.pendingButton;

    // "." means use default text
    const buttonText = (text && text.trim() === '.') ? pending.defaultText : (text || '').trim();
    if (!buttonText) {
      await safeSendMessage(bot, chatId, '❌ Текст кнопки не може бути порожнім. Введіть текст або надішліть <code>.</code>:', { parse_mode: 'HTML' });
      return true;
    }

    const newButton = { type: 'command', text: buttonText, command: pending.command, callback_data: pending.callback_data };
    const updatedState = {
      ...broadcastState,
      state: null,
      pendingButton: null,
      buttons: [...(broadcastState.buttons || []), newButton],
    };
    await setBroadcastState(telegramId, updatedState);

    if (wizardMessageId) {
      await safeDeleteMessage(bot, chatId, wizardMessageId);
    }

    const newMsg = await safeSendMessage(bot, chatId,
      `✅ <b>Кнопка команди додана!</b>`,
      {
        parse_mode: 'HTML',
        ...getBroadcastButtonsMenuKeyboard(updatedState.buttons),
      }
    );
    if (newMsg) {
      await setBroadcastState(telegramId, { ...updatedState, wizardMessageId: newMsg.message_id });
    }
    return true;
  }

  return false;
}

// ─── broadcast_cmd_* handler ──────────────────────────────────────────────────

/**
 * Handle broadcast_cmd_* callback queries from regular users clicking broadcast buttons.
 * These simulate triggering a bot command.
 * @param {object} handlers - Map of command handlers: { schedule, help, start }
 */
async function handleBroadcastCmdCallback(bot, query, handlers) {
  const data = query.data;
  await bot.api.answerCallbackQuery(query.id).catch(() => {});

  if (data === 'broadcast_cmd_start' && handlers.start) {
    await handlers.start(bot, query);
  } else if (data === 'broadcast_cmd_schedule' && handlers.schedule) {
    await handlers.schedule(bot, query);
  } else if (data === 'broadcast_cmd_help' && handlers.help) {
    await handlers.help(bot, query);
  }
}

module.exports = {
  startBroadcastWizard,
  handleBroadcastCallback,
  handleBroadcastConversation,
  handleBroadcastCmdCallback,
};
