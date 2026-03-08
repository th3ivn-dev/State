const { REGIONS, REGION_CODES, getQueuesForRegion } = require('../constants/regions');

// ─── Main Menu ────────────────────────────────────────────────────────────────

/**
 * Main menu keyboard.
 * @param {string} botStatus - 'active' | 'no_channel' | 'paused'
 * @param {boolean} channelPaused - whether the user's channel is paused
 */
function getMainMenu(botStatus, channelPaused) {
  const buttons = [
    [
      { text: 'Графік', callback_data: 'menu_schedule' },
      { text: '⏱ Таймер', callback_data: 'menu_timer' },
    ],
    [
      { text: '📈 Статистика', callback_data: 'menu_stats' },
      { text: '❓ Допомога', callback_data: 'menu_help' },
    ],
    [
      { text: '⚙️ Налаштування', callback_data: 'menu_settings' },
    ],
  ];

  // Add channel control row when channel is connected
  if (botStatus === 'active' || botStatus === 'paused') {
    if (channelPaused) {
      buttons.push([{ text: '▶️ Відновити канал', callback_data: 'channel_resume' }]);
    } else if (botStatus === 'active') {
      buttons.push([{ text: '⏸ Пауза каналу', callback_data: 'channel_pause' }]);
    }
  }

  return { reply_markup: { inline_keyboard: buttons } };
}

// ─── Schedule View ────────────────────────────────────────────────────────────

/**
 * Schedule view keyboard (shown on schedule screen).
 * Requirement: replace my_queues with schedule_change_queue.
 */
function getScheduleViewKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🌍 Змінити чергу', callback_data: 'schedule_change_queue' },
          { text: '🔄 Оновити', callback_data: 'schedule_refresh' },
        ],
        [
          { text: '⤴ Меню', callback_data: 'back_to_main' },
        ],
      ],
    },
  };
}

// ─── Settings Keyboard ────────────────────────────────────────────────────────

/**
 * Settings screen keyboard.
 * Requirement: only ⤴ Меню navigation button (no ← Назад).
 * @param {boolean} isAdmin
 */
function getSettingsKeyboard(isAdmin) {
  const buttons = [
    [{ text: '🗺 Регіон / Черга', callback_data: 'settings_region' }],
    [{ text: '🔔 Сповіщення', callback_data: 'settings_alerts' }],
    [{ text: '📡 IP моніторинг', callback_data: 'settings_ip' }],
    [{ text: '📺 Канал', callback_data: 'settings_channel' }],
    [{ text: '🗑 Автоочищення', callback_data: 'settings_cleanup' }],
    [
      { text: '❌ Видалити дані', callback_data: 'settings_delete_data' },
      { text: '⏸ Деактивувати', callback_data: 'settings_deactivate' },
    ],
  ];

  if (isAdmin) {
    buttons.push([{ text: '👨‍💼 Адмін панель', callback_data: 'settings_admin' }]);
  }

  buttons.push([{ text: '⤴ Меню', callback_data: 'back_to_main' }]);

  return { reply_markup: { inline_keyboard: buttons } };
}

// ─── Help Keyboard ────────────────────────────────────────────────────────────

function getHelpKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '❓ Як налаштувати?', callback_data: 'help_howto' },
          { text: '📋 FAQ', callback_data: 'help_faq' },
        ],
        [{ text: '⤴ Меню', callback_data: 'back_to_main' }],
      ],
    },
  };
}

// ─── Error Keyboard ───────────────────────────────────────────────────────────

function getErrorKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Спробувати знову', callback_data: 'back_to_main' }],
      ],
    },
  };
}

// ─── Region Keyboard ──────────────────────────────────────────────────────────

function getRegionKeyboard() {
  const rows = REGION_CODES.map(code => [
    { text: REGIONS[code].name, callback_data: `region_${code}` },
  ]);

  return { reply_markup: { inline_keyboard: rows } };
}

// ─── Queue Keyboard ───────────────────────────────────────────────────────────

const QUEUES_PER_PAGE = 12;

