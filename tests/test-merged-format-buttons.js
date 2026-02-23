#!/usr/bin/env node

/**
 * Test script for merged format buttons UX improvements
 */

const assert = require('assert');

console.log('🧪 Testing merged format buttons and cancel buttons...\n');

// Test 1: Check that the two separate buttons are merged into one
console.log('Test 1: Checking format schedule keyboard changes...');
try {
  const keyboards = require('../src/keyboards/inline');

  const mockUser = {
    delete_old_message: false,
    picture_only: false
  };

  const scheduleKeyboard = keyboards.getFormatScheduleKeyboard(mockUser);
  const buttons = scheduleKeyboard.reply_markup.inline_keyboard;

  // Check that the merged button exists
  const hasMergedButton = buttons.some(
    row => row.some(btn =>
      btn.callback_data === 'format_schedule_text' &&
      btn.text === '📝 Налаштувати текст графіка'
    )
  );
  assert.strictEqual(hasMergedButton, true, 'Should have merged "Налаштувати текст графіка" button');
  console.log('  ✓ Merged button "📝 Налаштувати текст графіка" exists');

  // Check that old separate buttons are removed
  const hasOldCaptionButton = buttons.some(
    row => row.some(btn =>
      btn.callback_data === 'format_schedule_caption' &&
      btn.text === '📝 Підпис під графіком'
    )
  );
  assert.strictEqual(hasOldCaptionButton, false, 'Old "Підпис під графіком" button should be removed');
  console.log('  ✓ Old "Підпис під графіком" button removed');

  const hasOldPeriodButton = buttons.some(
    row => row.some(btn =>
      btn.callback_data === 'format_schedule_periods' &&
      btn.text.includes('Формат часу')
    )
  );
  assert.strictEqual(hasOldPeriodButton, false, 'Old "Формат часу" button should be removed');
  console.log('  ✓ Old "Формат часу" button removed');

  // Check that other buttons still exist
  const hasDeleteButton = buttons.some(
    row => row.some(btn => btn.callback_data === 'format_toggle_delete')
  );
  assert.strictEqual(hasDeleteButton, true, 'Delete old message toggle should still exist');
  console.log('  ✓ Delete old message toggle still exists');

  const hasPicOnlyButton = buttons.some(
    row => row.some(btn => btn.callback_data === 'format_toggle_piconly')
  );
  assert.strictEqual(hasPicOnlyButton, true, 'Picture only toggle should still exist');
  console.log('  ✓ Picture only toggle still exists');

  console.log('✅ Test 1 Passed: Format schedule keyboard correctly updated\n');
} catch (error) {
  console.error('❌ Test 1 Failed:', error.message);
  process.exit(1);
}

// Test 2: Verify channel.js has the new handler
console.log('Test 2: Checking for format_schedule_text handler...');
try {
  const fs = require('fs');
  const path = require('path');
  const channelDir = path.join(__dirname, '../src/handlers/channel');
  const channelJsContent = fs.readdirSync(channelDir)
    .filter(f => f.endsWith('.js'))
    .map(f => fs.readFileSync(path.join(channelDir, f), 'utf8'))
    .join('\n');

  // Check for format_schedule_text handler
  assert(channelJsContent.includes("data === 'format_schedule_text'"),
    'Should have format_schedule_text handler');
  console.log('  ✓ format_schedule_text handler exists');

  // Check for instruction screen content
  assert(channelJsContent.includes('Текст графіка'),
    'Should have instruction screen title');
  console.log('  ✓ Instruction screen title exists');

  assert(channelJsContent.includes('Змінні для підпису'),
    'Should show variables for caption');
  console.log('  ✓ Caption variables displayed');

  assert(channelJsContent.includes('Змінні для формату часу'),
    'Should show variables for time format');
  console.log('  ✓ Time format variables displayed');

  // Check for buttons in instruction screen
  assert(channelJsContent.includes("'📝 Змінити підпис'"),
    'Should have "Change caption" button');
  console.log('  ✓ "Change caption" button exists');

  assert(channelJsContent.includes("'⏰ Змінити формат часу'"),
    'Should have "Change time format" button');
  console.log('  ✓ "Change time format" button exists');

  // Check that clearConversationState is called
  assert(channelJsContent.includes('clearConversationState(telegramId)'),
    'Should clear conversation state');
  console.log('  ✓ Conversation state is cleared');

  console.log('✅ Test 2 Passed: format_schedule_text handler correctly implemented\n');
} catch (error) {
  console.error('❌ Test 2 Failed:', error.message);
  process.exit(1);
}

