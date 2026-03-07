const logger = require('./utils/logger');
require('dotenv').config();

function normalizeWebhookUrl(url) {
  if (!url) return null;
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, ''); // Remove trailing slashes
}

const config = {
  botToken: process.env.BOT_TOKEN,
  ownerId: process.env.OWNER_ID, // Owner ID (optional - bot works without it, but owner features disabled)
  adminIds: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [],
  checkIntervalSeconds: 60, // секунди
  timezone: process.env.TZ || 'Europe/Kyiv',

  // URLs для отримання даних
  dataUrlTemplate: 'https://raw.githubusercontent.com/Baskerville42/outage-data-ua/main/data/{region}.json',
  imageUrlTemplate: 'https://raw.githubusercontent.com/Baskerville42/outage-data-ua/main/images/{region}/gpv-{queue}-emergency.png',

  // Моніторинг світла
  ROUTER_HOST: process.env.ROUTER_HOST || null,
  ROUTER_PORT: process.env.ROUTER_PORT || 80,

  // Scaling configuration — Railway Postgres starter allows ~25 connections
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX || '20', 10),
  DB_POOL_MIN: parseInt(process.env.DB_POOL_MIN || '2', 10),

  // Message queue
  TELEGRAM_RATE_LIMIT: parseInt(process.env.TELEGRAM_RATE_LIMIT || '25', 10), // msg/sec
  MESSAGE_RETRY_COUNT: parseInt(process.env.MESSAGE_RETRY_COUNT || '3', 10),

  // Scheduler
  SCHEDULER_BATCH_SIZE: parseInt(process.env.SCHEDULER_BATCH_SIZE || '5', 10), // parallel regions
  SCHEDULER_STAGGER_MS: parseInt(process.env.SCHEDULER_STAGGER_MS || '50', 10), // delay between users

  // Health check
  HEALTH_PORT: parseInt(process.env.PORT || process.env.HEALTH_PORT || '3000', 10),

  // Webhook configuration
  WEBHOOK_URL: normalizeWebhookUrl(process.env.WEBHOOK_URL), // e.g., your-app.railway.app or https://your-app.railway.app
  WEBHOOK_PATH: process.env.WEBHOOK_PATH || `/webhook/${process.env.BOT_TOKEN || 'default'}`,
  WEBHOOK_PORT: parseInt(process.env.PORT || process.env.WEBHOOK_PORT || '3000', 10),
  WEBHOOK_MAX_CONNECTIONS: parseInt(process.env.WEBHOOK_MAX_CONNECTIONS || '100', 10),
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || process.env.BOT_TOKEN?.split(':')[0] || 'default-secret',
  USE_WEBHOOK: process.env.USE_WEBHOOK !== 'false', // default true, only disable if explicitly 'false'
};

// Валідація обов'язкових параметрів
if (!config.botToken) {
  logger.error('❌ Помилка: BOT_TOKEN не встановлений в .env файлі');
  process.exit(1);
}

if (!config.ownerId) {
  logger.warn('⚠️  Попередження: OWNER_ID не встановлений - функції власника будуть недоступні');
}

if (config.adminIds.length === 0) {
  logger.warn('⚠️  Попередження: ADMIN_IDS не встановлений - адмін команди будуть недоступні');
}

if (config.USE_WEBHOOK && !config.WEBHOOK_URL) {
  logger.error('❌ Помилка: WEBHOOK_URL не встановлений. Вкажіть домен вашого сервера (наприклад: your-app.railway.app)');
  process.exit(1);
}

// Validate numeric values
for (const [key, value] of Object.entries(config)) {
  if (typeof value === 'number' && (isNaN(value) || value < 0)) {
    logger.error('❌ Invalid config value for', { key, value });
    process.exit(1);
  }
}

module.exports = config;
