const usersDb = require('../database/users');
const { isTelegramUserInactiveError } = require('../utils/errorHandler');

// Helper function to get bot ID (cached in bot.options.id)
async function ensureBotId(bot) {
  if (!bot.options.id) {
    const botInfo = await bot.api.getMe();
    bot.options.id = botInfo.id;
  }
  return bot.options.id;
}

// Notify user that their channel is blocked/unavailable
async function notifyChannelBlocked(bot, user, reason) {
  const message = reason === 'permissions'
    ? `⚠️ <b>Канал недоступний</b>\n\n` +
      `Бот не має доступу до вашого каналу або прав на публікацію.\n\n` +
      `🔴 <b>Моніторинг зупинено.</b>\n\n` +
      `Переконайтесь, що бот є адміністратором з правами на публікацію.\n` +
      `Перейдіть у Налаштування → Канал → Підключити канал`
    : `⚠️ <b>Канал недоступний</b>\n\n` +
      `Не вдалося отримати доступ до вашого каналу.\n` +
      `Можливо, бот був видалений або канал видалено.\n\n` +
      `🔴 <b>Моніторинг зупинено.</b>\n\n` +
      `Перейдіть у Налаштування → Канал → Підключити канал`;

  try {
    await bot.api.sendMessage(
      user.telegram_id,
      message,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⚙️ Налаштування', callback_data: 'menu_settings' }]
          ]
        }
      }
    );
  } catch (notifyError) {
    // User has blocked the bot or deleted their account — skip silently
    if (isTelegramUserInactiveError(notifyError)) {
      console.log(`ℹ️ Користувач ${user.telegram_id} недоступний — сповіщення про канал пропущено`);
    } else {
      console.error(`Не вдалося повідомити користувача ${user.telegram_id}:`, notifyError.message);
    }
  }
}

// Validate channel before publishing
// Returns true if channel is valid and bot has necessary permissions, false otherwise.
// If invalid: updates status to 'blocked', notifies user, returns false.
async function validateChannel(bot, user) {
  try {
    // Check if channel exists and bot has access
    await bot.api.getChat(user.channel_id);

    // Check if bot has necessary permissions
    const botId = await ensureBotId(bot);
    const botMember = await bot.api.getChatMember(user.channel_id, botId);

    if (botMember.status !== 'administrator' || !botMember.can_post_messages) {
      console.log(`Бот не має прав на публікацію в канал ${user.channel_id}, оновлюємо статус`);
      await usersDb.updateChannelStatus(user.telegram_id, 'blocked');

      // Notify user about the issue
      await notifyChannelBlocked(bot, user, 'permissions');

      return false;
    }
  } catch (validationError) {
    // Channel not found or not accessible
    console.log(`ℹ️ Канал ${user.channel_id} недоступний: ${validationError.message}`);
    await usersDb.updateChannelStatus(user.telegram_id, 'blocked');

    // Notify user about the issue
    await notifyChannelBlocked(bot, user, 'not_found');

    return false;
  }

  return true;
}

module.exports = {
  ensureBotId,
  notifyChannelBlocked,
  validateChannel,
};
