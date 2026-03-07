const { Pool } = require('pg');

// Підключення до PostgreSQL через DATABASE_URL
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL не знайдено в змінних середовища');
  process.exit(1);
}

// Railway Postgres starter allows ~25 connections; keep defaults safe
const { DB_POOL_MAX_DEFAULT, DB_POOL_MIN_DEFAULT } = require('../../constants/timeouts');

const pool = new Pool({
  connectionString,
  application_name: process.env.APP_NAME || 'svitlobot',
  ssl: process.env.NODE_ENV === 'production' || connectionString.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
  max: parseInt(process.env.DB_POOL_MAX || String(DB_POOL_MAX_DEFAULT), 10),
  min: parseInt(process.env.DB_POOL_MIN || String(DB_POOL_MIN_DEFAULT), 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
});

// Validate pool configuration
const poolMax = pool.options.max;
const poolMin = pool.options.min;
if (isNaN(poolMax) || poolMax < 1) {
  console.error('❌ DB_POOL_MAX must be a positive integer');
  process.exit(1);
}
if (isNaN(poolMin) || poolMin < 0) {
  console.error('❌ DB_POOL_MIN must be a non-negative integer');
  process.exit(1);
}
if (poolMin > poolMax) {
  console.error('❌ DB_POOL_MIN cannot be greater than DB_POOL_MAX');
  process.exit(1);
}

// Перевірка підключення
pool.on('connect', () => {
  if (process.env.NODE_ENV === 'development') {
    console.log('✅ PostgreSQL pool connected');
  }
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
});

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
  const { POOL_STATS_LOG_INTERVAL_MS } = require('../../constants/timeouts');

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

/**
 * Коректно закриває з'єднання з БД
 */
async function closeDatabase() {
  try {
    await pool.end();
    console.log('✅ БД закрита коректно');
  } catch (error) {
    console.error('❌ Помилка закриття БД:', error);
  }
}

module.exports = {
  pool,
  checkPoolHealth,
  startPoolMetricsLogging,
  stopPoolMetricsLogging,
  closeDatabase,
};
