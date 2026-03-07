const Redis = require('ioredis');

let connection;

if (process.env.REDIS_URL) {
  connection = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  console.log('✅ Redis підключено успішно (REDIS_URL)');
} else {
  connection = new Redis({
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: null,
  });
  console.log('✅ Redis підключено успішно (localhost:6379)');
}

connection.on('error', (err) => {
  console.error('❌ Redis помилка підключення:', err.message);
});

module.exports = connection;