// Test 3: Check for cancel buttons in all text input screens
console.log('Test 3: Checking cancel buttons in text input screens...');
try {
  const fs = require('fs');
  const path = require('path');
  const channelDir = path.join(__dirname, '../src/handlers/channel');
  const channelJsContent = fs.readdirSync(channelDir)
    .filter(f => f.endsWith('.js'))
    .map(f => fs.readFileSync(path.join(channelDir, f), 'utf8'))
    .join('\n');

  // Helper function to check for cancel button in a handler
  const checkCancelButton = (handlerPattern, expectedCallback, handlerName) => {
    const handlerIndex = channelJsContent.indexOf(handlerPattern);
    assert(handlerIndex !== -1, `${handlerName} handler should exist`);

    // Get the handler code (next 1500 characters should be enough)
    const handlerCode = channelJsContent.substring(handlerIndex, handlerIndex + 1500);

    // Check for reply_markup with cancel button
    assert(handlerCode.includes('reply_markup'),
      `${handlerName} should have reply_markup`);
    assert(handlerCode.includes("'❌ Скасувати'"),
      `${handlerName} should have cancel button`);
    assert(handlerCode.includes(expectedCallback),
      `${handlerName} cancel button should link to ${expectedCallback}`);

    console.log(`  ✓ ${handlerName} has cancel button → ${expectedCallback}`);
  };

  // Check all four text input handlers
  checkCancelButton(
    "data === 'format_schedule_caption'",
    'format_schedule_text',
    'Caption input'
  );

  checkCancelButton(
    "data === 'format_schedule_periods'",
    'format_schedule_text',
    'Period format input'
  );

  checkCancelButton(
    "data === 'format_power_off'",
    'format_power_settings',
    'Power off text input'
  );

  checkCancelButton(
    "data === 'format_power_on'",
    'format_power_settings',
    'Power on text input'
  );

  console.log('✅ Test 3 Passed: All text input screens have cancel buttons\n');
} catch (error) {
  console.error('❌ Test 3 Failed:', error.message);
  process.exit(1);
}

// Test 4: Verify handlers return to the instruction screen after saving
console.log('Test 4: Checking return navigation after saving...');
try {
  const fs = require('fs');
  const path = require('path');
  const channelDir = path.join(__dirname, '../src/handlers/channel');
  const channelJsContent = fs.readdirSync(channelDir)
    .filter(f => f.endsWith('.js'))
    .map(f => fs.readFileSync(path.join(channelDir, f), 'utf8'))
    .join('\n');

  // Check that caption handler returns to instruction screen
  const captionHandlerIndex = channelJsContent.indexOf("state.state === 'waiting_for_schedule_caption'");
  assert(captionHandlerIndex !== -1, 'Caption text handler should exist');

  const captionHandlerCode = channelJsContent.substring(captionHandlerIndex, captionHandlerIndex + 2500);
  assert(captionHandlerCode.includes('getScheduleTextInstructionMessage'),
    'Caption handler should call getScheduleTextInstructionMessage function');
  console.log('  ✓ Caption handler returns to instruction screen');

  // Check that period format handler returns to instruction screen
  const periodHandlerIndex = channelJsContent.indexOf("state.state === 'waiting_for_period_format'");
  assert(periodHandlerIndex !== -1, 'Period format handler should exist');

  const periodHandlerCode = channelJsContent.substring(periodHandlerIndex, periodHandlerIndex + 2500);
  assert(periodHandlerCode.includes('getScheduleTextInstructionMessage'),
    'Period handler should call getScheduleTextInstructionMessage function');
  console.log('  ✓ Period format handler returns to instruction screen');

  console.log('✅ Test 4 Passed: Handlers return to instruction screen after saving\n');
} catch (error) {
  console.error('❌ Test 4 Failed:', error.message);
  process.exit(1);
}

// Summary
const separator = '═'.repeat(39);
console.log(separator);
console.log('✅ ALL TESTS PASSED SUCCESSFULLY!');
console.log(separator);
console.log('\n📊 Summary:');
console.log('   • Merged button correctly replaces two separate buttons');
console.log('   • New instruction screen with detailed explanations');
console.log('   • Cancel buttons added to all 4 text input screens');
console.log('   • Proper navigation flow after saving changes');
console.log('\n✨ UX improvements successfully implemented!');
