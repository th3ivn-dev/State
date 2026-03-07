const { escapeHtml } = require('./format');

// Згенерувати повідомлення живого статусу
function generateLiveStatusMessage(user, regionName) {
  const statusIcon = user.power_state === 'on' ? '🟢' : '🔴';
  const statusText = user.power_state === 'on' ? 'Є світло' : 'Немає світла';

  let message = `${statusIcon} <b>${statusText}</b>\n\n`;
  message += `📍 Регіон: ${escapeHtml(regionName)}\n`;
  message += `🔢 Черга: ${escapeHtml(user.queue)}`;

  return message;
}

// Отримати username бота
async function getBotUsername(bot) {
  try {
    const me = await bot.api.getMe();
    return me.username;
  } catch (error) {
    console.error('Error getting bot username:', error);
    return null;
  }
}

// Отримати інструкції підключення каналу
function getChannelConnectionInstructions(botUsername) {
  return `Щоб підключити канал:
1. Додайте бота @${botUsername} до вашого каналу як адміністратора
2. Дайте боту права на публікацію повідомлень
3. Надішліть будь-яке повідомлення в канал
4. Переадресуйте це повідомлення мені`;
}

module.exports = {
  generateLiveStatusMessage,
  getBotUsername,
  getChannelConnectionInstructions,
};
