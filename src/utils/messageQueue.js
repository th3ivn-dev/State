const { createLogger } = require('./logger');
const { TELEGRAM_RATE_LIMIT_PER_SEC, TELEGRAM_RETRY_AFTER_DEFAULT_MS, TELEGRAM_MAX_RETRIES } = require('../constants/timeouts');

const logger = createLogger('MessageQueue');

// Priority levels
const PRIORITY = {
  high: 0,    // User interactions
  normal: 1,  // Schedule updates
  low: 2      // Admin notifications
};

class MessageQueue {
  constructor() {
    this.bot = null;
    this.queue = [];
    this.processing = false;
    this.metrics = {
      sent: 0,
      retries: 0,
      failures: 0
    };
    this.rateLimit = TELEGRAM_RATE_LIMIT_PER_SEC;
    this.intervalMs = 1000 / this.rateLimit;
    this.draining = false;
  }

  /**
   * Initialize the message queue with a bot instance
   * @param {object} botInstance - Telegram bot instance
   */
  init(botInstance) {
    this.bot = botInstance;
    logger.success('Message queue initialized');
  }

  /**
   * Add a message to the queue
   * @param {string} method - Bot method name (sendMessage, sendPhoto, etc.)
   * @param {array} args - Method arguments
   * @param {string} priority - Priority level (high, normal, low)
   * @returns {Promise} - Resolves when message is sent
   */
  enqueue(method, args, priority = 'normal') {
    if (!this.bot) {
      return Promise.reject(new Error('Message queue not initialized'));
    }

    return new Promise((resolve, reject) => {
      const item = {
        method,
        args,
        priority: PRIORITY[priority] || PRIORITY.normal,
        resolve,
        reject,
        retries: 0,
        timestamp: Date.now()
      };

      // Insert based on priority
      const insertIndex = this.queue.findIndex(q => q.priority > item.priority);
      if (insertIndex === -1) {
        this.queue.push(item);
      } else {
        this.queue.splice(insertIndex, 0, item);
      }

      this.process();
    });
  }

  /**
   * Process the queue
   */
  async process() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && !this.draining) {
      const item = this.queue.shift();

      try {
        const result = await this.executeWithRetry(item);
        item.resolve(result);
        this.metrics.sent++;
      } catch (error) {
        item.reject(error);
        this.metrics.failures++;
        logger.error(`Failed to send message after ${item.retries} retries:`, { error: error.message });
      }

      // Rate limiting delay
      await this.sleep(this.intervalMs);
    }

    this.processing = false;
  }

  /**
   * Execute a bot method with retry logic
   * @param {object} item - Queue item
   * @returns {Promise} - Result from bot method
   */
  async executeWithRetry(item) {
    while (item.retries < TELEGRAM_MAX_RETRIES) {
      try {
        return await this.bot.api[item.method](...item.args);
      } catch (error) {
        item.retries++;
        this.metrics.retries++;

        // Handle rate limiting (429)
        if (error.response && error.response.statusCode === 429) {
          const retryAfter = (error.response.body?.parameters?.retry_after || (TELEGRAM_RETRY_AFTER_DEFAULT_MS / 1000)) * 1000;
          logger.warn(`Rate limited, retrying after ${retryAfter}ms`);
          await this.sleep(retryAfter);
          continue;
        }

        // Handle 5xx errors with exponential backoff
        if (error.response && error.response.statusCode >= 500) {
          const backoff = Math.min(1000 * Math.pow(2, item.retries - 1), 30000);
          logger.warn(`Server error (${error.response.statusCode}), retrying after ${backoff}ms`);
          await this.sleep(backoff);
          continue;
        }

        // Non-retryable error
        throw error;
      }
    }

    throw new Error(`Failed after ${TELEGRAM_MAX_RETRIES} retries`);
  }

  /**
   * Send a text message
   * @param {number|string} chatId - Chat ID
   * @param {string} text - Message text
   * @param {object} options - Message options
   * @param {string} priority - Priority level
   * @returns {Promise}
   */
  sendMessage(chatId, text, options = {}, priority = 'normal') {
    return this.enqueue('sendMessage', [chatId, text, options], priority);
  }

  /**
   * Send a photo
   * @param {number|string} chatId - Chat ID
   * @param {string|Buffer} photo - Photo path or buffer
   * @param {object} options - Photo options
   * @param {string} priority - Priority level
   * @returns {Promise}
   */
  sendPhoto(chatId, photo, options = {}, priority = 'normal') {
    return this.enqueue('sendPhoto', [chatId, photo, options], priority);
  }

  /**
   * Edit message text
   * @param {string} text - New text
   * @param {object} options - Edit options
   * @param {string} priority - Priority level
   * @returns {Promise}
   */
  editMessageText(text, options = {}, priority = 'normal') {
    return this.enqueue('editMessageText', [text, options], priority);
  }

  /**
   * Edit message caption
   * @param {string} caption - New caption
   * @param {object} options - Edit options
   * @param {string} priority - Priority level
   * @returns {Promise}
   */
  editMessageCaption(caption, options = {}, priority = 'normal') {
    return this.enqueue('editMessageCaption', [caption, options], priority);
  }

  /**
   * Delete a message
   * @param {number|string} chatId - Chat ID
   * @param {number} messageId - Message ID
   * @param {string} priority - Priority level
   * @returns {Promise}
   */
  deleteMessage(chatId, messageId, priority = 'normal') {
    return this.enqueue('deleteMessage', [chatId, messageId], priority);
  }

  /**
   * Send batch messages with staggering
   * @param {array} messages - Array of {method, args, priority}
   * @param {object} options - Batch options
   * @returns {Promise}
   */
  async sendBatch(messages, options = {}) {
    const staggerMs = options.staggerMs || 50;
    const results = [];

    for (const msg of messages) {
      const promise = this.enqueue(msg.method, msg.args, msg.priority || 'normal');
      results.push(promise);
      await this.sleep(staggerMs);
    }

    return Promise.allSettled(results);
  }

  /**
   * Drain the queue (wait for all pending messages)
   * @param {number} timeoutMs - Maximum time to wait for drain (default: 10000ms)
   * @returns {Promise}
   */
  async drain(timeoutMs = 10000) {
    this.draining = true;
    logger.info('Draining message queue...');

    const deadline = Date.now() + timeoutMs;
    while ((this.queue.length > 0 || this.processing) && Date.now() < deadline) {
      await this.sleep(100);
    }

    if (this.queue.length > 0 || this.processing) {
      logger.warn(`Message queue drain timed out with ${this.queue.length} messages remaining`);
    } else {
      logger.success('Message queue drained');
    }
    this.draining = false;
  }

  /**
   * Get queue metrics
   * @returns {object}
   */
  getMetrics() {
    return {
      ...this.metrics,
      queueSize: this.queue.length,
      processing: this.processing
    };
  }

  /**
   * Sleep helper
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
const messageQueue = new MessageQueue();

module.exports = messageQueue;
