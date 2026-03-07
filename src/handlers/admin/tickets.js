const ticketsDb = require('../../database/tickets');
const { getAdminTicketKeyboard, getAdminTicketsListKeyboard } = require('../../keyboards/inline');
const { safeSendMessage, safeEditMessageText, safeDeleteMessage, safeAnswerCallbackQuery } = require('../../utils/errorHandler');

// Local Map for admin reply states
// key: telegramId адміна
// value: { ticketId }
const adminReplyStates = new Map();

// Helper function to format ticket message for display
async function formatTicketView(ticketId) {
  const ticket = await ticketsDb.getTicketById(ticketId);
  if (!ticket) return null;

  const messages = await ticketsDb.getTicketMessages(ticketId);
  const typeEmoji = ticket.type === 'bug' ? '🐛 Баг' : ticket.type === 'region_request' ? '🏙 Запит регіону' : '💬 Звернення';
  const statusEmoji = ticket.status === 'open' ? '🆕 Відкрито' : ticket.status === 'closed' ? '✅ Закрито' : '🔄 В роботі';

  let message =
    `📩 <b>Звернення #${ticket.id}</b>\n\n` +
    `${typeEmoji}\n` +
    `${statusEmoji}\n` +
    `👤 <b>Від:</b> <code>${ticket.telegram_id}</code>\n` +
    `📅 <b>Створено:</b> ${new Date(ticket.created_at).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })}\n`;

  if (ticket.subject) {
    message += `📝 <b>Тема:</b> ${ticket.subject}\n`;
  }

  message += '\n<b>Повідомлення:</b>\n\n';

  for (const msg of messages) {
    const senderLabel = msg.sender_type === 'user' ? '👤 Користувач' : '👨‍💼 Адмін';
    message += `${senderLabel}:\n`;

    if (msg.message_type === 'text') {
      message += `${msg.content}\n`;
    } else if (msg.message_type === 'photo') {
      message += `📷 Фото${msg.content ? ': ' + msg.content : ''}\n`;
    } else if (msg.message_type === 'video') {
      message += `🎥 Відео${msg.content ? ': ' + msg.content : ''}\n`;
    }
    message += '\n';
  }

  return { ticket, message };
}

