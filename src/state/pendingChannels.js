const { savePendingChannel, deletePendingChannel, getAllPendingChannels } = require('../database/db');
const { MAX_PENDING_CHANNELS_MAP_SIZE } = require('../constants/timeouts');
const logger = require('../utils/logger');

// Store pending channel connections
const pendingChannels = new Map();

// Helper functions to manage pending channels with DB persistence
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

async function removePendingChannel(channelId) {
  pendingChannels.delete(channelId);
  await deletePendingChannel(channelId);
}

/**
 * Відновити pending channels з БД при запуску бота
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
  logger.info('✅ Відновлено pending каналів', { count: channels.length });
}

module.exports = { pendingChannels, setPendingChannel, removePendingChannel, restorePendingChannels };
