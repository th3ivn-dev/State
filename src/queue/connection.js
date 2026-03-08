const Redis = require('ioredis');
const { createLogger } = require('../utils/logger');

const logger = createLogger('Redis');

const baseOptions = {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 200, 5000),
  reconnectOnError: (err) => {
    const msg = err.message || '';
    return msg.includes('READONLY') || msg.includes('LOADING');
  },
  lazyConnect: false,
};

const connections = [];

function createConnection() {
  const conn = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, baseOptions)
    : new Redis({ host: 'localhost', port: 6379, ...baseOptions });

  conn.on('error', (err) => {
    logger.error(`Redis помилка підключення: ${err.message}`);
  });

  conn.on('close', () => {
    logger.warn('Redis з\'єднання закрито');
  });

  conn.on('reconnecting', () => {
    logger.info('Redis перепідключення...');
  });

  conn.on('ready', () => {
    logger.success('Redis з\'єднання готове');
  });

  connections.push(conn);
  return conn;
}

const connection = createConnection();

async function getRedisHealthStatus() {
  try {
    await connection.ping();
    return { connected: true, clients: connections.length };
  } catch (err) {
    return { connected: false, error: err.message, clients: connections.length };
  }
}

async function closeAllConnections() {
  for (const conn of connections) {
    try {
      await conn.disconnect();
    } catch (_e) {
      // ignore
    }
  }
  connections.length = 0;
  logger.success('Всі Redis з\'єднання закрито');
}

module.exports = { connection, createConnection, getRedisHealthStatus, closeAllConnections };
