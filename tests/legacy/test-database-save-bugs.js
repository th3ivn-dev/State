#!/usr/bin/env node
const path = require('path');

/**
 * Comprehensive test for critical database save bug fixes:
 * 1. Missing $ in SQL parameterized queries in updateUserFormatSettings()
 * 2. Missing $ in SQL parameterized queries in updateUserScheduleAlertSettings()
 * 3. Using 1/0 instead of true/false for BOOLEAN in updateUserScheduleAlertSettings()
 * 4. updateUser() function only supports 6 fields
 * 5. UserService.saveUser() calls non-existent usersDb.saveUser()
 */

const assert = require('assert');
const fs = require('fs');

console.log('🧪 Testing Critical Database Save Bug Fixes...\n');

// ============================================================================
// Test 1: Verify updateUserFormatSettings has correct SQL parameters
// ============================================================================
console.log('Test 1: updateUserFormatSettings() uses $N in SQL queries');

const usersDbCode = fs.readFileSync(path.join(__dirname, '../src/database/users.js'), 'utf8');

// Check that all fields.push() calls in updateUserFormatSettings use $${values.length}
const formatSettingsMatch = usersDbCode.match(/async function updateUserFormatSettings[\s\S]*?return result\.rowCount > 0;\s*}/);
assert(formatSettingsMatch, 'updateUserFormatSettings function not found');
const formatSettingsSection = formatSettingsMatch[0];

// Should have $ prefix for all field assignments
assert(
  formatSettingsSection.includes('schedule_caption = $${values.length}'),
  'schedule_caption should use $${values.length}'
);
assert(
  formatSettingsSection.includes('period_format = $${values.length}'),
  'period_format should use $${values.length}'
);
assert(
  formatSettingsSection.includes('power_off_text = $${values.length}'),
  'power_off_text should use $${values.length}'
);
assert(
  formatSettingsSection.includes('power_on_text = $${values.length}'),
  'power_on_text should use $${values.length}'
);
assert(
  formatSettingsSection.includes('delete_old_message = $${values.length}'),
  'delete_old_message should use $${values.length}'
);
assert(
  formatSettingsSection.includes('picture_only = $${values.length}'),
  'picture_only should use $${values.length}'
);

// Check WHERE clause
assert(
  formatSettingsSection.includes('WHERE telegram_id = $${values.length}'),
  'WHERE clause in updateUserFormatSettings should use $${values.length}'
);

// Should NOT have incorrect syntax without $ (looking for = ${values.length} without the $)
const incorrectPattern = /= \$\{values\.length\}/;
assert(
  !incorrectPattern.test(formatSettingsSection),
  'updateUserFormatSettings should NOT have field assignments without $ prefix'
);

console.log('✓ updateUserFormatSettings() correctly uses $N in all SQL queries\n');

// ============================================================================
// Test 2: Verify updateUserScheduleAlertSettings has correct SQL parameters
// ============================================================================
console.log('Test 2: updateUserScheduleAlertSettings() uses $N in SQL queries');

const scheduleAlertMatch = usersDbCode.match(/async function updateUserScheduleAlertSettings[\s\S]*?return result\.rowCount > 0;\s*}/);
assert(scheduleAlertMatch, 'updateUserScheduleAlertSettings function not found');
const scheduleAlertSection = scheduleAlertMatch[0];

// Should have $ prefix for all field assignments
assert(
  scheduleAlertSection.includes('schedule_alert_enabled = $${values.length}'),
  'schedule_alert_enabled should use $${values.length}'
);
assert(
  scheduleAlertSection.includes('schedule_alert_minutes = $${values.length}'),
  'schedule_alert_minutes should use $${values.length}'
);
assert(
  scheduleAlertSection.includes('schedule_alert_target = $${values.length}'),
  'schedule_alert_target should use $${values.length}'
);

// Check WHERE clause
assert(
  scheduleAlertSection.includes('WHERE telegram_id = $${values.length}'),
  'WHERE clause in updateUserScheduleAlertSettings should use $${values.length}'
);

console.log('✓ updateUserScheduleAlertSettings() correctly uses $N in all SQL queries\n');

