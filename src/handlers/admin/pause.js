const { getPauseMenuKeyboard, getPauseMessageKeyboard, getPauseTypeKeyboard, getDebounceKeyboard } = require('../../keyboards/inline');
const { getSetting, setSetting } = require('../../database/db');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { logPauseEvent, getPauseLog, getPauseLogStats } = require('../../database/pauseLog');
const metricsCollector = require('../../monitoring/metricsCollector');
const { setConversationState } = require('../channel');

// Callback handler for pause/debounce-related callbacks
async function handlePauseCallback(bot, query, chatId, userId, data) {
  // Pause mode handlers
  if (data === 'admin_pause') {
    const isPaused = await getSetting('bot_paused', '0') === '1';
    const pauseMessage = await getSetting('pause_message', '🔧 Бот тимчасово недоступний. Спробуйте пізніше.');

    const statusIcon = isPaused ? '🔴' : '🟢';
    const statusText = isPaused ? 'Бот на паузі' : 'Бот активний';

    await safeEditMessageText(bot,
      '⏸️ <b>Режим паузи</b>\n\n' +
      `Статус: <b>${statusIcon} ${statusText}</b>\n\n` +
      'При паузі:\n' +
      '• ❌ Блокується підключення нових каналів\n' +
      '• ✅ Все інше працює\n' +
      '• 📢 Показується повідомлення користувачам\n\n' +
      (isPaused ? `Поточне повідомлення:\n"${pauseMessage}"` : ''),
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getPauseMenuKeyboard(isPaused).reply_markup
      }
    );
    return;
  }

  if (data === 'pause_status') {
    // Just ignore - this is the status indicator
    return;
  }

  if (data === 'pause_toggle') {
    const isPaused = await getSetting('bot_paused', '0') === '1';
    const newState = isPaused ? '0' : '1';
    await setSetting('bot_paused', newState);

    // Track pause mode change in monitoring
    try {
      metricsCollector.trackStateTransition(
        newState === '1' ? 'pause_mode_on' : 'pause_mode_off',
        {
          userId: userId,
          timestamp: new Date().toISOString()
        }
      );
    } catch (_e) {
    }

    // Log the pause event
    const pauseType = await getSetting('pause_type', 'update'); // default to update

    await logPauseEvent(
      userId,
      newState === '1' ? 'pause' : 'resume',
      newState === '1' ? pauseType : null,
      newState === '1' ? await getSetting('pause_message', '🔧 Бот тимчасово недоступний. Спробуйте пізніше.') : null,
      null // reason can be added later if needed
    );

    const newIsPaused = newState === '1';
    const statusIcon = newIsPaused ? '🔴' : '🟢';
    const statusText = newIsPaused ? 'Бот на паузі' : 'Бот активний';
    const pauseMessage = await getSetting('pause_message', '🔧 Бот тимчасово недоступний. Спробуйте пізніше.');

    await safeEditMessageText(bot,
      '⏸️ <b>Режим паузи</b>\n\n' +
      `Статус: <b>${statusIcon} ${statusText}</b>\n\n` +
      'При паузі:\n' +
      '• ❌ Блокується підключення нових каналів\n' +
      '• ✅ Все інше працює\n' +
      '• 📢 Показується повідомлення користувачам\n\n' +
      (newIsPaused ? `Поточне повідомлення:\n"${pauseMessage}"` : ''),
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getPauseMenuKeyboard(newIsPaused).reply_markup
      }
    );

    await safeAnswerCallbackQuery(bot, query.id, {
      text: newIsPaused ? '🔴 Паузу увімкнено' : '🟢 Паузу вимкнено',
      show_alert: true
    });
    return;
  }

  if (data === 'pause_message_settings') {
    const showSupport = await getSetting('pause_show_support', '1') === '1';

    await safeEditMessageText(bot,
      '📋 <b>Налаштування повідомлення паузи</b>\n\n' +
      'Оберіть шаблон або введіть свій текст:',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getPauseMessageKeyboard(showSupport).reply_markup
      }
    );
    return;
  }

  if (data.startsWith('pause_template_')) {
    const templates = {
      'pause_template_1': '🔧 Бот тимчасово недоступний. Спробуйте пізніше.',
      'pause_template_2': '⏸️ Бот на паузі. Скоро повернемось.',
      'pause_template_3': '🔧 Бот тимчасово оновлюється. Спробуйте пізніше.',
      'pause_template_4': '📋 Ведуться планові роботи. Повернемось найближчим часом.',
      'pause_template_5': '🚧 Технічні роботи. Дякуємо за розуміння.'
    };

    const message = templates[data];
    if (message) {
      await setSetting('pause_message', message);

      await safeAnswerCallbackQuery(bot, query.id, {
        text: '✅ Шаблон збережено',
        show_alert: true
      });

      // Refresh message settings view
      const showSupport = await getSetting('pause_show_support', '1') === '1';

      await safeEditMessageText(bot,
        '📋 <b>Налаштування повідомлення паузи</b>\n\n' +
        'Оберіть шаблон або введіть свій текст:\n\n' +
        `Поточне повідомлення:\n"${message}"`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: getPauseMessageKeyboard(showSupport).reply_markup
        }
      );
    }
    return;
  }

  if (data === 'pause_toggle_support') {
    const currentValue = await getSetting('pause_show_support', '1');
    const newValue = currentValue === '1' ? '0' : '1';
    await setSetting('pause_show_support', newValue);

    const showSupport = newValue === '1';
    const pauseMessage = await getSetting('pause_message', '🔧 Бот тимчасово недоступний. Спробуйте пізніше.');

    await safeEditMessageText(bot,
      '📋 <b>Налаштування повідомлення паузи</b>\n\n' +
      'Оберіть шаблон або введіть свій текст:\n\n' +
      `Поточне повідомлення:\n"${pauseMessage}"`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getPauseMessageKeyboard(showSupport).reply_markup
      }
    );

    await safeAnswerCallbackQuery(bot, query.id, {
      text: showSupport ? '✅ Кнопка буде показуватись' : '❌ Кнопка не буде показуватись'
    });
    return;
  }

  // Pause type selection
  if (data === 'pause_type_select') {
    const currentType = await getSetting('pause_type', 'update');

    const typeLabels = {
      'update': '🔧 Оновлення',
      'emergency': '🚨 Аварія',
      'maintenance': '🔨 Обслуговування',
      'testing': '🧪 Тестування'
    };

    await safeEditMessageText(bot,
      '🏷 <b>Тип паузи</b>\n\n' +
      `Поточний тип: <b>${typeLabels[currentType] || currentType}</b>\n\n` +
      'Оберіть тип паузи для логування:',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getPauseTypeKeyboard(currentType).reply_markup
      }
    );
    return;
  }

  if (data.startsWith('pause_type_')) {
    const newType = data.replace('pause_type_', '');
    await setSetting('pause_type', newType);

    const typeLabels = {
      'update': '🔧 Оновлення',
      'emergency': '🚨 Аварія',
      'maintenance': '🔨 Обслуговування',
      'testing': '🧪 Тестування'
    };

    await safeAnswerCallbackQuery(bot, query.id, {
      text: `✅ Тип встановлено: ${typeLabels[newType]}`,
      show_alert: true
    });

    // Refresh the pause type menu
    await safeEditMessageText(bot,
      '🏷 <b>Тип паузи</b>\n\n' +
      `Поточний тип: <b>${typeLabels[newType]}</b>\n\n` +
      'Оберіть тип паузи для логування:',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getPauseTypeKeyboard(newType).reply_markup
      }
    );
    return;
  }

  // Pause log
  if (data === 'pause_log') {
    const recentEvents = await getPauseLog(10);
    const stats = await getPauseLogStats();

    let message = '📜 <b>Лог паузи</b>\n\n';
    message += `Всього подій: ${stats.total_events}\n`;
    message += `Паузи: ${stats.pause_count} | Відновлення: ${stats.resume_count}\n\n`;

    if (recentEvents.length === 0) {
      message += 'ℹ️ Немає записів в логу';
    } else {
      message += '<b>Останні 10 подій:</b>\n\n';

      const typeLabels = {
        'update': '🔧',
        'emergency': '🚨',
        'maintenance': '🔨',
        'testing': '🧪'
      };

      recentEvents.forEach(event => {
        const date = new Date(event.created_at);
        const dateStr = date.toLocaleString('uk-UA', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });

        const eventIcon = event.event_type === 'pause' ? '🔴' : '🟢';
        const typeIcon = event.pause_type ? typeLabels[event.pause_type] || '' : '';

        message += `${eventIcon} ${dateStr} `;
        if (typeIcon) message += `${typeIcon} `;
        message += event.event_type === 'pause' ? 'Пауза' : 'Відновлення';
        message += '\n';
      });
    }

    await safeEditMessageText(bot, message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '← Назад', callback_data: 'admin_pause' },
            { text: '⤴ Меню', callback_data: 'back_to_main' }
          ]
        ]
      }
    });
    return;
  }

  if (data === 'pause_custom_message') {
    // Store conversation state for custom pause message
    setConversationState(userId, {
      state: 'waiting_for_pause_message',
      previousMessageId: query.message.message_id
    });

    await safeEditMessageText(bot,
      '✏️ <b>Свій текст повідомлення паузи</b>\n\n' +
      'Надішліть текст, який буде показано користувачам при спробі підключити канал.',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Скасувати', callback_data: 'pause_message_settings' }]
          ]
        }
      }
    );
    return;
  }

  // Debounce handlers
  if (data === 'admin_debounce') {
    const currentDebounce = await getSetting('power_debounce_minutes', '5');

    // Display text based on current value
    const displayValue = currentDebounce === '0' ? 'Вимкнено (без затримок)' : `${currentDebounce} хв`;

    await safeEditMessageText(bot,
      `⏸ <b>Налаштування Debounce</b>\n\n` +
      `Поточне значення: <b>${displayValue}</b>\n\n` +
      `Debounce — мінімальний час стабільного стану світла перед публікацією.\n` +
      `Це запобігає спаму при "моргаючому" світлі.\n\n` +
      `Оберіть нове значення:`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getDebounceKeyboard(currentDebounce).reply_markup,
      }
    );
    return;
  }

  if (data.startsWith('debounce_set_')) {
    const minutes = data.replace('debounce_set_', '');
    await setSetting('power_debounce_minutes', minutes);

    // Display text based on selected value
    const displayValue = minutes === '0' ? 'Вимкнено (без затримок)' : `${minutes} хв`;
    const alertText = minutes === '0'
      ? '✅ Debounce вимкнено. Сповіщення надходитимуть без затримок.'
      : `✅ Debounce встановлено: ${minutes} хв`;

    await safeAnswerCallbackQuery(bot, query.id, {
      text: alertText,
      show_alert: true
    });

    // Оновити повідомлення з оновленою клавіатурою
    await safeEditMessageText(bot,
      `⏸ <b>Налаштування Debounce</b>\n\n` +
      `Поточне значення: <b>${displayValue}</b>\n\n` +
      `Debounce — мінімальний час стабільного стану світла перед публікацією.\n` +
      `Це запобігає спаму при "моргаючому" світлі.\n\n` +
      `Оберіть нове значення:`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getDebounceKeyboard(minutes).reply_markup,
      }
    );
    return;
  }
}

module.exports = {
  handlePauseCallback,
};
