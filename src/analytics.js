/**
 * Analytics Module v2
 * Tracks key metrics for monitoring bot health and growth
 */

const usersDb = require('./database/users');

/**
 * Get active users count
 * Active = users who have completed setup
 */
async function getActiveUsersCount() {
  try {
    const stats = await usersDb.getUserStats();
    return stats.active || 0;
  } catch (error) {
    console.error('Error getting active users count:', error);
    return 0;
  }
}

/**
 * Get connected channels count
 */
async function getConnectedChannelsCount() {
  try {
    const stats = await usersDb.getUserStats();
    return stats.withChannels || 0;
  } catch (error) {
    console.error('Error getting connected channels count:', error);
    return 0;
  }
}

/**
 * Get IP monitoring count
 * Users who have configured IP monitoring
 */
async function getIpMonitoringCount() {
  try {
    const users = await usersDb.getUsersWithRouterIp();
    return users.length;
  } catch (error) {
    console.error('Error getting IP monitoring count:', error);
    return 0;
  }
}

/**
 * Get comprehensive analytics
 */
async function getAnalytics() {
  const stats = await usersDb.getUserStats();
  const ipCount = await getIpMonitoringCount();

  return {
    users: {
      total: stats.total || 0,
      active: stats.active || 0,
      inactive: (stats.total || 0) - (stats.active || 0),
    },
    channels: {
      connected: stats.withChannels || 0,
      percentage: stats.total > 0 ? Math.round((stats.withChannels / stats.total) * 100) : 0,
    },
    ipMonitoring: {
      configured: ipCount,
      percentage: stats.total > 0 ? Math.round((ipCount / stats.total) * 100) : 0,
    },
    regions: stats.byRegion || [],
  };
}

/**
 * Format analytics for display
 */
async function formatAnalytics() {
  const analytics = await getAnalytics();

  let message = '📊 <b>Аналітика v2</b>\n\n';

  // Users
  message += '<b>👥 Користувачі</b>\n';
  message += `• Всього: ${analytics.users.total}\n`;
  message += `• Активні: ${analytics.users.active}\n`;
  message += `• Неактивні: ${analytics.users.inactive}\n\n`;

  // Channels
  message += '<b>📺 Канали</b>\n';
  message += `• Підключені: ${analytics.channels.connected} (${analytics.channels.percentage}%)\n\n`;

  // IP Monitoring
  message += '<b>📡 IP-моніторинг</b>\n';
  message += `• Налаштовано: ${analytics.ipMonitoring.configured} (${analytics.ipMonitoring.percentage}%)\n\n`;

  // Regions
  if (analytics.regions.length > 0) {
    message += '<b>🗺 Регіони</b>\n';
    analytics.regions.forEach(region => {
      const { REGIONS } = require('./constants/regions');
      const regionName = REGIONS[region.region]?.name || region.region;
      message += `• ${regionName}: ${region.count}\n`;
    });
  }

  return message;
}

module.exports = {
  getActiveUsersCount,
  getConnectedChannelsCount,
  getIpMonitoringCount,
  getAnalytics,
  formatAnalytics,
};
