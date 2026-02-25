const usersDb = require('../../database/users');
const ticketsDb = require('../../database/tickets');
const { getAdminKeyboard, getAdminMenuKeyboard, getUsersMenuKeyboard, getAdminAnalyticsKeyboard, getAdminSettingsMenuKeyboard } = require('../../keyboards/inline');
const { formatMemory, formatUptime, isAdmin } = require('../../utils');
const config = require('../../config');
const { REGIONS } = require('../../constants/regions');
const { getSetting, setSetting } = require('../../database/db');
const { safeSendMessage, safeEditMessageText } = require('../../utils/errorHandler');
const { formatAnalytics } = require('../../analytics');

// Обробник команди /admin
async function handleAdmin(bot, msg) {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  if (!isAdmin(userId, config.adminIds, config.ownerId)) {
    await safeSendMessage(bot, chatId, '❓ Невідома команда. Використовуйте /start для початку.');
    return;
  }

  try {
    const openTicketsCount = await ticketsDb.getOpenTicketsCount();

    await safeSendMessage(
      bot,
      chatId,
      '👨‍💼 <b>Адмін панель</b>\n\nОберіть опцію:',
      {
        parse_mode: 'HTML',
        ...getAdminKeyboard(openTicketsCount),
      }
    );
  } catch (error) {
    console.error('Помилка в handleAdmin:', error);
    await safeSendMessage(bot, chatId, '❌ Виникла помилка.');
  }
}

// Обробник команди /stats
async function handleStats(bot, msg) {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  if (!isAdmin(userId, config.adminIds, config.ownerId)) {
    await safeSendMessage(bot, chatId, '❓ Невідома команда. Використовуйте /start для початку.');
    return;
  }

  try {
    // Use new analytics module
    const message = await formatAnalytics();

    await safeSendMessage(bot, chatId, message, { parse_mode: 'HTML' });

  } catch (error) {
    console.error('Помилка в handleStats:', error);
    await safeSendMessage(bot, chatId, '❌ Виникла помилка.');
  }
}

// Обробник команди /users
async function handleUsers(bot, msg) {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  if (!isAdmin(userId, config.adminIds, config.ownerId)) {
    await bot.api.sendMessage(chatId, '❓ Невідома команда. Використовуйте /start для початку.');
    return;
  }

  try {
    const users = await usersDb.getRecentUsers(20);

    if (users.length === 0) {
      await bot.api.sendMessage(chatId, 'ℹ️ Користувачів не знайдено.');
      return;
    }

    let message = '👥 <b>Останні 20 користувачів:</b>\n\n';

    users.forEach((user, index) => {
      const regionName = REGIONS[user.region]?.name || user.region;
      const status = user.is_active ? '✅' : '❌';
      const channel = user.channel_id ? '📺' : '';

      message += `${index + 1}. ${status} @${user.username || 'без username'}\n`;
      message += `   ${regionName}, Черга ${user.queue} ${channel}\n`;
      message += `   ID: <code>${user.telegram_id}</code>\n\n`;
    });

    await bot.api.sendMessage(chatId, message, { parse_mode: 'HTML' });

  } catch (error) {
    console.error('Помилка в handleUsers:', error);
    await bot.api.sendMessage(
      chatId,
      '❌ Виникла помилка.\n\nОберіть наступну дію:',
      getAdminMenuKeyboard()
    );
  }
}

// Обробник команди /broadcast
async function handleBroadcast(bot, msg) {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  if (!isAdmin(userId, config.adminIds, config.ownerId)) {
    await bot.api.sendMessage(chatId, '❓ Невідома команда. Використовуйте /start для початку.');
    return;
  }

  try {
    // Отримуємо текст повідомлення (після /broadcast)
    const text = msg.text.replace('/broadcast', '').trim();

    if (!text) {
      await bot.api.sendMessage(
        chatId,
        '❌ Використання: /broadcast <повідомлення>\n\nПриклад:\n/broadcast Важливе оновлення!'
      );
      return;
    }

    const users = await usersDb.getAllActiveUsers();

    if (users.length === 0) {
      await bot.api.sendMessage(chatId, 'ℹ️ Немає активних користувачів.');
      return;
    }

    await bot.api.sendMessage(chatId, `📤 Розсилка повідомлення ${users.length} користувачам...`);

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      try {
        await bot.api.sendMessage(user.telegram_id, `📢 <b>Повідомлення від адміністрації:</b>\n\n${text}`, {
          parse_mode: 'HTML',
        });
        sent++;

        // Затримка для уникнення rate limit
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`Помилка відправки користувачу ${user.telegram_id}:`, error.message);
        failed++;
      }
    }

    await bot.api.sendMessage(
      chatId,
      `✅ Розсилка завершена!\n\n` +
      `Відправлено: ${sent}\n` +
      `Помилок: ${failed}`
    );

  } catch (error) {
    console.error('Помилка в handleBroadcast:', error);
    await bot.api.sendMessage(
      chatId,
      '❌ Виникла помилка при розсилці.\n\nОберіть наступну дію:',
      getAdminMenuKeyboard()
    );
  }
}

