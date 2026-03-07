// Generate Live Status message for settings screen
function generateLiveStatusMessage(user, regionName) {
  let message = '';

  // Power status section
  const hasPowerState = user.power_state !== null && user.power_state !== undefined;
  const hasIp = user.router_ip !== null && user.router_ip !== undefined;
  const hasChannel = user.channel_id !== null && user.channel_id !== undefined;
  // Notifications are enabled if is_active (master switch) is true AND alerts_off is enabled
  const notificationsEnabled = user.is_active && user.alerts_off_enabled;

  if (!hasIp) {
    // Не показуємо статус світла якщо IP не налаштовано
  } else if (hasPowerState) {
    // Has IP and power state
    const powerOn = user.power_state === 'on';
    message += powerOn ? '🟢 Світло зараз: Є\n' : '🔴 Світло зараз: Немає\n';

    // Add update time if available
    // power_changed_at is expected to be an ISO 8601 datetime string (e.g., "2026-02-02T14:30:00.000Z")
    if (user.power_changed_at) {
      const updateDate = new Date(user.power_changed_at);
      const hours = String(updateDate.getHours()).padStart(2, '0');
      const minutes = String(updateDate.getMinutes()).padStart(2, '0');
      message += `🕓 Оновлено: ${hours}:${minutes}\n\n`;
    } else {
      message += '\n';
    }
  } else {
    // Has IP but no power state yet
    message += '⚪ Світло зараз: Невідомо\n\n';
  }

  // Settings section
  message += `📍 ${regionName} · ${user.queue}\n`;
  message += `📡 IP: ${hasIp ? 'підключено' : 'не підключено'}\n`;

  // Special messages based on configuration
  if (!hasIp) {
    message += '⚠️ Налаштуйте IP для моніторингу світла\n';
  }

  message += `📺 Канал: ${hasChannel ? 'підключено' : 'не підключено'}\n`;

  if (!hasChannel && hasIp) {
    message += 'ℹ️ Сповіщення приходитимуть лише в бот\n';
  }

  message += `🔔 Сповіщення: ${notificationsEnabled ? 'увімкнено' : 'вимкнено'}\n`;

  // Monitoring active message
  if (hasIp && notificationsEnabled) {
    message += '\n✅ Моніторинг активний';
  }

  return message;
}

module.exports = { generateLiveStatusMessage };
