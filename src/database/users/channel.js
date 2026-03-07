const { pool } = require('../db');
const logger = require('../../utils/logger');

// Оновити channel_id користувача
async function updateUserChannel(telegramId, channelId) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET channel_id = $1, updated_at = NOW()
      WHERE telegram_id = $2
    `, [channelId, telegramId]);

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in updateUserChannel', { error: error.message });
    return false;
  }
}

// Оновити channel_id та скинути інформацію про брендування
async function resetUserChannel(telegramId, channelId) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET channel_id = $1,
          channel_title = NULL,
          channel_description = NULL,
          channel_photo_file_id = NULL,
          channel_user_title = NULL,
          channel_user_description = NULL,
          channel_status = 'active',
          updated_at = NOW()
      WHERE telegram_id = $2
    `, [channelId, telegramId]);

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in resetUserChannel', { error: error.message });
    return false;
  }
}

// Оновити брендування каналу
// Sets channel_branding_updated_at timestamp to track bot-made changes
// Returns: true if update succeeded, false otherwise
async function updateChannelBranding(telegramId, brandingData) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET channel_title = $1,
          channel_description = $2,
          channel_photo_file_id = $3,
          channel_user_title = $4,
          channel_user_description = $5,
          channel_status = 'active',
          channel_branding_updated_at = NOW(),
          updated_at = NOW()
      WHERE telegram_id = $6
    `, [
      brandingData.channelTitle,
      brandingData.channelDescription,
      brandingData.channelPhotoFileId,
      brandingData.userTitle,
      brandingData.userDescription || null,
      telegramId
    ]);

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in updateChannelBranding', { error: error.message });
    return false;
  }
}

// Оновити частково брендування каналу (з можливістю оновити лише окремі поля)
// Sets channel_branding_updated_at timestamp to track bot-made changes
// Returns: true if update succeeded, false if no fields to update or update failed
async function updateChannelBrandingPartial(telegramId, brandingData) {
  try {
    const fields = [];
    const values = [];

    if (brandingData.channelTitle !== undefined) {
      values.push(brandingData.channelTitle);
      fields.push(`channel_title = $${values.length}`);
    }

    if (brandingData.channelDescription !== undefined) {
      values.push(brandingData.channelDescription);
      fields.push(`channel_description = $${values.length}`);
    }

    if (brandingData.channelPhotoFileId !== undefined) {
      values.push(brandingData.channelPhotoFileId);
      fields.push(`channel_photo_file_id = $${values.length}`);
    }

    if (brandingData.userTitle !== undefined) {
      values.push(brandingData.userTitle);
      fields.push(`channel_user_title = $${values.length}`);
    }

    if (brandingData.userDescription !== undefined) {
      values.push(brandingData.userDescription);
      fields.push(`channel_user_description = $${values.length}`);
    }

    if (fields.length === 0) {
      logger.warn('updateChannelBrandingPartial викликано без полів для оновлення');
      return false;
    }

    // Always update the timestamp when branding is changed through bot
    fields.push('channel_branding_updated_at = NOW()');
    fields.push('updated_at = NOW()');
    values.push(telegramId);

    const result = await pool.query(`
      UPDATE users 
      SET ${fields.join(', ')}
      WHERE telegram_id = $${values.length}
    `, values);

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in updateChannelBrandingPartial', { error: error.message });
    return false;
  }
}

// Оновити статус каналу
async function updateChannelStatus(telegramId, status) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET channel_status = $1, updated_at = NOW()
      WHERE telegram_id = $2
    `, [status, telegramId]);

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in updateChannelStatus', { error: error.message });
    return false;
  }
}

// Оновити статус паузи каналу користувача
async function updateUserChannelPaused(telegramId, paused) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET channel_paused = $1, updated_at = NOW()
      WHERE telegram_id = $2
    `, [paused ? true : false, telegramId]);

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Error in updateUserChannelPaused', { error: error.message });
    return false;
  }
}

module.exports = {
  updateUserChannel,
  resetUserChannel,
  updateChannelBranding,
  updateChannelBrandingPartial,
  updateChannelStatus,
  updateUserChannelPaused,
};
