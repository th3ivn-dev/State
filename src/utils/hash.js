const crypto = require('crypto');
const logger = require('../utils/logger');

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
    logger.error('Помилка обчислення хешу', { message: error.message });
    return null;
  }
}

module.exports = { calculateHash };
