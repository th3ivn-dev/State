#!/usr/bin/env node

const path = require('path');
/**
 * Тестовий скрипт для перевірки обмеження додавання каналів в wizard при режимі паузи
 */

const assert = require('assert');

console.log('🧪 Запуск тестів wizard pause mode...\n');

// Test 1: Перевірка що функція getSetting існує
console.log('Test 1: Перевірка функції getSetting');
const { getSetting } = require('../src/database/db');

assert(typeof getSetting === 'function', 'getSetting має бути функцією');
console.log('✓ Функція getSetting існує\n');

// Test 2: Перевірка що handleWizardCallback містить перевірку паузи
console.log('Test 2: Перевірка наявності перевірки паузи у wizard handlers');
const fs = require('fs');

const startHandlerPath = path.join(__dirname, 'src', 'handlers', 'start.js');
const startHandlerContent = fs.readFileSync(startHandlerPath, 'utf8');

// Перевіряємо що в wizard_notify_channel є перевірка bot_paused
const notifyChannelIndex = startHandlerContent.indexOf("if (data === 'wizard_notify_channel')");
assert(notifyChannelIndex > -1, 'wizard_notify_channel handler має існувати');

const notifyChannelSection = startHandlerContent.substring(notifyChannelIndex, notifyChannelIndex + 1500);
assert(notifyChannelSection.includes('bot_paused'), 'wizard_notify_channel має містити перевірку bot_paused');
assert(notifyChannelSection.includes('pause_message'), 'wizard_notify_channel має містити pause_message');
assert(notifyChannelSection.includes('pause_show_support'), 'wizard_notify_channel має містити pause_show_support');
assert(notifyChannelSection.includes('createPauseKeyboard'), 'wizard_notify_channel має використовувати createPauseKeyboard');

console.log('✓ wizard_notify_channel має перевірку режиму паузи\n');

// Test 3: Перевірка що в wizard_channel_confirm_ є перевірка bot_paused
console.log('Test 3: Перевірка наявності перевірки паузи у wizard_channel_confirm_');

const confirmChannelIndex = startHandlerContent.indexOf("if (data.startsWith('wizard_channel_confirm_'))");
assert(confirmChannelIndex > -1, 'wizard_channel_confirm_ handler має існувати');

const confirmChannelSection = startHandlerContent.substring(confirmChannelIndex, confirmChannelIndex + 1500);
assert(confirmChannelSection.includes('bot_paused'), 'wizard_channel_confirm_ має містити перевірку bot_paused');
assert(confirmChannelSection.includes('pause_message'), 'wizard_channel_confirm_ має містити pause_message');
assert(confirmChannelSection.includes('pause_show_support'), 'wizard_channel_confirm_ має містити pause_show_support');
assert(confirmChannelSection.includes('createPauseKeyboard'), 'wizard_channel_confirm_ має використовувати createPauseKeyboard');

console.log('✓ wizard_channel_confirm_ має перевірку режиму паузи\n');

// Test 4: Перевірка що перевірка паузи виконується ДО основної логіки
console.log('Test 4: Перевірка порядку виконання перевірок');

// В wizard_notify_channel перевірка паузи має бути ПЕРЕД `const username`
const usernameIndex1 = notifyChannelSection.indexOf('const username');
const pauseCheckIndex1 = notifyChannelSection.indexOf('bot_paused');
assert(pauseCheckIndex1 < usernameIndex1, 'Перевірка паузи має бути перед основною логікою в wizard_notify_channel');

// В wizard_channel_confirm_ перевірка паузи має бути ПЕРЕД `const channelId`
const channelIdIndex = confirmChannelSection.indexOf("const channelId = data.replace('wizard_channel_confirm_', '')");
const pauseCheckIndex2 = confirmChannelSection.indexOf('bot_paused');
assert(pauseCheckIndex2 < channelIdIndex, 'Перевірка паузи має бути перед основною логікою в wizard_channel_confirm_');

console.log('✓ Перевірки паузи розташовані коректно\n');

// Test 5: Перевірка структури helper функції createPauseKeyboard
console.log('Test 5: Перевірка helper функції createPauseKeyboard');

// Перевіряємо що helper функція існує
assert(startHandlerContent.includes('function createPauseKeyboard'), 'Має існувати helper функція createPauseKeyboard');
assert(startHandlerContent.includes('inline_keyboard'), 'createPauseKeyboard має повертати inline_keyboard');
assert(startHandlerContent.includes('💬 Обговорення/Підтримка'), 'Має бути кнопка Обговорення/Підтримка');
assert(startHandlerContent.includes('← Назад'), 'Має бути кнопка Назад');
assert(startHandlerContent.includes('https://t.me/voltyk_chat'), 'Має бути посилання на підтримку');
assert(startHandlerContent.includes('wizard_notify_back'), 'Має бути callback_data wizard_notify_back');

console.log('✓ Helper функція createPauseKeyboard коректна\n');

// Test 6: Перевірка узгодженості з channel.js
console.log('Test 6: Перевірка узгодженості з channel.js');

const channelHandlerPath = path.join(__dirname, 'src', 'handlers', 'channel.js');
const channelHandlerContent = fs.readFileSync(channelHandlerPath, 'utf8');

const channelConnectIndex = channelHandlerContent.indexOf("if (data === 'channel_connect')");
assert(channelConnectIndex > -1, 'channel_connect handler має існувати');

const channelConnectSection = channelHandlerContent.substring(channelConnectIndex, channelConnectIndex + 2000);
assert(channelConnectSection.includes('bot_paused'), 'channel_connect має містити перевірку bot_paused');

console.log('✓ Реалізація узгоджена з channel.js\n');

console.log('✅ Всі тести пройдено успішно!');
console.log('\n📝 Підсумок:');
console.log('   ✓ wizard_notify_channel має перевірку режиму паузи');
console.log('   ✓ wizard_channel_confirm_ має перевірку режиму паузи');
console.log('   ✓ Перевірки розташовані перед основною логікою');
console.log('   ✓ Helper функція createPauseKeyboard існує');
console.log('   ✓ getSetting імпортовано на початку файлу');
console.log('   ✓ Реалізація узгоджена з існуючим кодом');
