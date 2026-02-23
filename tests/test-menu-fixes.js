#!/usr/bin/env node
const path = require('path');

/**
 * Тестовий скрипт для перевірки виправлень проблем меню
 *
 * Тестує:
 * 1. Повідомлення про бета-версію в back_to_main
 * 2. Обробка фото-повідомлень в back_to_main
 * 3. Маршрутизація delete_data_step2
 */

const assert = require('assert');
const fs = require('fs');

console.log('🧪 Запуск тестів для виправлення проблем меню...\n');

// Test 1: Verify back_to_main handler has beta message
console.log('Test 1: Перевірка наявності повідомлення про бета-версію в back_to_main');
const menuJs = fs.readFileSync(path.join(__dirname, '../src/handlers/menu.js'), 'utf8');

// Check that back_to_main builds message with beta warning (now in menu.js)
const backToMainMatch = menuJs.match(/async function handleBackToMain[\s\S]*?\n\}/);
assert(backToMainMatch, 'handleBackToMain не знайдено в src/handlers/menu.js');

const backToMainCode = backToMainMatch[0];
assert(backToMainCode.includes('🚧 Бот у розробці'),
  'back_to_main повинен містити "🚧 Бот у розробці"');
assert(backToMainCode.includes('Деякі функції можуть працювати нестабільно'),
  'back_to_main повинен містити текст про нестабільність');
assert(backToMainCode.includes('Допоможіть нам стати краще'),
  'back_to_main повинен містити заклик до допомоги');
assert(backToMainCode.includes('Допомога'),
  'back_to_main повинен містити посилання на Допомогу');

console.log('✓ back_to_main містить повідомлення про бета-версію\n');

// Test 2: Verify back_to_main handles photo messages with try/catch
console.log('Test 2: Перевірка обробки фото-повідомлень в back_to_main');

// Check for try/catch around editMessageText
assert(backToMainCode.includes('try {') && backToMainCode.includes('catch (error)'),
  'back_to_main повинен містити try/catch блок');
assert(backToMainCode.includes('safeEditMessageText'),
  'back_to_main повинен спробувати safeEditMessageText');
assert(backToMainCode.includes('bot.api.deleteMessage') && backToMainCode.includes('bot.api.sendMessage'),
  'back_to_main повинен видаляти і створювати нове повідомлення при помилці');

console.log('✓ back_to_main коректно обробляє фото-повідомлення\n');

// Test 3: Verify delete_data_step2 is in callback routing
console.log('Test 3: Перевірка маршрутизації delete_data_step2');

const botJs = fs.readFileSync(path.join(__dirname, '../src/bot.js'), 'utf8');

// Find the settings callbacks routing section - look for the broader pattern
const settingsCallbackMatch = botJs.match(/\/\/ Settings callbacks[\s\S]{0,500}handleSettingsCallback/);
assert(settingsCallbackMatch, 'Settings callbacks секція не знайдена');

// Check that delete_data_step2 is in the routing
const settingsSection = settingsCallbackMatch[0];
assert(settingsSection.includes("data === 'delete_data_step2'"),
  'delete_data_step2 має бути включено в умову маршрутизації');

console.log('✓ delete_data_step2 правильно включено в маршрутизацію\n');

// Test 4: Check message structure consistency
console.log('Test 4: Перевірка узгодженості структури повідомлень');

// Find handleStart function in start.js
const startJs = fs.readFileSync(path.join(__dirname, '../src/handlers/start/command.js'), 'utf8');

// Check that /start uses similar beta message structure
assert(startJs.includes('🚧 Бот у розробці'),
  'handleStart також має містити "🚧 Бот у розробці"');

// Both should have the same beta warning structure
const startBetaSection = startJs.match(/🚧 Бот у розробці[\s\S]*?Головне меню/);
const backBetaSection = backToMainCode.match(/🚧 Бот у розробці[\s\S]*?Головне меню/);

assert(startBetaSection && backBetaSection,
  'Обидва handlers мають містити секцію бета-попередження');

console.log('✓ Структура повідомлень узгоджена між /start і back_to_main\n');

// Test 5: Verify HTML tags are properly used
console.log('Test 5: Перевірка правильного використання HTML тегів');

assert(backToMainCode.includes('<b>🚧 Бот у розробці</b>'),
  'Заголовок має бути в тегах <b>');
assert(backToMainCode.includes('<i>Деякі функції можуть працювати нестабільно</i>'),
  'Курсив має бути в тегах <i>');
assert(backToMainCode.includes("parse_mode: 'HTML'"),
  'parse_mode має бути встановлений в HTML');

console.log('✓ HTML теги використовуються правильно\n');

console.log('✅ Всі тести пройдено успішно!');
console.log('\n📝 Перевірені виправлення:');
console.log('   1. ✓ Повідомлення про бета-версію додано до back_to_main');
console.log('   2. ✓ Обробка фото-повідомлень реалізована через try/catch');
console.log('   3. ✓ delete_data_step2 додано до маршрутизації callbacks');
