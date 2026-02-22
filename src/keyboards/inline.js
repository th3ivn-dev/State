const { REGIONS, GROUPS, SUBGROUPS, QUEUES, getQueuesForRegion } = require('../constants/regions');

// Головне меню після /start для існуючих користувачів
function getMainMenu(botStatus = 'active', channelPaused = false) {
  const buttons = [
    [
      { text: 'Графік', callback_data: 'menu_schedule', icon_custom_emoji_id: '5210956306952758910' },
      { text: 'Допомога', callback_data: 'menu_help', icon_custom_emoji_id: '5443038326535759644' }
    ],
    [
      { text: 'Статистика', callback_data: 'menu_stats', icon_custom_emoji_id: '5190806721286657692' },
      { text: 'Таймер', callback_data: 'menu_timer', icon_custom_emoji_id: '5382194935057372936' }
    ],
    [
      { text: 'Налаштування', callback_data: 'menu_settings', icon_custom_emoji_id: '5341715473882955310' }
    ],
  ];
  
  // Add pause/resume button if user has a channel
  if (botStatus !== 'no_channel') {
    if (channelPaused) {
      buttons.push([
        { text: 'Відновити роботу каналу', callback_data: 'channel_resume', icon_custom_emoji_id: '5348125953090403204' }
      ]);
    } else {
      buttons.push([
        { text: 'Тимчасово зупинити канал', callback_data: 'channel_pause', icon_custom_emoji_id: '5359543311897998264' }
      ]);
    }
  }
  
  return {
    reply_markup: {
      inline_keyboard: buttons,
    },
  };
}

// Вибір регіону
function getRegionKeyboard() {
  const buttons = [];
  const row = [];
  
  Object.keys(REGIONS).forEach((code, index) => {
    row.push({
      text: REGIONS[code].name,
      callback_data: `region_${code}`,
    });
    
    if (row.length === 2 || index === Object.keys(REGIONS).length - 1) {
      buttons.push([...row]);
      row.length = 0;
    }
  });
  
  // Add "Suggest Region" button
  buttons.push([{ text: '🏙 Запропонувати регіон', callback_data: 'region_request_start' }]);
  
  return {
    reply_markup: {
      inline_keyboard: buttons,
    },
  };
}

