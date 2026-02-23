const axios = require('axios');
const config = require('./config');

// Кешування даних для зменшення навантаження на GitHub API
const cache = new Map();
const CACHE_TTL = 2 * 60 * 1000; // 2 хвилини
const MAX_CACHE_SIZE = 100;

// Periodic cache cleanup
function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp >= CACHE_TTL) {
      cache.delete(key);
    }
  }
  // Evict oldest if over max size
  // Note: O(n log n) complexity is acceptable for MAX_CACHE_SIZE=100
  // More complex structures would be overkill for this scale
  if (cache.size > MAX_CACHE_SIZE) {
    const sortedEntries = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toDelete = cache.size - MAX_CACHE_SIZE;
    for (let i = 0; i < toDelete; i++) {
      cache.delete(sortedEntries[i][0]);
    }
  }
}

const cacheCleanupInterval = setInterval(cleanupCache, 5 * 60 * 1000);

// Export cleanup for graceful shutdown
function stopCacheCleanup() {
  clearInterval(cacheCleanupInterval);
}

// Fetch with retry logic
async function fetchWithRetry(url, retries = 3, isImage = false) {
  const delays = [5000, 15000, 45000];

  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url, {
        timeout: 30000,
        responseType: isImage ? 'arraybuffer' : 'json',
        headers: {
          'User-Agent': 'SvitloCheck-Bot/1.0',
        },
      });
      return response.data;
    } catch (error) {
      const isLastRetry = i === retries - 1;

      if (isLastRetry) {
        throw new Error(`Failed to fetch ${url} after ${retries} attempts: ${error.message}`);
      }

      const delay = delays[i] || delays[delays.length - 1];
      console.log(`Retry ${i + 1}/${retries} for ${url} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Отримати URL для даних регіону
function getDataUrl(region) {
  return config.dataUrlTemplate.replace('{region}', region);
}

// Отримати URL для зображення графіка
function getImageUrl(region, queue) {
  return config.imageUrlTemplate
    .replace('{region}', region)
    .replace('{queue}', queue.replace('.', '-'));  // Замінюємо "3.1" на "3-1"
}

// Отримати дані графіка для регіону
async function fetchScheduleData(region) {
  const cacheKey = `schedule_${region}`;
  const cached = cache.get(cacheKey);

  // Перевірка кешу
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = getDataUrl(region);
    const data = await fetchWithRetry(url, 3, false);

    // Збереження в кеш
    cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });

    return data;
  } catch (error) {
    console.error(`Помилка отримання даних для ${region}:`, error.message);

    // Повернути дані з кешу якщо є помилка
    if (cached) {
      console.log(`Використання застарілих даних з кешу для ${region}`);
      return cached.data;
    }

    throw error;
  }
}

// Перевірити доступність зображення
async function checkImageExists(region, queue) {
  try {
    const url = getImageUrl(region, queue);
    const response = await axios.head(url, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

// Fetch schedule image as Buffer
async function fetchScheduleImage(region, queue) {
  const timestamp = Date.now();
  const baseUrl = getImageUrl(region, queue);
  const url = `${baseUrl}?t=${timestamp}`;
  console.log(`Fetching schedule image from: ${url}`);
  // Явно вказуємо що це зображення для arraybuffer
  return await fetchWithRetry(url, 3, true);
}

// Очистити кеш
function clearCache() {
  cache.clear();
}

module.exports = {
  fetchScheduleData,
  fetchScheduleImage,
  getImageUrl,
  checkImageExists,
  clearCache,
  stopCacheCleanup,
};
