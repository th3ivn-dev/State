const { userService } = require('../../services');
const { REGIONS } = require('../../constants/regions');
const { isAdmin } = require('../../utils');
const config = require('../../config');
const { safeEditMessageText } = require('../../utils/errorHandler');
const { getSettingsKeyboard } = require('../../keyboards/inline');

async function handleRegionCallback(bot, query, user) {
  const chatId = query.message.chat.id;
  const telegramId = String(query.from.id);
  const data = query.data;

  // Показати підтвердження перед зміною черги
  if (data === 'settings_region') {
    const confirmKeyboard = {
      inline_keyboard: [
        [
          { text: 'Так, змінити', callback_data: 'settings_region_confirm', icon_custom_emoji_id: '5206607081334906820' },
          { text: 'Скасувати', callback_data: 'back_to_settings', icon_custom_emoji_id: '5210952531676504517' }
        ]
      ]
    };

    await safeEditMessageText(bot,
      '<tg-emoji emoji-id="5447644880824181073">⚠️</tg-emoji> <b>Зміна регіону/черги</b>\n\n' +
      'Поточні налаштування:\n' +
      `<tg-emoji emoji-id="5399898266265475100">📍</tg-emoji> Регіон: ${REGIONS[user.region]?.name || user.region}\n` +
      `<tg-emoji emoji-id="5390854796011906616">🔢</tg-emoji> Черга: ${user.queue}\n\n` +
      'Ви впевнені, що хочете змінити регіон або чергу?',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: confirmKeyboard,
      }
    );
    return;
  }

  // Підтвердження зміни черги
  if (data === 'settings_region_confirm') {
    // Видаляємо попереднє повідомлення
    try {
      await bot.api.deleteMessage(chatId, query.message.message_id);
    } catch (_e) {
      // Ігноруємо помилки видалення
    }

    // Запускаємо wizard в режимі редагування
    const { startWizard } = require('../start');
    const username = query.from.username || query.from.first_name;
    await startWizard(bot, chatId, telegramId, username, 'edit');

    return;
  }

  // Назад до налаштувань
  if (data === 'back_to_settings') {
    const updatedUser = await userService.getUserByTelegramId(telegramId);
    const userIsAdmin = isAdmin(telegramId, config.adminIds, config.ownerId);
    const region = REGIONS[updatedUser.region]?.name || updatedUser.region;

    // Build settings message according to new format
    let message = '⚙️ <b>Налаштування</b>\n\n';
    message += 'Поточні параметри:\n\n';
    message += `📍 Регіон: ${region} • ${updatedUser.queue}\n`;
    message += `📺 Канал: ${updatedUser.channel_id ? updatedUser.channel_id + ' ✅' : 'не підключено'}\n`;
    message += `📡 IP: ${updatedUser.router_ip ? updatedUser.router_ip + ' ✅' : 'не підключено'}\n`;
    message += `🔔 Сповіщення: ${updatedUser.is_active ? 'увімкнено ✅' : 'вимкнено'}\n\n`;
    message += 'Керування:\n';

    await safeEditMessageText(bot, message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getSettingsKeyboard(userIsAdmin).reply_markup,
    });
    return;
  }
}

module.exports = { handleRegionCallback };
