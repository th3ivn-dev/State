const path = require('path');
const { escapeHtml } = require('../utils');

// Форматувати welcome message
function formatWelcomeMessage(username) {
  const name = username ? escapeHtml(username) : '';
  const lines = [];
  lines.push(`👋 Привіт${name ? ', ' + name : ''}! Я СвітлоБот 🤖`);
  lines.push('');
  lines.push('Я допоможу відстежувати відключення світла');
  lines.push('та повідомлю, коли воно зʼявиться або зникне.');
  lines.push('');
  lines.push('Давайте налаштуємося. Оберіть свій регіон:');
  return lines.join('\n');
}

// Форматувати help message
function formatHelpMessage() {
  const lines = [];
  lines.push('<b>📖 Довідка</b>');
  lines.push('');
  lines.push('<b>Основні функції:</b>');
  lines.push('📊 Графік — Показати графік відключень');
  lines.push('💡 Статус — Перевірити наявність світла');
  lines.push('⚙️ Налаштування — Налаштування бота');
  lines.push('❓ Допомога — Ця довідка');
  lines.push('');
  lines.push('<b>Як працює бот:</b>');
  lines.push('• Бот автоматично перевіряє графіки');
  lines.push('• При зміні графіка ви отримаєте сповіщення');
  lines.push('• Можна підключити бота до свого каналу');
  lines.push('• Можна моніторити наявність світла через роутер');
  lines.push('');

  // Add bot version from package.json
  try {
    const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
    const packageJson = require(packageJsonPath);
    lines.push(`<i>СвітлоБот v${packageJson.version}</i>`);
  } catch (_e) {
    lines.push('<i>СвітлоБот</i>');
  }

  return lines.join('\n');
}

// Форматувати повідомлення про помилку
function formatErrorMessage() {
  const lines = [];
  lines.push('⚠️ Щось пішло не так.');
  lines.push('');
  lines.push('Якщо помітили, що щось не працює —');
  lines.push('напишіть нам, будь ласка!');
  return lines.join('\n');
}

module.exports = {
  formatWelcomeMessage,
  formatHelpMessage,
  formatErrorMessage,
};
