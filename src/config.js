const logger = require('./logger').child({ module: 'config' });
require('dotenv').config();

const config = {
  botToken: process.env.BOT_TOKEN,
  databaseUrl: process.env.DATABASE_URL,
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

  // Scaling configuration (new)
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX || '50', 10),
  DB_POOL_MIN: parseInt(process.env.DB_POOL_MIN || '5', 10),

  // Message queue
  TELEGRAM_RATE_LIMIT: parseInt(process.env.TELEGRAM_RATE_LIMIT || '25', 10), // msg/sec
  MESSAGE_RETRY_COUNT: parseInt(process.env.MESSAGE_RETRY_COUNT || '3', 10),

  // Scheduler
  SCHEDULER_BATCH_SIZE: parseInt(process.env.SCHEDULER_BATCH_SIZE || '5', 10), // parallel regions
  SCHEDULER_STAGGER_MS: parseInt(process.env.SCHEDULER_STAGGER_MS || '50', 10), // delay between users

  // Health check
  HEALTH_PORT: parseInt(process.env.PORT || process.env.HEALTH_PORT || '3000', 10),

  // Webhook configuration
  WEBHOOK_URL: process.env.WEBHOOK_URL || null, // e.g., https://your-app.railway.app
  WEBHOOK_PATH: process.env.WEBHOOK_PATH || `/webhook/${process.env.BOT_TOKEN || 'default'}`,
  WEBHOOK_PORT: parseInt(process.env.PORT || process.env.WEBHOOK_PORT || '3000', 10),
  WEBHOOK_MAX_CONNECTIONS: parseInt(process.env.WEBHOOK_MAX_CONNECTIONS || '100', 10),
  USE_WEBHOOK: process.env.USE_WEBHOOK === 'true' || !!process.env.WEBHOOK_URL,
};

// Валідація обов'язкових параметрів
if (!config.botToken) {
  logger.error('❌ Помилка: BOT_TOKEN не встановлений в .env файлі');
  process.exit(1);
}

if (!config.databaseUrl) {
  logger.error('❌ Помилка: DATABASE_URL не встановлений в .env файлі');
  process.exit(1);
}

if (!config.ownerId) {
  logger.warn('⚠️  Попередження: OWNER_ID не встановлений - функції власника будуть недоступні');
} else {
  // Validate OWNER_ID is a number
  const ownerIdNum = parseInt(config.ownerId, 10);
  if (isNaN(ownerIdNum) || !Number.isSafeInteger(ownerIdNum) || ownerIdNum <= 0) {
    logger.error('❌ Помилка: OWNER_ID має бути числом');
    process.exit(1);
  }
}

if (config.adminIds.length === 0) {
  logger.warn('⚠️  Попередження: ADMIN_IDS не встановлений - адмін команди будуть недоступні');
} else {
  // Validate each ADMIN_IDS is a valid number
  for (const adminId of config.adminIds) {
    const adminIdNum = parseInt(adminId, 10);
    if (isNaN(adminIdNum) || !Number.isSafeInteger(adminIdNum) || adminIdNum <= 0) {
      logger.error(`❌ Помилка: ADMIN_IDS містить невірне значення: ${adminId}`);
      process.exit(1);
    }
  }
}

// Validate ROUTER_PORT is in range 1-65535
if (process.env.ROUTER_PORT) {
  const routerPort = parseInt(process.env.ROUTER_PORT, 10);
  if (isNaN(routerPort) || routerPort < 1 || routerPort > 65535) {
    logger.error(`❌ Помилка: ROUTER_PORT має бути в діапазоні 1-65535, отримано: ${process.env.ROUTER_PORT}`);
    process.exit(1);
  }
}

// Validate WEBHOOK_URL format (must start with https://)
if (config.WEBHOOK_URL && !config.WEBHOOK_URL.startsWith('https://')) {
  logger.error(`❌ Помилка: WEBHOOK_URL має починатися з https://, отримано: ${config.WEBHOOK_URL}`);
  process.exit(1);
}

// Validate numeric values
for (const [key, value] of Object.entries(config)) {
  if (typeof value === 'number' && (isNaN(value) || value < 0)) {
    logger.error(`❌ Invalid config value for ${key}: ${value}`);
    process.exit(1);
  }
}

module.exports = config;
