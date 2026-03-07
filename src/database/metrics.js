const { pool } = require('./pool');

/**
 * Перевірка здоров'я пулу підключень
 */
async function checkPoolHealth() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('✅ Database connection verified');
  } finally {
    client.release();
  }
}

/**
 * Логування метрик пулу
 */
let poolMetricsInterval = null;

function startPoolMetricsLogging() {
  const { POOL_STATS_LOG_INTERVAL_MS } = require('../constants/timeouts');

  if (poolMetricsInterval) {
    return; // Already running
  }

  poolMetricsInterval = setInterval(() => {
    console.log(`[DB] Pool: total=${pool.totalCount} idle=${pool.idleCount} waiting=${pool.waitingCount}`);
  }, POOL_STATS_LOG_INTERVAL_MS);
}

function stopPoolMetricsLogging() {
  if (poolMetricsInterval) {
    clearInterval(poolMetricsInterval);
    poolMetricsInterval = null;
  }
}

module.exports = { checkPoolHealth, startPoolMetricsLogging, stopPoolMetricsLogging };
