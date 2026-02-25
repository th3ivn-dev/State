/**
 * Test: Merged Reset Buttons
 *
 * Verifies that:
 * 1. The schedule text keyboard has only ONE reset button (not 2)
 * 2. The power keyboard has only ONE reset button (not 2)
 * 3. The new reset handlers (format_reset_all_schedule, format_reset_all_power) exist
 * 4. The new callbacks are in the CALLBACKS_WITH_CUSTOM_ANSWER list
 */

const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════════════════');
console.log('  Test: Merged Reset Buttons');
console.log('═══════════════════════════════════════════════════\n');

// Read the channel.js and inline.js files
const channelDir = path.join(__dirname, '../src/handlers/channel');
const inlineJsPath = path.join(__dirname, '../src/keyboards/inline.js');
const channelJsContent = fs.readdirSync(channelDir)
  .filter(f => f.endsWith('.js'))
  .map(f => fs.readFileSync(path.join(channelDir, f), 'utf8'))
  .join('\n');
const inlineJsContent = fs.readFileSync(inlineJsPath, 'utf8');

// Test 1: Schedule text keyboard has only ONE reset button
console.log('🧪 Test 1: Schedule text keyboard has merged reset button');

// Extract the getScheduleTextKeyboard function
const scheduleKeyboardMatch = channelJsContent.match(/function getScheduleTextKeyboard\(\)[\s\S]*?return \{[\s\S]*?\};[\s\S]*?\}/);
if (!scheduleKeyboardMatch) {
  console.error('  ❌ FAIL: getScheduleTextKeyboard function not found');
  process.exit(1);
}

const scheduleKeyboardStr = scheduleKeyboardMatch[0];

// Check that old individual reset buttons are REMOVED
if (scheduleKeyboardStr.includes('format_reset_caption') ||
    scheduleKeyboardStr.includes('format_reset_periods')) {
  console.error('  ❌ FAIL: Old individual reset buttons still exist in schedule keyboard');
  console.error('     Found old callback: format_reset_caption or format_reset_periods');
  process.exit(1);
}

// Check that new merged reset button EXISTS
if (!scheduleKeyboardStr.includes('format_reset_all_schedule')) {
  console.error('  ❌ FAIL: New merged reset button (format_reset_all_schedule) not found');
  process.exit(1);
}

// Check button text
if (!scheduleKeyboardStr.includes('Скинути все до стандартних')) {
  console.error('  ❌ FAIL: Reset button text "Скинути все до стандартних" not found');
  process.exit(1);
}

console.log('  ✅ Schedule keyboard has merged reset button');

// Test 2: Power keyboard has only ONE reset button
console.log('\n🧪 Test 2: Power keyboard has merged reset button');

// Extract the getFormatPowerKeyboard function
const powerKeyboardMatch = inlineJsContent.match(/function getFormatPowerKeyboard\(\)[\s\S]*?return \{[\s\S]*?\};[\s\S]*?\}/);
if (!powerKeyboardMatch) {
  console.error('  ❌ FAIL: getFormatPowerKeyboard function not found');
  process.exit(1);
}

const powerKeyboardStr = powerKeyboardMatch[0];

// Check that old individual reset buttons are REMOVED
if (powerKeyboardStr.includes('format_reset_power_off') ||
    powerKeyboardStr.includes('format_reset_power_on')) {
  console.error('  ❌ FAIL: Old individual reset buttons still exist in power keyboard');
  console.error('     Found old callback: format_reset_power_off or format_reset_power_on');
  process.exit(1);
}

// Check that new merged reset button EXISTS
if (!powerKeyboardStr.includes('format_reset_all_power')) {
  console.error('  ❌ FAIL: New merged reset button (format_reset_all_power) not found');
  process.exit(1);
}

// Check button text
if (!powerKeyboardStr.includes('Скинути все до стандартних')) {
  console.error('  ❌ FAIL: Reset button text "Скинути все до стандартних" not found in power keyboard');
  process.exit(1);
}

console.log('  ✅ Power keyboard has merged reset button');

// Test 3: New callback handlers exist
console.log('\n🧪 Test 3: New callback handlers exist');

