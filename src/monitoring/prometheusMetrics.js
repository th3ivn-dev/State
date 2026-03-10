/**
 * Prometheus Metrics Exporter
 *
 * Експортує метрики бота у форматі Prometheus.
 * Використовує існуючі колектори (metricsCollector, systemMetrics).
 *
 * Метрики оновлюються кожні 15 секунд.
 */

const client = require('prom-client');
const metricsCollector = require('./metricsCollector');
const { collectAllMetrics: collectSystemMetrics } = require('./systemMetrics');
const { createLogger } = require('../utils/logger');

const logger = createLogger('PrometheusMetrics');

const register = client.register;

// Стандартні Node.js метрики (process, gc, eventloop тощо)
client.collectDefaultMetrics({ register });

// ─── System метрики ──────────────────────────────────────────────────────────

const uptimeGauge = new client.Gauge({
  name: 'bot_uptime_seconds',
  help: 'Час роботи бота в секундах',
  registers: [register],
});

const heapUsedGauge = new client.Gauge({
  name: 'bot_memory_heap_used_bytes',
  help: 'Heap used memory в байтах',
  registers: [register],
});

const rssGauge = new client.Gauge({
  name: 'bot_memory_rss_bytes',
  help: 'RSS memory в байтах',
  registers: [register],
});

const restartCounter = new client.Counter({
  name: 'bot_restart_count',
  help: 'Кількість рестартів бота',
  registers: [register],
});

// ─── Database метрики ────────────────────────────────────────────────────────

const dbTotalConnectionsGauge = new client.Gauge({
  name: 'db_pool_total_connections',
  help: 'Загальна кількість з\'єднань у пулі DB',
  registers: [register],
});

const dbIdleConnectionsGauge = new client.Gauge({
  name: 'db_pool_idle_connections',
  help: 'Кількість idle з\'єднань у пулі DB',
  registers: [register],
});

const dbWaitingRequestsGauge = new client.Gauge({
  name: 'db_pool_waiting_requests',
  help: 'Кількість очікуючих запитів у пулі DB',
  registers: [register],
});

// ─── Redis метрики ───────────────────────────────────────────────────────────

const redisConnectedGauge = new client.Gauge({
  name: 'redis_connected',
  help: 'Стан підключення Redis (1 — підключено, 0 — відключено)',
  registers: [register],
});

// ─── BullMQ Queue метрики ────────────────────────────────────────────────────

const queueWaitingGauge = new client.Gauge({
  name: 'queue_waiting_jobs',
  help: 'Кількість очікуючих jobs у черзі',
  registers: [register],
});

const queueActiveGauge = new client.Gauge({
  name: 'queue_active_jobs',
  help: 'Кількість активних jobs у черзі',
  registers: [register],
});

const queueFailedGauge = new client.Gauge({
  name: 'queue_failed_jobs',
  help: 'Кількість failed jobs у черзі',
  registers: [register],
});

// ─── Business метрики ────────────────────────────────────────────────────────

const totalUsersGauge = new client.Gauge({
  name: 'bot_users_total',
  help: 'Загальна кількість користувачів',
  registers: [register],
});

const activeUsersGauge = new client.Gauge({
  name: 'bot_users_active',
  help: 'Кількість активних користувачів',
  registers: [register],
});

const dauGauge = new client.Gauge({
  name: 'bot_users_dau',
  help: 'Денні активні користувачі (DAU)',
  registers: [register],
});

const wauGauge = new client.Gauge({
  name: 'bot_users_wau',
  help: 'Тижневі активні користувачі (WAU)',
  registers: [register],
});

const channelsConnectedGauge = new client.Gauge({
  name: 'bot_channels_connected',
  help: 'Кількість підключених каналів',
  registers: [register],
});

const ipsMonitoredGauge = new client.Gauge({
  name: 'bot_ips_monitored',
  help: 'Кількість моніторених IP-адрес',
  registers: [register],
});

// ─── UX метрики ──────────────────────────────────────────────────────────────

const uxEventsCounter = new client.Counter({
  name: 'bot_ux_events_total',
  help: 'Загальна кількість UX подій',
  labelNames: ['event_type'],
  registers: [register],
});

// ─── IP моніторинг метрики ───────────────────────────────────────────────────

const ipEventsCounter = new client.Counter({
  name: 'bot_ip_events_total',
  help: 'Загальна кількість подій IP моніторингу',
  labelNames: ['event_type'],
  registers: [register],
});

// ─── Channel метрики ─────────────────────────────────────────────────────────

const channelEventsCounter = new client.Counter({
  name: 'bot_channel_events_total',
  help: 'Загальна кількість подій каналів',
  labelNames: ['event_type'],
  registers: [register],
});

// ─── Error метрики ───────────────────────────────────────────────────────────

const errorsCounter = new client.Counter({
  name: 'bot_errors_total',
  help: 'Загальна кількість помилок',
  registers: [register],
});

const uniqueErrorsGauge = new client.Gauge({
  name: 'bot_errors_unique',
  help: 'Кількість унікальних помилок',
  registers: [register],
});

// ─── Application метрики ─────────────────────────────────────────────────────

const botPausedGauge = new client.Gauge({
  name: 'bot_paused',
  help: 'Стан паузи бота (1 — на паузі, 0 — активний)',
  registers: [register],
});

const stateTransitionsCounter = new client.Counter({
  name: 'bot_state_transitions_total',
  help: 'Загальна кількість переходів стану',
  registers: [register],
});

