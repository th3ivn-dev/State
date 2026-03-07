const logger = require('../utils/logger');
// Кешуємо username бота щоб не робити повторні API виклики
let cachedBotUsername = null;
let botUsernamePromise = null; // Кешуємо promise для обробки конкурентних викликів

// Функція для отримання username бота (з кешуванням)
function getBotUsername(bot) {
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
      logger.error('Помилка отримання інформації про бота', { error });
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

module.exports = { getBotUsername, getChannelConnectionInstructions };