function getQueueKeyboard(region, page) {
  const pageNum = page || 1;
  const queues = getQueuesForRegion(region);

  const totalPages = Math.ceil(queues.length / QUEUES_PER_PAGE);
  const start = (pageNum - 1) * QUEUES_PER_PAGE;
  const pageQueues = queues.slice(start, start + QUEUES_PER_PAGE);

  // Build queue buttons (2 per row)
  const rows = [];
  for (let i = 0; i < pageQueues.length; i += 2) {
    const row = [{ text: pageQueues[i], callback_data: `queue_${pageQueues[i]}` }];
    if (pageQueues[i + 1]) {
      row.push({ text: pageQueues[i + 1], callback_data: `queue_${pageQueues[i + 1]}` });
    }
    rows.push(row);
  }

  // Pagination row
  if (totalPages > 1) {
    const navRow = [];
    if (pageNum > 1) {
      navRow.push({ text: '← Попередня', callback_data: `queue_page_${pageNum - 1}` });
    }
    if (pageNum < totalPages) {
      navRow.push({ text: 'Наступна →', callback_data: `queue_page_${pageNum + 1}` });
    }
    if (navRow.length > 0) rows.push(navRow);
  }

  rows.push([{ text: '← Назад', callback_data: 'back_to_region' }]);

  return { reply_markup: { inline_keyboard: rows } };
}

// ─── Confirm Keyboard (wizard) ────────────────────────────────────────────────

function getConfirmKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Підтвердити', callback_data: 'confirm_setup' },
          { text: '← Назад', callback_data: 'back_to_region' },
        ],
      ],
    },
  };
}

// ─── Wizard Notify Target Keyboard ───────────────────────────────────────────

function getWizardNotifyTargetKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📱 У боті', callback_data: 'wizard_notify_bot' }],
        [{ text: '📺 У каналі', callback_data: 'wizard_notify_channel' }],
      ],
    },
  };
}

// ─── IP Monitoring Keyboard ───────────────────────────────────────────────────

function getIpMonitoringKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Налаштувати IP', callback_data: 'ip_setup' }],
        [{ text: '📖 Інструкція', callback_data: 'ip_instruction' }],
        [{ text: '👁 Показати IP', callback_data: 'ip_show' }],
        [{ text: '← Назад', callback_data: 'back_to_settings' }],
      ],
    },
  };
}

function getIpCancelKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Скасувати', callback_data: 'ip_cancel' }],
      ],
    },
  };
}

// ─── Channel Menu Keyboard ────────────────────────────────────────────────────

/**
 * @param {string|null} channelId
 * @param {boolean} isPublic
 * @param {string} channelStatus - 'active' | 'blocked'
 */
function getChannelMenuKeyboard(channelId, isPublic, channelStatus) {
  const buttons = [];

  if (channelId) {
    // Show reconnect button when blocked
    if (channelStatus === 'blocked') {
      buttons.push([{ text: '🔗 Перепідключити канал', callback_data: 'channel_reconnect' }]);
    }

    buttons.push([{ text: '🎨 Налаштування формату', callback_data: 'format_settings' }]);
    buttons.push([{ text: '🧪 Тест публікації', callback_data: 'channel_test' }]);

    if (!isPublic) {
      buttons.push([
        { text: '⏸ Пауза каналу', callback_data: 'channel_pause' },
        { text: '❌ Вимкнути', callback_data: 'channel_disable' },
      ]);
    } else {
      buttons.push([{ text: '❌ Вимкнути', callback_data: 'channel_disable' }]);
    }
  } else {
    buttons.push([{ text: '🔗 Підключити канал', callback_data: 'channel_connect' }]);
  }

  buttons.push([{ text: '← Назад', callback_data: 'back_to_settings' }]);

  return { reply_markup: { inline_keyboard: buttons } };
}

// ─── Delete Data Keyboards ────────────────────────────────────────────────────

function getDeleteDataConfirmKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🗑 Так, видалити', callback_data: 'delete_data_step2' },
          { text: '← Скасувати', callback_data: 'back_to_settings' },
        ],
      ],
    },
  };
}

function getDeleteDataFinalKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '❌ Так, видалити все', callback_data: 'confirm_delete_data' },
          { text: '← Ні, залишити', callback_data: 'back_to_settings' },
        ],
      ],
    },
  };
}

function getDeactivateConfirmKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Так, вимкнути', callback_data: 'confirm_deactivate' },
          { text: '← Скасувати', callback_data: 'back_to_settings' },
        ],
      ],
    },
  };
}

// ─── Format Keyboards ─────────────────────────────────────────────────────────

/**
 * Channel format overview keyboard with section headers.
 * @param {object} _user
 */
function getFormatSettingsKeyboard(_user) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '── ГРАФІК ВІДКЛЮЧЕНЬ ──', callback_data: 'noop' }],
        [{ text: '📅 Налаштування графіка', callback_data: 'format_schedule_settings' }],
        [{ text: '── ФАКТИЧНИЙ СТАН ──', callback_data: 'noop' }],
        [{ text: '⚡ Стан живлення', callback_data: 'format_power_settings' }],
        [{ text: '← Назад', callback_data: 'settings_channel' }],
      ],
    },
  };
}

/**
 * Schedule format settings keyboard.
 * Per test: merged button format_schedule_text, format_toggle_delete, format_toggle_piconly.
 * @param {object} user
 */
function getFormatScheduleKeyboard(user) {
  const deleteIcon = user && user.delete_old_message ? '✅' : '❌';
  const picOnlyIcon = user && user.picture_only ? '✅' : '❌';

  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Налаштувати текст графіка', callback_data: 'format_schedule_text' }],
        [{ text: `${deleteIcon} Видаляти попереднє`, callback_data: 'format_toggle_delete' }],
        [{ text: `${picOnlyIcon} Тільки зображення`, callback_data: 'format_toggle_piconly' }],
        [{ text: '🔄 Скинути до стандартних', callback_data: 'format_reset_all_schedule' }],
        [{ text: '← Назад', callback_data: 'format_settings' }],
      ],
    },
  };
}

/**
 * Power format settings keyboard.
 */
function getFormatPowerKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✍️ Текст: Світло є', callback_data: 'format_power_on_text' }],
        [{ text: '✍️ Текст: Світла немає', callback_data: 'format_power_off_text' }],
        [{ text: '🔄 Скинути до стандартних', callback_data: 'format_reset_all_power' }],
        [{ text: '← Назад', callback_data: 'format_settings' }],
      ],
    },
  };
}

// ─── Unified Alerts Keyboard (legacy) ────────────────────────────────────────

/**
 * @param {boolean} isActive
 * @param {string} currentTarget - 'bot' | 'channel' | 'both'
 */
function getUnifiedAlertsKeyboard(isActive, currentTarget) {
  const toggleText = isActive ? '🔕 Вимкнути сповіщення' : '🔔 Увімкнути сповіщення';

  const botMark = currentTarget === 'bot' ? '✅ ' : '';
  const channelMark = currentTarget === 'channel' ? '✅ ' : '';
  const bothMark = currentTarget === 'both' ? '✅ ' : '';

  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: toggleText, callback_data: 'alert_toggle' }],
        [
          { text: `${botMark}📱 Бот`, callback_data: 'notify_target_bot' },
          { text: `${channelMark}📺 Канал`, callback_data: 'notify_target_channel' },
          { text: `${bothMark}📱📺 Обидва`, callback_data: 'notify_target_both' },
        ],
        [{ text: '← Назад', callback_data: 'back_to_settings' }],
      ],
    },
  };
}

// ─── Notification Keyboard (new, single-screen) ───────────────────────────────

/**
 * @param {object} user
 */