// Вибір черги з підтримкою пагінації для Києва
function getQueueKeyboard(region = null, page = 1) {
  const buttons = [];
  
  // Validate page number for Kyiv region
  if (region === 'kyiv' && (page < 1 || page > 5)) {
    page = 1; // Default to page 1 for invalid page numbers
  }
  
  // Для не-Київських регіонів або якщо регіон не вказано - показуємо стандартні 12 черг
  if (!region || region !== 'kyiv') {
    const queues = region ? getQueuesForRegion(region) : QUEUES;
    const row = [];
    
    queues.forEach((queue, index) => {
      row.push({
        text: queue,
        callback_data: `queue_${queue}`,
      });
      
      // 3 кнопки в рядку
      if (row.length === 3 || index === queues.length - 1) {
        buttons.push([...row]);
        row.length = 0;
      }
    });
    
    buttons.push([{ text: '← Назад', callback_data: 'back_to_region' }]);
    
    return {
      reply_markup: {
        inline_keyboard: buttons,
      },
    };
  }
  
  // Для Києва - показуємо пагіновану клавіатуру
  const kyivQueues = getQueuesForRegion('kyiv');
  
  if (page === 1) {
    // Page 1: Стандартні черги 1.1-6.2 (indices 0-11, 12 queues, 4 per row)
    const standardQueues = kyivQueues.slice(0, 12);
    const row = [];
    
    standardQueues.forEach((queue, index) => {
      row.push({
        text: queue,
        callback_data: `queue_${queue}`,
      });
      
      // 4 кнопки в рядку
      if (row.length === 4 || index === standardQueues.length - 1) {
        buttons.push([...row]);
        row.length = 0;
      }
    });
    
    // Кнопка "Інші черги →"
    buttons.push([{ text: 'Інші черги →', callback_data: 'queue_page_2' }]);
    buttons.push([{ text: '← Назад', callback_data: 'back_to_region' }]);
  } else if (page === 2) {
    // Page 2: Queues 7.1-22.1 (indices 12-27, 16 queues, 4×4 grid)
    const pageQueues = kyivQueues.slice(12, 28);
    const row = [];
    
    pageQueues.forEach((queue, index) => {
      row.push({
        text: queue,
        callback_data: `queue_${queue}`,
      });
      
      if (row.length === 4 || index === pageQueues.length - 1) {
        buttons.push([...row]);
        row.length = 0;
      }
    });
    
    // Navigation buttons
    buttons.push([
      { text: '← Назад', callback_data: 'queue_page_1' },
      { text: 'Далі →', callback_data: 'queue_page_3' }
    ]);
  } else if (page === 3) {
    // Page 3: Queues 23.1-38.1 (indices 28-43, 16 queues, 4×4 grid)
    const pageQueues = kyivQueues.slice(28, 44);
    const row = [];
    
    pageQueues.forEach((queue, index) => {
      row.push({
        text: queue,
        callback_data: `queue_${queue}`,
      });
      
      if (row.length === 4 || index === pageQueues.length - 1) {
        buttons.push([...row]);
        row.length = 0;
      }
    });
    
    // Navigation buttons
    buttons.push([
      { text: '← Назад', callback_data: 'queue_page_2' },
      { text: 'Далі →', callback_data: 'queue_page_4' }
    ]);
  } else if (page === 4) {
    // Page 4: Queues 39.1-54.1 (indices 44-59, 16 queues, 4×4 grid)
    const pageQueues = kyivQueues.slice(44, 60);
    const row = [];
    
    pageQueues.forEach((queue, index) => {
      row.push({
        text: queue,
        callback_data: `queue_${queue}`,
      });
      
      if (row.length === 4 || index === pageQueues.length - 1) {
        buttons.push([...row]);
        row.length = 0;
      }
    });
    
    // Navigation buttons
    buttons.push([
      { text: '← Назад', callback_data: 'queue_page_3' },
      { text: 'Далі →', callback_data: 'queue_page_5' }
    ]);
  } else if (page === 5) {
    // Page 5: Queues 55.1-60.1 (indices 60-65, 6 queues, last page)
    const pageQueues = kyivQueues.slice(60, 66);
    const row = [];
    
    pageQueues.forEach((queue, index) => {
      row.push({
        text: queue,
        callback_data: `queue_${queue}`,
      });
      
      if (row.length === 4 || index === pageQueues.length - 1) {
        buttons.push([...row]);
        row.length = 0;
      }
    });
    
    // Only back button on last page
    buttons.push([{ text: '← Назад', callback_data: 'queue_page_4' }]);
  }
  
  return {
    reply_markup: {
      inline_keyboard: buttons,
    },
  };
}

// Підтвердження налаштувань
function getConfirmKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✓ Підтвердити', callback_data: 'confirm_setup' }],
        [{ text: '🔄 Змінити регіон', callback_data: 'back_to_region' }],
        [{ text: '⤴ Меню', callback_data: 'back_to_main' }],
      ],
    },
  };
}

// Меню налаштувань - Живий стан
function getSettingsKeyboard(isAdmin = false) {
  const buttons = [
    [
      { text: 'Регіон', callback_data: 'settings_region', icon_custom_emoji_id: '5399898266265475100' },
      { text: 'IP', callback_data: 'settings_ip', icon_custom_emoji_id: '5447410659077661506' }
    ],
    [
      { text: 'Канал', callback_data: 'settings_channel', icon_custom_emoji_id: '5424818078833715060' },
      { text: 'Сповіщення', callback_data: 'settings_alerts', icon_custom_emoji_id: '5458603043203327669' }
    ],
  ];
  
  // Add admin panel button if user is admin
  if (isAdmin) {
    buttons.push(
      [{ text: 'Адмін-панель', callback_data: 'settings_admin', icon_custom_emoji_id: '5217822164362739968' }]
    );
  }
  
  buttons.push(
    [{ text: 'Видалити мої дані', callback_data: 'settings_delete_data', icon_custom_emoji_id: '5445267414562389170' }]
  );
  
  buttons.push(
    [
      { text: '← Назад', callback_data: 'back_to_main' },
      { text: '⤴ Меню', callback_data: 'back_to_main' }
    ]
  );
  
  return {
    reply_markup: {
      inline_keyboard: buttons,
    },
  };
}

// Налаштування алертів (спрощена версія - тільки увімк/вимк)
function getAlertsSettingsKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '← Назад', callback_data: 'back_to_settings' },
          { text: '⤴ Меню', callback_data: 'back_to_main' }
        ],
      ],
    },
  };
}

// Вибір часу для алертів - ВИДАЛЕНО (більше не використовується)
// function getAlertTimeKeyboard(type) { ... }

