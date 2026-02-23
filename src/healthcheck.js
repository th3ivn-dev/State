const http = require('http');
const config = require('./config');
const { pool } = require('./database/db');
const { getUserCount } = require('./database/users');

let server = null;
let botRef = null;

function startHealthCheck(bot, port = config.WEBHOOK_PORT) {
  botRef = bot;
  const useWebhook = config.USE_WEBHOOK;
  const webhookPath = config.WEBHOOK_PATH;

  server = http.createServer(async (req, res) => {
    // Webhook endpoint
    if (useWebhook && req.method === 'POST' && req.url === webhookPath) {
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

    // Health check endpoint
    if (req.url === '/health' || req.url === '/') {
      try {
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
          mode: useWebhook ? 'webhook' : 'polling',
          database: dbCheck ? 'connected' : 'disconnected',
          users: userCount,
          memory: {
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          },
        };

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
      }).then(() => {
        console.log(`🔗 Webhook встановлено: ${fullWebhookUrl}`);
      }).catch((error) => {
        console.error('❌ Помилка встановлення webhook:', error.message);
        console.log('⚠️ Перемикаємось на polling...');
        bot.start();
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
