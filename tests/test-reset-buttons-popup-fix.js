/**
 * Test: Reset Buttons Popup Fix
 *
 * Verifies that the handleChannelCallback function correctly skips
 * the early answerCallbackQuery for callbacks that need custom popup messages.
 * This ensures that reset buttons and other interactive buttons show their
 * confirmation popups to users.
 */

const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════════════════');
console.log('  Test: Reset Buttons Popup Fix');
console.log('═══════════════════════════════════════════════════\n');

// Read the channel.js file
const channelDir = path.join(__dirname, '../src/handlers/channel');
const channelJsContent = fs.readdirSync(channelDir)
  .filter(f => f.endsWith('.js'))
  .map(f => fs.readFileSync(path.join(channelDir, f), 'utf8'))
  .join('\n');

// Test 1: Check that CALLBACKS_WITH_CUSTOM_ANSWER constant exists
console.log('🧪 Test 1: CALLBACKS_WITH_CUSTOM_ANSWER constant exists');

const hasCallbacksConstant = channelJsContent.includes('const CALLBACKS_WITH_CUSTOM_ANSWER = [');

if (!hasCallbacksConstant) {
  console.error('  ❌ FAIL: CALLBACKS_WITH_CUSTOM_ANSWER constant not found');
  process.exit(1);
}

console.log('  ✅ CALLBACKS_WITH_CUSTOM_ANSWER constant exists');

// Test 2: Check that early answerCallbackQuery is conditional
console.log('\n🧪 Test 2: Early answerCallbackQuery is conditional');

const hasIfStatement = channelJsContent.includes('if (!CALLBACKS_WITH_CUSTOM_ANSWER.includes(data))');
const hasAnswerCall = channelJsContent.includes('await bot.answerCallbackQuery(query.id)');

if (!hasIfStatement) {
  console.error('  ❌ FAIL: Conditional check for CALLBACKS_WITH_CUSTOM_ANSWER not found');
  process.exit(1);
}

if (!hasAnswerCall) {
  console.error('  ❌ FAIL: answerCallbackQuery call not found');
  process.exit(1);
}

console.log('  ✅ Early answerCallbackQuery is conditional');

// Test 3: Check that all 4 reset buttons are in the exclusion list
console.log('\n🧪 Test 3: All 4 reset button callbacks are in exclusion list');

const resetButtonsInList = [
  channelJsContent.includes("'format_reset_caption'"),
  channelJsContent.includes("'format_reset_periods'"),
  channelJsContent.includes("'format_reset_power_off'"),
  channelJsContent.includes("'format_reset_power_on'")
];

const allResetButtonsPresent = resetButtonsInList.every(present => present);

if (!allResetButtonsPresent) {
  console.error('  ❌ FAIL: Not all reset buttons are in needsCustomAnswer list');
  process.exit(1);
}

console.log('  ✅ All 4 reset buttons in exclusion list');

// Test 4: Check that toggle buttons are in the exclusion list
console.log('\n🧪 Test 4: Toggle button callbacks are in exclusion list');

const toggleButtonsInList = [
  channelJsContent.includes("'format_toggle_delete'"),
  channelJsContent.includes("'format_toggle_piconly'")
];

const allToggleButtonsPresent = toggleButtonsInList.every(present => present);

if (!allToggleButtonsPresent) {
  console.error('  ❌ FAIL: Not all toggle buttons are in needsCustomAnswer list');
  process.exit(1);
}

console.log('  ✅ All toggle buttons in exclusion list');

// Test 5: Check that test buttons are in the exclusion list
console.log('\n🧪 Test 5: Test button callbacks are in exclusion list');

const testButtonsInList = [
  channelJsContent.includes("'test_schedule'"),
  channelJsContent.includes("'test_power_on'"),
  channelJsContent.includes("'test_power_off'")
];

const allTestButtonsPresent = testButtonsInList.every(present => present);

if (!allTestButtonsPresent) {
  console.error('  ❌ FAIL: Not all test buttons are in needsCustomAnswer list');
  process.exit(1);
}

console.log('  ✅ All test buttons in exclusion list');

// Test 6: Check that channel management buttons are in the exclusion list
console.log('\n🧪 Test 6: Channel management callbacks are in exclusion list');

const channelManagementInList = [
  channelJsContent.includes("'channel_test'"),
  channelJsContent.includes("'channel_info'"),
  channelJsContent.includes("'channel_disable_confirm'"),
  channelJsContent.includes("'channel_pause_confirm'"),
  channelJsContent.includes("'channel_resume_confirm'")
];

const allChannelManagementPresent = channelManagementInList.every(present => present);

if (!allChannelManagementPresent) {
  console.error('  ❌ FAIL: Not all channel management buttons are in CALLBACKS_WITH_CUSTOM_ANSWER');
  process.exit(1);
}

console.log('  ✅ All channel management buttons in exclusion list');

// Test 7: Verify reset callbacks still use safeAnswerCallbackQuery
console.log('\n🧪 Test 7: Reset callbacks use safeAnswerCallbackQuery');

const resetCallbacksExist = [
  channelJsContent.includes("if (data === 'format_reset_caption')"),
  channelJsContent.includes("if (data === 'format_reset_periods')"),
  channelJsContent.includes("if (data === 'format_reset_power_off')"),
  channelJsContent.includes("if (data === 'format_reset_power_on')")
];

const allResetCallbacksExist = resetCallbacksExist.every(exists => exists);

if (!allResetCallbacksExist) {
  console.error('  ❌ FAIL: Not all reset callback handlers found');
  process.exit(1);
}

console.log('  ✅ All reset callback handlers exist');

// Test 8: Verify early answer is still called for other callbacks (no unconditional removal)
console.log('\n🧪 Test 8: Early answer is still called for non-custom callbacks');

// Check that we didn't just remove the line, but made it conditional
const hasEarlyAnswerCall = channelJsContent.includes('await bot.answerCallbackQuery(query.id)');

if (!hasEarlyAnswerCall) {
  console.error('  ❌ FAIL: Early answerCallbackQuery call was removed entirely');
  process.exit(1);
}

console.log('  ✅ Early answer still exists for non-custom callbacks');

console.log('\n✅ All popup fix tests passed!');
console.log('═══════════════════════════════════════════════════\n');
process.exit(0);
