const { getAdminRouterKeyboard, getAdminRouterSetIpKeyboard, getAdminRouterStatsKeyboard } = require('../../keyboards/inline');
const { formatExactDuration, formatTime, isAdmin } = require('../../utils');
const config = require('../../config');
const { safeSendMessage, safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { forceCheckAdminRouter } = require('../../adminRouterMonitor');
const adminRoutersDb = require('../../database/adminRouters');
const { clearState, getState, setState } = require('../../state/stateManager');
const { isValidIPorDomain } = require('../settings');

// Callback handler for router monitoring callbacks
async function handleRouterCallback(bot, query, chatId, userId, data) {
  if (data === 'admin_router') {

    const routerData = await adminRoutersDb.getAdminRouter(userId);

    let message = '📡 <b>Моніторинг роутера</b>\n\n';

    if (!routerData || !routerData.router_ip) {
      message += '❌ IP роутера не налаштовано\n\n';
      message += 'Налаштуйте IP адресу вашого роутера\n';
      message += 'для моніторингу стану живлення/ДБЖ.';
    } else {
      const isOnline = routerData.last_state === 'online';
      const statusIcon = isOnline ? '🟢' : '🔴';
      const statusText = isOnline ? 'онлайн' : 'офлайн';

      message += `${statusIcon} Роутер ${statusText}\n`;
      message += `📍 IP: ${routerData.router_ip}\n`;

      // Calculate duration
      if (routerData.last_change_at) {
        const changeTime = new Date(routerData.last_change_at);
        const now = new Date();
        const durationSeconds = Math.floor((now - changeTime) / 1000);
        const durationStr = formatExactDuration(durationSeconds);
        message += `⏱️ ${isOnline ? 'Онлайн' : 'Офлайн'} вже: ${durationStr}\n`;
      }

      message += `🔔 Сповіщення: ${routerData.notifications_on ? 'увімк' : 'вимк'}\n`;

      // Show last offline event
      const history = await adminRoutersDb.getAdminRouterHistory(userId, 1);
      if (history.length > 0 && history[0].event_type === 'offline') {
        const event = history[0];
        const eventTime = new Date(event.event_at);
        const timeStr = formatTime(eventTime);
        const durationStr = event.duration_minutes
          ? formatExactDuration(event.duration_minutes * 60)
          : 'невідомо';
        message += `\nОстаннє відключення: ${timeStr} (тривалість ${durationStr})`;
      }
    }

    await safeEditMessageText(bot, message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      ...getAdminRouterKeyboard(routerData),
    });
    return;
  }

  if (data === 'admin_router_set_ip') {

    const routerData = await adminRoutersDb.getAdminRouter(userId);
    const currentIp = routerData?.router_ip || 'не налаштовано';

    await setState('conversation', userId, {
      state: 'waiting_for_admin_router_ip',
      messageId: query.message.message_id,
    });

    await safeEditMessageText(bot,
      `✏️ <b>Введіть IP адресу роутера</b>\n\n` +
      `Приклад: 192.168.1.1\n\n` +
      `Поточний IP: ${currentIp}`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        ...getAdminRouterSetIpKeyboard(),
      }
    );
    return;
  }

  if (data === 'admin_router_toggle_notify') {

    const newState = await adminRoutersDb.toggleAdminRouterNotifications(userId);

    if (newState !== null) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: newState ? '✅ Сповіщення увімкнено' : '❌ Сповіщення вимкнено',
      });

      // Refresh the screen
      const routerData = await adminRoutersDb.getAdminRouter(userId);

      let message = '📡 <b>Моніторинг роутера</b>\n\n';
      const isOnline = routerData.last_state === 'online';
      const statusIcon = isOnline ? '🟢' : '🔴';
      const statusText = isOnline ? 'онлайн' : 'офлайн';

      message += `${statusIcon} Роутер ${statusText}\n`;
      message += `📍 IP: ${routerData.router_ip}\n`;

      if (routerData.last_change_at) {
        const changeTime = new Date(routerData.last_change_at);
        const now = new Date();
        const durationSeconds = Math.floor((now - changeTime) / 1000);
        const durationStr = formatExactDuration(durationSeconds);
        message += `⏱️ ${isOnline ? 'Онлайн' : 'Офлайн'} вже: ${durationStr}\n`;
      }

      message += `🔔 Сповіщення: ${routerData.notifications_on ? 'увімк' : 'вимк'}\n`;

      const history = await adminRoutersDb.getAdminRouterHistory(userId, 1);
      if (history.length > 0 && history[0].event_type === 'offline') {
        const event = history[0];
        const eventTime = new Date(event.event_at);
        const timeStr = formatTime(eventTime);
        const durationStr = event.duration_minutes
          ? formatExactDuration(event.duration_minutes * 60)
          : 'невідомо';
        message += `\nОстаннє відключення: ${timeStr} (тривалість ${durationStr})`;
      }

      await safeEditMessageText(bot, message, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        ...getAdminRouterKeyboard(routerData),
      });
    }
    return;
  }

  if (data === 'admin_router_stats') {

    const stats24h = await adminRoutersDb.getAdminRouterStats(userId, 24);
    const stats7d = await adminRoutersDb.getAdminRouterStats(userId, 24 * 7);
    const history = await adminRoutersDb.getAdminRouterHistory(userId, 5);

    let message = '📊 <b>Статистика роутера</b>\n\n';

    // 24 hours stats
    message += '<b>За останні 24 години:</b>\n';
    message += `• Відключень: ${stats24h.offline_count}\n`;
    message += `• Загальний час офлайн: ${formatExactDuration(stats24h.total_offline_minutes * 60)}\n`;
    if (stats24h.longest_offline_minutes > 0) {
      message += `• Найдовше відключення: ${formatExactDuration(stats24h.longest_offline_minutes * 60)}\n`;
    }
    message += '\n';

    // 7 days stats
    message += '<b>За останні 7 днів:</b>\n';
    message += `• Відключень: ${stats7d.offline_count}\n`;
    message += `• Загальний час офлайн: ${formatExactDuration(stats7d.total_offline_minutes * 60)}\n`;
    if (stats7d.avg_offline_minutes > 0) {
      message += `• Середня тривалість: ${formatExactDuration(Math.round(stats7d.avg_offline_minutes) * 60)}\n`;
    }

    // Recent events
    if (history.length > 0) {
      message += '\n<b>Останні 5 подій:</b>\n';
      for (const event of history) {
        const eventTime = new Date(event.event_at);
        const timeStr = formatTime(eventTime);
        const icon = event.event_type === 'offline' ? '🔴' : '🟢';
        const durationStr = event.duration_minutes
          ? ` (${formatExactDuration(event.duration_minutes * 60)})`
          : '';
        message += `${icon} ${timeStr}${durationStr}\n`;
      }
    }

    await safeEditMessageText(bot, message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      ...getAdminRouterStatsKeyboard(),
    });
    return;
  }

  if (data === 'admin_router_refresh') {

    // Force check
    await forceCheckAdminRouter(userId);

    // Get updated data
    const routerData = await adminRoutersDb.getAdminRouter(userId);

    let message = '📡 <b>Моніторинг роутера</b>\n\n';
    const isOnline = routerData.last_state === 'online';
    const statusIcon = isOnline ? '🟢' : '🔴';
    const statusText = isOnline ? 'онлайн' : 'офлайн';

    message += `${statusIcon} Роутер ${statusText}\n`;
    message += `📍 IP: ${routerData.router_ip}\n`;

    if (routerData.last_change_at) {
      const changeTime = new Date(routerData.last_change_at);
      const now = new Date();
      const durationSeconds = Math.floor((now - changeTime) / 1000);
      const durationStr = formatExactDuration(durationSeconds);
      message += `⏱️ ${isOnline ? 'Онлайн' : 'Офлайн'} вже: ${durationStr}\n`;
    }

    message += `🔔 Сповіщення: ${routerData.notifications_on ? 'увімк' : 'вимк'}\n`;

    const history = await adminRoutersDb.getAdminRouterHistory(userId, 1);
    if (history.length > 0 && history[0].event_type === 'offline') {
      const event = history[0];
      const eventTime = new Date(event.event_at);
      const timeStr = formatTime(eventTime);
      const durationStr = event.duration_minutes
        ? formatExactDuration(event.duration_minutes * 60)
        : 'невідомо';
      message += `\nОстаннє відключення: ${timeStr} (тривалість ${durationStr})`;
    }

    await safeEditMessageText(bot, message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      ...getAdminRouterKeyboard(routerData),
    });

    await safeAnswerCallbackQuery(bot, query.id, {
      text: '🔄 Оновлено',
    });
    return;
  }
}

