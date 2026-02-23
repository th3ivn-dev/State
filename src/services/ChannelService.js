/**
 * Channel Service
 *
 * Handles channel-related business logic.
 * This service is Telegram-agnostic and focuses on:
 * - Channel connection management
 * - Channel validation
 * - Channel settings
 *
 * Does NOT handle Telegram API calls - that's the handler's job
 */

const usersDb = require('../database/users');

class ChannelService {
  /**
   * Validate channel connection
   * @param {string} channelId - Channel ID
   * @param {string} telegramId - User's Telegram ID
   * @returns {object} Validation result { valid, error, errorType }
   */
  async validateChannelConnection(channelId, telegramId) {
    // Check if channel is already occupied by another user
    const existingUser = await usersDb.getUserByChannelId(channelId);

    if (existingUser && existingUser.telegram_id !== telegramId) {
      return {
        valid: false,
        error: 'Channel already connected to another user',
        errorType: 'occupied'
      };
    }

    return { valid: true };
  }

  /**
   * Connect channel to user
   * @param {string} telegramId - User's Telegram ID
   * @param {object} channelData - Channel data
   * @returns {object} Updated user
   */
  async connectChannel(telegramId, channelData) {
    const { channelId, channelTitle, channelDescription, channelPhotoFileId } = channelData;

    // Validate
    const validation = await this.validateChannelConnection(channelId, telegramId);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Update user
    await usersDb.updateUser(telegramId, {
      channel_id: channelId,
      channel_title: channelTitle,
      channel_description: channelDescription,
      channel_photo_file_id: channelPhotoFileId,
      channel_status: 'active'
    });

    return await usersDb.getUserByTelegramId(telegramId);
  }

  /**
   * Disconnect channel from user
   * @param {string} telegramId - User's Telegram ID
   */
  async disconnectChannel(telegramId) {
    await usersDb.updateUser(telegramId, {
      channel_id: null,
      channel_title: null,
      channel_description: null,
      channel_photo_file_id: null,
      channel_user_title: null,
      channel_user_description: null,
      channel_status: null,
      last_published_hash: null,
      last_post_id: null
    });
  }

  /**
   * Update channel branding
   * @param {string} telegramId - User's Telegram ID
   * @param {object} branding - Branding data
   * @returns {object} Updated user
   */
  async updateChannelBranding(telegramId, branding) {
    const { title, description } = branding;

    await usersDb.updateUser(telegramId, {
      channel_user_title: title,
      channel_user_description: description
    });

    return await usersDb.getUserByTelegramId(telegramId);
  }

  /**
   * Mark channel as blocked
   * @param {string} telegramId - User's Telegram ID
   */
  async markChannelBlocked(telegramId) {
    await usersDb.updateUser(telegramId, {
      channel_status: 'blocked'
    });
  }

  /**
   * Mark channel as active
   * @param {string} telegramId - User's Telegram ID
   */
  async markChannelActive(telegramId) {
    await usersDb.updateUser(telegramId, {
      channel_status: 'active'
    });
  }

  /**
   * Get channel info for user
   * @param {string} telegramId - User's Telegram ID
   * @returns {object|null} Channel info or null if no channel
   */
  async getChannelInfo(telegramId) {
    const user = await usersDb.getUserByTelegramId(telegramId);

    if (!user || !user.channel_id) {
      return null;
    }

    return {
      channelId: user.channel_id,
      channelTitle: user.channel_title,
      channelDescription: user.channel_description,
      channelPhotoFileId: user.channel_photo_file_id,
      userTitle: user.channel_user_title,
      userDescription: user.channel_user_description,
      status: user.channel_status,
      lastPublishedHash: user.last_published_hash,
      lastPostId: user.last_post_id
    };
  }

  /**
   * Check if user has active channel
   * @param {string} telegramId - User's Telegram ID
   * @returns {boolean} True if user has active channel
   */
  async hasActiveChannel(telegramId) {
    const channelInfo = await this.getChannelInfo(telegramId);
    return channelInfo && channelInfo.status === 'active';
  }

  /**
   * Update last published hash
   * @param {string} telegramId - User's Telegram ID
   * @param {string} hash - New hash
   * @param {number} postId - Post ID (optional)
   */
  async updateLastPublished(telegramId, hash, postId = null) {
    const updates = { last_published_hash: hash };

    if (postId !== null) {
      updates.last_post_id = postId;
    }

    await usersDb.updateUser(telegramId, updates);
  }
}

// Export singleton instance
module.exports = new ChannelService();
