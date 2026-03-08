// Generate Live Status message for settings screen
function generateLiveStatusMessage(user, regionName) {
  let message = '⚙️ <b>Налаштування</b>\n\nПоточні параметри:\n\n';

  // Power status section
  const hasPowerState = user.power_state !== null && user.power_state !== undefined;
  const hasIp = user.router_ip !== null && user.router_ip !== undefined;
  const hasChannel = user.channel_id !== null && user.channel_id !== undefined;
  // Notifications are enabled if is_active (master switch) is true
  const notificationsEnabled = user.is_active;

  if (hasIp) {
    if (hasPowerState) {
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
  }

  // Settings section
  message += `📍 Регіон: ${regionName} • ${user.queue}\n`;
  message += `📺 Канал: ${hasChannel ? 'підключено ✅' : 'не підключено'}\n`;
  message += `📡 IP: ${hasIp ? 'підключено ✅' : 'не підключено'}\n`;
  message += `🔔 Сповіщення: ${notificationsEnabled ? 'увімкнено ✅' : 'вимкнено'}\n`;

  message += '\nКерування:';

  return message;
}

module.exports = { generateLiveStatusMessage };