// Callback handler for all ticket-related callbacks
async function handleTicketsCallback(bot, query, chatId, userId, data) {
  // Tickets list
  if (data === 'admin_tickets' || data.startsWith('admin_tickets_page_')) {
    const page = data.startsWith('admin_tickets_page_')
      ? parseInt(data.replace('admin_tickets_page_', ''), 10)
      : 1;

    const openTickets = await ticketsDb.getTicketsByStatus('open');

    if (openTickets.length === 0) {
      await safeEditMessageText(bot,
        '📩 <b>Звернення</b>\n\n' +
        'Немає відкритих звернень.',
        {
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
          }
        }
      );
    } else {
      await safeEditMessageText(bot,
        `📩 <b>Звернення</b>\n\n` +
        `Відкритих звернень: ${openTickets.length}\n\n` +
        'Оберіть звернення для перегляду:',
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: getAdminTicketsListKeyboard(openTickets, page),
        }
      );
    }

    return;
  }

  // View specific ticket
  if (data.startsWith('admin_ticket_view_')) {
    const ticketId = parseInt(data.replace('admin_ticket_view_', ''), 10);
    const result = await formatTicketView(ticketId);

    if (!result) {
      await safeAnswerCallbackQuery(bot, query.id, { text: '❌ Тикет не знайдено' });
      return;
    }

    try {
      await safeEditMessageText(bot, result.message, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getAdminTicketKeyboard(ticketId, result.ticket.status),
      });
    } catch (_editError) {
      // Якщо повідомлення є фото/відео — видаляємо і надсилаємо нове текстове
      try {
        await safeDeleteMessage(bot, chatId, query.message.message_id);
      } catch (e) {
        console.error('Помилка при видаленні повідомлення:', e.message);
      }
      await safeSendMessage(bot, chatId, result.message, {
        parse_mode: 'HTML',
        reply_markup: getAdminTicketKeyboard(ticketId, result.ticket.status),
      });
    }

    return;
  }

  // Close ticket
  if (data.startsWith('admin_ticket_close_')) {
    const ticketId = parseInt(data.replace('admin_ticket_close_', ''), 10);
    const ticket = await ticketsDb.getTicketById(ticketId);

    if (!ticket) {
      await safeAnswerCallbackQuery(bot, query.id, { text: '❌ Тикет не знайдено' });
      return;
    }

    await ticketsDb.updateTicketStatus(ticketId, 'closed', userId);

    // Notify user
    await safeSendMessage(
      bot,
      ticket.telegram_id,
      `✅ <b>Ваше звернення #${ticketId} закрито</b>\n\n` +
      'Дякуємо за звернення!',
      { parse_mode: 'HTML' }
    );

    await safeAnswerCallbackQuery(bot, query.id, { text: '✅ Тикет закрито' });

    // Refresh ticket view using the shared function
    const result = await formatTicketView(ticketId);
    if (result) {
      try {
        await safeEditMessageText(bot, result.message, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: getAdminTicketKeyboard(ticketId, result.ticket.status),
        });
      } catch (_editError) {
        // Якщо повідомлення є фото/відео — видаляємо і надсилаємо нове текстове
        try {
          await safeDeleteMessage(bot, chatId, query.message.message_id);
        } catch (e) {
          console.error('Помилка при видаленні повідомлення:', e.message);
        }
        await safeSendMessage(bot, chatId, result.message, {
          parse_mode: 'HTML',
          reply_markup: getAdminTicketKeyboard(ticketId, result.ticket.status),
        });
      }
    }

    return;
  }

  // Reopen ticket
  if (data.startsWith('admin_ticket_reopen_')) {
    const ticketId = parseInt(data.replace('admin_ticket_reopen_', ''), 10);

    await ticketsDb.updateTicketStatus(ticketId, 'open');
    await safeAnswerCallbackQuery(bot, query.id, { text: '✅ Тикет знову відкрито' });

    // Refresh ticket view using the shared function
    const result = await formatTicketView(ticketId);
    if (result) {
      try {
        await safeEditMessageText(bot, result.message, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: getAdminTicketKeyboard(ticketId, result.ticket.status),
        });
      } catch (_editError) {
        // Якщо повідомлення є фото/відео — видаляємо і надсилаємо нове текстове
        try {
          await safeDeleteMessage(bot, chatId, query.message.message_id);
        } catch (e) {
          console.error('Помилка при видаленні повідомлення:', e.message);
        }
        await safeSendMessage(bot, chatId, result.message, {
          parse_mode: 'HTML',
          reply_markup: getAdminTicketKeyboard(ticketId, result.ticket.status),
        });
      }
    }

    return;
  }

  // Reply to ticket
  if (data.startsWith('admin_ticket_reply_')) {
    const ticketId = parseInt(data.replace('admin_ticket_reply_', ''), 10);
    const ticket = await ticketsDb.getTicketById(ticketId);

    if (!ticket) {
      await safeAnswerCallbackQuery(bot, query.id, { text: '❌ Тикет не знайдено' });
      return;
    }

    // Зберігаємо стан відповіді
    adminReplyStates.set(userId, { ticketId });

    const replyMessage = `💬 <b>Відповідь на звернення #${ticketId}</b>\n\n` +
      `Введіть текст відповіді:`;
    const replyMarkup = {
      inline_keyboard: [
        [{ text: '❌ Скасувати', callback_data: `admin_ticket_reply_cancel_${ticketId}` }]
      ]
    };

    try {
      await safeEditMessageText(bot, replyMessage, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      });
    } catch (_editError) {
      // Якщо повідомлення є фото/відео — видаляємо і надсилаємо нове текстове
      try {
        await safeDeleteMessage(bot, chatId, query.message.message_id);
      } catch (e) {
        console.error('Помилка при видаленні повідомлення:', e.message);
      }
      await safeSendMessage(bot, chatId, replyMessage, {
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      });
    }

    return;
  }

  // Cancel reply to ticket
  if (data.startsWith('admin_ticket_reply_cancel_')) {
    const ticketId = parseInt(data.replace('admin_ticket_reply_cancel_', ''), 10);

    // Очищаємо стан
    adminReplyStates.delete(userId);

    // Повертаємо перегляд тикета
    const result = await formatTicketView(ticketId);
    if (result) {
      try {
        await safeEditMessageText(bot, result.message, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: getAdminTicketKeyboard(ticketId, result.ticket.status),
        });
      } catch (_editError) {
        // Якщо повідомлення є фото/відео — видаляємо і надсилаємо нове текстове
        try {
          await safeDeleteMessage(bot, chatId, query.message.message_id);
        } catch (e) {
          console.error('Помилка при видаленні повідомлення:', e.message);
        }
        await safeSendMessage(bot, chatId, result.message, {
          parse_mode: 'HTML',
          reply_markup: getAdminTicketKeyboard(ticketId, result.ticket.status),
        });
      }
    }

    return;
  }
}

/**
 * Handle admin reply to ticket
 * This function checks if admin is currently replying to a ticket
 * and processes the reply message
 * @param {TelegramBot} bot - Bot instance
 * @param {Object} msg - Telegram message object
 * @returns {Promise<boolean>} - Returns true if handled, false otherwise
 */
async function handleAdminReply(bot, msg) {
  const telegramId = String(msg.from.id);
  const replyState = adminReplyStates.get(telegramId);

  if (!replyState || !msg.text) {
    return false; // Не наш стан
  }

  const { ticketId } = replyState;
  const chatId = msg.chat.id;

  try {
    const ticket = await ticketsDb.getTicketById(ticketId);
    if (!ticket) {
      adminReplyStates.delete(telegramId);
      await safeSendMessage(bot, chatId, '❌ Тикет не знайдено.');
      return true;
    }

    // Зберігаємо відповідь у тикеті
    await ticketsDb.addTicketMessage(ticketId, 'admin', telegramId, 'text', msg.text, null);

    // Надсилаємо відповідь користувачу
    await safeSendMessage(
      bot,
      ticket.telegram_id,
      `💬 <b>Відповідь на ваше звернення #${ticketId}</b>\n\n` +
      `${msg.text}`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⤴ Меню', callback_data: 'back_to_main' }]
          ]
        }
      }
    );

    // Очищаємо стан
    adminReplyStates.delete(telegramId);

    // Показуємо підтвердження адміну з навігацією
    await safeSendMessage(bot, chatId, '✅ Відповідь надіслано користувачу.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📩 Звернення', callback_data: 'admin_tickets' }],
          [
            { text: '← Назад', callback_data: 'admin_menu' },
            { text: '⤴ Меню', callback_data: 'back_to_main' }
          ]
        ]
      }
    });

    return true;
  } catch (error) {
    console.error('Помилка handleAdminReply:', error);
    adminReplyStates.delete(telegramId);
    await safeSendMessage(bot, chatId, '❌ Помилка при надсиланні відповіді.');
    return true;
  }
}

module.exports = {
  handleTicketsCallback,
  handleAdminReply,
};
