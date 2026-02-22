/**
 * Безпечні операції з Telegram Bot API
 * Забезпечує надійну обробку помилок для всіх критичних операцій
 */

const { InputFile } = require('grammy');
const { createLogger } = require('./logger');
const logger = createLogger('ErrorHandler');

/**
 * Безпечна відправка повідомлення
 * @param {Object} bot - Екземпляр Telegram бота
 * @param {String|Number} chatId - ID чату
 * @param {String} text - Текст повідомлення
 * @param {Object} options - Додаткові опції (parse_mode, reply_markup тощо)
 * @returns {Promise<Object|null>} - Відправлене повідомлення або null при помилці
 */
async function safeSendMessage(bot, chatId, text, options = {}) {
  try {
    return await bot.api.sendMessage(chatId, text, options);
  } catch (error) {
    logger.error(`Помилка відправки повідомлення ${chatId}:`, { error: error.message });
    return null;
  }
}

/**
 * Безпечне видалення повідомлення
 * @param {Object} bot - Екземпляр Telegram бота
 * @param {String|Number} chatId - ID чату
 * @param {Number} messageId - ID повідомлення
 * @returns {Promise<Boolean>} - true якщо успішно, false при помилці
 */
async function safeDeleteMessage(bot, chatId, messageId) {
  try {
    await bot.api.deleteMessage(chatId, messageId);
    return true;
  } catch (error) {
    // Ігноруємо — повідомлення могло бути вже видалене
    return false;
  }
}

/**
 * Безпечне редагування повідомлення
 * @param {Object} bot - Екземпляр Telegram бота
 * @param {String|Number} chatId - ID чату
 * @param {Number} messageId - ID повідомлення
 * @param {String} text - Новий текст повідомлення
 * @param {Object} options - Додаткові опції
 * @returns {Promise<Object|null>} - Відредаговане повідомлення або null при помилці
 */
async function safeEditMessage(bot, chatId, messageId, text, options = {}) {
  try {
    return await bot.api.editMessageText(chatId, messageId, text, options);
  } catch (error) {
    logger.error(`Помилка редагування повідомлення:`, { error: error.message });
    return null;
  }
}

/**
 * Безпечне редагування тексту повідомлення з обробкою помилки "message is not modified"
 * @param {Object} bot - Екземпляр Telegram бота
 * @param {String} text - Новий текст повідомлення
 * @param {Object} options - Опції (chat_id, message_id, parse_mode, reply_markup тощо)
 * @returns {Promise<Object|null>} - Відредаговане повідомлення або null
 */
async function safeEditMessageText(bot, text, options = {}) {
  try {
    const { chat_id, message_id, ...other } = options;
    return await bot.api.editMessageText(chat_id, message_id, text, other);
  } catch (error) {
    const errorMessage = error.message || '';
    // grammY includes the Telegram description in error.message; node-telegram-bot-api uses error.response
    const errorDescription = error.response?.body?.description || '';
    
    // Ігноруємо помилку "message is not modified" — це нормальна ситуація
    // Виникає коли користувач натискає ту саму кнопку двічі
    if (errorDescription.includes('message is not modified') ||
        errorMessage.includes('message is not modified')) {
      // Повідомлення вже актуальне, нічого робити не потрібно
      return null;
    }
    
    // Обробляємо помилку "there is no text in the message to edit" — це очікувана ситуація
    // Виникає коли намагаємось редагувати повідомлення з фото (яке має caption замість тексту)
    // Викидаємо без логування, оскільки викликач (напр. bot.js:back_to_main) обробляє
    // цю помилку через try-catch і реалізує fallback (видалення старого повідомлення + відправка нового)
    if (errorDescription.includes('there is no text in the message to edit') ||
        errorMessage.includes('there is no text in the message to edit')) {
      throw error;
    }
    
    // Інші помилки логуємо з повним контекстом
    logger.error(`Помилка редагування тексту повідомлення:`, { 
      error: error.message,
      code: error.code,
      description: errorDescription
    });
    throw error;
  }
}

/**
 * Безпечна відправка фото
 * @param {Object} bot - Екземпляр Telegram бота
 * @param {String|Number} chatId - ID чату
 * @param {String|Buffer} photo - Фото (file_id, URL, або Buffer)
 * @param {Object} options - Додаткові опції (caption, parse_mode тощо)
 * @param {Object} fileOpts - Опції файлу (filename, contentType)
 * @returns {Promise<Object|null>} - Відправлене повідомлення або null при помилці
 */
