#!/usr/bin/env node

/**
 * Тестовий скрипт для перевірки wizard flow з вибором куди сповіщати
 */

const assert = require('assert');

console.log('🧪 Запуск тестів wizard notification target...\n');

// Test 1: Перевірка що клавіатура існує
console.log('Test 1: Перевірка клавіатури вибору куди сповіщати');
const { getWizardNotifyTargetKeyboard } = require('../src/keyboards/inline');

const keyboard = getWizardNotifyTargetKeyboard();
assert(keyboard, 'Клавіатура має існувати');
assert(keyboard.reply_markup, 'reply_markup має існувати');
assert(keyboard.reply_markup.inline_keyboard, 'inline_keyboard має існувати');
assert.strictEqual(keyboard.reply_markup.inline_keyboard.length, 2, 'Має бути 2 кнопки');

// Перевірка кнопок
const button1 = keyboard.reply_markup.inline_keyboard[0][0];
const button2 = keyboard.reply_markup.inline_keyboard[1][0];

assert.strictEqual(button1.callback_data, 'wizard_notify_bot', 'Перша кнопка має callback_data wizard_notify_bot');
assert.strictEqual(button2.callback_data, 'wizard_notify_channel', 'Друга кнопка має callback_data wizard_notify_channel');
assert(button1.text.includes('боті'), 'Перша кнопка має містити текст про бот');
assert(button2.text.includes('каналі'), 'Друга кнопка має містити текст про канал');

console.log('✓ Клавіатура коректна\n');

// Test 2: Перевірка що функція updateUserPowerNotifyTarget існує
console.log('Test 2: Перевірка функції updateUserPowerNotifyTarget');
const usersDb = require('../src/database/users');

assert(typeof usersDb.updateUserPowerNotifyTarget === 'function', 'updateUserPowerNotifyTarget має бути функцією');
console.log('✓ Функція updateUserPowerNotifyTarget існує\n');

// Test 3: Перевірка що handleWizardCallback імпортується правильно
console.log('Test 3: Перевірка handleWizardCallback');
const { handleWizardCallback } = require('../src/handlers/start');

assert(typeof handleWizardCallback === 'function', 'handleWizardCallback має бути функцією');
console.log('✓ handleWizardCallback існує\n');

// Test 4: Перевірка що conversationStates експортується з channel.js
console.log('Test 4: Перевірка conversationStates');
const { conversationStates } = require('../src/handlers/channel');

assert(conversationStates, 'conversationStates має існувати');
assert(typeof conversationStates.set === 'function', 'conversationStates має мати метод set');
assert(typeof conversationStates.get === 'function', 'conversationStates має мати метод get');
console.log('✓ conversationStates експортується правильно\n');

console.log('✅ Всі тести пройдено успішно!');
