const crypto = require('crypto');

// Обчислити хеш для даних графіка конкретної черги
function calculateHash(data, queueKey, todayTimestamp, tomorrowTimestamp) {
  try {
    const todayFact = data?.fact?.data?.[todayTimestamp]?.[queueKey] || {};
    const tomorrowFact = data?.fact?.data?.[tomorrowTimestamp]?.[queueKey] || {};

    if (Object.keys(todayFact).length === 0 && Object.keys(tomorrowFact).length === 0) {
      return null;
    }

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

module.exports = {
  calculateHash,
};