// Адмін меню
function getAdminKeyboard(openTicketsCount = 0) {
  const ticketsText = openTicketsCount > 0 ? `📩 Звернення (${openTicketsCount})` : '📩 Звернення';
  
  const buttons = [
    [
      { text: '📊 Статистика', callback_data: 'admin_stats' },
      { text: '👥 Користувачі', callback_data: 'admin_users' }
    ],
    [
      { text: ticketsText, callback_data: 'admin_tickets' },
      { text: '📢 Розсилка', callback_data: 'admin_broadcast' }
    ],
    [
      { text: '💻 Система', callback_data: 'admin_system' },
      { text: '📈 Ріст', callback_data: 'admin_growth' }
    ],
    [
      { text: '⏱ Інтервали', callback_data: 'admin_intervals' },
      { text: '⏸ Debounce', callback_data: 'admin_debounce' }
    ],
    [
      { text: '📡 Моніторинг роутера', callback_data: 'admin_router' }
    ],
    [
      { text: '📞 Підтримка', callback_data: 'admin_support' }
    ],
    [
      { text: '⏸️ Режим паузи', callback_data: 'admin_pause' },
      { text: '🗑 Очистити базу', callback_data: 'admin_clear_db' }
    ],
    [
      { text: '🔄 Перезапуск', callback_data: 'admin_restart' }
    ],
  ];
  
  buttons.push([
    { text: '← Назад', callback_data: 'back_to_settings' },
    { text: '⤴ Меню', callback_data: 'back_to_main' }
  ]);
  
  return {
    reply_markup: {
      inline_keyboard: buttons,
    },
  };
}

// Меню інтервалів (адмін)
function getAdminIntervalsKeyboard(currentScheduleInterval, currentIpInterval) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: `⏱ Графіки: ${currentScheduleInterval} хв`, callback_data: 'admin_interval_schedule' }],
        [{ text: `📡 IP: ${currentIpInterval}`, callback_data: 'admin_interval_ip' }],
        [
          { text: '← Назад', callback_data: 'admin_menu' },
          { text: '⤴ Меню', callback_data: 'back_to_main' }
        ]
      ]
    }
  };
}

// Вибір інтервалу графіків
function getScheduleIntervalKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '1 хв', callback_data: 'admin_schedule_1' },
          { text: '5 хв', callback_data: 'admin_schedule_5' },
          { text: '10 хв', callback_data: 'admin_schedule_10' },
          { text: '15 хв', callback_data: 'admin_schedule_15' }
        ],
        [
          { text: '← Назад', callback_data: 'admin_intervals' },
          { text: '⤴ Меню', callback_data: 'back_to_main' }
        ]
      ]
    }
  };
}

// Вибір інтервалу IP моніторингу
function getIpIntervalKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '10 сек', callback_data: 'admin_ip_10' },
          { text: '30 сек', callback_data: 'admin_ip_30' },
          { text: '1 хв', callback_data: 'admin_ip_60' },
          { text: '2 хв', callback_data: 'admin_ip_120' }
        ],
        [
          { text: '🔄 Динамічний', callback_data: 'admin_ip_0' }
        ],
        [
          { text: '← Назад', callback_data: 'admin_intervals' },
          { text: '⤴ Меню', callback_data: 'back_to_main' }
        ]
      ]
    }
  };
}

// Підтвердження деактивації
function getDeactivateConfirmKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✓ Так, деактивувати', callback_data: 'confirm_deactivate' }],
        [{ text: '✕ Скасувати', callback_data: 'back_to_settings' }],
      ],
    },
  };
}

// Підтвердження видалення даних - Step 1
function getDeleteDataConfirmKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Скасувати', callback_data: 'back_to_settings', style: 'success' },
          { text: 'Продовжити', callback_data: 'delete_data_step2', style: 'danger' }
        ],
      ],
    },
  };
}

// Підтвердження видалення даних - Step 2
function getDeleteDataFinalKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Ні', callback_data: 'back_to_settings', style: 'success' },
          { text: 'Так, видалити', callback_data: 'confirm_delete_data', style: 'danger', icon_custom_emoji_id: '5445267414562389170' }
        ],
      ],
    },
  };
}

