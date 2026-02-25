const { getAdminKeyboard, getAdminSettingsMenuKeyboard, getRestartConfirmKeyboard } = require('../../keyboards/inline');
const { pool } = require('../../database/db');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const { saveAllUserStates, stopPowerMonitoring } = require('../../powerMonitor');

// Callback handler for database/restart callbacks
async function handleDatabaseCallback(bot, query, chatId, userId, data) {
  // Clear DB handlers
  if (data === 'admin_clear_db') {
    await safeEditMessageText(bot,
      `⚠️ <b>УВАГА: Очищення бази даних</b>\n\n` +
      `Ця дія видалить ВСІХ користувачів з бази.\n` +
      `Це потрібно при переході на новий бот.\n\n` +
      `❗️ Дія незворотня!`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '← Скасувати', callback_data: 'admin_settings_menu' },
              { text: '🗑 Так, очистити', callback_data: 'admin_clear_db_confirm' }
            ]
          ]
        }
      }
    );
    return;
  }

  if (data === 'admin_clear_db_confirm') {
    // Очистити таблицю users з транзакцією для атомарності

    try {
      // Використовуємо транзакцію для забезпечення атомарності
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM users');
        await client.query('DELETE FROM power_history');
        await client.query('DELETE FROM outage_history');
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      await safeEditMessageText(bot,
        `✅ <b>База очищена</b>\n\n` +
        `Всі користувачі видалені.\n` +
        `Нові користувачі можуть починати з /start`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: getAdminSettingsMenuKeyboard().reply_markup
        }
      );
      await safeAnswerCallbackQuery(bot, query.id, { text: '✅ База очищена' });
    } catch (error) {
      console.error('Error clearing database:', error);
      await safeAnswerCallbackQuery(bot, query.id, {
        text: '❌ Помилка очищення бази',
        show_alert: true
      });
    }
    return;
  }

  if (data === 'admin_restart') {

    await safeEditMessageText(bot,
      '🔄 <b>Перезапуск бота</b>\n\n' +
      '⚠️ Бот буде недоступний ~10-15 секунд.\n' +
      'Всі налаштування та дані збережуться.\n\n' +
      'Ви впевнені?',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getRestartConfirmKeyboard().reply_markup,
      }
    );
    return;
  }

  if (data === 'admin_restart_confirm') {
    await safeAnswerCallbackQuery(bot, query.id, {
      text: '🔄 Перезапуск бота...',
      show_alert: false
    });

    await safeEditMessageText(bot,
      '🔄 <b>Перезапуск бота через 3 секунди...</b>\n\n' +
      '⏳ Бот буде доступний через ~10-15 секунд.',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
      }
    );

    // Graceful shutdown: зберігаємо стани перед виходом
    setTimeout(() => {
      // Wrap everything in try-catch to handle any unhandled promise rejections
      (async () => {
        try {
          // Зберігаємо стани користувачів
          await saveAllUserStates();
          stopPowerMonitoring();
          console.log('🔄 Адмін-перезапуск ініційований користувачем', userId);
        } catch (error) {
          console.error('Помилка при graceful shutdown:', error);
        } finally {
          // Always exit, even if there were errors during shutdown
          process.exit(1);
        }
      })();
    }, 3000);

    return;
  }
}

module.exports = {
  handleDatabaseCallback,
};
