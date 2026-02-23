const usersDb = require('../../database/users');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { getIpMonitoringKeyboard, getIpCancelKeyboard, getMainMenu } = require('../../keyboards/inline');
const { logIpMonitoringSetup } = require('../../growthMetrics');
const { getUserIpStatus } = require('../../powerMonitor');
const { setIpSetupState, getIpSetupState, clearIpSetupState, isValidIPorDomain } = require('./helpers');

async function handleIpCallback(bot, query, user) {
  const chatId = query.message.chat.id;
  const telegramId = String(query.from.id);
  const data = query.data;

  // IP моніторинг меню
  if (data === 'settings_ip') {
    await safeEditMessageText(bot,
      '🌐 <b>IP моніторинг</b>\n\n' +
      `Поточна IP: ${user.router_ip || 'не налаштовано'}\n\n` +
      'Оберіть опцію:',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getIpMonitoringKeyboard().reply_markup,
      }
    );
    return;
  }

  // IP instruction
  if (data === 'ip_instruction') {
    const instructionText = `ℹ️ <b>Налаштування моніторингу через IP</b>

Налаштування може здатися складним, особливо якщо ви не айтішник,
але всі кроки можна виконати самостійно.
Нижче описано, як саме працює моніторинг і що потрібно для його коректної роботи.

━━━━━━━━━━━━━━━━━━━━

🔌 <b>Важливі умови</b>

Для роботи IP-моніторингу потрібен роутер,
який стає недоступним при вимкненні електроенергії.

Зверніть увагу:
• якщо роутер підключений до ДБЖ або powerbank'у,
  він не вимикатиметься разом зі світлом
• у такому випадку потрібно вказати інший роутер —
  саме той, який втрачає живлення під час відключень

У деяких ситуаціях також може знадобитися налаштування Port Forwarding
на головному роутері, щоб доступ до потрібного пристрою
був можливий з інтернету.

━━━━━━━━━━━━━━━━━━━━

⚡ <b>Принцип роботи</b>

СвітлоБот перевіряє доступність вашого роутера ззовні.
Якщо роутер перестає відповідати — вважається, що світло зникло.
Коли доступ до роутера відновлюється — світло зʼявилось.

Перевірка виконується автоматично сервером
і не потребує додаткових дій після налаштування.

━━━━━━━━━━━━━━━━━━━━

🛠 <b>Варіанти налаштування</b>

1️⃣ <b>Використання статичної IP-адреси</b>

Деякі інтернет-провайдери надають статичну IP-адресу,
але часто це окрема платна послуга.

Варто врахувати:
• динамічна IP-адреса може змінюватися
• у такому разі моніторинг працюватиме некоректно

Корисні сервіси для перевірки:
• Визначення вашої IP-адреси: https://2ip.ua/ua
• Перевірка доступності з інтернету:
  https://2ip.ua/ua/services/ip-service/ping-traceroute
• Перевірка відкритих портів (Port Forwarding):
  https://2ip.ua/ua/services/ip-service/port-check

━━━━━━━━━━━━━━━━━━━━

2️⃣ <b>Доменне імʼя DDNS (альтернатива статичній IP)</b>

DDNS (Dynamic Domain Name System) дозволяє
підключатися до роутера через доменне імʼя,
навіть якщо IP-адреса змінюється.

У цьому випадку роутер самостійно оновлює інформацію
про свою поточну IP-адресу,
а моніторинг продовжує працювати без переривань.

Що потрібно зробити:
• увімкнути DDNS у налаштуваннях роутера
• скопіювати згенероване доменне імʼя
• вставити його сюди

━━━━━━━━━━━━━━━━━━━━

📘 <b>Інструкції з налаштування DDNS</b>

• ASUS — https://www.asus.com/ua-ua/support/FAQ/1011725/
• TP-Link:
  – https://help-wifi.com/tp-link/nastrojka-ddns-dinamicheskij-dns-na-routere-tp-link/
  – https://www.youtube.com/watch?v=Q97_8XVyBuo
• NETGEAR — https://www.hardreset.info/uk/devices/netgear/netgear-dgnd3700v2/faq/dns-settings/how-to-change-dns/
• D-Link — https://yesondd.com/361-dlinkddns-com-remote-access-to-d-link-wifi-router-via-internet-via-ddns
• MikroTik — https://xn----7sba7aachdbqfnhtigrl.xn--j1amh/nastrojka-mikrotik-cloud-sobstvennyj-ddns/
• Xiaomi — https://www.hardreset.info/ru/devices/xiaomi/xiaomi-mi-router-4a/nastroyki-dns/

Багато роутерів також підтримують сторонні DDNS-сервіси
(наприклад, noip.com), навіть якщо вбудованого клієнта DDNS немає.
У такому випадку налаштування виконується вручну.

━━━━━━━━━━━━━━━━━━━━

✍️ <b>Що потрібно ввести</b>

Після налаштування статичної IP-адреси або DDNS
поверніться назад і натисніть «Підключити IP».

Приклади форматів:
• 89.267.32.1
• 89.267.32.1:80 (80 — ваш порт)
• myhome.ddns.net`;

    // Кнопки навігації під інструкцією
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '← Назад', callback_data: 'settings_ip' },
            { text: '⤴ Меню', callback_data: 'back_to_main' }
          ]
        ]
      }
    };

    await bot.api.editMessageText(chatId, query.message.message_id, instructionText, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...keyboard
    });

    return;
  }

  // IP setup
  if (data === 'ip_setup') {
    // Check if user already has an IP address
    if (user.router_ip) {
      await safeEditMessageText(bot,
        '⚠️ У вас вже додана IP-адреса:\n\n' +
        `📡 ${user.router_ip}\n\n` +
        'Щоб додати нову адресу — спочатку видаліть поточну.',
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🗑 Видалити адресу', callback_data: 'ip_delete' }
              ],
              [
                { text: '← Назад', callback_data: 'settings_ip' },
                { text: '⤴ Меню', callback_data: 'back_to_main' }
              ]
            ]
          }
        }
      );
      return;
    }

    await safeEditMessageText(bot,
      '🌐 <b>Налаштування IP</b>\n\n' +
      'Надішліть IP-адресу вашого роутера або DDNS домен.\n\n' +
      'Приклади:\n' +
      '• 89.267.32.1\n' +
      '• 89.267.32.1:80\n' +
      '• myhome.ddns.net\n\n' +
      '⏰ Час очікування введення: 5 хвилин',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getIpCancelKeyboard().reply_markup,
      }
    );

    // Set up warning timeout (4 minutes = 5 minutes - 1 minute)
    const warningTimeout = setTimeout(() => {
      bot.api.sendMessage(
        chatId,
        '⏳ Залишилась 1 хвилина.\n' +
        'Надішліть IP-адресу або продовжіть пізніше.'
      ).catch(() => {});
    }, 240000); // 4 minutes

    // Set up final timeout (5 minutes)
    const finalTimeout = setTimeout(async () => {
      await clearIpSetupState(telegramId);

      // Send timeout message with navigation buttons
      const timeoutUser = await usersDb.getUserByTelegramId(telegramId);

      let botStatus = 'active';
      if (!timeoutUser.channel_id) {
        botStatus = 'no_channel';
      } else if (!timeoutUser.is_active) {
        botStatus = 'paused';
      }
      const channelPaused = timeoutUser.channel_paused === true;

      await bot.api.sendMessage(
        chatId,
        '⌛ <b>Час вийшов.</b>\n' +
        'Режим налаштування IP завершено.\n\n' +
        'Оберіть наступну дію:',
        {
          parse_mode: 'HTML',
          ...getMainMenu(botStatus, channelPaused)
        }
      ).catch(() => {});
    }, 300000); // 5 minutes

    await setIpSetupState(telegramId, {
      messageId: query.message.message_id,
      warningTimeout: warningTimeout,
      finalTimeout: finalTimeout,
      timestamp: Date.now()
    });

    return;
  }

  // IP cancel
  if (data === 'ip_cancel') {
    const state = getIpSetupState(telegramId);
    if (state) {
      if (state.warningTimeout) clearTimeout(state.warningTimeout);
      if (state.finalTimeout) clearTimeout(state.finalTimeout);
      if (state.timeout) clearTimeout(state.timeout); // backwards compatibility
      await clearIpSetupState(telegramId);
    }

    await safeEditMessageText(bot,
      '❌ Налаштування IP скасовано.\n\nОберіть наступну дію:',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '← Назад', callback_data: 'settings_ip' },
              { text: '⤴ Меню', callback_data: 'back_to_main' }
            ]
          ]
        }
      }
    );
    return;
  }

  // IP show
  if (data === 'ip_show') {
    if (!user.router_ip) {
      await safeAnswerCallbackQuery(bot, query.id, {
        text: 'ℹ️ IP-адреса не налаштована',
        show_alert: true
      });
      return;
    }

    // Get IP monitoring status
    const ipStatus = getUserIpStatus(user.telegram_id);

    const statusInfo = [
      `📍 IP-адреса: ${user.router_ip}`,
      ``,
      `Статус: ${ipStatus.label}`,
    ];

    if (ipStatus.lastPing) {
      statusInfo.push(`Останній пінг: ${ipStatus.lastPing}`);
    }

    if (ipStatus.state === 'unstable') {
      statusInfo.push(`⚠️ Зʼєднання нестабільне`);
    }

    await safeAnswerCallbackQuery(bot, query.id, {
      text: statusInfo.join('\n'),
      show_alert: true
    });
    return;
  }

  // IP delete
  if (data === 'ip_delete') {
    if (!user.router_ip) {
      await safeAnswerCallbackQuery(bot, query.id, { text: 'ℹ️ IP-адреса не налаштована' });
      return;
    }

    await usersDb.updateUserRouterIp(telegramId, null);

    await safeEditMessageText(bot,
      '✅ IP-адресу видалено.\n\nОберіть наступну дію:',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '← Назад', callback_data: 'settings_ip' },
              { text: '⤴ Меню', callback_data: 'back_to_main' }
            ]
          ]
        }
      }
    );
    return;
  }
}