function getNotificationKeyboard(user) {
  const scheduleOn = user.notify_schedule_changes !== false;
  const t60 = user.remind_1h === true;
  const t30 = user.remind_30m === true;
  const t15 = user.remind_15m !== false;
  const factOn = user.notify_fact_off !== false;

  const on = '✅';
  const off = '❌';

  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: `${scheduleOn ? on : off} Оновлення графіків`, callback_data: 'notif_toggle_schedule' }],
        [{ text: `${t60 ? on : off} Нагадування за 1 год`, callback_data: 'notif_time_60' }],
        [{ text: `${t30 ? on : off} Нагадування за 30 хв`, callback_data: 'notif_time_30' }],
        [{ text: `${t15 ? on : off} Нагадування за 15 хв`, callback_data: 'notif_time_15' }],
        [{ text: `${factOn ? on : off} Факт по графіку`, callback_data: 'notif_toggle_fact' }],
        [{ text: '← Назад', callback_data: 'back_to_settings' }],
      ],
    },
  };
}

// ─── Cleanup Keyboard ─────────────────────────────────────────────────────────

/**
 * @param {object} user
 */
function getCleanupKeyboard(user) {
  const cmdIcon = user && user.auto_delete_commands ? '✅' : '❌';
  const msgIcon = user && user.auto_delete_bot_messages ? '✅' : '❌';

  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: `${cmdIcon} Видаляти команди`, callback_data: 'cleanup_toggle_commands' }],
        [{ text: `${msgIcon} Видаляти повідомлення бота`, callback_data: 'cleanup_toggle_messages' }],
        [{ text: '← Назад', callback_data: 'back_to_settings' }],
      ],
    },
  };
}

// ─── Restoration Keyboard ─────────────────────────────────────────────────────

function getRestorationKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Відновити профіль', callback_data: 'restore_profile' }],
        [{ text: '🆕 Створити новий', callback_data: 'create_new_profile' }],
      ],
    },
  };
}

// ─── Admin Keyboards ──────────────────────────────────────────────────────────

/**
 * @param {number} openTicketsCount
 */
function getAdminKeyboard(openTicketsCount) {
  const ticketText = openTicketsCount > 0
    ? `📩 Звернення (${openTicketsCount})`
    : '📩 Звернення';

  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📊 Статистика', callback_data: 'admin_stats' },
          { text: '👥 Користувачі', callback_data: 'admin_users' },
        ],
        [
          { text: '📈 Ріст', callback_data: 'admin_growth' },
          { text: '📉 Аналітика', callback_data: 'admin_analytics' },
        ],
        [
          { text: '⏸ Пауза', callback_data: 'admin_pause' },
          { text: '📡 Моніторинг роутера', callback_data: 'admin_router' },
        ],
        [
          { text: ticketText, callback_data: 'admin_tickets' },
          { text: '⚙️ Налаштування', callback_data: 'admin_settings_menu' },
        ],
        [{ text: '⤴ Меню', callback_data: 'back_to_main' }],
      ],
    },
  };
}

// Alias for backward compatibility
function getAdminMenuKeyboard(openTicketsCount) {
  return getAdminKeyboard(openTicketsCount);
}

function getUsersMenuKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📊 Статистика', callback_data: 'admin_users_stats' },
          { text: '📋 Список', callback_data: 'admin_users_list_1' },
        ],
        [{ text: '← Назад', callback_data: 'admin_menu' }],
      ],
    },
  };
}

function getAdminAnalyticsKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '← Назад', callback_data: 'admin_menu' }],
      ],
    },
  };
}

function getAdminSettingsMenuKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '⏱ Інтервали', callback_data: 'admin_intervals' },
          { text: '💻 Система', callback_data: 'admin_system' },
        ],
        [
          { text: '🗑 Очистити БД', callback_data: 'admin_clear_db' },
          { text: '🔄 Перезапуск', callback_data: 'admin_restart' },
        ],
        [
          { text: '📞 Підтримка', callback_data: 'admin_support' },
          { text: '🔧 Тех. роботи', callback_data: 'admin_maintenance' },
        ],
        [{ text: '← Назад', callback_data: 'admin_menu' }],
      ],
    },
  };
}

function getRestartConfirmKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔄 Так, перезапустити', callback_data: 'admin_restart_confirm' },
          { text: '← Скасувати', callback_data: 'admin_settings_menu' },
        ],
      ],
    },
  };
}

// ─── Admin Pause / Debounce Keyboards ─────────────────────────────────────────

