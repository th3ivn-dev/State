#!/usr/bin/env node

/**
 * Test suite for admin panel and fallback message fixes
 *
 * This test verifies:
 * 1. Admin panel button appears in settings keyboard when isAdmin = true
 * 2. Admin panel button does NOT appear when isAdmin = false
 * 3. Admin panel button is positioned before "Delete all data" button
 */

const assert = require('assert');

console.log('🧪 Starting admin panel and fallback fixes tests...\n');

// Test 1: Verify admin panel button appears when isAdmin = true
console.log('Test 1: Admin panel button appears for admins');
try {
  const { getSettingsKeyboard } = require('../src/keyboards/inline');

  // Get settings keyboard for admin
  const adminKeyboard = getSettingsKeyboard(true);

  assert(adminKeyboard.reply_markup, 'Settings keyboard should have reply_markup');
  assert(adminKeyboard.reply_markup.inline_keyboard, 'Settings keyboard should have inline_keyboard');

  // Find admin panel button
  const buttons = adminKeyboard.reply_markup.inline_keyboard;
  const adminButton = buttons.find(row =>
    row.some(btn => btn.callback_data === 'settings_admin')
  );

  assert(adminButton, 'Admin panel button should exist when isAdmin = true');
  assert(adminButton[0].text === '👑 Адмін-панель', 'Admin panel button should have correct text');
  assert(adminButton[0].callback_data === 'settings_admin', 'Admin panel button should have correct callback_data');

  console.log('✅ Admin panel button test passed\n');
} catch (error) {
  console.error('❌ Admin panel button test failed:', error.message);
  process.exit(1);
}

// Test 2: Verify admin panel button does NOT appear when isAdmin = false
console.log('Test 2: Admin panel button does NOT appear for non-admins');
try {
  const { getSettingsKeyboard } = require('../src/keyboards/inline');

  // Get settings keyboard for non-admin
  const userKeyboard = getSettingsKeyboard(false);

  assert(userKeyboard.reply_markup, 'Settings keyboard should have reply_markup');
  assert(userKeyboard.reply_markup.inline_keyboard, 'Settings keyboard should have inline_keyboard');

  // Find admin panel button
  const buttons = userKeyboard.reply_markup.inline_keyboard;
  const adminButton = buttons.find(row =>
    row.some(btn => btn.callback_data === 'settings_admin')
  );

  assert(!adminButton, 'Admin panel button should NOT exist when isAdmin = false');

  console.log('✅ Non-admin settings test passed\n');
} catch (error) {
  console.error('❌ Non-admin settings test failed:', error.message);
  process.exit(1);
}

// Test 3: Verify admin panel button is positioned before delete data button
console.log('Test 3: Admin panel button positioned correctly');
try {
  const { getSettingsKeyboard } = require('../src/keyboards/inline');

  // Get settings keyboard for admin
  const adminKeyboard = getSettingsKeyboard(true);
  const buttons = adminKeyboard.reply_markup.inline_keyboard;

  // Find positions
  let adminPanelIndex = -1;
  let deleteDataIndex = -1;

  buttons.forEach((row, index) => {
    if (row.some(btn => btn.callback_data === 'settings_admin')) {
      adminPanelIndex = index;
    }
    if (row.some(btn => btn.callback_data === 'settings_delete_data')) {
      deleteDataIndex = index;
    }
  });

  assert(adminPanelIndex !== -1, 'Admin panel button should exist');
  assert(deleteDataIndex !== -1, 'Delete data button should exist');
  assert(adminPanelIndex < deleteDataIndex, 'Admin panel button should be before delete data button');

  console.log('✅ Button positioning test passed\n');
} catch (error) {
  console.error('❌ Button positioning test failed:', error.message);
  process.exit(1);
}

// Test 4: Verify getAdminKeyboard has broadcast button
console.log('Test 4: Admin keyboard has broadcast button');
try {
  const { getAdminKeyboard } = require('../src/keyboards/inline');

  const adminKeyboard = getAdminKeyboard();

  assert(adminKeyboard.reply_markup, 'Admin keyboard should have reply_markup');
  assert(adminKeyboard.reply_markup.inline_keyboard, 'Admin keyboard should have inline_keyboard');

  // Find broadcast button
  const buttons = adminKeyboard.reply_markup.inline_keyboard;
  const broadcastButton = buttons.find(row =>
    row.some(btn => btn.callback_data === 'admin_broadcast')
  );

  assert(broadcastButton, 'Broadcast button should exist in admin keyboard');

  // Find the button in the row
  const btn = broadcastButton.find(btn => btn.callback_data === 'admin_broadcast');
  assert(btn.text === '📢 Розсилка', 'Broadcast button should have correct text');

  console.log('✅ Admin keyboard broadcast button test passed\n');
} catch (error) {
  console.error('❌ Admin keyboard broadcast button test failed:', error.message);
  process.exit(1);
}

console.log('🎉 All tests passed!\n');
console.log('Summary:');
console.log('✅ Admin panel button appears for admins');
console.log('✅ Admin panel button hidden for non-admins');
console.log('✅ Admin panel button positioned correctly');
console.log('✅ Broadcast button exists in admin keyboard');
