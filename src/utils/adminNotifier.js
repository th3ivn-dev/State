/**
 * Система автоматичного сповіщення адмінів про помилки в боті
 * Надсилає повідомлення через Telegram про будь-які помилки що виникають
 */

const config = require('../config');

// Rate limiting для запобігання спаму
const errorNotifications = new Map();
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 хвилин
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 хвилин

// Лічильник повторних помилок
const errorCounts = new Map();

/**
 * Екранування HTML спецсимволів для безпечного відображення в Telegram
 * @param {string} text - Текст для екранування
 * @returns {string} - Екранований текст
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Отримати ключ для rate limiting (перші 100 символів повідомлення помилки)
 * @param {Error|string} error - Помилка
 * @returns {string} - Ключ для rate limiting
 */
function getRateLimitKey(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.substring(0, 100);
}

/**
 * Форматувати timestamp у форматі uk-UA з timezone Europe/Kyiv
 * @returns {string} - Відформатований timestamp
 */
function formatTimestamp() {
  return new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
}

/**
 * Надіслати сповіщення про помилку всім адмінам та овнеру
 * @param {Object} bot - Інстанс Telegram бота
 * @param {Error|string} error - Об'єкт Error або рядок з описом помилки
 * @param {string} context - Контекст де виникла помилка
 */
async function notifyAdminsAboutError(bot, error, context) {
  try {
    // Перевірка чи bot ініціалізований
    if (!bot) {
      console.error('notifyAdminsAboutError: bot не ініціалізований');
      return;
    }

    // Перевіряємо чи це помилка яку НЕ треба логувати
    const errorMessage = error instanceof Error ? error.message : String(error);
    const skipPatterns = [
      'bot was blocked by the user',
      'chat not found',
      'ETELEGRAM 409 Conflict',
      '409: Conflict',
      'terminated by other getUpdates request'
    ];
    
    if (skipPatterns.some(pattern => errorMessage.includes(pattern))) {
      // Це нормальна ситуація, не сповіщаємо адмінів
      return;
    }

    // Отримуємо список адмінів
    const adminList = [];
    if (config.ownerId) {
      adminList.push(config.ownerId);
    }
    if (config.adminIds && Array.isArray(config.adminIds)) {
      adminList.push(...config.adminIds);
    }

    // Якщо немає адмінів - виходимо
    if (adminList.length === 0) {
      return;
    }

    // Rate limiting - перевіряємо чи не надсилали недавно таку саму помилку
    const rateLimitKey = getRateLimitKey(error);
    const now = Date.now();
    const lastNotification = errorNotifications.get(rateLimitKey);

    if (lastNotification && (now - lastNotification) < RATE_LIMIT_MS) {
      // Збільшуємо лічильник повторних помилок
      const currentCount = errorCounts.get(rateLimitKey) || 0;
      errorCounts.set(rateLimitKey, currentCount + 1);
      return;
    }

    // Отримуємо кількість пропущених повторень
    const repeatCount = errorCounts.get(rateLimitKey) || 0;
    
    // Оновлюємо час останнього сповіщення
    errorNotifications.set(rateLimitKey, now);
    errorCounts.set(rateLimitKey, 0);

    // Формуємо повідомлення
    const stackTrace = error instanceof Error && error.stack 
      ? error.stack.substring(0, 500) 
      : '';

    let message = '🚨 <b>Помилка в боті</b>\n\n';
    message += `📍 Контекст: <code>${escapeHtml(context)}</code>\n`;
    message += `⏰ Час: ${formatTimestamp()}\n`;
    
    if (repeatCount > 0) {
      message += `🔄 Повторів: ${repeatCount}\n`;
    }
    
    message += `\n❌ <b>Помилка:</b>\n`;
    message += `<code>${escapeHtml(errorMessage)}</code>\n`;

    if (stackTrace) {
      message += `\n📋 <b>Stack trace:</b>\n`;
      message += `<code>${escapeHtml(stackTrace)}</code>`;
    }

    // Надсилаємо повідомлення кожному адміну окремо
    for (const adminId of adminList) {
      try {
        await bot.api.sendMessage(adminId, message, { parse_mode: 'HTML' });
      } catch (sendError) {
        // Ігноруємо помилки відправки окремим адмінам
        // (можливо бот заблокований або chat не існує)
        console.error(`Не вдалося надіслати повідомлення адміну ${adminId}:`, sendError.message);
      }
    }

  } catch (error) {
    // Ніколи не кидати виняток з цієї функції
    console.error('Помилка в notifyAdminsAboutError:', error);
  }
}

// Автоматична очистка старих записів з Map кожні 30 хвилин
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  const cutoffTime = now - RATE_LIMIT_MS;

  // Очищаємо старі записи
  for (const [key, timestamp] of errorNotifications.entries()) {
    if (timestamp < cutoffTime) {
      errorNotifications.delete(key);
      errorCounts.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

// Дозволяємо процесу завершитися якщо інтервал є єдиним таймером
cleanupInterval.unref();

/**
 * Зупинити автоматичну очистку та очистити всі дані
 * Корисно для тестування та graceful shutdown
 */
function stopCleanup() {
  clearInterval(cleanupInterval);
  errorNotifications.clear();
  errorCounts.clear();
}

module.exports = {
  notifyAdminsAboutError,
  stopCleanup
};