// Обробник команди /system
async function handleSystem(bot, msg) {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  if (!isAdmin(userId, config.adminIds, config.ownerId)) {
    await bot.api.sendMessage(chatId, '❓ Невідома команда. Використовуйте /start для початку.');
    return;
  }

  try {
    const uptime = process.uptime();
    const memory = process.memoryUsage();

    let message = '💻 <b>Інформація про систему</b>\n\n';
    message += `⏱ Uptime: ${formatUptime(uptime)}\n`;
    message += `📊 Memory (RSS): ${formatMemory(memory.rss)}\n`;
    message += `📊 Memory (Heap): ${formatMemory(memory.heapUsed)} / ${formatMemory(memory.heapTotal)}\n`;
    message += `📊 Node.js: ${process.version}\n`;
    message += `📊 Platform: ${process.platform}\n\n`;

    // Railway environment info
    if (process.env.RAILWAY_ENVIRONMENT) {
      message += '<b>Railway:</b>\n';
      message += `Environment: ${process.env.RAILWAY_ENVIRONMENT}\n`;
      message += `Project: ${process.env.RAILWAY_PROJECT_NAME || 'N/A'}\n`;
      message += `Service: ${process.env.RAILWAY_SERVICE_NAME || 'N/A'}\n`;
    }

    await bot.api.sendMessage(chatId, message, { parse_mode: 'HTML' });

  } catch (error) {
    console.error('Помилка в handleSystem:', error);
    await bot.api.sendMessage(
      chatId,
      '❌ Виникла помилка.\n\nОберіть наступну дію:',
      getAdminMenuKeyboard()
    );
  }
}

// Обробник команди /setinterval
async function handleSetInterval(bot, msg, match) {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  if (!isAdmin(userId, config.adminIds, config.ownerId)) {
    await bot.api.sendMessage(chatId, '❓ Невідома команда. Використовуйте /start для початку.');
    return;
  }

  try {
    // Формат: /setinterval schedule 300 або /setinterval power 5
    const type = match[1]; // schedule або power
    const value = parseInt(match[2], 10);

    if (type !== 'schedule' && type !== 'power') {
      await bot.api.sendMessage(
        chatId,
        '❌ Невірний тип інтервалу.\n\n' +
        'Використання:\n' +
        '/setinterval schedule <сек> - інтервал перевірки графіка\n' +
        '/setinterval power <сек> - інтервал моніторингу світла\n\n' +
        'Приклад:\n' +
        '/setinterval schedule 300\n' +
        '/setinterval power 5\n\n' +
        'Оберіть наступну дію:',
        getAdminMenuKeyboard()
      );
      return;
    }

    if (isNaN(value)) {
      await bot.api.sendMessage(
        chatId,
        '❌ Значення має бути числом.\n\nОберіть наступну дію:',
        getAdminMenuKeyboard()
      );
      return;
    }

    // Валідація лімітів
    if (type === 'schedule') {
      if (value < 5 || value > 3600) {
        await bot.api.sendMessage(
          chatId,
          '❌ Інтервал перевірки графіка має бути від 5 до 3600 сек (60 хв).\n\n' +
          'Оберіть наступну дію:',
          getAdminMenuKeyboard()
        );
        return;
      }
    } else if (type === 'power') {
      if (value < 1 || value > 60) {
        await bot.api.sendMessage(
          chatId,
          '❌ Інтервал моніторингу світла має бути від 1 до 60 сек.\n\n' +
          'Оберіть наступну дію:',
          getAdminMenuKeyboard()
        );
        return;
      }
    }

    // Зберігаємо в БД
    const key = type === 'schedule' ? 'schedule_check_interval' : 'power_check_interval';
    await setSetting(key, String(value));

    const typeName = type === 'schedule' ? 'перевірки графіка' : 'моніторингу світла';
    await bot.api.sendMessage(
      chatId,
      `✅ Інтервал ${typeName} встановлено: ${value} сек\n\n` +
      '⚠️ Для застосування змін потрібен перезапуск бота.'
    );

  } catch (error) {
    console.error('Помилка в handleSetInterval:', error);
    await bot.api.sendMessage(
      chatId,
      '❌ Виникла помилка.\n\nОберіть наступну дію:',
      getAdminMenuKeyboard()
    );
  }
}

