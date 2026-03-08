const { pool } = require('../database/db');
const { createLogger } = require('../utils/logger');
const logger = createLogger('SystemMetrics');

let metricsInterval = null;
const METRICS_LOG_INTERVAL = parseInt(process.env.METRICS_LOG_INTERVAL_MS || '300000', 10); // 5 хв

async function collectAllMetrics() {
  const mem = process.memoryUsage();

  const metrics = {
    timestamp: new Date().toISOString(),
    process: {
      uptime: Math.floor(process.uptime()),
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        external: Math.round(mem.external / 1024 / 1024),
      },
      pid: process.pid,
      nodeVersion: process.version,
    },
    database: {
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingRequests: pool.waitingCount,
    },
    redis: null,
    queue: null,
  };

  // Redis metrics
  try {
    const { getRedisHealthStatus } = require('../queue/connection');
    metrics.redis = await getRedisHealthStatus();
  } catch (_e) {
    metrics.redis = { connected: false, error: 'module unavailable' };
  }

  // BullMQ queue metrics
  try {
    const { getQueueStats } = require('../queue/notificationsQueue');
    metrics.queue = await getQueueStats();
  } catch (_e) {
    metrics.queue = null;
  }

  return metrics;
}

function startMetricsLogging() {
  if (metricsInterval) return;

  logger.info(`Starting periodic metrics logging (interval: ${METRICS_LOG_INTERVAL}ms)`);

  metricsInterval = setInterval(async () => {
    try {
      const m = await collectAllMetrics();
      logger.info('📊 System metrics', {
        mem: `${m.process.memory.rss}MB RSS, ${m.process.memory.heapUsed}MB heap`,
        db: `total=${m.database.totalConnections} idle=${m.database.idleConnections} waiting=${m.database.waitingRequests}`,
        redis: m.redis?.connected ? 'ok' : 'down',
        queue: m.queue ? `waiting=${m.queue.waiting || 0} active=${m.queue.active || 0} failed=${m.queue.failed || 0}` : 'n/a',
        uptime: `${m.process.uptime}s`,
      });
    } catch (_e) {
      // Ignore — metrics logging should never crash the bot
      logger.debug('Metrics collection error (ignored)', { error: _e.message });
    }
  }, METRICS_LOG_INTERVAL);

  metricsInterval.unref(); // Don't keep process alive just for metrics
}

function stopMetricsLogging() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
    logger.info('Metrics logging stopped');
  }
}

module.exports = { collectAllMetrics, startMetricsLogging, stopMetricsLogging };
