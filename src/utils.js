const crypto = require('crypto');

// Обчислити хеш для даних графіка конкретної черги
// NOTE: This hash is used for COARSE change detection in scheduler.js
// It hashes the raw API data (SHA-256) to detect if anything changed at all.
// The publisher.js uses a separate MD5 hash of parsed events for FINE deduplication.
// This dual-hash strategy is intentional:
// - utils.calculateHash (SHA-256, raw API) → triggers publication check
// - publisher.calculateScheduleHash (MD5, parsed events) → prevents duplicate publications
function calculateHash(data, queueKey, todayTimestamp, tomorrowTimestamp) {
  try {
    // Отримуємо дані тільки для конкретної черги
    const todayFact = data?.fact?.data?.[todayTimestamp]?.[queueKey] || {};
    const tomorrowFact = data?.fact?.data?.[tomorrowTimestamp]?.[queueKey] || {};
    
    // Якщо немає даних для черги, повертаємо null
    if (Object.keys(todayFact).length === 0 && Object.keys(tomorrowFact).length === 0) {
      return null;
    }
    
    // Хешуємо дані черги + стабільний timestamp з API
    // ВАЖЛИВО: використовуємо data.fact.today замість параметра todayTimestamp
    // бо data.fact.today - стабільний timestamp з API
    const hashData = {
      todayFact,
      tomorrowFact,
      todayTimestamp: data?.fact?.today || todayTimestamp
    };
    
    return crypto.createHash('sha256').update(JSON.stringify(hashData)).digest('hex');
  } catch (error) {
    console.error('Помилка обчислення хешу:', error.message);
    return null;
  }
}

// Форматувати час для відображення
function formatTime(date) {
  if (!date) return 'невідомо';
  
  try {
    const d = new Date(date);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch (error) {
    return 'невідомо';
  }
}

// Форматувати дату для відображення
function formatDate(date) {
  if (!date) return 'невідомо';
  
  try {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  } catch (error) {
    return 'невідомо';
  }
}

// Форматувати дату та час
function formatDateTime(date) {
  if (!date) return 'невідомо';
  return `${formatDate(date)} ${formatTime(date)}`;
}

// Обчислити різницю в хвилинах між двома датами
function getMinutesDifference(date1, date2 = new Date()) {
  try {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.floor((d1 - d2) / (1000 * 60));
  } catch (error) {
    return null;
  }
}

// Форматувати час, що залишився
function formatTimeRemaining(minutes) {
  if (minutes < 0) return 'минуло';
  if (minutes === 0) return 'зараз';
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours > 0 && mins > 0) {
    return `${hours} год ${mins} хв`;
  } else if (hours > 0) {
    return `${hours} год`;
  }
  return `${mins} хв`;
}

// Перевірити, чи є користувач адміном
function isAdmin(userId, adminIds, ownerId = null) {
  const userIdStr = String(userId);
  
  // Check if user is the owner first (owner has all admin rights)
  if (ownerId && userIdStr === String(ownerId)) {
    return true;
  }
  
  // Check if user is in admin list
  return adminIds.includes(userIdStr);
}

// Екранувати HTML символи для Telegram
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Парсити час з рядка (формат HH:MM)
function parseTime(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  const now = new Date();
  const time = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
  return time;
}

// Отримати поточний час у timezone
function getCurrentTime() {
  return new Date();
}

// Форматувати uptime для відображення
function formatUptime(seconds) {
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days} д`);
  if (hours > 0) parts.push(`${hours} год`);
  if (minutes > 0) parts.push(`${minutes} хв`);
  
  return parts.join(' ') || '< 1 хв';
}

// Форматувати тривалість з мілісекунд
function formatDurationFromMs(ms) {
  const hours = ms / (1000 * 60 * 60);
  
  if (hours >= 1) {
    // Format as decimal hours (e.g., "1.5 год") but omit .0 for whole hours
    const formattedHours = hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1);
    return `${formattedHours} год`;
  }
  
  const minutes = Math.floor(ms / (1000 * 60));
  if (minutes > 0) return `${minutes} хв`;
  return '< 1 хв';
}

// Форматувати розмір пам'яті
function formatMemory(bytes) {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(2)} MB`;
}

