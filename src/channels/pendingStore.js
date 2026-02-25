/**
 * Управління тимчасовими каналами в процесі підключення
 * Extracted from bot.js for better architecture
 */

const { savePendingChannel, deletePendingChannel, getAllPendingChannels } = require('../database/db');
const { MAX_INSTRUCTION_MESSAGES_MAP_SIZE, MAX_PENDING_CHANNELS_MAP_SIZE, PENDING_CHANNEL_CLEANUP_INTERVAL_MS } = require('../constants/timeouts');
const logger = require('../logger').child({ module: 'pendingStore' });

// Store pending channel connections
const pendingChannels = new Map();

// Store channel instruction message IDs (для видалення старих інструкцій)
const channelInstructionMessages = new Map();

// Автоочистка застарілих записів з pendingChannels (кожну годину)
const botCleanupInterval = setInterval(() => {
  const oneHourAgo = Date.now() - PENDING_CHANNEL_CLEANUP_INTERVAL_MS;

  // Cleanup pendingChannels with size limit
  for (const [key, value] of pendingChannels.entries()) {
    if (value && value.timestamp && value.timestamp < oneHourAgo) {
      pendingChannels.delete(key);
    }
  }

  // Enforce max size limit for pendingChannels (LRU-style)
  if (pendingChannels.size >= MAX_PENDING_CHANNELS_MAP_SIZE) {
    const entriesToDelete = pendingChannels.size - MAX_PENDING_CHANNELS_MAP_SIZE;
    const keys = Array.from(pendingChannels.keys()).slice(0, entriesToDelete);
    keys.forEach(key => pendingChannels.delete(key));
    logger.info(`🧹 Очищено ${entriesToDelete} старих pending channels (перевищено ліміт ${MAX_PENDING_CHANNELS_MAP_SIZE})`);
  }

  // Cleanup channelInstructionMessages with size limit
  if (channelInstructionMessages.size >= MAX_INSTRUCTION_MESSAGES_MAP_SIZE) {
    const entriesToDelete = channelInstructionMessages.size - MAX_INSTRUCTION_MESSAGES_MAP_SIZE;
    const keys = Array.from(channelInstructionMessages.keys()).slice(0, entriesToDelete);
    keys.forEach(key => channelInstructionMessages.delete(key));
    logger.info(`🧹 Очищено ${entriesToDelete} старих instruction messages (перевищено ліміт ${MAX_INSTRUCTION_MESSAGES_MAP_SIZE})`);
  }
}, PENDING_CHANNEL_CLEANUP_INTERVAL_MS); // Кожну годину

/**
 * Додати канал до списку pending з збереженням у БД
 * @param {string} channelId - ID каналу
 * @param {object} data - Дані каналу (channelUsername, channelTitle, telegramId, timestamp)
 * @returns {Promise<void>}
 */
async function setPendingChannel(channelId, data) {
  // Enforce max size before adding
  if (pendingChannels.size >= MAX_PENDING_CHANNELS_MAP_SIZE) {
    // Remove oldest entry (first in iteration)
    const firstKey = pendingChannels.keys().next().value;
    pendingChannels.delete(firstKey);
  }

  pendingChannels.set(channelId, data);
  await savePendingChannel(channelId, data.channelUsername, data.channelTitle, data.telegramId);
}

/**
 * Видалити канал зі списку pending та БД
 * @param {string} channelId - ID каналу
 * @returns {Promise<void>}
 */
async function removePendingChannel(channelId) {
  pendingChannels.delete(channelId);
  await deletePendingChannel(channelId);
}

/**
 * Відновити pending channels з БД при запуску бота
 * @returns {Promise<void>}
 */
async function restorePendingChannels() {
  const channels = await getAllPendingChannels();
  for (const channel of channels) {
    // Don't call setPendingChannel here to avoid double-writing to DB
    pendingChannels.set(channel.channel_id, {
      channelId: channel.channel_id,
      channelUsername: channel.channel_username,
      channelTitle: channel.channel_title,
      telegramId: channel.telegram_id,
      timestamp: new Date(channel.created_at).getTime()
    });
  }
  logger.info(`✅ Відновлено ${channels.length} pending каналів`);
}

/**
 * Зупинити cleanup інтервал
 * @returns {void}
 */
function stopBotCleanup() {
  clearInterval(botCleanupInterval);
  logger.info('🛑 Bot cleanup interval зупинено');
}

module.exports = {
  pendingChannels,
  channelInstructionMessages,
  setPendingChannel,
  removePendingChannel,
  restorePendingChannels,
  stopBotCleanup,
};