// Обробник команди /setdebounce
async function handleSetDebounce(bot, msg, match) {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  if (!isAdmin(userId, config.adminIds, config.ownerId)) {
    await bot.api.sendMessage(chatId, '❓ Невідома команда. Використовуйте /start для початку.');
    return;
  }

  try {
    const value = parseInt(match[1], 10);

    if (isNaN(value)) {
      await bot.api.sendMessage(
        chatId,
        '❌ Значення має бути числом.\n\nОберіть наступну дію:',
        getAdminMenuKeyboard()
      );
      return;
    }

    // Валідація: від 0 до 30 хвилин (0 = вимкнено)
    if (value < 0 || value > 30) {
      await bot.api.sendMessage(
        chatId,
        '❌ Час debounce має бути від 0 до 30 хвилин.\n\n' +
        '0 = вимкнено (без затримок)\n' +
        'Рекомендовано: 3-5 хвилин\n\n' +
        'Оберіть наступну дію:',
        getAdminMenuKeyboard()
      );
      return;
    }

    // Зберігаємо в БД
    await setSetting('power_debounce_minutes', String(value));

    // Display appropriate message based on value
    let message;
    if (value === 0) {
      message = `✅ Debounce вимкнено. Сповіщення надходитимуть без затримок.\n\n` +
        'Зміни застосуються автоматично при наступній перевірці.';
    } else {
      message = `✅ Час debounce встановлено: ${value} хв\n\n` +
        'Нові зміни стану світла будуть публікуватись тільки після ' +
        `${value} хвилин стабільного стану.\n\n` +
        'Зміни застосуються автоматично при наступній перевірці.';
    }

    await bot.api.sendMessage(chatId, message);

  } catch (error) {
    console.error('Помилка в handleSetDebounce:', error);
    await bot.api.sendMessage(
      chatId,
      '❌ Виникла помилка.\n\nОберіть наступну дію:',
      getAdminMenuKeyboard()
    );
  }
}

// Обробник команди /debounce
async function handleGetDebounce(bot, msg) {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  if (!isAdmin(userId, config.adminIds, config.ownerId)) {
    await bot.api.sendMessage(chatId, '❓ Невідома команда. Використовуйте /start для початку.');
    return;
  }

  try {
    const value = await getSetting('power_debounce_minutes', '5');

    await bot.api.sendMessage(
      chatId,
      `⚙️ <b>Поточний час debounce:</b> ${value} хв\n\n` +
      'Зміни стану світла публікуються після ' +
      `${value} хвилин стабільного стану.\n\n` +
      'Для зміни використайте:\n' +
      '/setdebounce <хвилини>',
      { parse_mode: 'HTML' }
    );

  } catch (error) {
    console.error('Помилка в handleGetDebounce:', error);
    await bot.api.sendMessage(
      chatId,
      '❌ Виникла помилка.\n\nОберіть наступну дію:',
      getAdminMenuKeyboard()
    );
  }
}