// ============================================================================
// Test 3: Verify updateUserScheduleAlertSettings uses true/false for BOOLEAN
// ============================================================================
console.log('Test 3: updateUserScheduleAlertSettings() uses true/false for BOOLEAN');

// Check that it uses ? true : false, not ? 1 : 0
assert(
  scheduleAlertSection.includes('scheduleAlertEnabled ? true : false'),
  'scheduleAlertEnabled should use ? true : false, not ? 1 : 0'
);

// Should NOT have 1/0 syntax
assert(
  !scheduleAlertSection.includes('scheduleAlertEnabled ? 1 : 0'),
  'scheduleAlertEnabled should NOT use ? 1 : 0'
);

console.log('✓ updateUserScheduleAlertSettings() correctly uses true/false for BOOLEAN\n');

// ============================================================================
// Test 4: Verify updateUser() supports all required fields
// ============================================================================
console.log('Test 4: updateUser() function supports all required fields');

const updateUserMatch = usersDbCode.match(/async function updateUser\(telegramId, updates\)[\s\S]*?return result\.rowCount > 0;\s*}/);
assert(updateUserMatch, 'updateUser function not found');
const updateUserSection = updateUserMatch[0];

// Original 6 fields
assert(updateUserSection.includes('last_start_message_id'), 'Should support last_start_message_id');
assert(updateUserSection.includes('last_settings_message_id'), 'Should support last_settings_message_id');
assert(updateUserSection.includes('last_schedule_message_id'), 'Should support last_schedule_message_id');
assert(updateUserSection.includes('last_timer_message_id'), 'Should support last_timer_message_id');
assert(updateUserSection.includes('channel_id'), 'Should support channel_id');
assert(updateUserSection.includes('channel_title'), 'Should support channel_title');

// New required fields from UserService
assert(updateUserSection.includes('is_active'), 'Should support is_active');
assert(updateUserSection.includes('router_ip'), 'Should support router_ip');
assert(updateUserSection.includes('notify_before_off'), 'Should support notify_before_off');
assert(updateUserSection.includes('notify_before_on'), 'Should support notify_before_on');
assert(updateUserSection.includes('alerts_off_enabled'), 'Should support alerts_off_enabled');
assert(updateUserSection.includes('alerts_on_enabled'), 'Should support alerts_on_enabled');

// New required fields from ChannelService
assert(updateUserSection.includes('channel_description'), 'Should support channel_description');
assert(updateUserSection.includes('channel_photo_file_id'), 'Should support channel_photo_file_id');
assert(updateUserSection.includes('channel_user_title'), 'Should support channel_user_title');
assert(updateUserSection.includes('channel_user_description'), 'Should support channel_user_description');
assert(updateUserSection.includes('channel_status'), 'Should support channel_status');
assert(updateUserSection.includes('last_published_hash'), 'Should support last_published_hash');
assert(updateUserSection.includes('last_post_id'), 'Should support last_post_id');

// Additional fields mentioned in problem statement
assert(updateUserSection.includes('last_menu_message_id'), 'Should support last_menu_message_id');
assert(updateUserSection.includes('last_hash'), 'Should support last_hash');
assert(updateUserSection.includes('channel_paused'), 'Should support channel_paused');
assert(updateUserSection.includes('power_notify_target'), 'Should support power_notify_target');

console.log('✓ updateUser() now supports all 24+ required fields\n');

// ============================================================================
// Test 5: Verify saveUser() function exists and is exported
// ============================================================================
console.log('Test 5: saveUser() function exists and is exported');

// Check that saveUser function is defined
assert(
  usersDbCode.includes('async function saveUser('),
  'saveUser function should be defined in users.js'
);

// Check that it uses upsert (INSERT ... ON CONFLICT)
const saveUserMatch = usersDbCode.match(/async function saveUser[\s\S]*?}/);
assert(saveUserMatch, 'saveUser function not found');
const saveUserSection = saveUserMatch[0];
assert(
  saveUserSection.includes('ON CONFLICT'),
  'saveUser should use ON CONFLICT for upsert'
);
assert(
  saveUserSection.includes('DO UPDATE SET'),
  'saveUser should use DO UPDATE SET for upsert'
);