/**
 * @param {boolean} isPaused
 */
function getPauseMenuKeyboard(isPaused) {
  const toggleText = isPaused ? '▶️ Вимкнути паузу' : '⏸ Увімкнути паузу';

  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: toggleText, callback_data: 'pause_toggle' }],
        [{ text: '✏️ Змінити повідомлення', callback_data: 'pause_message_settings' }],
        [{ text: '🔧 Тип паузи', callback_data: 'pause_type_select' }],
        [{ text: '📜 Журнал', callback_data: 'pause_log' }],
        [{ text: '← Назад', callback_data: 'admin_menu' }],
      ],
    },
  };
}

/**
 * @param {boolean} _isPaused - unused but kept for API compatibility
 */
function getPauseMessageKeyboard(_isPaused) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '1️⃣ Бот тимчасово недоступний', callback_data: 'pause_template_1' }],
        [{ text: '2️⃣ Бот на паузі. Скоро повернемось', callback_data: 'pause_template_2' }],
        [{ text: '3️⃣ Бот тимчасово оновлюється', callback_data: 'pause_template_3' }],
        [{ text: '4️⃣ Планові роботи', callback_data: 'pause_template_4' }],
        [{ text: '5️⃣ Технічні роботи', callback_data: 'pause_template_5' }],
        [{ text: '✏️ Свій текст', callback_data: 'pause_custom_message' }],
        [{ text: '❌ Скасувати', callback_data: 'pause_message_settings' }],
      ],
    },
  };
}

function getPauseTypeKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Оновлення', callback_data: 'pause_type_update' }],
        [{ text: '🔧 Технічні роботи', callback_data: 'pause_type_maintenance' }],
        [{ text: '⚡ Аварія', callback_data: 'pause_type_emergency' }],
        [{ text: '← Назад', callback_data: 'admin_pause' }],
      ],
    },
  };
}

/**
 * @param {string} currentDebounce - current debounce minutes value
 */
function getDebounceKeyboard(currentDebounce) {
  const mark = (val) => String(currentDebounce) === String(val) ? '✅ ' : '';

  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: `${mark('0')}Вимкнено`, callback_data: 'debounce_set_0' }],
        [
          { text: `${mark('2')}2 хв`, callback_data: 'debounce_set_2' },
          { text: `${mark('3')}3 хв`, callback_data: 'debounce_set_3' },
          { text: `${mark('5')}5 хв`, callback_data: 'debounce_set_5' },
        ],
        [
          { text: `${mark('10')}10 хв`, callback_data: 'debounce_set_10' },
          { text: `${mark('15')}15 хв`, callback_data: 'debounce_set_15' },
        ],
        [{ text: '← Назад', callback_data: 'admin_pause' }],
      ],
    },
  };
}

// ─── Admin Intervals Keyboards ────────────────────────────────────────────────

function getAdminIntervalsKeyboard(scheduleMinutes, ipFormatted) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: `⏱ Графік: ${scheduleMinutes} хв`, callback_data: 'admin_interval_schedule' }],
        [{ text: `📡 IP: ${ipFormatted}`, callback_data: 'admin_interval_ip' }],
        [{ text: '← Назад', callback_data: 'admin_settings_menu' }],
      ],
    },
  };
}

function getScheduleIntervalKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '5 хв', callback_data: 'admin_schedule_5' },
          { text: '10 хв', callback_data: 'admin_schedule_10' },
          { text: '15 хв', callback_data: 'admin_schedule_15' },
        ],
        [
          { text: '30 хв', callback_data: 'admin_schedule_30' },
          { text: '45 хв', callback_data: 'admin_schedule_45' },
          { text: '60 хв', callback_data: 'admin_schedule_60' },
        ],
        [{ text: '← Назад', callback_data: 'admin_intervals' }],
      ],
    },
  };
}

function getIpIntervalKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '1 хв', callback_data: 'admin_ip_60' },
          { text: '2 хв', callback_data: 'admin_ip_120' },
          { text: '5 хв', callback_data: 'admin_ip_300' },
        ],
        [{ text: '← Назад', callback_data: 'admin_intervals' }],
      ],
    },
  };
}