// Handle IP setup conversation
async function handleIpConversation(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);
  const text = msg.text;

  const state = getIpSetupState(telegramId);
  if (!state) return false;

  try {
    // Clear all timeouts
    if (state.timeout) clearTimeout(state.timeout);
    if (state.warningTimeout) clearTimeout(state.warningTimeout);
    if (state.finalTimeout) clearTimeout(state.finalTimeout);

    // Validate IP address using the new validation function
    const validationResult = isValidIPorDomain(text);

    if (!validationResult.valid) {
      await bot.api.sendMessage(chatId, `❌ ${validationResult.error}`);

      // Reset timeout with new 5-minute timer
      const warningTimeout = setTimeout(() => {
        bot.api.sendMessage(
          chatId,
          '⏳ Залишилась 1 хвилина.\n' +
          'Надішліть IP-адресу або продовжіть пізніше.'
        ).catch(() => {});
      }, 240000); // 4 minutes

      const finalTimeout = setTimeout(async () => {
        await clearIpSetupState(telegramId);

        // Send timeout message with navigation buttons
        const user = await usersDb.getUserByTelegramId(telegramId);

        let botStatus = 'active';
        if (!user.channel_id) {
          botStatus = 'no_channel';
        } else if (!user.is_active) {
          botStatus = 'paused';
        }
        const channelPaused = user.channel_paused === true;

        await bot.api.sendMessage(
          chatId,
          '⌛ <b>Час вийшов.</b>\n' +
          'Режим налаштування IP завершено.\n\n' +
          'Оберіть наступну дію:',
          {
            parse_mode: 'HTML',
            ...getMainMenu(botStatus, channelPaused)
          }
        ).catch(() => {});
      }, 300000); // 5 minutes

      state.warningTimeout = warningTimeout;
      state.finalTimeout = finalTimeout;
      await setIpSetupState(telegramId, state);

      return true;
    }

    // Save IP address using the trimmed and validated address
    await usersDb.updateUserRouterIp(telegramId, validationResult.address);
    await clearIpSetupState(telegramId);

    // Log IP monitoring setup for growth tracking
    await logIpMonitoringSetup(telegramId);

    // Send success message with navigation buttons
    await bot.api.sendMessage(
      chatId,
      `✅ IP-адресу збережено\n\n` +
      `📡 Адреса: ${validationResult.address}\n\n` +
      `Тепер бот буде моніторити доступність цієї адреси для визначення наявності світла.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '← Назад', callback_data: 'settings_ip' },
              { text: '⤴ Меню', callback_data: 'back_to_main' }
            ]
          ]
        }
      }
    );

    return true;
  } catch (error) {
    console.error('Помилка в handleIpConversation:', error);
    await clearIpSetupState(telegramId);

    // Send error message with navigation buttons
    const user = await usersDb.getUserByTelegramId(telegramId);

    let botStatus = 'active';
    if (user && !user.channel_id) {
      botStatus = 'no_channel';
    } else if (user && !user.is_active) {
      botStatus = 'paused';
    }
    const channelPaused = user ? user.channel_paused === true : false;

    await bot.api.sendMessage(
      chatId,
      '😅 Щось пішло не так. Спробуйте ще раз.\n\nОберіть наступну дію:',
      getMainMenu(botStatus, channelPaused)
    );
    return true;
  }
}

module.exports = { handleIpCallback, handleIpConversation };
