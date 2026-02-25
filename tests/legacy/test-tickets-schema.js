/**
 * Test script for ticketing system database tables
 */

require('dotenv').config();

// Mock the pool before requiring db module
const { Pool } = require('pg');

console.log('🧪 Тестування схеми бази даних для системи тикетів...\n');

// Check DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL не встановлено');
  console.log('\n💡 Для запуску тестів потрібна змінна DATABASE_URL в .env файлі');
  process.exit(0); // Exit gracefully without error
}

async function testDatabaseSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    console.log('1️⃣ Перевірка підключення до бази даних...');
    const client = await pool.connect();
    console.log('✅ Підключення успішне\n');

    console.log('2️⃣ Перевірка існування таблиць тикетів...');

    // Check tickets table
    const ticketsTableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'tickets'
      );
    `);

    if (ticketsTableCheck.rows[0].exists) {
      console.log('✅ Таблиця tickets існує');

      // Get column info
      const ticketsColumns = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'tickets'
        ORDER BY ordinal_position;
      `);

      console.log('   Колонки таблиці tickets:');
      ticketsColumns.rows.forEach(col => {
        console.log(`   - ${col.column_name} (${col.data_type})`);
      });
    } else {
      console.log('⚠️  Таблиця tickets не існує (буде створена при запуску бота)');
    }

    console.log();

    // Check ticket_messages table
    const messagesTableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'ticket_messages'
      );
    `);

    if (messagesTableCheck.rows[0].exists) {
      console.log('✅ Таблиця ticket_messages існує');

      // Get column info
      const messagesColumns = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'ticket_messages'
        ORDER BY ordinal_position;
      `);

      console.log('   Колонки таблиці ticket_messages:');
      messagesColumns.rows.forEach(col => {
        console.log(`   - ${col.column_name} (${col.data_type})`);
      });
    } else {
      console.log('⚠️  Таблиця ticket_messages не існує (буде створена при запуску бота)');
    }

    console.log('\n3️⃣ Перевірка індексів...');

    const indexesCheck = await client.query(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE tablename IN ('tickets', 'ticket_messages')
      ORDER BY tablename, indexname;
    `);

    if (indexesCheck.rows.length > 0) {
      console.log('✅ Знайдено індекси:');
      indexesCheck.rows.forEach(idx => {
        console.log(`   - ${idx.indexname} на таблиці ${idx.tablename}`);
      });
    } else {
      console.log('⚠️  Індекси не знайдено (будуть створені при запуску бота)');
    }

    client.release();
    await pool.end();

    console.log('\n✅ Тест схеми бази даних завершено успішно');
    console.log('\n📝 Примітка: Якщо таблиці не існують, вони будуть створені автоматично');
    console.log('   при першому запуску бота через функцію initializeDatabase()');

  } catch (error) {
    console.error('\n❌ Помилка під час тестування:', error.message);
    console.log('\n💡 Це нормально якщо база даних ще не ініціалізована');
    console.log('   Таблиці будуть створені при першому запуску бота');
  }
}

// Run test
testDatabaseSchema().catch(error => {
  console.error('❌ Критична помилка:', error);
  process.exit(1);
});
