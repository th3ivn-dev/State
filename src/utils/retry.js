/**
 * Утиліта для повторних спроб при невдалих операціях
 * Використовує експоненційний backoff для зменшення навантаження
 */

const { createLogger } = require('./logger');
const logger = createLogger('Retry');

/**
 * Виконує функцію з повторними спробами при помилках
 * @param {Function} fn - Функція для виконання
 * @param {Object} options - Опції повторних спроб
 * @param {Number} options.maxAttempts - Максимальна кількість спроб (за замовчуванням: 3)
 * @param {Number} options.delayMs - Початкова затримка в мс (за замовчуванням: 1000)
 * @param {Number} options.backoff - Множник для експоненційного backoff (за замовчуванням: 2)
 * @returns {Promise<*>} - Результат виконання функції
 * @throws {Error} - Остання помилка якщо всі спроби невдалі
 */
async function withRetry(fn, options = {}) {
  const { maxAttempts = 3, delayMs = 1000, backoff = 2 } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts;

      if (isLastAttempt) {
        throw error;
      }

      // Експоненційний backoff: перша спроба чекає delayMs, друга - delayMs * backoff, тощо
      const delay = delayMs * Math.pow(backoff, attempt - 1);
      logger.info(`Спроба ${attempt}/${maxAttempts} не вдалась, повтор через ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Виконує функцію з повторними спробами для специфічних типів помилок
 * @param {Function} fn - Функція для виконання
 * @param {Object} options - Опції повторних спроб
 * @param {Function} options.shouldRetry - Функція для визначення чи потрібна повторна спроба
 * @param {Number} options.maxAttempts - Максимальна кількість спроб
 * @param {Number} options.delayMs - Початкова затримка
 * @param {Number} options.backoff - Множник backoff
 * @returns {Promise<*>} - Результат виконання функції
 */
async function withConditionalRetry(fn, options = {}) {
  const {
    shouldRetry = () => true,
    maxAttempts = 3,
    delayMs = 1000,
    backoff = 2
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts;
      const shouldRetryError = shouldRetry(error);

      if (isLastAttempt || !shouldRetryError) {
        throw error;
      }

      const delay = delayMs * Math.pow(backoff, attempt - 1);
      logger.info(`Спроба ${attempt}/${maxAttempts} не вдалась (${error.message}), повтор через ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

module.exports = { withRetry, withConditionalRetry };