// IP моніторинг меню
function getIpMonitoringKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'ℹ️ Інструкція', callback_data: 'ip_instruction' }],
        [{ text: '✚ Підключити IP', callback_data: 'ip_setup' }],
        [{ text: '📋 Показати поточний', callback_data: 'ip_show' }],
        [{ text: '🗑️ Видалити IP', callback_data: 'ip_delete' }],
        [
          { text: '← Назад', callback_data: 'back_to_settings' },
          { text: '⤴ Меню', callback_data: 'back_to_main' }
        ],
      ],
    },
  };
}

// Кнопка скасування для IP setup
function getIpCancelKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✕ Скасувати', callback_data: 'ip_cancel' }],
      ],
    },
  };
}

// Статистика меню
function getStatisticsKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚡ Відключення за тиждень', callback_data: 'stats_week' }],
        [{ text: '📡 Статус пристрою', callback_data: 'stats_device' }],
        [{ text: '⚙️ Мої налаштування', callback_data: 'stats_settings' }],
        [
          { text: '← Назад', callback_data: 'back_to_main' },
          { text: '⤴ Меню', callback_data: 'back_to_main' }
        ],
      ],
    },
  };
}

// Допомога меню
async function getHelpKeyboard() {
  const { getSupportButton } = require('../handlers/feedback');
  const supportButton = await getSupportButton();
  
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📖 Інструкція', callback_data: 'help_howto' },
          supportButton
        ],
        [
          { text: '📢 Новини', url: 'https://t.me/Voltyk_news' },
          { text: '💬 Обговорення', url: 'https://t.me/voltyk_chat' }
        ],
        [{ text: '🏙 Запропонувати регіон', callback_data: 'region_request_start' }],
        [{ text: '⤴ Меню', callback_data: 'back_to_main' }],
      ],
    },
  };
}

// Канал меню
function getChannelMenuKeyboard(channelId = null, isPublic = false, channelStatus = 'active') {
  const buttons = [];
  
  if (!channelId) {
    // Канал НЕ підключено
    buttons.push([{ text: '✚ Підключити канал', callback_data: 'channel_connect' }]);
  } else {
    // Канал підключено
    // Add "Open channel" button for public channels
    if (isPublic && channelId.startsWith('@')) {
      buttons.push([{ text: '📺 Відкрити канал', url: `https://t.me/${channelId.replace('@', '')}` }]);
    }
    
    buttons.push([
      { text: 'ℹ️ Інфо', callback_data: 'channel_info' },
      { text: '✏️ Назва', callback_data: 'channel_edit_title' }
    ]);
    buttons.push([
      { text: '📝 Опис', callback_data: 'channel_edit_description' },
      { text: '📋 Формат', callback_data: 'channel_format' }
    ]);
    buttons.push([
      { text: '🧪 Тест', callback_data: 'channel_test' },
      // Add reconnect button if channel is blocked, otherwise disable
      channelStatus === 'blocked' 
        ? { text: '⚙️ Перепідключити', callback_data: 'channel_reconnect' }
        : { text: '🔴 Вимкнути', callback_data: 'channel_disable' }
    ]);
  }
  
  buttons.push([
    { text: '← Назад', callback_data: 'back_to_settings' },
    { text: '⤴ Меню', callback_data: 'back_to_main' }
  ]);
  
  return {
    reply_markup: {
      inline_keyboard: buttons,
    },
  };
}

// Restoration keyboard for deactivated users
function getRestorationKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Відновити налаштування', callback_data: 'restore_profile' }],
        [{ text: '🆕 Почати заново', callback_data: 'create_new_profile' }],
      ],
    },
  };
}

// Меню формату публікацій
// Level 1 - Main format menu
function getFormatSettingsKeyboard(user) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 Графік відключень', callback_data: 'format_schedule_settings' }],
        [{ text: '⚡ Фактичний стан', callback_data: 'format_power_settings' }],
        [
          { text: '← Назад', callback_data: 'settings_channel' },
          { text: '⤴ Меню', callback_data: 'back_to_main' }
        ]
      ]
    }
  };
}

// Level 2a - Schedule format settings
function getFormatScheduleKeyboard(user) {
  const deleteOld = user.delete_old_message ? '✓' : '○';
  const picOnly = user.picture_only ? '✓' : '○';
  
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Налаштувати текст графіка', callback_data: 'format_schedule_text' }],
        [{ text: `${deleteOld} Видаляти старий графік`, callback_data: 'format_toggle_delete' }],
        [{ text: `${picOnly} Без тексту (тільки картинка)`, callback_data: 'format_toggle_piconly' }],
        [
          { text: '← Назад', callback_data: 'format_menu' },
          { text: '⤴ Меню', callback_data: 'back_to_main' }
        ]
      ]
    }
  };
}