async function safeSendPhoto(bot, chatId, photo, options = {}, fileOpts = {}) {
  try {
    const input = Buffer.isBuffer(photo) ? new InputFile(photo, 'schedule.png') : photo;
    return await bot.api.sendPhoto(chatId, input, options);
  } catch (error) {
    logger.error(`Помилка відправки фото ${chatId}:`, { error: error.message });
    return null;
  }
}

/**
 * Безпечна відповідь на callback query
 * @param {Object} bot - Екземпляр Telegram бота
 * @param {String} callbackQueryId - ID callback query
 * @param {Object} options - Додаткові опції (text, show_alert тощо)
 * @returns {Promise<Boolean>} - true якщо успішно, false при помилці
 */
async function safeAnswerCallbackQuery(bot, callbackQueryId, options = {}) {
  try {
    await bot.api.answerCallbackQuery(callbackQueryId, options);
    return true;
  } catch (error) {
    logger.error(`Помилка відповіді на callback query:`, { error: error.message });
    return false;
  }
}

/**
 * Безпечна зміна назви чату з обробкою "not modified" помилок
 * @param {Object} bot - Екземпляр Telegram бота
 * @param {String|Number} chatId - ID чату/каналу
 * @param {String} title - Нова назва
 * @returns {Promise<Boolean>} - true якщо успішно, false при помилці
 */
async function safeSetChatTitle(bot, chatId, title) {
  try {
    await bot.api.setChatTitle(chatId, title);
    return true;
  } catch (error) {
    // Ігноруємо помилку "chat title is not modified"
    // grammY: error.message includes the description; node-telegram-bot-api: error.response.body.description
    const errorMessage = error.message || '';
    const errorDescription = error.response?.body?.description || '';
    if (errorMessage.includes('title is not modified') ||
        errorDescription.includes('title is not modified')) {
      logger.info(`Назва чату ${chatId} вже актуальна, пропускаємо`);
      return true;
    }
    logger.error(`Помилка зміни назви чату ${chatId}:`, { error: error.message });
    throw error;
  }
}

/**
 * Безпечна зміна опису чату з обробкою "not modified" помилок
 * @param {Object} bot - Екземпляр Telegram бота
 * @param {String|Number} chatId - ID чату/каналу
 * @param {String} description - Новий опис
 * @returns {Promise<Boolean>} - true якщо успішно, false при помилці
 */
async function safeSetChatDescription(bot, chatId, description) {
  try {
    await bot.api.setChatDescription(chatId, { description: description });
    return true;
  } catch (error) {
    // Ігноруємо помилку "chat description is not modified"
    // grammY: error.message includes the description; node-telegram-bot-api: error.response.body.description
    const errorMessage = error.message || '';
    const errorDescription = error.response?.body?.description || '';
    if (errorMessage.includes('description is not modified') ||
        errorDescription.includes('description is not modified')) {
      logger.info(`Опис чату ${chatId} вже актуальний, пропускаємо`);
      return true;
    }
    logger.error(`Помилка зміни опису чату ${chatId}:`, { error: error.message });
    throw error;
  }
}

/**
 * Безпечна зміна фото чату
 * @param {Object} bot - Екземпляр Telegram бота
 * @param {String|Number} chatId - ID чату/каналу
 * @param {String|Buffer} photo - Фото (file_id, URL, або Buffer)
 * @param {Object} options - Додаткові опції
 * @param {Object} fileOpts - Опції файлу
 * @returns {Promise<Boolean>} - true якщо успішно, false при помилці
 */
async function safeSetChatPhoto(bot, chatId, photo, options = {}, fileOpts = {}) {
  try {
    await bot.api.setChatPhoto(chatId, photo);
    return true;
  } catch (error) {
    logger.error(`Помилка зміни фото чату ${chatId}:`, { error: error.message });
    throw error;
  }
}

module.exports = {
  safeSendMessage,
  safeDeleteMessage,
  safeEditMessage,
  safeEditMessageText,
  safeSendPhoto,
  safeAnswerCallbackQuery,
  safeSetChatTitle,
  safeSetChatDescription,
  safeSetChatPhoto
};
