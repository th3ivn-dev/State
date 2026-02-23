#!/usr/bin/env node

/**
 * Test script for verifying the format menu split implementation
 * Tests the 3-level navigation structure for publication format settings
 */

const assert = require('assert');

console.log('🧪 Testing Format Menu Split Implementation...\n');

// Test 1: Verify keyboard functions exist
console.log('Test 1: Verifying keyboard functions exist');
const {
  getFormatSettingsKeyboard,
  getFormatScheduleKeyboard,
  getFormatPowerKeyboard
} = require('../src/keyboards/inline');

assert(typeof getFormatSettingsKeyboard === 'function', 'getFormatSettingsKeyboard should be a function');
assert(typeof getFormatScheduleKeyboard === 'function', 'getFormatScheduleKeyboard should be a function');
assert(typeof getFormatPowerKeyboard === 'function', 'getFormatPowerKeyboard should be a function');
console.log('✓ All keyboard functions exist\n');

// Test 2: Verify Level 1 menu structure (Main format menu)
console.log('Test 2: Verifying Level 1 menu structure');
const mockUser = {
  delete_old_message: false,
  picture_only: false
};

const level1Menu = getFormatSettingsKeyboard(mockUser);
assert(level1Menu.reply_markup, 'Level 1 menu should have reply_markup');
assert(Array.isArray(level1Menu.reply_markup.inline_keyboard), 'Level 1 menu should have inline_keyboard array');

const level1Buttons = level1Menu.reply_markup.inline_keyboard;
assert(level1Buttons.length === 3, `Level 1 should have 3 rows (got ${level1Buttons.length})`);

// Check buttons
const scheduleButton = level1Buttons[0][0];
const powerButton = level1Buttons[1][0];
assert(scheduleButton.text === '📊 Графік відключень', 'First button should be for schedule settings');
assert(scheduleButton.callback_data === 'format_schedule_settings', 'Schedule button should have correct callback_data');
assert(powerButton.text === '⚡ Фактичний стан', 'Second button should be for power settings');
assert(powerButton.callback_data === 'format_power_settings', 'Power button should have correct callback_data');

// Check navigation buttons
const navRow = level1Buttons[2];
assert(navRow.length === 2, 'Navigation row should have 2 buttons');
assert(navRow[0].callback_data === 'settings_channel', 'Back button should go to settings_channel');
assert(navRow[1].callback_data === 'back_to_main', 'Menu button should go to back_to_main');

console.log('✓ Level 1 menu structure is correct\n');

// Test 3: Verify Level 2a menu structure (Schedule settings)
console.log('Test 3: Verifying Level 2a menu structure');
const level2aMenu = getFormatScheduleKeyboard(mockUser);
assert(level2aMenu.reply_markup, 'Level 2a menu should have reply_markup');

const level2aButtons = level2aMenu.reply_markup.inline_keyboard;
assert(level2aButtons.length === 5, `Level 2a should have 5 rows (got ${level2aButtons.length})`);

// Check buttons
assert(level2aButtons[0][0].text === '📝 Підпис під графіком', 'First button should be for caption');
assert(level2aButtons[0][0].callback_data === 'format_schedule_caption', 'Caption button should have correct callback_data');
assert(level2aButtons[1][0].text === '⏰ Формат часу (08:00-12:00)', 'Second button should be for periods');
assert(level2aButtons[1][0].callback_data === 'format_schedule_periods', 'Period button should have correct callback_data');
assert(level2aButtons[2][0].text.includes('Видаляти старий графік'), 'Third button should be for delete toggle');
assert(level2aButtons[2][0].callback_data === 'format_toggle_delete', 'Delete toggle should have correct callback_data');
assert(level2aButtons[3][0].text.includes('Без тексту'), 'Fourth button should be for pic only toggle');
assert(level2aButtons[3][0].callback_data === 'format_toggle_piconly', 'Pic only toggle should have correct callback_data');

// Check navigation buttons go back to format_menu
const level2aNavRow = level2aButtons[4];
assert(level2aNavRow.length === 2, 'Level 2a navigation row should have 2 buttons');
assert(level2aNavRow[0].callback_data === 'format_menu', 'Back button should go to format_menu');
assert(level2aNavRow[1].callback_data === 'back_to_main', 'Menu button should go to back_to_main');

console.log('✓ Level 2a menu structure is correct\n');

// Test 4: Verify Level 2b menu structure (Power state settings)
console.log('Test 4: Verifying Level 2b menu structure');
const level2bMenu = getFormatPowerKeyboard();
assert(level2bMenu.reply_markup, 'Level 2b menu should have reply_markup');

const level2bButtons = level2bMenu.reply_markup.inline_keyboard;
assert(level2bButtons.length === 3, `Level 2b should have 3 rows (got ${level2bButtons.length})`);

// Check buttons with correct emojis
assert(level2bButtons[0][0].text === '🔴 Повідомлення "Світло зникло"', 'First button should be for power off with red circle emoji');
assert(level2bButtons[0][0].callback_data === 'format_power_off', 'Power off button should have correct callback_data');
assert(level2bButtons[1][0].text === '🟢 Повідомлення "Світло є"', 'Second button should be for power on with green circle emoji');
assert(level2bButtons[1][0].callback_data === 'format_power_on', 'Power on button should have correct callback_data');

// Check navigation buttons go back to format_menu
const level2bNavRow = level2bButtons[2];
assert(level2bNavRow.length === 2, 'Level 2b navigation row should have 2 buttons');
assert(level2bNavRow[0].callback_data === 'format_menu', 'Back button should go to format_menu');
assert(level2bNavRow[1].callback_data === 'back_to_main', 'Menu button should go to back_to_main');

console.log('✓ Level 2b menu structure is correct\n');

// Test 5: Verify toggle states
console.log('Test 5: Verifying toggle states');
const userWithToggles = {
  delete_old_message: true,
  picture_only: true
};

const menuWithToggles = getFormatScheduleKeyboard(userWithToggles);
const toggleButtons = menuWithToggles.reply_markup.inline_keyboard;
assert(toggleButtons[2][0].text.startsWith('✓'), 'Delete toggle should show checkmark when enabled');
assert(toggleButtons[3][0].text.startsWith('✓'), 'Pic only toggle should show checkmark when enabled');

const userWithoutToggles = {
  delete_old_message: false,
  picture_only: false
};

const menuWithoutToggles = getFormatScheduleKeyboard(userWithoutToggles);
const untoggleButtons = menuWithoutToggles.reply_markup.inline_keyboard;
assert(untoggleButtons[2][0].text.startsWith('○'), 'Delete toggle should show circle when disabled');
assert(untoggleButtons[3][0].text.startsWith('○'), 'Pic only toggle should show circle when disabled');

console.log('✓ Toggle states work correctly\n');

// Test 6: Verify no format_noop callback_data exists
console.log('Test 6: Verifying format_noop callback is removed');
const allMenus = [level1Menu, level2aMenu, level2bMenu];
for (const menu of allMenus) {
  const buttons = menu.reply_markup.inline_keyboard.flat();
  const hasFormatNoop = buttons.some(btn => btn.callback_data === 'format_noop');
  assert(!hasFormatNoop, 'No button should have format_noop callback_data');
}
console.log('✓ format_noop callback_data has been removed\n');

console.log('✅ All tests passed! Format menu split implementation is correct.\n');
