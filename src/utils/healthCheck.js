/**
 * Health Check для моніторингу стану бота
 * Надає інформацію про uptime, використання пам'яті та стан системи
 */

const startTime = Date.now();

/**
 * Отримує поточний стан здоров'я системи
 * @returns {Object} - Об'єкт зі статусом системи
 */
function getHealthStatus() {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const memoryUsage = process.memoryUsage();

  return {
    status: 'ok',
    uptime: uptime,
    uptimeFormatted: formatUptime(uptime),
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
      rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
      external: Math.round(memoryUsage.external / 1024 / 1024) + ' MB'
    },
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Форматує час роботи в зрозумілий формат
 * @param {Number} seconds - Час роботи в секундах
 * @returns {String} - Відформатований час (напр. "2д 5г 30хв")
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}д`);
  if (hours > 0) parts.push(`${hours}г`);
  if (minutes > 0) parts.push(`${minutes}хв`);
  if (secs > 0 && days === 0) parts.push(`${secs}с`);

  return parts.join(' ') || '0с';
}

/**
 * Отримує детальну інформацію про використання пам'яті
 * @returns {Object} - Детальна інформація про пам'ять
 */
function getMemoryStats() {
  const memoryUsage = process.memoryUsage();

  return {
    heapUsed: memoryUsage.heapUsed,
    heapTotal: memoryUsage.heapTotal,
    heapUsedPercent: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
    rss: memoryUsage.rss,
    external: memoryUsage.external,
    arrayBuffers: memoryUsage.arrayBuffers
  };
}

/**
 * Перевіряє чи система працює нормально
 * @param {Object} options - Опції перевірки
 * @param {Number} options.maxMemoryMB - Максимальне використання пам'яті в MB
 * @param {Number} options.maxUptimeSeconds - Максимальний uptime для перезапуску
 * @returns {Object} - Результат перевірки
 */
function checkHealth(options = {}) {
  const { maxMemoryMB = 500, maxUptimeSeconds = 86400 * 7 } = options; // 7 днів за замовчуванням

  const health = getHealthStatus();
  const memoryStats = getMemoryStats();
  const warnings = [];

  // Перевірка використання пам'яті
  const memoryUsedMB = memoryStats.heapUsed / 1024 / 1024;
  if (memoryUsedMB > maxMemoryMB) {
    warnings.push(`Високе використання пам'яті: ${Math.round(memoryUsedMB)}MB > ${maxMemoryMB}MB`);
  }

  // Перевірка uptime
  if (health.uptime > maxUptimeSeconds) {
    warnings.push(`Довгий uptime: ${health.uptimeFormatted} (рекомендується перезапуск)`);
  }

  return {
    healthy: warnings.length === 0,
    warnings,
    stats: {
      uptime: health.uptimeFormatted,
      memory: memoryStats,
      timestamp: health.timestamp
    }
  };
}

module.exports = {
  getHealthStatus,
  formatUptime,
  getMemoryStats,
  checkHealth
};
