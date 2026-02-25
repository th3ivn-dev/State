/**
 * User Service
 *
 * Handles all user-related business logic.
 * This service is Telegram-agnostic and can be used independently.
 *
 * Responsibilities:
 * - User CRUD operations
 * - User settings management
 * - User preferences
 * - User validation
 */

const usersDb = require('../database/users');
const { REGIONS } = require('../constants/regions');

class UserService {
  /**
   * Get user by Telegram ID
   * @param {string} telegramId - Telegram user ID
   * @returns {object|null} User object or null if not found
   */
  getUserByTelegramId(telegramId) {
    return usersDb.getUserByTelegramId(telegramId);
  }

  /**
   * Get user by channel ID
   * @param {string} channelId - Channel ID
   * @returns {object|null} User object or null if not found
   */
  getUserByChannelId(channelId) {
    return usersDb.getUserByChannelId(channelId);
  }

  /**
   * Check if user exists
   * @param {string} telegramId - Telegram user ID
   * @returns {boolean} True if user exists
   */
  async userExists(telegramId) {
    return !!(await this.getUserByTelegramId(telegramId));
  }

  /**
   * Create or update user
   * @param {object} userData - User data
   * @returns {object} Created/updated user
   */
  async saveUser(userData) {
    const { telegramId, username, region, queue } = userData;

    // Validate required fields
    if (!telegramId || !region || !queue) {
      throw new Error('Missing required fields: telegramId, region, queue');
    }

    // Validate region
    if (!REGIONS[region]) {
      throw new Error(`Invalid region: ${region}`);
    }

    // Save to database
    await usersDb.saveUser(telegramId, username, region, queue);

    return this.getUserByTelegramId(telegramId);
  }

  /**
   * Update user settings
   * @param {string} telegramId - Telegram user ID
   * @param {object} settings - Settings to update
   * @returns {object} Updated user
   */
  async updateUserSettings(telegramId, settings) {
    const user = await this.getUserByTelegramId(telegramId);

    if (!user) {
      throw new Error(`User not found: ${telegramId}`);
    }

    // Update allowed settings
    const allowedSettings = [
      'notify_before_off',
      'notify_before_on',
      'alerts_off_enabled',
      'alerts_on_enabled',
      'router_ip'
    ];

    const updates = {};
    for (const key of allowedSettings) {
      if (settings[key] !== undefined) {
        updates[key] = settings[key];
      }
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      await usersDb.updateUser(telegramId, updates);
    }

    return this.getUserByTelegramId(telegramId);
  }

  /**
   * Deactivate user
   * @param {string} telegramId - Telegram user ID
   */
  async deactivateUser(telegramId) {
    await usersDb.updateUser(telegramId, { is_active: false });
  }

  /**
   * Activate user
   * @param {string} telegramId - Telegram user ID
   */
  async activateUser(telegramId) {
    await usersDb.updateUser(telegramId, { is_active: true });
  }

  /**
   * Delete user data
   * @param {string} telegramId - Telegram user ID
   */
  async deleteUser(telegramId) {
    await usersDb.deleteUser(telegramId);
  }

  /**
   * Get users by region
   * @param {string} region - Region code
   * @returns {Array} Array of users
   */
  getUsersByRegion(region) {
    return usersDb.getUsersByRegion(region);
  }

  /**
   * Get all active users
   * @returns {Array} Array of active users
   */
  async getAllActiveUsers() {
    const allUsers = await usersDb.getAllUsers();
    return allUsers.filter(user => user.is_active);
  }

  /**
   * Get user statistics
   * @returns {object} User statistics
   */
  async getUserStats() {
    const allUsers = await usersDb.getAllUsers();

    return {
      total: allUsers.length,
      active: allUsers.filter(u => u.is_active).length,
      withChannel: allUsers.filter(u => u.channel_id).length,
      withIpMonitoring: allUsers.filter(u => u.router_ip).length,
      byRegion: this._countByRegion(allUsers)
    };
  }

  /**
   * Оновити поля користувача напряму
   * @param {string} telegramId - Telegram user ID
   * @param {object} updates - Поля для оновлення (наприклад: last_schedule_message_id, is_active, channel_id тощо)
   * @returns {Promise<boolean>}
   */
  updateUser(telegramId, updates) {
    return usersDb.updateUser(telegramId, updates);
  }

  /**
   * Отримати snapshot-хеші для визначення змін у графіку
   * @param {string} telegramId - Telegram user ID
   * @returns {Promise<{today_hash: string|null, tomorrow_hash: string|null}>} Snapshot hashes
   */
  getSnapshotHashes(telegramId) {
    return usersDb.getSnapshotHashes(telegramId);
  }

  /**
   * Встановити статус активності користувача
   * @param {string} telegramId - Telegram user ID
   * @param {boolean} isActive - Новий статус
   * @returns {Promise<boolean>}
   */
  setUserActive(telegramId, isActive) {
    return usersDb.setUserActive(telegramId, isActive);
  }

  /**
   * Оновити налаштування куди надсилати сповіщення (bot/channel/both)
   * @param {string} telegramId - Telegram user ID
   * @param {string} target - Ціль: 'bot', 'channel', 'both'
   * @returns {Promise<boolean>}
   */
  updateUserPowerNotifyTarget(telegramId, target) {
    return usersDb.updateUserPowerNotifyTarget(telegramId, target);
  }

  /**
   * Оновити статус каналу
   * @param {string} telegramId - Telegram user ID
   * @param {string} status - Новий статус (active/blocked)
   * @returns {Promise<boolean>}
   */
  updateChannelStatus(telegramId, status) {
    return usersDb.updateChannelStatus(telegramId, status);
  }

  /**
   * Оновити регіон та чергу
   * @param {string} telegramId - Telegram user ID
   * @param {string} region - Код регіону
   * @param {string} queue - Номер черги
   * @returns {Promise<boolean>}
   */
  updateUserRegionAndQueue(telegramId, region, queue) {
    return usersDb.updateUserRegionAndQueue(telegramId, region, queue);
  }

  /**
   * Отримати статистику користувачів з БД
   * @returns {Promise<object>}
   */
  getDbUserStats() {
    return usersDb.getUserStats();
  }

  /**
   * Отримати нещодавніх користувачів
   * @param {number} limit - Кількість
   * @returns {Promise<Array>}
   */
  getRecentUsers(limit) {
    return usersDb.getRecentUsers(limit);
  }

  /**
   * Отримати всіх користувачів
   * @returns {Promise<Array>}
   */
  getAllUsers() {
    return usersDb.getAllUsers();
  }

  /**
   * Створити нового користувача
   * @param {string} telegramId
   * @param {string} username
   * @param {string} region
   * @param {string} queue
   * @returns {Promise<object>}
   */
  createUser(telegramId, username, region, queue) {
    return usersDb.createUser(telegramId, username, region, queue);
  }

  /**
   * Оновити IP-адресу роутера
   * @param {string} telegramId - Telegram user ID
   * @param {string|null} routerIp - IP-адреса або null для видалення
   * @returns {Promise<boolean>}
   */
  updateUserRouterIp(telegramId, routerIp) {
    return usersDb.updateUserRouterIp(telegramId, routerIp);
  }

  /**
   * Private helper to count users by region
   * @param {Array} users - Array of users
   * @returns {object} Count by region
   */
  _countByRegion(users) {
    const counts = {};
    for (const user of users) {
      counts[user.region] = (counts[user.region] || 0) + 1;
    }
    return counts;
  }
}

// Export singleton instance
module.exports = new UserService();
