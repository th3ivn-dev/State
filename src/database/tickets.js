const { safeQuery } = require('./db');
const { createLogger } = require('../utils/logger');

const logger = createLogger('TicketsDb');

async function createTicket(telegramId, type, subject) {
  try {
    const result = await safeQuery(`
      INSERT INTO tickets (telegram_id, type, subject, status, created_at, updated_at)
      VALUES ($1, $2, $3, 'open', NOW(), NOW())
      RETURNING *
    `, [telegramId, type, subject]);
    return result.rows[0];
  } catch (error) {
    logger.error('Помилка створення тикета:', { error: error.message });
    throw error;
  }
}

async function addTicketMessage(ticketId, senderType, senderId, messageType, content, fileId = null) {
  try {
    const result = await safeQuery(`
      INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, message_type, content, file_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `, [ticketId, senderType, senderId, messageType, content, fileId]);

    await safeQuery(`UPDATE tickets SET updated_at = NOW() WHERE id = $1`, [ticketId]);
    return result.rows[0];
  } catch (error) {
    logger.error('Помилка додавання повідомлення до тикета:', { error: error.message });
    throw error;
  }
}

async function getTicketById(ticketId) {
  try {
    const result = await safeQuery('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Помилка отримання тикета:', { error: error.message });
    return null;
  }
}

async function getTicketsByUser(telegramId) {
  try {
    const result = await safeQuery(
      'SELECT * FROM tickets WHERE telegram_id = $1 ORDER BY created_at DESC',
      [telegramId]
    );
    return result.rows;
  } catch (error) {
    logger.error('Помилка отримання тикетів користувача:', { error: error.message });
    return [];
  }
}

async function getTicketsByStatus(status, limit = 50) {
  try {
    const result = await safeQuery(
      'SELECT * FROM tickets WHERE status = $1 ORDER BY created_at DESC LIMIT $2',
      [status, limit]
    );
    return result.rows;
  } catch (error) {
    logger.error('Помилка отримання тикетів за статусом:', { error: error.message });
    return [];
  }
}

async function getTicketMessages(ticketId) {
  try {
    const result = await safeQuery(
      'SELECT * FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC',
      [ticketId]
    );
    return result.rows;
  } catch (error) {
    logger.error('Помилка отримання повідомлень тикета:', { error: error.message });
    return [];
  }
}

async function updateTicketStatus(ticketId, status, closedBy = null) {
  try {
    if (status === 'closed') {
      await safeQuery(`
        UPDATE tickets 
        SET status = $1, updated_at = NOW(), closed_at = NOW(), closed_by = $2
        WHERE id = $3
      `, [status, closedBy, ticketId]);
    } else {
      await safeQuery(`
        UPDATE tickets 
        SET status = $1, updated_at = NOW()
        WHERE id = $2
      `, [status, ticketId]);
    }
    return true;
  } catch (error) {
    logger.error('Помилка оновлення статусу тикета:', { error: error.message });
    return false;
  }
}

async function getTicketStats() {
  try {
    const totalResult = await safeQuery('SELECT COUNT(*) as count FROM tickets');
    const total = parseInt(totalResult.rows[0].count);

    const openResult = await safeQuery("SELECT COUNT(*) as count FROM tickets WHERE status = 'open'");
    const open = parseInt(openResult.rows[0].count);

    const inProgressResult = await safeQuery("SELECT COUNT(*) as count FROM tickets WHERE status = 'in_progress'");
    const inProgress = parseInt(inProgressResult.rows[0].count);

    const closedResult = await safeQuery("SELECT COUNT(*) as count FROM tickets WHERE status = 'closed'");
    const closed = parseInt(closedResult.rows[0].count);

    return { total, open, inProgress, closed };
  } catch (error) {
    logger.error('Помилка отримання статистики тикетів:', { error: error.message });
    return { total: 0, open: 0, inProgress: 0, closed: 0 };
  }
}

async function getOpenTicketsCount() {
  try {
    const result = await safeQuery("SELECT COUNT(*) as count FROM tickets WHERE status = 'open'");
    return parseInt(result.rows[0].count);
  } catch (error) {
    logger.error('Помилка отримання кількості відкритих тикетів:', { error: error.message });
    return 0;
  }
}

module.exports = {
  createTicket,
  addTicketMessage,
  getTicketById,
  getTicketsByUser,
  getTicketsByStatus,
  getTicketMessages,
  updateTicketStatus,
  getTicketStats,
  getOpenTicketsCount,
};
