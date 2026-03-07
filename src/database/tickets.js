const { pool } = require('./db');

/**
 * Створити новий тикет
 * @param {string} telegramId - Telegram ID користувача
 * @param {string} type - Тип тикета ('feedback' | 'region_request' | 'bug')
 * @param {string} subject - Тема/опис тикета
 * @returns {Promise<Object>} - Створений тикет
 */
async function createTicket(telegramId, type, subject) {
  try {
    const result = await pool.query(`
      INSERT INTO tickets (telegram_id, type, subject, status, created_at, updated_at)
      VALUES ($1, $2, $3, 'open', NOW(), NOW())
      RETURNING *
    `, [telegramId, type, subject]);

    return result.rows[0];
  } catch (error) {
    console.error('Помилка створення тикета:', error.message);
    throw error;
  }
}

/**
 * Додати повідомлення до тикета
 * @param {number} ticketId - ID тикета
 * @param {string} senderType - Тип відправника ('user' | 'admin')
 * @param {string} senderId - ID відправника
 * @param {string} messageType - Тип повідомлення ('text' | 'photo' | 'video')
 * @param {string} content - Текстовий контент повідомлення
 * @param {string} fileId - ID файлу (для фото/відео)
 * @returns {Promise<Object>} - Додане повідомлення
 */
async function addTicketMessage(ticketId, senderType, senderId, messageType, content, fileId = null) {
  try {
    const result = await pool.query(`
      INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, message_type, content, file_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `, [ticketId, senderType, senderId, messageType, content, fileId]);

    // Оновити updated_at в тикеті
    await pool.query(`
      UPDATE tickets SET updated_at = NOW() WHERE id = $1
    `, [ticketId]);

    return result.rows[0];
  } catch (error) {
    console.error('Помилка додавання повідомлення до тикета:', error.message);
    throw error;
  }
}

/**
 * Отримати тикет за ID
 * @param {number} ticketId - ID тикета
 * @returns {Promise<Object|null>} - Тикет або null якщо не знайдено
 */
async function getTicketById(ticketId) {
  try {
    const result = await pool.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Помилка отримання тикета:', error.message);
    return null;
  }
}

/**
 * Отримати всі тикети користувача
 * @param {string} telegramId - Telegram ID користувача
 * @returns {Promise<Array>} - Масив тикетів
 */
async function getTicketsByUser(telegramId) {
  try {
    const result = await pool.query(
      'SELECT * FROM tickets WHERE telegram_id = $1 ORDER BY created_at DESC',
      [telegramId]
    );
    return result.rows;
  } catch (error) {
    console.error('Помилка отримання тикетів користувача:', error.message);
    return [];
  }
}

/**
 * Отримати тикети за статусом
 * @param {string} status - Статус тикета ('open' | 'in_progress' | 'closed')
 * @param {number} limit - Максимальна кількість тикетів (за замовчуванням 50)
 * @returns {Promise<Array>} - Масив тикетів
 */
async function getTicketsByStatus(status, limit = 50) {
  try {
    const result = await pool.query(
      'SELECT * FROM tickets WHERE status = $1 ORDER BY created_at DESC LIMIT $2',
      [status, limit]
    );
    return result.rows;
  } catch (error) {
    console.error('Помилка отримання тикетів за статусом:', error.message);
    return [];
  }
}

/**
 * Отримати всі повідомлення тикета
 * @param {number} ticketId - ID тикета
 * @returns {Promise<Array>} - Масив повідомлень
 */
async function getTicketMessages(ticketId) {
  try {
    const result = await pool.query(
      'SELECT * FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC',
      [ticketId]
    );
    return result.rows;
  } catch (error) {
    console.error('Помилка отримання повідомлень тикета:', error.message);
    return [];
  }
}

/**
 * Оновити статус тикета
 * @param {number} ticketId - ID тикета
 * @param {string} status - Новий статус ('open' | 'in_progress' | 'closed')
 * @param {string} closedBy - ID адміна що закрив тикет (опціонально)
 * @returns {Promise<boolean>} - true якщо успішно
 */
async function updateTicketStatus(ticketId, status, closedBy = null) {
  try {
    if (status === 'closed') {
      await pool.query(`
        UPDATE tickets 
        SET status = $1, updated_at = NOW(), closed_at = NOW(), closed_by = $2
        WHERE id = $3
      `, [status, closedBy, ticketId]);
    } else {
      await pool.query(`
        UPDATE tickets 
        SET status = $1, updated_at = NOW()
        WHERE id = $2
      `, [status, ticketId]);
    }
    return true;
  } catch (error) {
    console.error('Помилка оновлення статусу тикета:', error.message);
    return false;
  }
}

/**
 * Отримати статистику тикетів
 * @returns {Promise<Object>} - Статистика {total, open, inProgress, closed}
 */
async function getTicketStats() {
  try {
    const totalResult = await pool.query('SELECT COUNT(*) as count FROM tickets');
    const total = parseInt(totalResult.rows[0].count);

    const openResult = await pool.query("SELECT COUNT(*) as count FROM tickets WHERE status = 'open'");
    const open = parseInt(openResult.rows[0].count);

    const inProgressResult = await pool.query("SELECT COUNT(*) as count FROM tickets WHERE status = 'in_progress'");
    const inProgress = parseInt(inProgressResult.rows[0].count);

    const closedResult = await pool.query("SELECT COUNT(*) as count FROM tickets WHERE status = 'closed'");
    const closed = parseInt(closedResult.rows[0].count);

    return { total, open, inProgress, closed };
  } catch (error) {
    console.error('Помилка отримання статистики тикетів:', error.message);
    return { total: 0, open: 0, inProgress: 0, closed: 0 };
  }
}

/**
 * Отримати кількість відкритих тикетів
 * @returns {Promise<number>} - Кількість відкритих тикетів
 */
async function getOpenTicketsCount() {
  try {
    const result = await pool.query("SELECT COUNT(*) as count FROM tickets WHERE status = 'open'");
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Помилка отримання кількості відкритих тикетів:', error.message);
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
