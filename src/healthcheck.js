const http = require('http');
const config = require('./config');
const { pool } = require('./database/db');
const { getUserCount } = require('./database/users');

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

  server = http.createServer(async (req, res) => {
    // Webhook endpoint
    if (useWebhook && req.method === 'POST' && req.url === webhookPath) {
      const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];
      if (incomingSecret !== webhookSecret) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const update = JSON.parse(body);
          bot.handleUpdate(update);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          console.error('Webhook processing error:', error.message);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
        }
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
        };

        healthCache = { data: health, ts: now };

        const statusCode = dbCheck ? 200 : 503;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: error.message }));
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