/**
 * Handle admin router IP conversation
 */
async function handleAdminRouterIpConversation(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);
  const text = msg.text;

  // Check if admin
  if (!isAdmin(telegramId, config.adminIds, config.ownerId)) {
    return false;
  }

  // Check conversation state
  const state = getState('conversation', telegramId);
  if (!state || state.state !== 'waiting_for_admin_router_ip') {
    return false;
  }

  try {
    // Validate IP address
    const validationResult = isValidIPorDomain(text);

    if (!validationResult.valid) {
      await safeSendMessage(bot, chatId, `❌ ${validationResult.error}`);
      return true;
    }

    // Save router IP
    await adminRoutersDb.setAdminRouterIP(telegramId, validationResult.address);
    await clearState('conversation', telegramId);

    // Get router data
    const routerData = await adminRoutersDb.getAdminRouter(telegramId);

    let message = '📡 <b>Моніторинг роутера</b>\n\n';
    message += `✅ IP адресу збережено: ${validationResult.address}\n\n`;

    if (routerData.last_state) {
      const isOnline = routerData.last_state === 'online';
      const statusIcon = isOnline ? '🟢' : '🔴';
      const statusText = isOnline ? 'онлайн' : 'офлайн';

      message += `${statusIcon} Роутер ${statusText}\n`;
      message += `📍 IP: ${routerData.router_ip}\n`;

      if (routerData.last_change_at) {
        const changeTime = new Date(routerData.last_change_at);
        const now = new Date();
        const durationSeconds = Math.floor((now - changeTime) / 1000);
        const durationStr = formatExactDuration(durationSeconds);
        message += `⏱️ ${isOnline ? 'Онлайн' : 'Офлайн'} вже: ${durationStr}\n`;
      }

      message += `🔔 Сповіщення: ${routerData.notifications_on ? 'увімк' : 'вимк'}\n`;
    } else {
      message += 'Моніторинг почнеться протягом 5 хвилин.';
    }

    // Edit the message if we have the message ID
    if (state.messageId) {
      await safeEditMessageText(bot, message, {
        chat_id: chatId,
        message_id: state.messageId,
        parse_mode: 'HTML',
        ...getAdminRouterKeyboard(routerData),
      });
    } else {
      await safeSendMessage(bot, chatId, message, {
        parse_mode: 'HTML',
        ...getAdminRouterKeyboard(routerData),
      });
    }

    return true;
  } catch (error) {
    console.error('Помилка в handleAdminRouterIpConversation:', error);
    // Don't clear state on error - let user retry
    await safeSendMessage(bot, chatId, '❌ Виникла помилка при збереженні IP адреси. Спробуйте ще раз:');
    return true;
  }
}

module.exports = {
  handleRouterCallback,
  handleAdminRouterIpConversation,
};
