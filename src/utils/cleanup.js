const { pendingChannels } = require('../state/pendingChannels');
const { MAX_INSTRUCTION_MESSAGES_MAP_SIZE, MAX_PENDING_CHANNELS_MAP_SIZE, PENDING_CHANNEL_CLEANUP_INTERVAL_MS } = require('../constants/timeouts');

function startBotCleanup(channelInstructionMessages) {
  const interval = setInterval(() => {
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
      console.log(`🧹 Очищено ${entriesToDelete} старих pending channels (перевищено ліміт ${MAX_PENDING_CHANNELS_MAP_SIZE})`);
    }

    // Cleanup channelInstructionMessages with size limit
    if (channelInstructionMessages.size >= MAX_INSTRUCTION_MESSAGES_MAP_SIZE) {
      const entriesToDelete = channelInstructionMessages.size - MAX_INSTRUCTION_MESSAGES_MAP_SIZE;
      const keys = Array.from(channelInstructionMessages.keys()).slice(0, entriesToDelete);
      keys.forEach(key => channelInstructionMessages.delete(key));
      console.log(`🧹 Очищено ${entriesToDelete} старих instruction messages (перевищено ліміт ${MAX_INSTRUCTION_MESSAGES_MAP_SIZE})`);
    }
  }, PENDING_CHANNEL_CLEANUP_INTERVAL_MS); // Кожну годину

  return interval;
}

function stopBotCleanup(interval) {
  clearInterval(interval);
}

module.exports = { startBotCleanup, stopBotCleanup };