// Level 2b - Power state settings
function getFormatPowerKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔴 Повідомлення "Світло зникло"', callback_data: 'format_power_off' }],
        [{ text: '🟢 Повідомлення "Світло є"', callback_data: 'format_power_on' }],
        [{ text: '🔄 Скинути все до стандартних', callback_data: 'format_reset_all_power' }],
        [
          { text: '← Назад', callback_data: 'format_menu' },
          { text: '⤴ Меню', callback_data: 'back_to_main' }
        ]
      ]
    }
  };
}

// Меню тесту публікації
function getTestPublicationKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 Графік відключень', callback_data: 'test_schedule' }],
        [{ text: '⚡ Фактичний стан (світло є)', callback_data: 'test_power_on' }],
        [{ text: '📴 Фактичний стан (світла немає)', callback_data: 'test_power_off' }],
        [{ text: '✏️ Своє повідомлення', callback_data: 'test_custom' }],
        [
          { text: '← Назад', callback_data: 'settings_channel' },
          { text: '⤴ Меню', callback_data: 'back_to_main' }
        ]
      ]
    }
  };
}

// Меню режиму паузи
function getPauseMenuKeyboard(isPaused) {
  const statusIcon = isPaused ? '🔴' : '🟢';
  const statusText = isPaused ? 'Бот на паузі' : 'Бот активний';
  const toggleText = isPaused ? '🟢 Вимкнути паузу' : '🔴 Увімкнути паузу';
  
  const buttons = [
    [{ text: `${statusIcon} ${statusText}`, callback_data: 'pause_status' }],
    [{ text: toggleText, callback_data: 'pause_toggle' }],
    [{ text: '📋 Налаштувати повідомлення', callback_data: 'pause_message_settings' }],
  ];
  
  if (isPaused) {
    buttons.push([{ text: '🏷 Тип паузи', callback_data: 'pause_type_select' }]);
  }
  
  buttons.push([{ text: '📜 Лог паузи', callback_data: 'pause_log' }]);
  buttons.push([
    { text: '← Назад', callback_data: 'admin_menu' },
    { text: '⤴ Меню', callback_data: 'back_to_main' }
  ]);
  
  return {
    reply_markup: {
      inline_keyboard: buttons
    }
  };
}

// Меню налаштування повідомлення паузи
function getPauseMessageKeyboard(showSupportButton) {
  const supportIcon = showSupportButton ? '✓' : '○';
  
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔧 Бот тимчасово недоступний...', callback_data: 'pause_template_1' }],
        [{ text: '⏸️ Бот на паузі. Скоро повернемось', callback_data: 'pause_template_2' }],
        [{ text: '🔧 Бот тимчасово оновлюється. Спробуйте пізніше.', callback_data: 'pause_template_3' }],
        [{ text: '⏸️ Бот на паузі. Скоро повернемось.', callback_data: 'pause_template_4' }],
        [{ text: '🚧 Технічні роботи. Дякуємо за розуміння.', callback_data: 'pause_template_5' }],
        [{ text: '✏️ Свій текст...', callback_data: 'pause_custom_message' }],
        [{ text: `${supportIcon} Показувати кнопку "Обговорення/Підтримка"`, callback_data: 'pause_toggle_support' }],
        [
          { text: '← Назад', callback_data: 'admin_pause' },
          { text: '⤴ Меню', callback_data: 'back_to_main' }
        ]
      ]
    }
  };
}

// Меню вибору типу паузи
function getPauseTypeKeyboard(currentType = 'update') {
  const types = [
    { value: 'update', label: '🔧 Оновлення', icon: '🔧' },
    { value: 'emergency', label: '🚨 Аварія', icon: '🚨' },
    { value: 'maintenance', label: '🔨 Обслуговування', icon: '🔨' },
    { value: 'testing', label: '🧪 Тестування', icon: '🧪' },
  ];
  
  const buttons = types.map(type => [{
    text: currentType === type.value ? `✓ ${type.label}` : type.label,
    callback_data: `pause_type_${type.value}`
  }]);
  
  buttons.push([
    { text: '← Назад', callback_data: 'admin_pause' },
    { text: '⤴ Меню', callback_data: 'back_to_main' }
  ]);
  
  return {
    reply_markup: {
      inline_keyboard: buttons
    }
  };
}

