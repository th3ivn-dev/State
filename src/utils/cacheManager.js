/**
 * Менеджер кешів для управління та періодичного очищення
 * Дозволяє реєструвати кеші та автоматично очищати їх
 */

const { createLogger } = require('./logger');
const logger = createLogger('CacheManager');

const caches = new Map();

/**
 * Реєструє кеш для управління
 * @param {String} name - Унікальна назва кешу
 * @param {*} cache - Об'єкт кешу (Map, Object, тощо)
 * @param {Function} cleanupFn - Функція очищення кешу
 */
function registerCache(name, cache, cleanupFn) {
  caches.set(name, { cache, cleanupFn });
}

/**
 * Видаляє кеш з реєстру
 * @param {String} name - Назва кешу
 * @returns {Boolean} - true якщо кеш було видалено
 */
function unregisterCache(name) {
  return caches.delete(name);
}

/**
 * Очищує всі зареєстровані кеші
 */
function cleanupAllCaches() {
  for (const [name, { cleanupFn }] of caches) {
    try {
      cleanupFn();
      logger.info(`Кеш "${name}" очищено`);
    } catch (error) {
      logger.error(`Помилка очищення кешу "${name}":`, { error: error.message });
    }
  }
}

/**
 * Очищує конкретний кеш
 * @param {String} name - Назва кешу
 * @returns {Boolean} - true якщо кеш було очищено
 */
function cleanupCache(name) {
  const cacheEntry = caches.get(name);
  if (!cacheEntry) {
    logger.warn(`Кеш "${name}" не знайдено`);
    return false;
  }

  try {
    cacheEntry.cleanupFn();
    logger.info(`Кеш "${name}" очищено`);
    return true;
  } catch (error) {
    logger.error(`Помилка очищення кешу "${name}":`, { error: error.message });
    return false;
  }
}

/**
 * Отримує інформацію про зареєстровані кеші
 * @returns {Array} - Масив з назвами кешів
 */
function getCacheNames() {
  return Array.from(caches.keys());
}

/**
 * Отримує статистику про кеш
 * @param {String} name - Назва кешу
 * @returns {Object|null} - Статистика кешу або null
 */
function getCacheStats(name) {
  const cacheEntry = caches.get(name);
  if (!cacheEntry) return null;

  const { cache } = cacheEntry;

  // Визначення розміру залежно від типу кешу
  let size = 0;
  if (cache instanceof Map || cache instanceof Set) {
    size = cache.size;
  } else if (typeof cache === 'object' && cache !== null) {
    size = Object.keys(cache).length;
  }

  return {
    name,
    size,
    type: cache.constructor.name
  };
}

// Автоматичне очищення кешів кожні 30 хвилин
let cleanupInterval = null;

/**
 * Запускає періодичне очищення кешів
 * @param {Number} intervalMs - Інтервал очищення в мілісекундах (за замовчуванням: 30 хвилин)
 */
function startPeriodicCleanup(intervalMs = 30 * 60 * 1000) {
  if (cleanupInterval) {
    logger.warn('Періодичне очищення вже запущено');
    return;
  }

  cleanupInterval = setInterval(() => {
    try {
      logger.info('Початок періодичного очищення кешів...');
      cleanupAllCaches();
    } catch (error) {
      logger.error('Помилка під час періодичного очищення кешів:', { error: error.message });
    }
  }, intervalMs);

  logger.info(`Періодичне очищення кешів налаштовано (кожні ${intervalMs / 1000 / 60} хвилин)`);
}

/**
 * Зупиняє періодичне очищення кешів
 */
function stopPeriodicCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Періодичне очищення кешів зупинено');
  }
}

module.exports = {
  registerCache,
  unregisterCache,
  cleanupAllCaches,
  cleanupCache,
  getCacheNames,
  getCacheStats,
  startPeriodicCleanup,
  stopPeriodicCleanup
};
