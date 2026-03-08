const http = require('http');
const crypto = require('crypto');
const config = require('./config');
const { pool } = require('./database/db');
const { getUserCount } = require('./database/users');
const { getRedisHealthStatus } = require('./queue/connection');
const { getQueueStats } = require('./queue/notificationsQueue');

let server = null;
let botRef = null;

// Cache health check data to avoid hammering the DB on frequent probes
let healthCache = { data: null, ts: 0 };
const HEALTH_CACHE_TTL = 10_000; // 10 seconds

function startHealthCheck(bot, port = config.WEBHOOK_PORT) {
  botRef = bot;
  const useWebhook = config.USE_WEBHOOK;
  const webhookPath = config.WEBHOOK_PATH;
  const webhookSecret = config.WEBHOOK_SECRET;

  const MAX_BODY_BYTES = 1024 * 1024; // 1 MB — Telegram updates are small
  const REQUEST_TIMEOUT_MS = 10_000;

  server = http.createServer(async (req, res) => {
    // Webhook endpoint — hardened with body size limit and timeout
    if (useWebhook && req.method === 'POST' && req.url === webhookPath) {
      const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];
      if (incomingSecret !== webhookSecret) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
        return;
      }

      let body = '';
      let aborted = false;

      const timer = setTimeout(() => {
        aborted = true;
        res.writeHead(408, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Request timeout' }));
        req.destroy();
      }, REQUEST_TIMEOUT_MS);

      req.on('data', (chunk) => {
        body += chunk.toString();
        if (body.length > MAX_BODY_BYTES) {
          aborted = true;
          clearTimeout(timer);
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Payload too large' }));
          req.destroy();
        }
      });

      req.on('end', () => {
        clearTimeout(timer);
        if (aborted) return;

        try {
          const update = JSON.parse(body);

          // Fire-and-forget with error isolation — a bad update must never crash the server
          Promise.resolve(bot.handleUpdate(update)).catch((err) => {
            console.error('Webhook handleUpdate error (isolated):', err.message);
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          console.error('Webhook processing error:', error.message);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
        }
      });

      req.on('error', () => {
        clearTimeout(timer);
      });
      return;
    }

    // Health check endpoint (cached to reduce DB load from probes)
    if (req.url === '/health' || req.url === '/') {
      try {
        const now = Date.now();
        if (healthCache.data && now - healthCache.ts < HEALTH_CACHE_TTL) {
          const cached = healthCache.data;
          cached.uptime = Math.floor(process.uptime());
          cached.timestamp = new Date().toISOString();
          const mem = process.memoryUsage();
          cached.memory = { rss: Math.round(mem.rss / 1024 / 1024), heapUsed: Math.round(mem.heapUsed / 1024 / 1024) };
          try { cached.redis = await getRedisHealthStatus(); }
          catch (_e) { cached.redis = { connected: false, error: 'unavailable' }; }
          try { cached.queue = await getQueueStats() || {}; }
          catch (_e) { cached.queue = {}; }
          const statusCode = cached.database === 'connected' ? 200 : 503;
          res.writeHead(statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(cached));
          return;
        }

        const dbCheck = await pool.query('SELECT 1').then(() => true).catch((err) => {
          console.error('Health check DB error:', err.message);
          return false;
        });
        const userCount = await getUserCount();

        const health = {
          status: 'ok',
          uptime: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
          bot: 'running',
          mode: 'webhook',
          database: dbCheck ? 'connected' : 'disconnected',
          users: userCount,
          memory: {
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          },
          redis: await (async () => {
            try { return await getRedisHealthStatus(); }
            catch (_e) { return { connected: false, error: 'unavailable' }; }
          })(),
          queue: await (async () => {
            try { return await getQueueStats() || {}; }
            catch (_e) { return {}; }
          })(),
        };

        healthCache = { data: health, ts: now };

        const statusCode = dbCheck ? 200 : 503;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: error.message }));
      }
    } else if (req.url.startsWith('/metrics')) {
      // Metrics endpoint — detailed system metrics
      // Auth check for metrics endpoint
      const metricsKey = config.METRICS_API_KEY;
      if (metricsKey) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const headerKey = req.headers['x-metrics-key'] || '';
        const queryKey = url.searchParams.get('key') || '';
        const keyBuf = Buffer.from(metricsKey);
        const headerMatch = headerKey.length === metricsKey.length &&
          crypto.timingSafeEqual(Buffer.from(headerKey), keyBuf);
        const queryMatch = queryKey.length === metricsKey.length &&
          crypto.timingSafeEqual(Buffer.from(queryKey), keyBuf);
        if (!headerMatch && !queryMatch) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
      }
      try {
        const { collectAllMetrics } = require('./monitoring/systemMetrics');
        const metrics = await collectAllMetrics();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(metrics, null, 2));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(port, () => {
    console.log(`🏥 Health check server running on port ${port}`);

    if (useWebhook && config.WEBHOOK_URL) {
      // Set webhook with Telegram
      const fullWebhookUrl = `${config.WEBHOOK_URL}${webhookPath}`;
      bot.api.setWebhook(fullWebhookUrl, {
        max_connections: config.WEBHOOK_MAX_CONNECTIONS,
        secret_token: webhookSecret,
        allowed_updates: ['message', 'callback_query', 'my_chat_member', 'chat_member', 'channel_post'],
      }).then(() => {
        console.log(`🔗 Webhook встановлено: ${fullWebhookUrl}`);
      }).catch((error) => {
        console.error('❌ Помилка встановлення webhook:', error.message);
        process.exit(1); // Let Railway restart the service
      });
    }
  });
}

function stopHealthCheck() {
  if (server) {
    // If using webhook, delete it before stopping
    if (botRef && config.USE_WEBHOOK) {
      botRef.api.deleteWebhook().catch((error) => {
        console.error('⚠️  Помилка при видаленні webhook:', error.message);
      });
    }
    server.close();
    console.log('✅ Health check server stopped');
  }
}

module.exports = { startHealthCheck, stopHealthCheck };
