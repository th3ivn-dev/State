const { getAdminIntervalsKeyboard, getScheduleIntervalKeyboard, getIpIntervalKeyboard } = require('../../keyboards/inline');
const { formatInterval } = require('../../utils');
const { getSetting, setSetting } = require('../../database/db');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { schedulerManager, checkAllSchedules } = require('../../scheduler');
const { startPowerMonitoring, stopPowerMonitoring } = require('../../powerMonitor');
const logger = require('../../utils/logger').createLogger('AdminHandler');

// Callback handler for interval-related callbacks
async function handleIntervalsCallback(bot, query, chatId, userId, data) {
  // Admin intervals menu
  if (data === 'admin_intervals') {
    const scheduleInterval = parseInt(await getSetting('schedule_check_interval', '60'), 10);
    const ipInterval = parseInt(await getSetting('power_check_interval', '2'), 10);

    const scheduleMinutes = Math.round(scheduleInterval / 60);
    const ipFormatted = formatInterval(ipInterval);

    await safeEditMessageText(bot,
      '⏱️ <b>Налаштування інтервалів</b>\n\n' +
      `⏱ Інтервал перевірки графіків: ${scheduleMinutes} хв\n` +
      `📡 Інтервал IP моніторингу: ${ipFormatted}\n\n` +
      'Оберіть, що хочете змінити:',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getAdminIntervalsKeyboard(scheduleMinutes, ipFormatted).reply_markup,
      }
    );
    return;
  }

  // Show schedule interval options
  if (data === 'admin_interval_schedule') {
    await safeEditMessageText(bot,
      '⏱ <b>Інтервал перевірки графіків</b>\n\n' +
      'Як часто бот має перевіряти оновлення графіків?\n\n' +
      'Оберіть інтервал:',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getScheduleIntervalKeyboard().reply_markup,
      }
    );
    return;
  }

  // Show IP interval options
  if (data === 'admin_interval_ip') {
    await safeEditMessageText(bot,
      '📡 <b>Інтервал IP моніторингу</b>\n\n' +
      'Як часто бот має перевіряти доступність IP?\n\n' +
      'Оберіть інтервал:',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getIpIntervalKeyboard().reply_markup,
      }
    );
    return;
  }

  // Set schedule interval
  if (data.startsWith('admin_schedule_')) {
    const minutes = parseInt(data.replace('admin_schedule_', ''), 10);
    const seconds = minutes * 60;

    await setSetting('schedule_check_interval', String(seconds));

    // Update scheduler interval and restart immediately
    schedulerManager.updateScheduleCheckInterval(seconds);
    schedulerManager.restart({
      bot: bot,
      checkAllSchedules: checkAllSchedules
    });

    await safeAnswerCallbackQuery(bot, query.id, {
      text: `✅ Інтервал графіків: ${minutes} хв. Застосовано!`,
      show_alert: true
    });

    // Return to intervals menu
    const scheduleInterval = parseInt(await getSetting('schedule_check_interval', '60'), 10);
    const ipInterval = parseInt(await getSetting('power_check_interval', '2'), 10);

    const scheduleMinutes = Math.round(scheduleInterval / 60);
    const ipFormatted = formatInterval(ipInterval);

    await safeEditMessageText(bot,
      '⏱️ <b>Налаштування інтервалів</b>\n\n' +
      `⏱ Інтервал перевірки графіків: ${scheduleMinutes} хв\n` +
      `📡 Інтервал IP моніторингу: ${ipFormatted}\n\n` +
      'Оберіть, що хочете змінити:',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getAdminIntervalsKeyboard(scheduleMinutes, ipFormatted).reply_markup,
      }
    );
    return;
  }

  // Set IP interval
  if (data.startsWith('admin_ip_')) {
    const seconds = parseInt(data.replace('admin_ip_', ''), 10);

    await setSetting('power_check_interval', String(seconds));

    // Restart power monitoring to apply the new interval immediately
    try {
      stopPowerMonitoring();
      await startPowerMonitoring(bot);
      logger.info(`Power monitoring restarted with new interval: ${seconds}s`);
    } catch (error) {
      logger.error('Failed to restart power monitoring', { error });
    }

    const formatted = formatInterval(seconds);
    const message = seconds === 0
      ? '✅ Інтервал IP: Динамічний режим. Застосовано!'
      : `✅ Інтервал IP: ${formatted}. Застосовано!`;

    await safeAnswerCallbackQuery(bot, query.id, {
      text: message,
      show_alert: true
    });

    // Return to intervals menu
    const scheduleInterval = parseInt(await getSetting('schedule_check_interval', '60'), 10);
    const ipInterval = parseInt(await getSetting('power_check_interval', '2'), 10);

    const scheduleMinutes = Math.round(scheduleInterval / 60);
    const ipFormatted = formatInterval(ipInterval);

    await safeEditMessageText(bot,
      '⏱️ <b>Налаштування інтервалів</b>\n\n' +
      `⏱ Інтервал перевірки графіків: ${scheduleMinutes} хв\n` +
      `📡 Інтервал IP моніторингу: ${ipFormatted}\n\n` +
      'Оберіть, що хочете змінити:',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getAdminIntervalsKeyboard(scheduleMinutes, ipFormatted).reply_markup,
      }
    );
    return;
  }
}

module.exports = {
  handleIntervalsCallback,
};
