#!/usr/bin/env node
const path = require('path');

/**
 * Test suite for inline keyboard fixes
 *
 * This test verifies:
 * 1. QUEUES is properly imported and can be used in getQueueKeyboard()
 * 2. getMainMenu() returns an inline keyboard with correct callback_data
 * 3. All menu callbacks are properly defined
 */

const assert = require('assert');

console.log('🧪 Starting inline keyboard fix tests...\n');

// Test 1: Verify QUEUES import
console.log('Test 1: Verify QUEUES is imported in inline.js');
try {
  const inlineKeyboards = require('../src/keyboards/inline');
  const { QUEUES } = require('../src/constants/regions');

  // Get queue keyboard which uses QUEUES
  const queueKeyboard = inlineKeyboards.getQueueKeyboard();

  assert(queueKeyboard.reply_markup, 'Queue keyboard should have reply_markup');
  assert(queueKeyboard.reply_markup.inline_keyboard, 'Queue keyboard should have inline_keyboard');

  // Verify that queues are in the keyboard
  const buttons = queueKeyboard.reply_markup.inline_keyboard;
  const queueButtons = buttons.filter(row =>
    row.some(btn => btn.callback_data && btn.callback_data.startsWith('queue_'))
  );

  assert(queueButtons.length > 0, 'Queue keyboard should have queue buttons');

  console.log('✅ QUEUES import test passed\n');
} catch (error) {
  console.error('❌ QUEUES import test failed:', error.message);
  process.exit(1);
}

// Test 2: Verify getMainMenu() returns inline keyboard
console.log('Test 2: Verify getMainMenu() returns inline keyboard');
try {
  const { getMainMenu } = require('../src/keyboards/inline');
  const mainMenu = getMainMenu();

  assert(mainMenu.reply_markup, 'Main menu should have reply_markup');
  assert(mainMenu.reply_markup.inline_keyboard, 'Main menu should have inline_keyboard');
  assert(!mainMenu.reply_markup.keyboard, 'Main menu should not have keyboard (Reply Keyboard)');
  assert(!mainMenu.reply_markup.resize_keyboard, 'Main menu should not have resize_keyboard');

  const inlineKeyboard = mainMenu.reply_markup.inline_keyboard;
  assert(Array.isArray(inlineKeyboard), 'inline_keyboard should be an array');

  console.log('✅ getMainMenu() inline keyboard test passed\n');
} catch (error) {
  console.error('❌ getMainMenu() test failed:', error.message);
  process.exit(1);
}

// Test 3: Verify main menu has correct callback_data
console.log('Test 3: Verify main menu has correct callback_data');
try {
  const { getMainMenu } = require('../src/keyboards/inline');
  const mainMenu = getMainMenu();
  const inlineKeyboard = mainMenu.reply_markup.inline_keyboard;

  // Flatten all buttons
  const allButtons = inlineKeyboard.flat();

  // Check for expected callback_data
  const expectedCallbacks = [
    'menu_schedule',
    'menu_timer',
    'menu_stats',
    'menu_help',
    'menu_settings'
  ];

  expectedCallbacks.forEach(expectedCallback => {
    const found = allButtons.some(btn => btn.callback_data === expectedCallback);
    assert(found, `Main menu should have button with callback_data: ${expectedCallback}`);
  });

  // Verify button texts
  const scheduleButton = allButtons.find(btn => btn.callback_data === 'menu_schedule');
  assert(scheduleButton.text === 'Графік', 'Schedule button should have correct text');

  const timerButton = allButtons.find(btn => btn.callback_data === 'menu_timer');
  assert(timerButton.text === '⏱ Таймер', 'Timer button should have correct text');

  const statsButton = allButtons.find(btn => btn.callback_data === 'menu_stats');
  assert(statsButton.text === '📈 Статистика', 'Stats button should have correct text');

  const helpButton = allButtons.find(btn => btn.callback_data === 'menu_help');
  assert(helpButton.text === '❓ Допомога', 'Help button should have correct text');

  const settingsButton = allButtons.find(btn => btn.callback_data === 'menu_settings');
  assert(settingsButton.text === '⚙️ Налаштування', 'Settings button should have correct text');

  console.log('✅ Main menu callback_data test passed\n');
} catch (error) {
  console.error('❌ Main menu callback_data test failed:', error.message);
  process.exit(1);
}

// Test 4: Verify bot.js has the callback handlers (basic check)
console.log('Test 4: Verify bot.js structure');
try {
  const fs = require('fs');
  const botContent = fs.readFileSync(path.join(__dirname, '../src/bot.js'), 'utf-8');

  // Check for menu callback handlers
  const expectedHandlers = [
    "data === 'menu_schedule'",
    "data === 'menu_timer'",
    "data === 'menu_stats'",
    "data === 'menu_help'",
    "data === 'menu_settings'",
    "data === 'back_to_main'"
  ];

  expectedHandlers.forEach(handler => {
    assert(botContent.includes(handler), `bot.js should contain handler: ${handler}`);
  });

  // Verify QUEUES import
  assert(botContent.includes("const { REGIONS } = require('./constants/regions')"),
    'bot.js should import REGIONS');

  // Verify getSettingsKeyboard import
  assert(botContent.includes('getSettingsKeyboard'),
    'bot.js should import getSettingsKeyboard');

  console.log('✅ bot.js structure test passed\n');
} catch (error) {
  console.error('❌ bot.js structure test failed:', error.message);
  process.exit(1);
}

// Test 5: Verify old text handlers are removed
console.log('Test 5: Verify old text menu handlers are removed');
try {
  const fs = require('fs');
  const botContent = fs.readFileSync(path.join(__dirname, '../src/bot.js'), 'utf-8');

  // These should no longer exist in the switch statement
  const removedHandlers = [
    "case '📊 Графік':",
    "case '⏱ Таймер':",
    "case '⚙️ Налаштування':",
  ];

  // Check that old menu switch statement is gone
  // If any of these handlers still exist, it means the old code is still there
  const hasOldMenuSwitch = removedHandlers.some(handler => botContent.includes(handler));

  assert(!hasOldMenuSwitch, 'bot.js should not contain old menu text handlers in switch statement');

  console.log('✅ Old text handlers removal test passed\n');
} catch (error) {
  console.error('❌ Old text handlers test failed:', error.message);
  process.exit(1);
}

// Test 6: Verify back_to_main is not in settings callbacks
console.log('Test 6: Verify back_to_main callback routing');
try {
  const fs = require('fs');
  const botContent = fs.readFileSync(path.join(__dirname, '../src/bot.js'), 'utf-8');

  // Find the Settings callbacks section
  const settingsCallbackMatch = botContent.match(/\/\/ Settings callbacks[\s\S]*?return;\s*}/);
  assert(settingsCallbackMatch, 'Should find Settings callbacks section');

  const settingsSection = settingsCallbackMatch[0];

  // back_to_main should NOT be in the settings callbacks list
  assert(!settingsSection.includes("data === 'back_to_main'"),
    'back_to_main should not be handled by settings callbacks');

  console.log('✅ back_to_main routing test passed\n');
} catch (error) {
  console.error('❌ back_to_main routing test failed:', error.message);
  process.exit(1);
}

console.log('✅✅✅ All tests passed! ✅✅✅');
console.log('\nSummary:');
console.log('1. ✅ QUEUES is properly imported and can be used');
console.log('2. ✅ getMainMenu() returns inline keyboard');
console.log('3. ✅ Main menu has correct callback_data values');
console.log('4. ✅ bot.js has all required callback handlers');
console.log('5. ✅ Old text menu handlers are removed');
console.log('6. ✅ back_to_main is properly routed');