// Меню помилки з кнопкою підтримки
async function getErrorKeyboard() {
  const { getSupportButton } = require('../handlers/feedback');
  const supportButton = await getSupportButton();
  
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Спробувати ще', callback_data: 'back_to_main' }],
        [supportButton],
      ],
    },
  };
}

// Меню налаштування debounce
function getDebounceKeyboard(currentValue) {
  const options = [0, 1, 2, 3, 5, 10, 15];
  const buttons = options.map(min => {
    if (min === 0) {
      // Special text for 0 value
      const isSelected = currentValue === '0' || currentValue === 0;
      return {
        text: isSelected ? '✓ Вимкнено' : '❌ Вимкнути',
        callback_data: 'debounce_set_0'
      };
    }
    return {
      text: currentValue === String(min) || currentValue === min ? `✓ ${min} хв` : `${min} хв`,
      callback_data: `debounce_set_${min}`
    };
  });
  
  return {
    reply_markup: {
      inline_keyboard: [
        [buttons[0]], // [❌ Вимкнути] or [✓ Вимкнено]
        buttons.slice(1, 4), // [1 хв] [2 хв] [3 хв]
        buttons.slice(4, 7), // [5 хв] [10 хв] [15 хв]
        [
          { text: '← Назад', callback_data: 'admin_menu' },
          { text: '⤴ Меню', callback_data: 'back_to_main' }
        ]
      ]
    }
  };
}

// Меню вибору куди публікувати сповіщення про світло
function getNotifyTargetKeyboard(currentTarget = 'both') {
  const options = [
    { value: 'bot', label: '📱 Тільки в бот' },
    { value: 'channel', label: '📺 Тільки в канал' },
    { value: 'both', label: '📱📺 В бот і канал' }
  ];
  
  const buttons = options.map(opt => [{
    text: currentTarget === opt.value ? `✓ ${opt.label}` : opt.label,
    callback_data: `notify_target_${opt.value}`
  }]);
  
  buttons.push([
    { text: '← Назад', callback_data: 'back_to_settings' },
    { text: '⤴ Меню', callback_data: 'back_to_main' }
  ]);
  
  return {
    reply_markup: {
      inline_keyboard: buttons
    }
  };
}

// Unified alerts menu (combines alerts on/off with notify target selection)
function getUnifiedAlertsKeyboard(isActive, currentTarget = 'both') {
  const buttons = [];
  
  if (isActive) {
    // Show target selection buttons when notifications are enabled
    const options = [
      { value: 'bot', label: '📱 Тільки в бот' },
      { value: 'channel', label: '📺 Тільки в канал' },
      { value: 'both', label: '📱📺 В бот і канал' }
    ];
    
    options.forEach(opt => {
      const btn = {
        text: opt.label,
        callback_data: `notify_target_${opt.value}`
      };
      if (currentTarget === opt.value) btn.style = 'success';
      buttons.push([btn]);
    });
    
    // Add disable button
    buttons.push([{ text: '🔕 Вимкнути сповіщення', callback_data: 'alert_toggle', style: 'danger' }]);
  } else {
    // Show only enable button when notifications are disabled
    buttons.push([{ text: '🔔 Увімкнути сповіщення', callback_data: 'alert_toggle', style: 'success' }]);
  }
  
  // Add back button
  buttons.push([
    { text: '← Назад', callback_data: 'back_to_settings' }
  ]);
  
  return {
    reply_markup: {
      inline_keyboard: buttons
    }
  };
}

// Wizard: вибір куди надсилати сповіщення (для нових користувачів)
function getWizardNotifyTargetKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📱 У цьому боті', callback_data: 'wizard_notify_bot' }],
        [{ text: '📺 У Telegram-каналі', callback_data: 'wizard_notify_channel' }]
      ]
    }
  };
}

// Growth management keyboard
function getGrowthKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 Метрики', callback_data: 'growth_metrics' }],
        [{ text: '🎯 Етап росту', callback_data: 'growth_stage' }],
        [{ text: '🔐 Реєстрація', callback_data: 'growth_registration' }],
        [{ text: '📝 Події', callback_data: 'growth_events' }],
        [
          { text: '← Назад', callback_data: 'admin_menu' },
          { text: '⤴ Меню', callback_data: 'back_to_main' }
        ]
      ]
    }
  };
}

