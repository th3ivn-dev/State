const { Pool } = require('pg');
const logger = require('../utils/logger');

// Підключення до PostgreSQL через DATABASE_URL
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  logger.error('❌ DATABASE_URL не знайдено в змінних середовища');
  process.exit(1);
}

// Railway Postgres starter allows ~25 connections; keep defaults safe
const { DB_POOL_MAX_DEFAULT, DB_POOL_MIN_DEFAULT } = require('../constants/timeouts');

const pool = new Pool({
  connectionString,
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
  logger.error('❌ DB_POOL_MAX must be a positive integer');
  process.exit(1);
}
if (isNaN(poolMin) || poolMin < 0) {
  logger.error('❌ DB_POOL_MIN must be a non-negative integer');
  process.exit(1);
}
if (poolMin > poolMax) {
  logger.error('❌ DB_POOL_MIN cannot be greater than DB_POOL_MAX');
  process.exit(1);
}

// Перевірка підключення
pool.on('connect', () => {
  if (process.env.NODE_ENV === 'development') {
    logger.info('✅ PostgreSQL pool connected');
  }
});

pool.on('error', (err) => {
  logger.error('❌ Unexpected error on idle client', { error: err });
});

// Resilient query wrapper — retries once on connection errors
// (covers brief Railway Postgres restarts / failovers)
const RETRIABLE_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT',
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08003', // connection_does_not_exist
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
]);

async function safeQuery(text, params) {
  try {
    return await pool.query(text, params);
  } catch (error) {
    const code = error.code || '';
    const msg = error.message || '';
    const isRetriable = RETRIABLE_CODES.has(code)
      || msg.includes('Connection terminated')
      || msg.includes('connection terminated')
      || msg.includes('Client has encountered a connection error');

    if (isRetriable) {
      logger.warn(`⚠️ DB connection error (${code || msg.slice(0, 60)}), retrying in 1s…`);
      await new Promise(r => setTimeout(r, 1000));
      return pool.query(text, params);
    }
    throw error;
  }
}

/**
 * Коректно закриває з'єднання з БД
 */
async function closeDatabase() {
  try {
    await pool.end();
    logger.info('✅ БД закрита коректно');
  } catch (error) {
    logger.error('❌ Помилка закриття БД', { error });
  }
}

module.exports = { pool, safeQuery, closeDatabase, RETRIABLE_CODES };
