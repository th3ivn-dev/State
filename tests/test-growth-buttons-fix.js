#!/usr/bin/env node

/**
 * Test suite for Growth buttons fix in admin panel
 *
 * This test verifies:
 * 1. Growth keyboard has all required buttons
 * 2. Growth stage keyboard has all required buttons
 * 3. Growth registration keyboard has all required buttons
 * 4. All buttons have correct callback_data
 */

const assert = require('assert');

console.log('🧪 Starting Growth buttons fix tests...\n');

// Test 1: Verify getGrowthKeyboard has all required buttons
console.log('Test 1: Growth keyboard has all required buttons');
try {
  const { getGrowthKeyboard } = require('../src/keyboards/inline');

  const keyboard = getGrowthKeyboard();

  assert(keyboard.reply_markup, 'Growth keyboard should have reply_markup');
  assert(keyboard.reply_markup.inline_keyboard, 'Growth keyboard should have inline_keyboard');

  const buttons = keyboard.reply_markup.inline_keyboard;

  // Find each required button
  const metricsButton = buttons.find(row =>
    row.some(btn => btn.callback_data === 'growth_metrics')
  );
  const stageButton = buttons.find(row =>
    row.some(btn => btn.callback_data === 'growth_stage')
  );
  const registrationButton = buttons.find(row =>
    row.some(btn => btn.callback_data === 'growth_registration')
  );
  const eventsButton = buttons.find(row =>
    row.some(btn => btn.callback_data === 'growth_events')
  );
  const backButton = buttons.find(row =>
    row.some(btn => btn.callback_data === 'admin_menu')
  );

  assert(metricsButton, 'Metrics button should exist');
  assert(stageButton, 'Stage button should exist');
  assert(registrationButton, 'Registration button should exist');
  assert(eventsButton, 'Events button should exist');
  assert(backButton, 'Back button should exist');

  // Verify button texts
  const metricsBtnObj = metricsButton.find(btn => btn.callback_data === 'growth_metrics');
  const stageBtnObj = stageButton.find(btn => btn.callback_data === 'growth_stage');
  const regBtnObj = registrationButton.find(btn => btn.callback_data === 'growth_registration');
  const eventsBtnObj = eventsButton.find(btn => btn.callback_data === 'growth_events');

  assert(metricsBtnObj.text === '📊 Метрики', 'Metrics button should have correct text');
  assert(stageBtnObj.text === '🎯 Етап росту', 'Stage button should have correct text');
  assert(regBtnObj.text === '🔐 Реєстрація', 'Registration button should have correct text');
  assert(eventsBtnObj.text === '📝 Події', 'Events button should have correct text');

  console.log('✅ Growth keyboard test passed\n');
} catch (error) {
  console.error('❌ Growth keyboard test failed:', error.message);
  process.exit(1);
}

// Test 2: Verify getGrowthStageKeyboard has all stage buttons
console.log('Test 2: Growth stage keyboard has all stage buttons');
try {
  const { getGrowthStageKeyboard } = require('../src/keyboards/inline');

  const keyboard = getGrowthStageKeyboard(0); // Test with stage 0

  assert(keyboard.reply_markup, 'Growth stage keyboard should have reply_markup');
  assert(keyboard.reply_markup.inline_keyboard, 'Growth stage keyboard should have inline_keyboard');

  const buttons = keyboard.reply_markup.inline_keyboard;

  // Check for all stage buttons
  const stage0Button = buttons.find(row =>
    row.some(btn => btn.callback_data === 'growth_stage_0')
  );
  const stage1Button = buttons.find(row =>
    row.some(btn => btn.callback_data === 'growth_stage_1')
  );
  const stage2Button = buttons.find(row =>
    row.some(btn => btn.callback_data === 'growth_stage_2')
  );
  const stage3Button = buttons.find(row =>
    row.some(btn => btn.callback_data === 'growth_stage_3')
  );
  const stage4Button = buttons.find(row =>
    row.some(btn => btn.callback_data === 'growth_stage_4')
  );
  const backButton = buttons.find(row =>
    row.some(btn => btn.callback_data === 'admin_growth')
  );

  assert(stage0Button, 'Stage 0 button should exist');
  assert(stage1Button, 'Stage 1 button should exist');
  assert(stage2Button, 'Stage 2 button should exist');
  assert(stage3Button, 'Stage 3 button should exist');
  assert(stage4Button, 'Stage 4 button should exist');
  assert(backButton, 'Back button should exist');

  console.log('✅ Growth stage keyboard test passed\n');
} catch (error) {
  console.error('❌ Growth stage keyboard test failed:', error.message);
  process.exit(1);
}