// Growth stage selection keyboard
function getGrowthStageKeyboard(currentStage) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: `${currentStage === 0 ? '✓' : ''} Етап 0: Закрите тестування (0-50)`, callback_data: 'growth_stage_0' }],
        [{ text: `${currentStage === 1 ? '✓' : ''} Етап 1: Відкритий тест (50-300)`, callback_data: 'growth_stage_1' }],
        [{ text: `${currentStage === 2 ? '✓' : ''} Етап 2: Контрольований ріст (300-1000)`, callback_data: 'growth_stage_2' }],
        [{ text: `${currentStage === 3 ? '✓' : ''} Етап 3: Активний ріст (1000-5000)`, callback_data: 'growth_stage_3' }],
        [{ text: `${currentStage === 4 ? '✓' : ''} Етап 4: Масштаб (5000+)`, callback_data: 'growth_stage_4' }],
        [
          { text: '← Назад', callback_data: 'admin_growth' },
          { text: '⤴ Меню', callback_data: 'back_to_main' }
        ]
      ]
    }
  };
}

// Growth registration control keyboard
function getGrowthRegistrationKeyboard(enabled) {
  const toggleText = enabled ? '🔴 Вимкнути реєстрацію' : '🟢 Увімкнути реєстрацію';
  const statusText = enabled ? '🟢 Реєстрація увімкнена' : '🔴 Реєстрація вимкнена';
  
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: statusText, callback_data: 'growth_reg_status' }],
        [{ text: toggleText, callback_data: 'growth_reg_toggle' }],
        [
          { text: '← Назад', callback_data: 'admin_growth' },
          { text: '⤴ Меню', callback_data: 'back_to_main' }
        ]
      ]
    }
  };
}

// Restart confirmation keyboard
function getRestartConfirmKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Так, перезапустити', callback_data: 'admin_restart_confirm' }],
        [{ text: '❌ Скасувати', callback_data: 'admin_menu' }]
      ]
    }
  };
}

// Users menu keyboard
function getUsersMenuKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 Статистика користувачів', callback_data: 'admin_users_stats' }],
        [{ text: '📋 Список користувачів', callback_data: 'admin_users_list_1' }],
        [
          { text: '← Назад', callback_data: 'admin_menu' },
          { text: '⤴ Меню', callback_data: 'back_to_main' }
        ]
      ]
    }
  };
}

// Admin ticket keyboard with counter
function getAdminTicketsKeyboard(openCount = 0) {
  const buttonText = openCount > 0 ? `📩 Звернення (${openCount})` : '📩 Звернення';
  return {
    inline_keyboard: [
      [{ text: buttonText, callback_data: 'admin_tickets' }],
    ],
  };
}

// Admin ticket management keyboard
function getAdminTicketKeyboard(ticketId, status = 'open') {
  const buttons = [];
  
  if (status === 'open') {
    buttons.push([{ text: '💬 Відповісти', callback_data: `admin_ticket_reply_${ticketId}` }]);
    buttons.push([{ text: '✅ Закрити', callback_data: `admin_ticket_close_${ticketId}` }]);
  } else if (status === 'closed') {
    buttons.push([{ text: '🔄 Відкрити знову', callback_data: `admin_ticket_reopen_${ticketId}` }]);
  }
  
  buttons.push([
    { text: '← Назад до списку', callback_data: 'admin_tickets' },
  ]);
  
  return {
    inline_keyboard: buttons,
  };
}

// Admin tickets list keyboard
function getAdminTicketsListKeyboard(tickets, page = 1) {
  const buttons = [];
  
  // Show up to 5 tickets per page
  const startIndex = (page - 1) * 5;
  const endIndex = Math.min(startIndex + 5, tickets.length);
  
  for (let i = startIndex; i < endIndex; i++) {
    const ticket = tickets[i];
    const typeEmoji = ticket.type === 'bug' ? '🐛' : ticket.type === 'region_request' ? '🏙' : '💬';
    const statusEmoji = ticket.status === 'open' ? '🆕' : ticket.status === 'closed' ? '✅' : '🔄';
    let displaySubject = ticket.subject ? ticket.subject : 'Звернення';
    if (displaySubject.length > 30) {
      displaySubject = displaySubject.substring(0, 30) + '...';
    }
    const buttonText = `${statusEmoji} ${typeEmoji} #${ticket.id} - ${displaySubject}`;
    buttons.push([{ text: buttonText, callback_data: `admin_ticket_view_${ticket.id}` }]);
  }
  
  // Pagination if needed
  const totalPages = Math.ceil(tickets.length / 5);
  if (totalPages > 1) {
    const paginationRow = [];
    if (page > 1) {
      paginationRow.push({ text: '← Попередня', callback_data: `admin_tickets_page_${page - 1}` });
    }
    if (page < totalPages) {
      paginationRow.push({ text: 'Наступна →', callback_data: `admin_tickets_page_${page + 1}` });
    }
    if (paginationRow.length > 0) {
      buttons.push(paginationRow);
    }
  }
  
  buttons.push([
    { text: '← Назад', callback_data: 'admin_menu' },
    { text: '⤴ Меню', callback_data: 'back_to_main' }
  ]);
  
  return {
    inline_keyboard: buttons,
  };
}

