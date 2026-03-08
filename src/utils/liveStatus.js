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

  // Settings section — регіон та черга жирним
  message += `📍 <b>${regionName} · ${user.queue}</b>\n\n`;

  message += `📡 IP: ${hasIp ? 'підключено ✅' : 'не підключено 😕'}\n`;
  message += `📺 Канал: ${hasChannel ? 'підключено ✅' : 'не підключено'}\n`;
  message += `🔔 Сповіщення: ${notificationsEnabled ? 'увімкнено ✅' : 'вимкнено'}\n`;

  if (!hasIp) {
    message += '\n<i>💡 Додайте IP для точного моніторингу світла</i>';
  }

  if (hasIp && notificationsEnabled) {
    message += '\n✅ Моніторинг активний';
  }

  return message;
}

module.exports = { generateLiveStatusMessage };