// Check format_reset_all_schedule handler
if (!channelJsContent.includes("if (data === 'format_reset_all_schedule')")) {
  console.error('  ❌ FAIL: format_reset_all_schedule handler not found');
  process.exit(1);
}

// Check that it resets BOTH values
const scheduleHandlerMatch = channelJsContent.match(/if \(data === 'format_reset_all_schedule'\)[\s\S]*?return;/);
if (!scheduleHandlerMatch) {
  console.error('  ❌ FAIL: format_reset_all_schedule handler incomplete');
  process.exit(1);
}

const scheduleHandler = scheduleHandlerMatch[0];
if (!scheduleHandler.includes('scheduleCaption: null') ||
    !scheduleHandler.includes('periodFormat: null')) {
  console.error('  ❌ FAIL: format_reset_all_schedule does not reset both scheduleCaption and periodFormat');
  process.exit(1);
}

// Check format_reset_all_power handler
if (!channelJsContent.includes("if (data === 'format_reset_all_power')")) {
  console.error('  ❌ FAIL: format_reset_all_power handler not found');
  process.exit(1);
}

// Check that it resets BOTH values
const powerHandlerMatch = channelJsContent.match(/if \(data === 'format_reset_all_power'\)[\s\S]*?return;/);
if (!powerHandlerMatch) {
  console.error('  ❌ FAIL: format_reset_all_power handler incomplete');
  process.exit(1);
}

const powerHandler = powerHandlerMatch[0];
if (!powerHandler.includes('powerOffText: null') ||
    !powerHandler.includes('powerOnText: null')) {
  console.error('  ❌ FAIL: format_reset_all_power does not reset both powerOffText and powerOnText');
  process.exit(1);
}

console.log('  ✅ New callback handlers exist and reset both values');

// Test 4: New callbacks are in CALLBACKS_WITH_CUSTOM_ANSWER
console.log('\n🧪 Test 4: New callbacks in CALLBACKS_WITH_CUSTOM_ANSWER');

if (!channelJsContent.includes("'format_reset_all_schedule'")) {
  console.error('  ❌ FAIL: format_reset_all_schedule not in CALLBACKS_WITH_CUSTOM_ANSWER');
  process.exit(1);
}

if (!channelJsContent.includes("'format_reset_all_power'")) {
  console.error('  ❌ FAIL: format_reset_all_power not in CALLBACKS_WITH_CUSTOM_ANSWER');
  process.exit(1);
}

console.log('  ✅ New callbacks in CALLBACKS_WITH_CUSTOM_ANSWER');

// Test 5: Handlers show correct popup message
console.log('\n🧪 Test 5: Handlers show correct popup message');

if (!scheduleHandler.includes('Тексти скинуто до стандартних')) {
  console.error('  ❌ FAIL: format_reset_all_schedule popup message incorrect');
  process.exit(1);
}

if (!scheduleHandler.includes('show_alert: true')) {
  console.error('  ❌ FAIL: format_reset_all_schedule does not show alert popup');
  process.exit(1);
}

if (!powerHandler.includes('Тексти скинуто до стандартних')) {
  console.error('  ❌ FAIL: format_reset_all_power popup message incorrect');
  process.exit(1);
}

if (!powerHandler.includes('show_alert: true')) {
  console.error('  ❌ FAIL: format_reset_all_power does not show alert popup');
  process.exit(1);
}

console.log('  ✅ Handlers show correct popup messages');

// Test 6: Old handlers still exist (for backward compatibility)
console.log('\n🧪 Test 6: Old handlers preserved for backward compatibility');

const oldHandlers = [
  'format_reset_caption',
  'format_reset_periods',
  'format_reset_power_off',
  'format_reset_power_on'
];

for (const handler of oldHandlers) {
  if (!channelJsContent.includes(`if (data === '${handler}')`)) {
    console.error(`  ❌ FAIL: Old handler ${handler} removed (should be kept for backward compatibility)`);
    process.exit(1);
  }
}

console.log('  ✅ Old handlers preserved for backward compatibility');

console.log('\n✅ All merged reset button tests passed!');
console.log('═══════════════════════════════════════════════════\n');
process.exit(0);
