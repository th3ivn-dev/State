#!/usr/bin/env node
const path = require('path');

/**
 * Test script for IP monitoring interval fix
 * Verifies that admin panel IP interval setting is properly implemented
 */

const assert = require('assert');
const fs = require('fs');

console.log('🧪 Testing IP Monitoring Interval Fix...\n');

// Test 1: Verify powerMonitor.js reads interval from database
console.log('Test 1: Verify powerMonitor reads interval from database');
try {
  const powerMonitorContent = fs.readFileSync(path.join(__dirname, '../src/powerMonitor.js'), 'utf8');

  // Check that getSetting is called for power_check_interval
  assert(
    powerMonitorContent.includes("await getSetting('power_check_interval'"),
    'powerMonitor should call getSetting for power_check_interval'
  );

  // Check that it stores the result
  assert(
    powerMonitorContent.includes('adminInterval') && powerMonitorContent.includes('adminIntervalNum'),
    'powerMonitor should store admin interval value'
  );

  console.log('✓ powerMonitor correctly reads interval from database\n');
} catch (error) {
  console.error('✗ Failed:', error.message);
  process.exit(1);
}

// Test 2: Verify dynamic calculation is used as fallback
console.log('Test 2: Verify dynamic calculation is used as fallback');
try {
  const powerMonitorContent = fs.readFileSync(path.join(__dirname, '../src/powerMonitor.js'), 'utf8');

  // Check that calculateCheckInterval is still called as fallback
  assert(
    powerMonitorContent.includes('calculateCheckInterval(userCount)'),
    'Dynamic calculation should still be available as fallback'
  );

  // Check for conditional logic
  assert(
    powerMonitorContent.includes('if (adminIntervalNum > 0)'),
    'Should check if admin interval is greater than 0'
  );

  console.log('✓ Dynamic calculation is used as fallback\n');
} catch (error) {
  console.error('✗ Failed:', error.message);
  process.exit(1);
}

// Test 3: Verify logging shows correct mode
console.log('Test 3: Verify logging shows correct mode');
try {
  const powerMonitorContent = fs.readFileSync(path.join(__dirname, '../src/powerMonitor.js'), 'utf8');

  // Check for admin mode logging
  assert(
    powerMonitorContent.includes('встановлено адміном'),
    'Should log when admin interval is used'
  );

  // Check for dynamic mode logging
  assert(
    powerMonitorContent.includes('динамічний, на основі'),
    'Should log when dynamic interval is used'
  );

  // Check for intervalMode variable
  assert(
    powerMonitorContent.includes("intervalMode = 'admin'") &&
    powerMonitorContent.includes("intervalMode = 'dynamic'"),
    'Should track interval mode'
  );

  console.log('✓ Logging correctly shows interval mode\n');
} catch (error) {
  console.error('✗ Failed:', error.message);
  process.exit(1);
}

// Test 4: Verify admin.js restarts power monitoring
console.log('Test 4: Verify admin.js restarts power monitoring after change');
try {
  const adminContent = fs.readFileSync(path.join(__dirname, '../src/handlers/admin.js'), 'utf8');

  // Find the admin_ip_ callback handler
  const ipHandlerStart = adminContent.indexOf("if (data.startsWith('admin_ip_'))");
  const ipHandlerEnd = adminContent.indexOf('return;', ipHandlerStart + 500);
  const ipHandler = adminContent.substring(ipHandlerStart, ipHandlerEnd);

  // Check that it imports power monitoring functions
  assert(
    ipHandler.includes('stopPowerMonitoring') && ipHandler.includes('startPowerMonitoring'),
    'Should import stopPowerMonitoring and startPowerMonitoring'
  );

  // Check that stopPowerMonitoring is called
  assert(
    ipHandler.includes('stopPowerMonitoring()'),
    'Should call stopPowerMonitoring()'
  );

  // Check that startPowerMonitoring is awaited
  assert(
    ipHandler.includes('await startPowerMonitoring(bot)'),
    'Should await startPowerMonitoring(bot)'
  );

  console.log('✓ admin.js correctly restarts power monitoring\n');
} catch (error) {
  console.error('✗ Failed:', error.message);
  process.exit(1);
}