// Форматувати точну тривалість українською мовою
function formatExactDuration(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);
  
  // Тільки хвилини
  if (hours === 0) {
    if (minutes === 0) return 'менше хвилини';
    return `${minutes} хв`;
  }
  
  // Тільки години
  if (minutes === 0) {
    return `${hours} год`;
  }
  
  // Години + хвилини
  return `${hours} год ${minutes} хв`;
}

// Форматувати інтервал в секундах для відображення
function formatInterval(seconds) {
  if (seconds < 60) {
    // Менше 60 секунд - показуємо в секундах
    return `${seconds} сек`;
  } else {
    // 60+ секунд - показуємо в хвилинах
    const minutes = seconds / 60;
    // Якщо ділиться націло - показуємо як ціле число хвилин
    if (Number.isInteger(minutes)) {
      return `${minutes} хв`;
    } else {
      // Якщо не ділиться націло - показуємо в секундах для точності
      return `${seconds} сек`;
    }
  }
}

// Форматувати тривалість в секундах згідно з вимогами Task 7
function formatDuration(seconds) {
  if (seconds < 60) {
    return '< 1 хв';
  }
  
  const totalMinutes = Math.floor(seconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);
  
  if (totalDays >= 1) {
    const hours = totalHours % 24;
    // Proper Ukrainian pluralization for days
    let dayWord = 'день';
    if (totalDays >= 5 || totalDays === 0) {
      dayWord = 'днів';
    } else if (totalDays >= 2) {
      dayWord = 'дні';
    }
    
    if (hours > 0) {
      return `${totalDays} ${dayWord} ${hours} год`;
    }
    return `${totalDays} ${dayWord}`;
  }
  
  if (totalHours >= 1) {
    const minutes = totalMinutes % 60;
    if (minutes > 0) {
      return `${totalHours} год ${minutes} хв`;
    }
    return `${totalHours} год`;
  }
  
  return `${totalMinutes} хв`;
}

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
    // No IP configured
    message += '⚪ Світло зараз: Невідомо\n\n';
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

// Кешуємо username бота щоб не робити повторні API виклики
let cachedBotUsername = null;
let botUsernamePromise = null; // Кешуємо promise для обробки конкурентних викликів

// Функція для отримання username бота (з кешуванням)
async function getBotUsername(bot) {
  // Якщо вже є кешоване значення, повертаємо його
  if (cachedBotUsername) {
    return cachedBotUsername;
  }
  
  // Якщо вже є активний запит, чекаємо на його завершення
  if (botUsernamePromise) {
    return botUsernamePromise;
  }
  
  // Створюємо новий запит і кешуємо promise
  botUsernamePromise = (async () => {
    try {
      const botInfo = await bot.api.getMe();
      cachedBotUsername = `@${botInfo.username}`;
      return cachedBotUsername;
    } catch (error) {
      console.error('Помилка отримання інформації про бота:', error);
      // Не кешуємо помилку - дозволяємо повторні спроби
      botUsernamePromise = null;
      return 'цей_бот'; // Fallback value in Ukrainian for consistency
    }
  })();
  
  return botUsernamePromise;
}

// Генерує текст інструкції для підключення каналу
function getChannelConnectionInstructions(botUsername) {
  return (
    `📺 <b>Підключення каналу</b>\n\n` +
    `Щоб бот міг публікувати графіки у ваш канал:\n\n` +
    `1️⃣ Відкрийте ваш канал у Telegram\n` +
    `2️⃣ Перейдіть у Налаштування каналу → Адміністратори\n` +
    `3️⃣ Натисніть "Додати адміністратора"\n` +
    `4️⃣ Знайдіть бота: ${botUsername}\n` +
    `5️⃣ Надайте права на публікацію повідомлень\n\n` +
    `Після цього натисніть кнопку "✅ Перевірити" нижче.\n\n` +
    `💡 <b>Порада:</b> скопіюйте ${botUsername} і вставте у пошук`
  );
}

module.exports = {
  calculateHash,
  formatTime,
  formatDate,
  formatDateTime,
  getMinutesDifference,
  formatTimeRemaining,
  isAdmin,
  escapeHtml,
  parseTime,
  getCurrentTime,
  formatUptime,
  formatMemory,
  formatDurationFromMs,
  formatExactDuration,
  formatInterval,
  formatDuration,
  generateLiveStatusMessage,
  getBotUsername,
  getChannelConnectionInstructions,
};