// ─── Попередні значення лічильників ─────────────────────────────────────────
// Counters у prom-client можна тільки інкрементувати, тому відстежуємо дельти

const prevUxEvents = { cancel: 0, timeout: 0, retry: 0, quickClicks: 0, abort: 0 };
const prevIpEvents = { offlineToOnline: 0, unstableCount: 0, debounceCount: 0 };
const prevChannelEvents = { adminRightsLost: 0, publishErrors: 0, messageDeleted: 0 };
let prevErrorCount = 0;
let prevStateTransitionCount = 0;
let prevRestartCount = 0;

let updateInterval = null;
const UPDATE_INTERVAL_MS = parseInt(process.env.PROMETHEUS_SCRAPE_INTERVAL_MS || '15000', 10);

/**
 * Оновлює всі Prometheus Gauge/Counter метрики з поточних колекторів.
 */
async function updateMetrics() {
  try {
    const [allMetrics, systemMetrics] = await Promise.all([
      metricsCollector.collectAllMetrics(),
      collectSystemMetrics(),
    ]);

    const { system, application, business, ux, ip, channel } = allMetrics;

    // Система
    uptimeGauge.set(system.uptime || 0);
    heapUsedGauge.set((system.memory?.heapUsedMB || 0) * 1024 * 1024);
    rssGauge.set((system.memory?.rssMB || 0) * 1024 * 1024);

    const currentRestartCount = system.restartCount || 0;
    if (currentRestartCount > prevRestartCount) {
      restartCounter.inc(currentRestartCount - prevRestartCount);
    }
    prevRestartCount = currentRestartCount;

    // База даних
    dbTotalConnectionsGauge.set(systemMetrics.database?.totalConnections || 0);
    dbIdleConnectionsGauge.set(systemMetrics.database?.idleConnections || 0);
    dbWaitingRequestsGauge.set(systemMetrics.database?.waitingRequests || 0);

    // Redis
    redisConnectedGauge.set(systemMetrics.redis?.connected ? 1 : 0);

    // BullMQ черга
    if (systemMetrics.queue) {
      queueWaitingGauge.set(systemMetrics.queue.waiting || 0);
      queueActiveGauge.set(systemMetrics.queue.active || 0);
      queueFailedGauge.set(systemMetrics.queue.failed || 0);
    }

    // Business
    totalUsersGauge.set(business.totalUsers || 0);
    activeUsersGauge.set(business.activeUsers || 0);
    dauGauge.set(business.dau || 0);
    wauGauge.set(business.wau || 0);
    channelsConnectedGauge.set(business.channelsConnected || 0);
    ipsMonitoredGauge.set(business.ipsMonitored || 0);

    // UX події (дельта)
    for (const [eventType, count] of Object.entries(ux)) {
      if (eventType === 'timestamp') continue;
      const prev = prevUxEvents[eventType] || 0;
      if (count > prev) {
        uxEventsCounter.inc({ event_type: eventType }, count - prev);
      }
      prevUxEvents[eventType] = count;
    }

    // IP події (дельта)
    for (const [eventType, count] of Object.entries(ip)) {
      if (eventType === 'timestamp') continue;
      const prev = prevIpEvents[eventType] || 0;
      if (count > prev) {
        ipEventsCounter.inc({ event_type: eventType }, count - prev);
      }
      prevIpEvents[eventType] = count;
    }

    // Channel події (дельта)
    for (const [eventType, count] of Object.entries(channel)) {
      if (eventType === 'timestamp') continue;
      const prev = prevChannelEvents[eventType] || 0;
      if (count > prev) {
        channelEventsCounter.inc({ event_type: eventType }, count - prev);
      }
      prevChannelEvents[eventType] = count;
    }

    // Помилки (дельта)
    const currentErrorCount = application.errorCount || 0;
    if (currentErrorCount > prevErrorCount) {
      errorsCounter.inc(currentErrorCount - prevErrorCount);
    }
    prevErrorCount = currentErrorCount;
    uniqueErrorsGauge.set(application.uniqueErrors || 0);

    // Application
    botPausedGauge.set(application.botPaused ? 1 : 0);

    const currentTransitions = application.stateTransitionCount || 0;
    if (currentTransitions > prevStateTransitionCount) {
      stateTransitionsCounter.inc(currentTransitions - prevStateTransitionCount);
    }
    prevStateTransitionCount = currentTransitions;
  } catch (_e) {
    // Ніколи не крешимо бот через помилку збору метрик
    logger.debug('Помилка оновлення Prometheus метрик (ігнорується)', { error: _e.message });
  }
}

/**
 * Запускає періодичне оновлення Prometheus метрик (кожні 15 секунд).
 */
function startPrometheusMetrics() {
  if (updateInterval) return;
  updateInterval = setInterval(updateMetrics, UPDATE_INTERVAL_MS);
  updateInterval.unref(); // Не блокуємо завершення процесу
  // Перше оновлення відразу
  updateMetrics().catch(() => {});
}

/**
 * Зупиняє оновлення метрик.
 */
function stopPrometheusMetrics() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

/**
 * HTTP request handler для /metrics endpoint.
 * Повертає метрики у форматі Prometheus text/plain.
 */
function getMetricsHandler() {
  return async (req, res) => {
    try {
      const metrics = await register.metrics();
      res.writeHead(200, { 'Content-Type': register.contentType });
      res.end(metrics);
    } catch (error) {
      res.writeHead(500);
      res.end(error.message);
    }
  };
}

module.exports = { startPrometheusMetrics, stopPrometheusMetrics, getMetricsHandler };
