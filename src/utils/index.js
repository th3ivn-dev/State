const { calculateHash } = require('./hash');
const {
  formatTime,
  formatDate,
  formatDateTime,
  formatTimeRemaining,
  formatUptime,
  formatDurationFromMs,
  formatMemory,
  formatExactDuration,
  formatInterval,
  formatDuration,
} = require('./formatting');
const { getMinutesDifference, parseTime, getCurrentTime } = require('./time');
const { isAdmin } = require('./auth');
const { escapeHtml } = require('./html');
const { getBotUsername, getChannelConnectionInstructions } = require('./botHelpers');
const { generateLiveStatusMessage } = require('./liveStatus');

module.exports = {
  calculateHash,
  formatTime,
  formatDate,
  formatDateTime,
  formatTimeRemaining,
  formatUptime,
  formatDurationFromMs,
  formatMemory,
  formatExactDuration,
  formatInterval,
  formatDuration,
  getMinutesDifference,
  parseTime,
  getCurrentTime,
  isAdmin,
  escapeHtml,
  getBotUsername,
  getChannelConnectionInstructions,
  generateLiveStatusMessage,
};
