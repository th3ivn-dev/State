const { isAdmin } = require('../../utils');
const config = require('../../config');
const { monitoringManager } = require('../../monitoring/monitoringManager');

// Обробник команди /monitoring
async function handleMonitoring(bot, msg) {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  if (!isAdmin(userId, config.adminIds, config.ownerId)) {
    await bot.api.sendMessage(chatId, '❓ Невідома команда. Використовуйте /start для початку.');
    return;
  }

  try {
    const status = await monitoringManager.getStatus();
    const metricsCollector = monitoringManager.getMetricsCollector();
    const alertManager = monitoringManager.getAlertManager();

    // Get metrics
    const metrics = await metricsCollector.collectAllMetrics();
    const alertsSummary = alertManager.getAlertsSummary();

    // Format message
    let message = '🔎 <b>Система моніторингу</b>\n\n';

    // Status
    message += `<b>Статус:</b> ${status.isRunning ? '🟢 Активна' : '🔴 Неактивна'}\n`;
    message += `<b>Інтервал:</b> ${status.config.checkIntervalMinutes} хв\n\n`;

    // System metrics
    message += '<b>📊 Система:</b>\n';
    message += `• Uptime: ${metrics.system.uptimeFormatted}\n`;
    message += `• Памʼять: ${metrics.system.memory.heapUsedMB}MB (${metrics.system.memory.heapUsedPercent}%)\n`;
    message += `• Рестарти: ${metrics.system.restartCount}\n\n`;

    // Application metrics
    message += '<b>⚙️ Застосунок:</b>\n';
    message += `• Режим паузи: ${metrics.application.botPaused ? '🔴 ТАК' : '🟢 НІ'}\n`;
    message += `• Помилок: ${metrics.application.errorCount} (унікальних: ${metrics.application.uniqueErrors})\n\n`;

    // Business metrics
    message += '<b>📈 Бізнес:</b>\n';
    message += `• Всього користувачів: ${metrics.business.totalUsers}\n`;
    message += `• Активні: ${metrics.business.activeUsers}\n`;
    message += `• DAU: ${metrics.business.dau}\n`;
    message += `• WAU: ${metrics.business.wau}\n`;
    message += `• Каналів: ${metrics.business.channelsConnected}\n`;
    message += `• IP моніторингів: ${metrics.business.ipsMonitored}\n\n`;

    // Alerts summary
    message += '<b>🚨 Алерти:</b>\n';
    message += `• За годину: ${alertsSummary.lastHour}\n`;
    message += `• За добу: ${alertsSummary.lastDay}\n`;
    message += `• INFO: ${alertsSummary.byLevel.INFO}\n`;
    message += `• WARN: ${alertsSummary.byLevel.WARN}\n`;
    message += `• CRITICAL: ${alertsSummary.byLevel.CRITICAL}\n\n`;

    // Alert channel
    const alertChannelId = alertManager.config.alertChannelId;
    message += '<b>📢 Канал для алертів:</b>\n';
    message += alertChannelId ? `✅ Налаштовано: ${alertChannelId}` : '❌ Не налаштовано';
    message += '\n\nДля налаштування канала:\n';
    message += '/setalertchannel <channel_id>';

    await bot.api.sendMessage(chatId, message, { parse_mode: 'HTML' });

  } catch (error) {
    console.error('Помилка в handleMonitoring:', error);
    await bot.api.sendMessage(chatId, '❌ Виникла помилка при отриманні статусу моніторингу.');
  }
}

// Обробник команди /setalertchannel
async function handleSetAlertChannel(bot, msg, match) {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  if (!isAdmin(userId, config.adminIds, config.ownerId)) {
    await bot.api.sendMessage(chatId, '❓ Невідома команда. Використовуйте /start для початку.');
    return;
  }

  try {
    const channelId = match[1].trim();

    // Validate channel ID format
    if (!channelId.startsWith('@') && !channelId.startsWith('-')) {
      await bot.api.sendMessage(
        chatId,
        '❌ Невірний формат ID каналу.\n\n' +
        'Використайте:\n' +
        '• @username для публічних каналів\n' +
        '• -100xxxxxxxxxx для приватних каналів\n\n' +
        'Приклад: /setalertchannel @my_alerts_channel'
      );
      return;
    }

    // Try to send a test message to verify bot has access
    try {
      await bot.api.sendMessage(
        channelId,
        '✅ Канал для алертів налаштовано успішно!\n\n' +
        'Тут будуть публікуватися алерти системи моніторингу.',
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      await bot.api.sendMessage(
        chatId,
        '❌ Не вдалося надіслати повідомлення в канал.\n\n' +
        'Перевірте:\n' +
        '• Бот доданий до каналу як адміністратор\n' +
        '• Бот має право публікувати повідомлення\n' +
        '• ID каналу вказано правильно\n\n' +
        `Помилка: ${error.message}`
      );
      return;
    }

    // Configure alert channel
    monitoringManager.setAlertChannel(channelId);

    await bot.api.sendMessage(
      chatId,
      `✅ Канал для алертів налаштовано: ${channelId}\n\n` +
      'Тепер усі алерти системи моніторингу будуть публікуватися в цьому каналі.',
      { parse_mode: 'HTML' }
    );

  } catch (error) {
    console.error('Помилка в handleSetAlertChannel:', error);
    await bot.api.sendMessage(chatId, '❌ Виникла помилка при налаштуванні каналу.');
  }
}

module.exports = {
  handleMonitoring,
  handleSetAlertChannel,
};