// Admin router monitoring keyboards
function getAdminRouterKeyboard(routerData) {
  const buttons = [];
  
  if (!routerData || !routerData.router_ip) {
    // IP not configured
    buttons.push([
      { text: '✏️ Налаштувати IP', callback_data: 'admin_router_set_ip' }
    ]);
  } else {
    // IP is configured
    buttons.push([
      { text: '✏️ Змінити IP', callback_data: 'admin_router_set_ip' },
      { text: routerData.notifications_on ? '✓ Сповіщення' : '✗ Сповіщення', callback_data: 'admin_router_toggle_notify' }
    ]);
    buttons.push([
      { text: '📊 Статистика', callback_data: 'admin_router_stats' },
      { text: '🔄 Оновити', callback_data: 'admin_router_refresh' }
    ]);
  }
  
  buttons.push([
    { text: '← Назад', callback_data: 'admin_menu' },
    { text: '⤴ Меню', callback_data: 'back_to_main' }
  ]);
  
  return {
    reply_markup: {
      inline_keyboard: buttons,
    },
  };
}

function getAdminRouterStatsKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔄 Оновити', callback_data: 'admin_router_stats' }
        ],
        [
          { text: '← Назад', callback_data: 'admin_router' },
          { text: '⤴ Меню', callback_data: 'back_to_main' }
        ],
      ],
    },
  };
}

function getAdminRouterSetIpKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '❌ Скасувати', callback_data: 'admin_router' }
        ],
      ],
    },
  };
}

function getAdminSupportKeyboard(currentMode, supportUrl) {
  const channelActive = currentMode === 'channel';
  const botActive = currentMode === 'bot';
  
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { 
            text: `${channelActive ? '●' : '○'} Через канал (листування)`, 
            callback_data: 'admin_support_channel' 
          }
        ],
        [
          { 
            text: `${botActive ? '●' : '○'} Через бот (тікети)`, 
            callback_data: 'admin_support_bot' 
          }
        ],
        [
          { text: '✏️ Змінити посилання', callback_data: 'admin_support_edit_url' }
        ],
        [
          { text: '← Назад', callback_data: 'admin_menu' }
        ],
      ],
    },
  };
}

module.exports = {
  getMainMenu,
  getRegionKeyboard,
  getQueueKeyboard,
  getConfirmKeyboard,
  getSettingsKeyboard,
  getAlertsSettingsKeyboard,
  getAdminKeyboard,
  getAdminIntervalsKeyboard,
  getScheduleIntervalKeyboard,
  getIpIntervalKeyboard,
  getDeactivateConfirmKeyboard,
  getDeleteDataConfirmKeyboard,
  getDeleteDataFinalKeyboard,
  getIpMonitoringKeyboard,
  getIpCancelKeyboard,
  getStatisticsKeyboard,
  getHelpKeyboard,
  getChannelMenuKeyboard,
  getRestorationKeyboard,
  getFormatSettingsKeyboard,
  getFormatScheduleKeyboard,
  getFormatPowerKeyboard,
  getTestPublicationKeyboard,
  getPauseMenuKeyboard,
  getPauseMessageKeyboard,
  getPauseTypeKeyboard,
  getErrorKeyboard,
  getDebounceKeyboard,
  getNotifyTargetKeyboard,
  getUnifiedAlertsKeyboard,
  getWizardNotifyTargetKeyboard,
  getGrowthKeyboard,
  getGrowthStageKeyboard,
  getGrowthRegistrationKeyboard,
  getRestartConfirmKeyboard,
  getUsersMenuKeyboard,
  getAdminTicketsKeyboard,
  getAdminTicketKeyboard,
  getAdminTicketsListKeyboard,
  getAdminRouterKeyboard,
  getAdminRouterStatsKeyboard,
  getAdminRouterSetIpKeyboard,
  getAdminSupportKeyboard,
};
