// Re-export all utility modules for centralized access
// This allows both import from subdirectories and from this index

const { calculateHash } = require('./hash');
const { isAdmin } = require('./validation');
const {
  generateLiveStatusMessage,
  getBotUsername,
  getChannelConnectionInstructions
} = require('./telegram');

// Also re-export from root utils.js for functions not yet migrated
const utils = require('../utils');

module.exports = {
  // Hash utilities
  calculateHash,

  // Validation utilities
  isAdmin,

  // Telegram utilities
  generateLiveStatusMessage,
  getBotUsername,
  getChannelConnectionInstructions,

  // Format utilities from utils.js (to be migrated)
  formatTime: utils.formatTime,
  formatDate: utils.formatDate,
  formatDateTime: utils.formatDateTime,
  getMinutesDifference: utils.getMinutesDifference,
  formatTimeRemaining: utils.formatTimeRemaining,
  parseTime: utils.parseTime,
  getCurrentTime: utils.getCurrentTime,
  formatUptime: utils.formatUptime,
  formatDurationFromMs: utils.formatDurationFromMs,
  formatMemory: utils.formatMemory,
  formatExactDuration: utils.formatExactDuration,
  formatInterval: utils.formatInterval,
  formatDuration: utils.formatDuration,
  escapeHtml: utils.escapeHtml,
};
