const axios = require('axios');
const config = require('./config');
const { CircuitBreaker, CircuitOpenError } = require('./utils/circuitBreaker');

const cache = new Map();
const CACHE_TTL = 2 * 60 * 1000;
const MAX_CACHE_SIZE = 100;

// Circuit breaker per region — prevents hammering GitHub when it's down
const regionBreakers = new Map();

function getRegionBreaker(region) {
  if (!regionBreakers.has(region)) {
    regionBreakers.set(region, new CircuitBreaker(`github:${region}`, {
      failureThreshold: 3,
      resetTimeoutMs: 90_000,
    }));
  }
  return regionBreakers.get(region);
}

function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp >= CACHE_TTL) {
      cache.delete(key);
    }
  }
  if (cache.size > MAX_CACHE_SIZE) {
    const sortedEntries = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toDelete = cache.size - MAX_CACHE_SIZE;
    for (let i = 0; i < toDelete; i++) {
      cache.delete(sortedEntries[i][0]);
    }
  }
}

const cacheCleanupInterval = setInterval(cleanupCache, 5 * 60 * 1000);

function stopCacheCleanup() {
  clearInterval(cacheCleanupInterval);
}

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

function getDataUrl(region) {
  return config.dataUrlTemplate.replace('{region}', region);
}

function getImageUrl(region, queue) {
  return config.imageUrlTemplate
    .replace('{region}', region)
    .replace('{queue}', queue.replace('.', '-'));
}

async function fetchScheduleData(region) {
  const cacheKey = `schedule_${region}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const breaker = getRegionBreaker(region);

  try {
    const data = await breaker.execute(() => {
      const url = getDataUrl(region);
      return fetchWithRetry(url, 3, false);
    });

    cache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      console.warn(`⚡ Circuit breaker OPEN для ${region} — використання кешу`);
    } else {
      console.error(`Помилка отримання даних для ${region}:`, error.message);
    }

    // Stale-cache fallback — return old data rather than crashing
    if (cached) {
      console.log(`Використання застарілих даних з кешу для ${region}`);
      return cached.data;
    }

    throw error;
  }
}

async function checkImageExists(region, queue) {
  try {
    const url = getImageUrl(region, queue);
    const response = await axios.head(url, { timeout: 5000 });
    return response.status === 200;
  } catch (_error) {
    return false;
  }
}

function fetchScheduleImage(region, queue) {
  const timestamp = Date.now();
  const baseUrl = getImageUrl(region, queue);
  const url = `${baseUrl}?t=${timestamp}`;
  return fetchWithRetry(url, 2, true);
}

function clearCache() {
  cache.clear();
}

function getCircuitBreakerStatuses() {
  const statuses = {};
  for (const [region, breaker] of regionBreakers) {
    statuses[region] = breaker.getStatus();
  }
  return statuses;
}

module.exports = {
  fetchScheduleData,
  fetchScheduleImage,
  getImageUrl,
  checkImageExists,
  clearCache,
  stopCacheCleanup,
  getCircuitBreakerStatuses,
};