// Check that saveUser is exported
assert(
  usersDbCode.includes('module.exports = {') && usersDbCode.match(/module\.exports = \{[\s\S]*?saveUser[\s\S]*?\}/),
  'saveUser should be exported in module.exports'
);

console.log('✓ saveUser() function exists with upsert logic and is exported\n');

// ============================================================================
// Test 6: Verify UserService.saveUser() calls correct function
// ============================================================================
console.log('Test 6: UserService.saveUser() can now call usersDb.saveUser()');

const userServiceCode = fs.readFileSync(path.join(__dirname, '../src/services/UserService.js'), 'utf8');

// Check that UserService imports usersDb
assert(
  userServiceCode.includes("require('../database/users')"),
  'UserService should import usersDb'
);

// Check that UserService has a saveUser method that calls usersDb.saveUser
assert(
  userServiceCode.includes('await usersDb.saveUser('),
  'UserService.saveUser() should call usersDb.saveUser()'
);

console.log('✓ UserService.saveUser() correctly calls usersDb.saveUser()\n');

// ============================================================================
// Test 7: Verify ChannelService methods can use updateUser() with new fields
// ============================================================================
console.log('Test 7: ChannelService uses updateUser() with extended fields');

const channelServiceCode = fs.readFileSync(path.join(__dirname, '../src/services/ChannelService.js'), 'utf8');

// Check that ChannelService imports usersDb
assert(
  channelServiceCode.includes("require('../database/users')"),
  'ChannelService should import usersDb'
);

// Check that ChannelService uses updateUser
assert(
  channelServiceCode.includes('usersDb.updateUser('),
  'ChannelService should call usersDb.updateUser()'
);

// Verify that service methods can now set channel-related fields
const connectChannelMatch = channelServiceCode.match(/async connectChannel[\s\S]*?getUserByTelegramId/);
if (connectChannelMatch) {
  const connectChannel = connectChannelMatch[0];
  assert(
    connectChannel.includes('channel_description') || connectChannel.includes('channelDescription'),
    'connectChannel should handle channel_description'
  );
}

console.log('✓ ChannelService can use updateUser() with all channel fields\n');

// ============================================================================
// Test 8: Verify BOOLEAN fields use true/false consistently
// ============================================================================
console.log('Test 8: All BOOLEAN fields use true/false consistently');

// Check updateUser for BOOLEAN consistency
assert(
  updateUserSection.includes('channel_paused ? true : false'),
  'channel_paused should use ? true : false'
);
assert(
  updateUserSection.includes('alerts_off_enabled ? true : false'),
  'alerts_off_enabled should use ? true : false'
);
assert(
  updateUserSection.includes('alerts_on_enabled ? true : false'),
  'alerts_on_enabled should use ? true : false'
);
assert(
  updateUserSection.includes('is_active ? true : false'),
  'is_active should use ? true : false'
);

console.log('✓ All BOOLEAN fields consistently use true/false\n');

// ============================================================================
// Summary
// ============================================================================
console.log('✅ All database save bug tests passed!\n');
console.log('Summary of fixes:');
console.log('1. ✅ updateUserFormatSettings() now uses $N in SQL parameters');
console.log('2. ✅ updateUserScheduleAlertSettings() now uses $N in SQL parameters');
console.log('3. ✅ updateUserScheduleAlertSettings() uses true/false for BOOLEAN');
console.log('4. ✅ updateUser() now supports 24+ fields (was 6)');
console.log('5. ✅ saveUser() function added with upsert logic');
console.log('6. ✅ UserService.saveUser() can call usersDb.saveUser()');
console.log('7. ✅ ChannelService can use all channel fields via updateUser()');
console.log('8. ✅ All BOOLEAN fields use true/false consistently');
console.log('\nExpected results:');
console.log('✅ SQL queries will use proper parameterized placeholders ($1, $2, etc.)');
console.log('✅ PostgreSQL will correctly interpret parameters instead of literal values');
console.log('✅ Data will be saved correctly to the database');
console.log('✅ No more silent field ignoring in service layer');
