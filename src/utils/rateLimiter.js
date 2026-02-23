/**
 * Rate Limiter для захисту від перевантаження Telegram API
 * Забезпечує дотримання лімітів API (30 повідомлень/сек)
 */

class RateLimiter {
  /**
   * Створює новий Rate Limiter
   * @param {Number} maxRequests - Максимальна кількість запитів у вікні
   * @param {Number} windowMs - Розмір вікна в мілісекундах
   */
  constructor(maxRequests = 30, windowMs = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  /**
   * Отримує дозвіл на виконання запиту (очікує якщо потрібно)
   * @returns {Promise<void>}
   */
  async acquire() {
    const now = Date.now();
    // Видаляємо старі запити поза вікном
    this.requests = this.requests.filter(time => now - time < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = Math.max(0, this.windowMs - (now - oldestRequest));
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      // Оновлюємо список після очікування
      const afterWait = Date.now();
      this.requests = this.requests.filter(time => afterWait - time < this.windowMs);
    }

    this.requests.push(Date.now());
  }

  /**
   * Скидає всі записи про запити
   */
  reset() {
    this.requests = [];
  }

  /**
   * Отримує поточну кількість запитів у вікні
   * @returns {Number}
   */
  getCurrentCount() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    return this.requests.length;
  }
}

// Глобальний rate limiter для Telegram API (30 повідомлень/сек)
const telegramRateLimiter = new RateLimiter(30, 1000);

// Rate limiter для групових повідомлень (20 повідомлень/хв)
const groupMessageRateLimiter = new RateLimiter(20, 60000);

module.exports = { RateLimiter, telegramRateLimiter, groupMessageRateLimiter };