// Test 5: Verify success message updated
console.log('Test 5: Verify success message updated');
try {
  const adminContent = fs.readFileSync(path.join(__dirname, '../src/handlers/admin.js'), 'utf8');

  // Find the admin_ip_ callback handler
  const ipHandlerStart = adminContent.indexOf("if (data.startsWith('admin_ip_'))");
  const ipHandlerEnd = adminContent.indexOf('return;', ipHandlerStart + 1000);
  const ipHandler = adminContent.substring(ipHandlerStart, ipHandlerEnd);

  // Check that old message is not used
  assert(
    !ipHandler.includes('Перезапустіть бота'),
    'Should not show "Перезапустіть бота" message'
  );

  // Check that new message is used
  assert(
    ipHandler.includes('Застосовано!'),
    'Should show "Застосовано!" message'
  );

  console.log('✓ Success message correctly updated\n');
} catch (error) {
  console.error('✗ Failed:', error.message);
  process.exit(1);
}

// Test 6: Verify dynamic mode button exists
console.log('Test 6: Verify dynamic mode button added to keyboard');
try {
  const keyboardContent = fs.readFileSync(path.join(__dirname, '../src/keyboards/inline.js'), 'utf8');

  // Find getIpIntervalKeyboard function - use a more robust search
  const keyboardStart = keyboardContent.indexOf('function getIpIntervalKeyboard()');
  const nextFunctionStart = keyboardContent.indexOf('function getDeactivateConfirmKeyboard()', keyboardStart);
  const keyboard = keyboardContent.substring(keyboardStart, nextFunctionStart);

  // Check for dynamic button
  assert(
    keyboard.includes('admin_ip_0'),
    'Should have button with callback_data admin_ip_0'
  );

  assert(
    keyboard.includes('Динамічний') || keyboard.includes('🔄'),
    'Dynamic button should be labeled appropriately'
  );

  console.log('✓ Dynamic mode button added to keyboard\n');
} catch (error) {
  console.error('✗ Failed:', error.message);
  process.exit(1);
}

// Test 7: Verify special handling for 0 value
console.log('Test 7: Verify special handling for interval value 0');
try {
  const adminContent = fs.readFileSync(path.join(__dirname, '../src/handlers/admin.js'), 'utf8');

  // Find the admin_ip_ callback handler
  const ipHandlerStart = adminContent.indexOf("if (data.startsWith('admin_ip_'))");
  const ipHandlerEnd = adminContent.indexOf('return;', ipHandlerStart + 1000);
  const ipHandler = adminContent.substring(ipHandlerStart, ipHandlerEnd);

  // Check for special message when seconds === 0
  assert(
    ipHandler.includes('seconds === 0') && ipHandler.includes('Динамічний режим'),
    'Should show special message for dynamic mode (0 value)'
  );

  console.log('✓ Special handling for 0 value implemented\n');
} catch (error) {
  console.error('✗ Failed:', error.message);
  process.exit(1);
}

// Test 8: Verify logger is imported in admin.js
console.log('Test 8: Verify logger is imported in admin.js');
try {
  const adminContent = fs.readFileSync(path.join(__dirname, '../src/handlers/admin.js'), 'utf8');

  // Check for logger import near the top of the file (first 1500 chars should be enough)
  const firstPartOfFile = adminContent.substring(0, 1500);
  assert(
    firstPartOfFile.includes('logger') && firstPartOfFile.includes('createLogger'),
    'Logger should be imported at the top of admin.js'
  );

  console.log('✓ Logger is imported in admin.js\n');
} catch (error) {
  console.error('✗ Failed:', error.message);
  process.exit(1);
}

console.log('✅ All tests passed!');
console.log('\n📋 Summary of fixes verified:');
console.log('  ✓ powerMonitor reads interval from database with getSetting');
console.log('  ✓ Falls back to dynamic calculation when no admin value set');
console.log('  ✓ Logs show whether admin or dynamic mode is active');
console.log('  ✓ admin.js restarts power monitoring after interval change');
console.log('  ✓ Success message updated to "Застосовано!"');
console.log('  ✓ Dynamic mode button (admin_ip_0) added to keyboard');
console.log('  ✓ Special handling for 0 value (dynamic mode)');
console.log('  ✓ Logger imported for monitoring restart logging');