// Test 3: Verify getGrowthRegistrationKeyboard has toggle button
console.log('Test 3: Growth registration keyboard has toggle button');
try {
  const { getGrowthRegistrationKeyboard } = require('../src/keyboards/inline');

  // Test with registration enabled
  const keyboardEnabled = getGrowthRegistrationKeyboard(true);

  assert(keyboardEnabled.reply_markup, 'Growth registration keyboard should have reply_markup');
  assert(keyboardEnabled.reply_markup.inline_keyboard, 'Growth registration keyboard should have inline_keyboard');

  const buttonsEnabled = keyboardEnabled.reply_markup.inline_keyboard;

  const toggleButton = buttonsEnabled.find(row =>
    row.some(btn => btn.callback_data === 'growth_reg_toggle')
  );
  const statusButton = buttonsEnabled.find(row =>
    row.some(btn => btn.callback_data === 'growth_reg_status')
  );
  const backButton = buttonsEnabled.find(row =>
    row.some(btn => btn.callback_data === 'admin_growth')
  );

  assert(toggleButton, 'Toggle button should exist');
  assert(statusButton, 'Status button should exist');
  assert(backButton, 'Back button should exist');

  // Test button text for enabled state
  const toggleBtnObj = toggleButton.find(btn => btn.callback_data === 'growth_reg_toggle');
  assert(toggleBtnObj.text === '🔴 Вимкнути реєстрацію', 'Toggle button should have correct text for enabled state');

  // Test with registration disabled
  const keyboardDisabled = getGrowthRegistrationKeyboard(false);
  const buttonsDisabled = keyboardDisabled.reply_markup.inline_keyboard;
  const toggleButtonDisabled = buttonsDisabled.find(row =>
    row.some(btn => btn.callback_data === 'growth_reg_toggle')
  );
  const toggleBtnObjDisabled = toggleButtonDisabled.find(btn => btn.callback_data === 'growth_reg_toggle');
  assert(toggleBtnObjDisabled.text === '🟢 Увімкнути реєстрацію', 'Toggle button should have correct text for disabled state');

  console.log('✅ Growth registration keyboard test passed\n');
} catch (error) {
  console.error('❌ Growth registration keyboard test failed:', error.message);
  process.exit(1);
}

// Test 4: Verify callback_data prefixes
console.log('Test 4: All growth callbacks use correct prefixes');
try {
  const { getGrowthKeyboard, getGrowthStageKeyboard, getGrowthRegistrationKeyboard } = require('../src/keyboards/inline');

  // Get all buttons from all keyboards
  const keyboards = [
    getGrowthKeyboard(),
    getGrowthStageKeyboard(0),
    getGrowthRegistrationKeyboard(true)
  ];

  const validPrefixes = ['growth_', 'admin_'];
  const validExactMatches = ['back_to_main'];

  keyboards.forEach((keyboard, index) => {
    const buttons = keyboard.reply_markup.inline_keyboard;
    buttons.forEach((row) => {
      row.forEach((btn) => {
        const callbackData = btn.callback_data;
        const hasValidPrefix = validPrefixes.some(prefix => callbackData.startsWith(prefix));
        const hasValidExactMatch = validExactMatches.includes(callbackData);
        const isValid = hasValidPrefix || hasValidExactMatch;
        assert(isValid, `Button "${btn.text}" has invalid callback_data: ${callbackData}`);
      });
    });
  });

  console.log('✅ Callback data prefix test passed\n');
} catch (error) {
  console.error('❌ Callback data prefix test failed:', error.message);
  process.exit(1);
}

console.log('🎉 All tests passed!\n');
console.log('Summary:');
console.log('✅ Growth keyboard has all required buttons');
console.log('✅ Growth stage keyboard has all stage buttons');
console.log('✅ Growth registration keyboard has toggle button');
console.log('✅ All callbacks use correct prefixes');
console.log('\n💡 The buttons should now work correctly in the admin panel!');
