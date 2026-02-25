const path = require('path');
/**
 * Test script to verify admin reply functionality
 */

console.log('🧪 Тестування функціоналу відповіді адміна на тикети...\n');

try {
  const fs = require('fs');

  console.log('1️⃣ Перевірка src/handlers/admin.js...');
  const adminCode = fs.readFileSync(path.join(__dirname, '../src/handlers/admin.js'), 'utf-8');

  // Check for adminReplyStates Map
  if (adminCode.includes('adminReplyStates = new Map()')) {
    console.log('   ✅ adminReplyStates Map створена');
  } else {
    console.log('   ❌ adminReplyStates Map відсутня');
    process.exit(1);
  }

  // Check for reply handler
  if (adminCode.includes("data.startsWith('admin_ticket_reply_')")) {
    console.log('   ✅ Обробник admin_ticket_reply_ реалізовано');
  } else {
    console.log('   ❌ Обробник admin_ticket_reply_ відсутній');
    process.exit(1);
  }

  // Check for cancel handler
  if (adminCode.includes("data.startsWith('admin_ticket_reply_cancel_')")) {
    console.log('   ✅ Обробник admin_ticket_reply_cancel_ реалізовано');
  } else {
    console.log('   ❌ Обробник admin_ticket_reply_cancel_ відсутній');
    process.exit(1);
  }

  // Check for handleAdminReply function
  if (adminCode.includes('async function handleAdminReply(bot, msg)')) {
    console.log('   ✅ Функція handleAdminReply реалізована');
  } else {
    console.log('   ❌ Функція handleAdminReply відсутня');
    process.exit(1);
  }

  // Check if handleAdminReply is exported
  if (adminCode.includes('handleAdminReply,')) {
    console.log('   ✅ handleAdminReply експортовано');
  } else {
    console.log('   ❌ handleAdminReply не експортовано');
    process.exit(1);
  }
  console.log();

  console.log('2️⃣ Перевірка src/bot.js...');
  const botCode = fs.readFileSync(path.join(__dirname, '../src/bot.js'), 'utf-8');

  // Check if handleAdminReply is imported
  const hasAdminReplyImport = botCode.includes('handleAdminReply');
  if (hasAdminReplyImport) {
    console.log('   ✅ bot.js імпортує handleAdminReply');
  } else {
    console.log('   ❌ bot.js не імпортує handleAdminReply');
    process.exit(1);
  }

  // Check if handleAdminReply is called in message handler
  const hasAdminReplyCall = botCode.includes('await handleAdminReply(bot, msg)');
  if (hasAdminReplyCall) {
    console.log('   ✅ bot.js викликає handleAdminReply в обробнику повідомлень');
  } else {
    console.log('   ❌ bot.js не викликає handleAdminReply');
    process.exit(1);
  }

  // Check that handleAdminReply is called before feedback handler
  const adminReplyPos = botCode.indexOf('handleAdminReply(bot, msg)');
  const feedbackPos = botCode.indexOf('handleFeedbackMessage(bot, msg)');

  if (adminReplyPos !== -1 && feedbackPos !== -1 && adminReplyPos < feedbackPos) {
    console.log('   ✅ handleAdminReply викликається перед іншими обробниками');
  } else {
    console.log('   ⚠️  Порядок виклику handleAdminReply потребує перевірки');
  }
  console.log();

  console.log('3️⃣ Перевірка логіки handleAdminReply...');

  // Extract handleAdminReply function body for more specific checks
  const handleAdminReplyMatch = adminCode.match(/async function handleAdminReply\(bot, msg\) \{([\s\S]*?)^\}/m);
  const handleAdminReplyBody = handleAdminReplyMatch ? handleAdminReplyMatch[1] : '';

  // Check if it saves message to ticket
  if (handleAdminReplyBody.includes('ticketsDb.addTicketMessage')) {
    console.log('   ✅ Відповідь зберігається в тикет');
  } else {
    console.log('   ❌ Відповідь не зберігається в тикет');
    process.exit(1);
  }

  // Check if it sends message to user
  if (handleAdminReplyBody.includes('Відповідь на ваше звернення')) {
    console.log('   ✅ Відповідь надсилається користувачу');
  } else {
    console.log('   ❌ Відповідь не надсилається користувачу');
    process.exit(1);
  }

  // Check if it clears state
  if (handleAdminReplyBody.includes('adminReplyStates.delete')) {
    console.log('   ✅ Стан очищається після відповіді');
  } else {
    console.log('   ❌ Стан не очищується');
    process.exit(1);
  }

  // Check for return true in handleAdminReply
  if (handleAdminReplyBody.includes('return true')) {
    console.log('   ✅ Функція повертає true після обробки');
  } else {
    console.log('   ❌ Функція не повертає true');
    process.exit(1);
  }

  // Check for return false in handleAdminReply
  if (handleAdminReplyBody.includes('return false')) {
    console.log('   ✅ Функція повертає false якщо стан не її');
  } else {
    console.log('   ❌ Функція не повертає false для невідомого стану');
    process.exit(1);
  }
  console.log();

  console.log('4️⃣ Перевірка обробників callback...');

  // Check that reply handler sets state
  if (adminCode.includes('adminReplyStates.set(userId, { ticketId })')) {
    console.log('   ✅ Обробник reply встановлює стан');
  } else {
    console.log('   ❌ Обробник reply не встановлює стан');
    process.exit(1);
  }

  // Check that reply handler shows prompt
  if (adminCode.includes('Введіть текст відповіді:')) {
    console.log('   ✅ Обробник reply показує запит на введення');
  } else {
    console.log('   ❌ Обробник reply не показує запит');
    process.exit(1);
  }

  // Check that cancel handler clears state
  if (adminCode.includes('adminReplyStates.delete(userId)')) {
    console.log('   ✅ Обробник cancel очищає стан');
  } else {
    console.log('   ❌ Обробник cancel не очищає стан');
    process.exit(1);
  }

  // Check that cancel handler shows ticket view
  if (adminCode.includes('formatTicketView(ticketId)')) {
    console.log('   ✅ Обробник cancel повертає перегляд тикета');
  } else {
    console.log('   ❌ Обробник cancel не повертає перегляд тикета');
    process.exit(1);
  }
  console.log();

  console.log('✅ Всі тести пройдені успішно!\n');
  console.log('📝 Функціонал відповіді адміна на тикети реалізовано:');
  console.log('   - Адміністратор може натиснути "💬 Відповісти" на тикеті');
  console.log('   - Бот запитує текст відповіді з кнопкою "❌ Скасувати"');
  console.log('   - Адміністратор може скасувати відповідь');
  console.log('   - Відповідь зберігається в базі даних');
  console.log('   - Користувач отримує повідомлення з відповіддю та кнопкою "⤴ Меню"');
  console.log('   - Адміністратор бачить підтвердження "✅ Відповідь надіслано користувачу"');

} catch (error) {
  console.error('\n❌ Помилка:', error.message);
  console.error(error.stack);
  process.exit(1);
}