// Callback handler for commands/core: admin_stats, admin_users*, admin_broadcast, admin_system, admin_menu, noop
async function handleCommandsCallback(bot, query, chatId, userId, data) {
  if (data === 'admin_stats') {
    // Use new analytics module
    const message = await formatAnalytics();

    await safeEditMessageText(bot, message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '← Назад', callback_data: 'admin_menu' },
            { text: '⤴ Меню', callback_data: 'back_to_main' }
          ]
        ]
      },
    });
    return;
  }

  if (data === 'admin_users') {
    const stats = await usersDb.getUserStats();

    await safeEditMessageText(bot,
      `👥 <b>Користувачі</b>\n\n` +
      `📊 Всього: ${stats.total}\n` +
      `✅ Активних: ${stats.active}\n` +
      `📺 З каналами: ${stats.withChannels}\n\n` +
      `Оберіть дію:`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getUsersMenuKeyboard().reply_markup,
      }
    );
    return;
  }

  if (data === 'admin_users_stats') {
    const stats = await usersDb.getUserStats();

    let message = `📊 <b>Статистика користувачів</b>\n\n`;
    message += `📊 Всього: ${stats.total}\n`;
    message += `✅ Активних: ${stats.active}\n`;
    message += `❌ Неактивних: ${stats.total - stats.active}\n`;
    message += `📺 З каналами: ${stats.withChannels}\n`;
    message += `📱 Тільки бот: ${stats.total - stats.withChannels}\n\n`;

    message += `🏙 <b>За регіонами:</b>\n`;
    for (const r of stats.byRegion) {
      const regionName = REGIONS[r.region]?.name || r.region;
      message += `  ${regionName}: ${r.count}\n`;
    }

    await safeEditMessageText(bot, message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '← Назад', callback_data: 'admin_users' }],
          [{ text: '⤴ Меню', callback_data: 'back_to_main' }]
        ]
      }
    });
    return;
  }

  if (data.startsWith('admin_users_list_')) {
    const page = parseInt(data.replace('admin_users_list_', ''), 10) || 1;
    const perPage = 10;

    const allUsers = await usersDb.getAllUsers(); // вже відсортовані по created_at DESC
    const totalPages = Math.ceil(allUsers.length / perPage);
    const currentPage = Math.min(page, totalPages) || 1;
    const startIndex = (currentPage - 1) * perPage;
    const pageUsers = allUsers.slice(startIndex, startIndex + perPage);

    let message = `📋 <b>Користувачі</b> (${allUsers.length} всього)\n`;
    message += `📄 Сторінка ${currentPage}/${totalPages}\n\n`;

    pageUsers.forEach((user, index) => {
      const num = startIndex + index + 1;
      const regionName = REGIONS[user.region]?.name || user.region;
      const channelIcon = user.channel_id ? ' 📺' : '';
      const ipIcon = user.router_ip ? ' 📡' : '';
      const activeIcon = user.is_active ? '' : ' ❌';

      message += `${num}. ${user.username ? '@' + user.username : 'без username'} • ${regionName} ${user.queue}${channelIcon}${ipIcon}${activeIcon}\n`;
    });

    // Пагінація
    const navButtons = [];
    if (currentPage > 1) {
      navButtons.push({ text: '← Попередня', callback_data: `admin_users_list_${currentPage - 1}` });
    }
    navButtons.push({ text: `${currentPage}/${totalPages}`, callback_data: 'noop' });
    if (currentPage < totalPages) {
      navButtons.push({ text: 'Наступна →', callback_data: `admin_users_list_${currentPage + 1}` });
    }

    const keyboard = [];
    if (navButtons.length > 1) {
      keyboard.push(navButtons);
    }
    keyboard.push([
      { text: '← Назад', callback_data: 'admin_users' },
      { text: '⤴ Меню', callback_data: 'back_to_main' }
    ]);

    await safeEditMessageText(bot, message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    });
    return;
  }

  if (data === 'noop') {
    return;
  }

  if (data === 'admin_broadcast') {
    await safeEditMessageText(bot,
      '📢 <b>Розсилка повідомлення</b>\n\n' +
      'Для розсилки використовуйте команду:\n' +
      '<code>/broadcast Ваше повідомлення</code>\n\n' +
      'Приклад:\n' +
      '<code>/broadcast Важливе оновлення! Нова версія бота.</code>\n\n' +
      'Повідомлення буде відправлено всім активним користувачам.',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getAdminKeyboard().reply_markup,
      }
    );
    return;
  }

  if (data === 'admin_system') {
    const uptime = process.uptime();
    const memory = process.memoryUsage();

    let message = '💻 <b>Інформація про систему</b>\n\n';
    message += `⏱ Uptime: ${formatUptime(uptime)}\n`;
    message += `📊 Memory (RSS): ${formatMemory(memory.rss)}\n`;
    message += `📊 Memory (Heap): ${formatMemory(memory.heapUsed)} / ${formatMemory(memory.heapTotal)}\n`;
    message += `📊 Node.js: ${process.version}\n`;
    message += `📊 Platform: ${process.platform}\n\n`;

    if (process.env.RAILWAY_ENVIRONMENT) {
      message += '<b>Railway:</b>\n';
      message += `Environment: ${process.env.RAILWAY_ENVIRONMENT}\n`;
    }

    await safeEditMessageText(bot, message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '← Назад', callback_data: 'admin_settings_menu' },
            { text: '⤴ Меню', callback_data: 'back_to_main' }
          ]
        ]
      },
    });
    return;
  }

  if (data === 'admin_analytics') {
    await safeEditMessageText(bot,
      '📊 <b>Аналітика</b>',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getAdminAnalyticsKeyboard().reply_markup,
      }
    );
    return;
  }

  if (data === 'admin_settings_menu') {
    await safeEditMessageText(bot,
      '⚙️ <b>Налаштування бота</b>',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getAdminSettingsMenuKeyboard().reply_markup,
      }
    );
    return;
  }

  // Admin menu callback (back from intervals)
  if (data === 'admin_menu') {
    const openTicketsCount = await ticketsDb.getOpenTicketsCount();

    await safeEditMessageText(bot,
      '🔧 <b>Адмін-панель</b>',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getAdminKeyboard(openTicketsCount).reply_markup,
      }
    );
    return;
  }
}

module.exports = {
  handleAdmin,
  handleStats,
  handleUsers,
  handleBroadcast,
  handleSystem,
  handleSetInterval,
  handleSetDebounce,
  handleGetDebounce,
  handleCommandsCallback,
};
