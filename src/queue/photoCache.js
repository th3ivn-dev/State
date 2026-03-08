const { createConnection } = require('./connection');
const { createLogger } = require('../utils/logger');

const logger = createLogger('PhotoCache');

const redis = createConnection();
const PHOTO_TTL_SECONDS = 600; // 10 хвилин
const KEY_PREFIX = 'photo:';

async function cachePhoto(region, queue, photoBase64) {
  const key = `${KEY_PREFIX}${encodeURIComponent(region)}:${encodeURIComponent(queue)}`;
  try {
    await redis.set(key, photoBase64, 'EX', PHOTO_TTL_SECONDS);
    logger.debug(`Фото закешовано: ${key}`);
    return key;
  } catch (err) {
    logger.error('Помилка кешування фото:', { error: err.message });
    return null;
  }
}

async function getCachedPhoto(key) {
  try {
    return await redis.get(key);
  } catch (err) {
    logger.error('Помилка отримання фото з кешу:', { error: err.message });
    return null;
  }
}

async function closePhotoCache() {
  try {
    await redis.disconnect();
  } catch (_e) { /* ignore */ }
}

module.exports = { cachePhoto, getCachedPhoto, closePhotoCache };