// ─── Admin Router Keyboards ───────────────────────────────────────────────────

/**
 * @param {object|null} routerData
 */
function getAdminRouterKeyboard(routerData) {
  const buttons = [];

  if (!routerData || !routerData.router_ip) {
    buttons.push([{ text: '📝 Налаштувати IP', callback_data: 'admin_router_set_ip' }]);
  } else {
    const notifyText = routerData.notifications_on
      ? '🔕 Вимкнути сповіщення'
      : '🔔 Увімкнути сповіщення';
    buttons.push([{ text: '📝 Змінити IP', callback_data: 'admin_router_set_ip' }]);
    buttons.push([{ text: notifyText, callback_data: 'admin_router_toggle_notify' }]);
    buttons.push([{ text: '🔄 Оновити статус', callback_data: 'admin_router_refresh' }]);
    buttons.push([{ text: '📊 Статистика', callback_data: 'admin_router_stats' }]);
  }

  buttons.push([{ text: '← Назад', callback_data: 'admin_menu' }]);

  return { reply_markup: { inline_keyboard: buttons } };
}

function getAdminRouterSetIpKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Скасувати', callback_data: 'admin_router' }],
      ],
    },
  };
}

function getAdminRouterStatsKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '← Назад', callback_data: 'admin_router' }],
      ],
    },
  };
}

// ─── Admin Support Keyboard ───────────────────────────────────────────────────

/**
 * @param {string} mode - 'channel' | 'bot'
 * @param {string} _url
 */
function getAdminSupportKeyboard(mode, _url) {
  const channelMark = mode === 'channel' ? '✅ ' : '';
  const botMark = mode === 'bot' ? '✅ ' : '';

  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `${channelMark}📺 Через канал`, callback_data: 'admin_support_channel' },
          { text: `${botMark}🤖 Через бот`, callback_data: 'admin_support_bot' },
        ],
        [{ text: '✏️ Змінити посилання', callback_data: 'admin_support_edit_url' }],
        [{ text: '← Назад', callback_data: 'admin_settings_menu' }],
      ],
    },
  };
}

// ─── Admin Tickets Keyboards ──────────────────────────────────────────────────

/**
 * @param {number} ticketId
 */
function getAdminTicketKeyboard(ticketId) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✉️ Відповісти', callback_data: `admin_ticket_reply_${ticketId}` }],
        [{ text: '✅ Закрити тікет', callback_data: `admin_ticket_close_${ticketId}` }],
        [{ text: '← Список', callback_data: 'admin_tickets' }],
      ],
    },
  };
}

/**
 * @param {Array} tickets
 * @param {number} page
 */
function getAdminTicketsListKeyboard(tickets, page) {
  const perPage = 10;
  const currentPage = page || 1;
  const totalPages = Math.ceil(tickets.length / perPage);
  const start = (currentPage - 1) * perPage;
  const pageTickets = tickets.slice(start, start + perPage);

  const buttons = pageTickets.map(ticket => ([
    { text: `📩 Переглянути`, callback_data: `admin_ticket_view_${ticket.id}` },
  ]));

  const navRow = [];
  if (currentPage > 1) {
    navRow.push({ text: '← Попередня', callback_data: `admin_tickets_page_${currentPage - 1}` });
  }
  if (currentPage < totalPages) {
    navRow.push({ text: 'Наступна →', callback_data: `admin_tickets_page_${currentPage + 1}` });
  }
  if (navRow.length > 0) buttons.push(navRow);

  buttons.push([
    { text: '← Назад', callback_data: 'admin_menu' },
  ]);

  return { inline_keyboard: buttons };
}

// ─── Maintenance Keyboard ─────────────────────────────────────────────────────

/**
 * @param {boolean} enabled
 */
function getMaintenanceKeyboard(enabled) {
  const toggleText = enabled ? '❌ Вимкнути тех. роботи' : '✅ Увімкнути тех. роботи';

  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: toggleText, callback_data: 'maintenance_toggle' }],
        [{ text: '✏️ Змінити повідомлення', callback_data: 'maintenance_edit_message' }],
        [{ text: '← Назад', callback_data: 'admin_settings_menu' }],
      ],
    },
  };
}

