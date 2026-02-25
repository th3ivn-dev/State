#!/usr/bin/env node

const path = require('path');
/**
 * Test script to verify the implementation of:
 * - Auto-connect channel via my_chat_member
 * - Admin panel interval management
 * - Improved navigation with two buttons
 */

const fs = require('fs');

console.log('🧪 Testing implementation changes...\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    testsFailed++;
  }
}

// Test 1: Verify pendingChannels Map exists in bot.js
test('bot.js exports pendingChannels', () => {
  const botContent = fs.readFileSync(path.join(__dirname, 'src/bot.js'), 'utf8');
  if (!botContent.includes('const pendingChannels = new Map()')) {
    throw new Error('pendingChannels Map not found');
  }
  if (!botContent.includes('module.exports.pendingChannels = pendingChannels')) {
    throw new Error('pendingChannels not exported');
  }
});

// Test 2: Verify /setchannel command is removed
test('/setchannel command removed from bot.js', () => {
  const botContent = fs.readFileSync(path.join(__dirname, 'src/bot.js'), 'utf8');
  if (botContent.includes('bot.onText(/^\\/setchannel/')) {
    throw new Error('/setchannel command still exists');
  }
});

// Test 3: Verify my_chat_member handler updated
test('my_chat_member handler uses new flow', () => {
  const botContent = fs.readFileSync(path.join(__dirname, 'src/bot.js'), 'utf8');
  if (!botContent.includes('pendingChannels.set(channelId')) {
    throw new Error('my_chat_member does not use pendingChannels');
  }
  if (!botContent.includes('usersDb.getUserByChannelId(channelId)')) {
    throw new Error('my_chat_member does not check for occupied channels');
  }
});

// Test 4: Verify channel_connect callback updated
test('channel_connect callback checks pendingChannels', () => {
  const channelContent = fs.readFileSync(path.join(__dirname, 'src/handlers/channel.js'), 'utf8');
  if (!channelContent.includes('const { pendingChannels } = require(\'../bot\')')) {
    throw new Error('channel.js does not import pendingChannels');
  }
  if (!channelContent.includes('for (const [channelId, channel] of pendingChannels.entries())')) {
    throw new Error('channel_connect does not iterate pendingChannels');
  }
});

// Test 5: Verify channel_confirm_ callback exists
test('channel_confirm_ callback handler exists', () => {
  const channelContent = fs.readFileSync(path.join(__dirname, 'src/handlers/channel.js'), 'utf8');
  if (!channelContent.includes('if (data.startsWith(\'channel_confirm_\'))')) {
    throw new Error('channel_confirm_ callback handler not found');
  }
});

// Test 6: Verify admin interval keyboards exist
test('Admin interval keyboards exist in inline.js', () => {
  const inlineContent = fs.readFileSync(path.join(__dirname, 'src/keyboards/inline.js'), 'utf8');
  if (!inlineContent.includes('function getAdminIntervalsKeyboard')) {
    throw new Error('getAdminIntervalsKeyboard not found');
  }
  if (!inlineContent.includes('function getScheduleIntervalKeyboard')) {
    throw new Error('getScheduleIntervalKeyboard not found');
  }
  if (!inlineContent.includes('function getIpIntervalKeyboard')) {
    throw new Error('getIpIntervalKeyboard not found');
  }
});

// Test 7: Verify admin interval callbacks exist
test('Admin interval callbacks exist in admin.js', () => {
  const adminContent = fs.readFileSync(path.join(__dirname, 'src/handlers/admin.js'), 'utf8');
  if (!adminContent.includes('if (data === \'admin_intervals\')')) {
    throw new Error('admin_intervals callback not found');
  }
  if (!adminContent.includes('if (data.startsWith(\'admin_schedule_\'))')) {
    throw new Error('admin_schedule_ callbacks not found');
  }
  if (!adminContent.includes('if (data.startsWith(\'admin_ip_\'))')) {
    throw new Error('admin_ip_ callbacks not found');
  }
});

// Test 8: Verify navigation buttons updated (region/queue confirmation)
test('Region/queue update has two navigation buttons', () => {
  const startContent = fs.readFileSync(path.join(__dirname, 'src/handlers/start.js'), 'utf8');
  if (!startContent.includes('{ text: \'← Назад\', callback_data: \'menu_settings\' }')) {
    throw new Error('Back button not found in region/queue update');
  }
  if (!startContent.includes('{ text: \'⤴︎ Меню\', callback_data: \'back_to_main\' }')) {
    throw new Error('Menu button not found in region/queue update');
  }
});

// Test 9: Verify keyboards have two buttons
test('Keyboards updated with two navigation buttons', () => {
  const inlineContent = fs.readFileSync(path.join(__dirname, 'src/keyboards/inline.js'), 'utf8');

  // Check getAlertsSettingsKeyboard
  const alertsKeyboard = inlineContent.match(/function getAlertsSettingsKeyboard[\s\S]*?return \{[\s\S]*?\};/);
  if (!alertsKeyboard || !alertsKeyboard[0].includes('⤴︎ Меню')) {
    throw new Error('getAlertsSettingsKeyboard does not have Menu button');
  }

  // Check getAlertTimeKeyboard
  const alertTimeKeyboard = inlineContent.match(/function getAlertTimeKeyboard[\s\S]*?return \{[\s\S]*?\};/);
  if (!alertTimeKeyboard || !alertTimeKeyboard[0].includes('⤴︎ Меню')) {
    throw new Error('getAlertTimeKeyboard does not have Menu button');
  }
});

// Test 10: Verify getUserByChannelId function exists
test('getUserByChannelId function exists in users.js', () => {
  const usersContent = fs.readFileSync(path.join(__dirname, 'src/database/users.js'), 'utf8');
  if (!usersContent.includes('function getUserByChannelId')) {
    throw new Error('getUserByChannelId function not found');
  }
  if (!usersContent.includes('getUserByChannelId,')) {
    throw new Error('getUserByChannelId not exported');
  }
});

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);
console.log(`${'='.repeat(50)}`);

if (testsFailed === 0) {
  console.log('\n✅ All tests passed! Implementation verified.');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed. Please review the implementation.');
  process.exit(1);
}
