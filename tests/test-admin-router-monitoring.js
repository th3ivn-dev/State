/**
 * Test for Admin Router Monitoring Feature
 * 
 * This test verifies:
 * 1. Database functions exist and are exported correctly
 * 2. Monitoring functions exist and are exported correctly
 * 3. Keyboard functions are exported correctly
 * 4. Handler functions are exported correctly
 */

console.log('🧪 Testing Admin Router Monitoring Feature...\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   Error: ${error.message}`);
    testsFailed++;
  }
}

// Test 1: Database module exists and exports functions
test('Database module exports all required functions', () => {
  const adminRoutersDb = require('../src/database/adminRouters');
  
  const requiredFunctions = [
    'getAdminRouter',
    'setAdminRouterIP',
    'updateAdminRouterState',
    'updateAdminRouterCheckTime',
    'toggleAdminRouterNotifications',
    'addAdminRouterEvent',
    'getAdminRouterHistory',
    'getAdminRouterStats',
    'getAllConfiguredAdminRouters',
  ];
  
  requiredFunctions.forEach(fn => {
    if (typeof adminRoutersDb[fn] !== 'function') {
      throw new Error(`Missing or invalid function: ${fn}`);
    }
  });
});

// Test 2: Monitor module exists and exports functions
test('Monitor module exports all required functions', () => {
  const adminRouterMonitor = require('../src/adminRouterMonitor');
  
  const requiredFunctions = [
    'startAdminRouterMonitoring',
    'stopAdminRouterMonitoring',
    'forceCheckAdminRouter',
  ];
  
  requiredFunctions.forEach(fn => {
    if (typeof adminRouterMonitor[fn] !== 'function') {
      throw new Error(`Missing or invalid function: ${fn}`);
    }
  });
});

// Test 3: Keyboard module exports new functions
test('Keyboard module exports admin router keyboard functions', () => {
  const keyboards = require('../src/keyboards/inline');
  
  const requiredFunctions = [
    'getAdminRouterKeyboard',
    'getAdminRouterStatsKeyboard',
    'getAdminRouterSetIpKeyboard',
  ];
  
  requiredFunctions.forEach(fn => {
    if (typeof keyboards[fn] !== 'function') {
      throw new Error(`Missing or invalid function: ${fn}`);
    }
  });
});

// Test 4: Admin handler exports router IP conversation handler
test('Admin handler exports handleAdminRouterIpConversation', () => {
  const adminHandler = require('../src/handlers/admin');
  
  if (typeof adminHandler.handleAdminRouterIpConversation !== 'function') {
    throw new Error('Missing or invalid function: handleAdminRouterIpConversation');
  }
});

// Test 5: Keyboard functions return valid structures
test('Keyboard functions return valid keyboard structures', () => {
  const keyboards = require('../src/keyboards/inline');
  
  // Test getAdminRouterKeyboard with no data
  const kb1 = keyboards.getAdminRouterKeyboard(null);
  if (!kb1.reply_markup || !kb1.reply_markup.inline_keyboard) {
    throw new Error('getAdminRouterKeyboard(null) returned invalid structure');
  }
  
  // Test getAdminRouterKeyboard with data
  const kb2 = keyboards.getAdminRouterKeyboard({ 
    router_ip: '192.168.1.1',
    notifications_on: true 
  });
  if (!kb2.reply_markup || !kb2.reply_markup.inline_keyboard) {
    throw new Error('getAdminRouterKeyboard(data) returned invalid structure');
  }
  
  // Test getAdminRouterStatsKeyboard
  const kb3 = keyboards.getAdminRouterStatsKeyboard();
  if (!kb3.reply_markup || !kb3.reply_markup.inline_keyboard) {
    throw new Error('getAdminRouterStatsKeyboard() returned invalid structure');
  }
  
  // Test getAdminRouterSetIpKeyboard
  const kb4 = keyboards.getAdminRouterSetIpKeyboard();
  if (!kb4.reply_markup || !kb4.reply_markup.inline_keyboard) {
    throw new Error('getAdminRouterSetIpKeyboard() returned invalid structure');
  }
});

// Test 6: Admin keyboard includes router monitoring button
test('Admin keyboard includes router monitoring button', () => {
  const keyboards = require('../src/keyboards/inline');
  
  const adminKeyboard = keyboards.getAdminKeyboard();
  const buttons = adminKeyboard.reply_markup.inline_keyboard.flat();
  
  const hasRouterButton = buttons.some(btn => 
    btn.text === '📡 Моніторинг роутера' && btn.callback_data === 'admin_router'
  );
  
  if (!hasRouterButton) {
    throw new Error('Admin keyboard does not include router monitoring button');
  }
});

// Test 7: Database tables are defined in db.js
test('Database tables are defined in initialization', () => {
  const fs = require('fs');
  const dbContent = fs.readFileSync('../src/database/db.js', 'utf8');
  
  if (!dbContent.includes('CREATE TABLE IF NOT EXISTS admin_routers')) {
    throw new Error('admin_routers table not found in db.js');
  }
  
  if (!dbContent.includes('CREATE TABLE IF NOT EXISTS admin_router_history')) {
    throw new Error('admin_router_history table not found in db.js');
  }
});

// Test 8: Bot.js includes admin router IP conversation handler
test('Bot.js includes admin router IP conversation handler', () => {
  const fs = require('fs');
  const botContent = fs.readFileSync('../src/bot.js', 'utf8');
  
  if (!botContent.includes('handleAdminRouterIpConversation')) {
    throw new Error('handleAdminRouterIpConversation not imported in bot.js');
  }
  
  if (!botContent.includes('await handleAdminRouterIpConversation(bot, msg)')) {
    throw new Error('handleAdminRouterIpConversation not called in message handler');
  }
});

// Test 9: Index.js starts and stops admin router monitoring
test('Index.js starts and stops admin router monitoring', () => {
  const fs = require('fs');
  const indexContent = fs.readFileSync('../src/index.js', 'utf8');
  
  if (!indexContent.includes('startAdminRouterMonitoring')) {
    throw new Error('startAdminRouterMonitoring not called in index.js');
  }
  
  if (!indexContent.includes('stopAdminRouterMonitoring')) {
    throw new Error('stopAdminRouterMonitoring not called in shutdown');
  }
});

// Print summary
console.log('\n📊 Test Summary:');
console.log(`   Passed: ${testsPassed}`);
console.log(`   Failed: ${testsFailed}`);
console.log(`   Total:  ${testsPassed + testsFailed}`);

if (testsFailed === 0) {
  console.log('\n✅ All tests passed!');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed!');
  process.exit(1);
}