// ─── Growth Keyboards ─────────────────────────────────────────────────────────

function getGrowthKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📊 Метрики', callback_data: 'growth_metrics' },
          { text: '🎯 Етап росту', callback_data: 'growth_stage' },
        ],
        [
          { text: '🔐 Реєстрація', callback_data: 'growth_registration' },
          { text: '📝 Події', callback_data: 'growth_events' },
        ],
        [{ text: '← Назад', callback_data: 'admin_menu' }],
      ],
    },
  };
}

/**
 * @param {number} currentStageId
 */
function getGrowthStageKeyboard(currentStageId) {
  const stages = [
    { id: 0, name: 'Закрите Тестування' },
    { id: 1, name: 'Відкритий Тест' },
    { id: 2, name: 'Контрольований Ріст' },
    { id: 3, name: 'Активний Ріст' },
    { id: 4, name: 'Масштаб' },
  ];

  const buttons = stages.map(stage => {
    const mark = stage.id === currentStageId ? '✅ ' : '';
    return [{ text: `${mark}${stage.name}`, callback_data: `growth_stage_${stage.id}` }];
  });

  buttons.push([{ text: '← Назад', callback_data: 'admin_growth' }]);

  return { reply_markup: { inline_keyboard: buttons } };
}

/**
 * @param {boolean} enabled
 */
function getGrowthRegistrationKeyboard(enabled) {
  const toggleText = enabled ? '🔴 Вимкнути реєстрацію' : '🟢 Увімкнути реєстрацію';

  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: toggleText, callback_data: 'growth_reg_toggle' }],
        [{ text: '📊 Статус', callback_data: 'growth_reg_status' }],
        [{ text: '← Назад', callback_data: 'admin_growth' }],
      ],
    },
  };
}

// ─── Test Publication Keyboard ────────────────────────────────────────────────

function getTestPublicationKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📅 Графік', callback_data: 'test_schedule' }],
        [
          { text: '🟢 Світло є', callback_data: 'test_power_on' },
          { text: '🔴 Світла немає', callback_data: 'test_power_off' },
        ],
        [{ text: '← Назад', callback_data: 'settings_channel' }],
      ],
    },
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getMainMenu,
  getScheduleViewKeyboard,
  getSettingsKeyboard,
  getHelpKeyboard,
  getErrorKeyboard,
  getRegionKeyboard,
  getQueueKeyboard,
  getConfirmKeyboard,
  getWizardNotifyTargetKeyboard,
  getIpMonitoringKeyboard,
  getIpCancelKeyboard,
  getChannelMenuKeyboard,
  getDeleteDataConfirmKeyboard,
  getDeleteDataFinalKeyboard,
  getDeactivateConfirmKeyboard,
  getFormatSettingsKeyboard,
  getFormatScheduleKeyboard,
  getFormatPowerKeyboard,
  getUnifiedAlertsKeyboard,
  getNotificationKeyboard,
  getCleanupKeyboard,
  getRestorationKeyboard,
  getAdminKeyboard,
  getAdminMenuKeyboard,
  getUsersMenuKeyboard,
  getAdminAnalyticsKeyboard,
  getAdminSettingsMenuKeyboard,
  getRestartConfirmKeyboard,
  getAdminRouterKeyboard,
  getAdminRouterSetIpKeyboard,
  getAdminRouterStatsKeyboard,
  getAdminSupportKeyboard,
  getAdminTicketKeyboard,
  getAdminTicketsListKeyboard,
  getAdminIntervalsKeyboard,
  getScheduleIntervalKeyboard,
  getIpIntervalKeyboard,
  getMaintenanceKeyboard,
  getGrowthKeyboard,
  getGrowthStageKeyboard,
  getGrowthRegistrationKeyboard,
  getTestPublicationKeyboard,
  getPauseMenuKeyboard,
  getPauseMessageKeyboard,
  getPauseTypeKeyboard,
  getDebounceKeyboard,
};