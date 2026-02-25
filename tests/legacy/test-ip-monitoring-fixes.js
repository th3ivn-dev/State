#!/usr/bin/env node
const path = require('path');

/**
 * Test script for IP monitoring bug fixes
 * Tests code changes without requiring bot initialization
 */

const assert = require('assert');
const fs = require('fs');

console.log('🧪 Testing IP Monitoring Bug Fixes...\n');

// Test 1: Verify settings.js uses telegram_id for getUserIpStatus
console.log('Test 1: Verify settings.js uses telegram_id for getUserIpStatus');
try {
  const settingsContent = fs.readFileSync(path.join(__dirname, '../src/handlers/settings.js'), 'utf8');

  // Check that getUserIpStatus is called with user.telegram_id
  assert(
    settingsContent.includes('getUserIpStatus(user.telegram_id)'),
    'getUserIpStatus should be called with user.telegram_id'
  );

  // Make sure it's not using user.id incorrectly
  const incorrectUsage = settingsContent.match(/getUserIpStatus\(user\.id\)/);
  assert(
    !incorrectUsage,
    'getUserIpStatus should not be called with user.id'
  );

  console.log('✓ settings.js correctly uses user.telegram_id\n');
} catch (error) {
  console.error('✗ Failed:', error.message);
  process.exit(1);
}

// Test 2: Verify powerMonitor.js uses getSetting for debounce
console.log('Test 2: Verify powerMonitor.js uses getSetting for debounce');
try {
  const powerMonitorContent = fs.readFileSync(path.join(__dirname, '../src/powerMonitor.js'), 'utf8');

  // Check that getSetting is imported from database/db (either standalone or with pool)
  assert(
    powerMonitorContent.includes('getSetting') &&
    powerMonitorContent.includes("require('./database/db')"),
    'getSetting should be imported from database/db'
  );

  assert(
    powerMonitorContent.includes("await getSetting('power_debounce_minutes'"),
    'getSetting should be used to get power_debounce_minutes'
  );

  console.log('✓ powerMonitor.js correctly uses getSetting for debounce\n');
} catch (error) {
  console.error('✗ Failed:', error.message);
  process.exit(1);
}

// Test 3: Check that startPowerMonitoring is async
console.log('Test 3: Verify startPowerMonitoring is async');
try {
  const powerMonitorContent = fs.readFileSync(path.join(__dirname, '../src/powerMonitor.js'), 'utf8');

  assert(
    powerMonitorContent.includes('async function startPowerMonitoring'),
    'startPowerMonitoring should be an async function'
  );

  console.log('✓ startPowerMonitoring is async\n');
} catch (error) {
  console.error('✗ Failed:', error.message);
  process.exit(1);
}

// Test 4: Check index.js awaits startPowerMonitoring
console.log('Test 4: Verify index.js awaits startPowerMonitoring');
try {
  const indexContent = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');

  // Check that startPowerMonitoring is awaited
  assert(
    indexContent.includes('await startPowerMonitoring(bot)'),
    'startPowerMonitoring should be awaited in index.js'
  );
  console.log('✓ index.js correctly awaits startPowerMonitoring\n');
} catch (error) {
  console.error('✗ Failed:', error.message);
  process.exit(1);
}

// Test 5: Verify IP setup duplicate check exists
console.log('Test 5: Verify IP setup has duplicate check');
try {
  const settingsContent = fs.readFileSync(path.join(__dirname, '../src/handlers/settings.js'), 'utf8');

  // Check for duplicate check in ip_setup handler
  assert(
    settingsContent.includes('if (user.router_ip)') &&
    settingsContent.includes('У вас вже додана IP-адреса'),
    'ip_setup should check for existing IP and show warning'
  );

  assert(
    settingsContent.includes('Видалити адресу'),
    'Duplicate IP warning should have delete button'
  );

  console.log('✓ IP setup has duplicate check\n');
} catch (error) {
  console.error('✗ Failed:', error.message);
  process.exit(1);
}

// Test 6: Verify IP save confirmation has navigation buttons
console.log('Test 6: Verify IP save confirmation has correct buttons');
try {
  const settingsContent = fs.readFileSync(path.join(__dirname, '../src/handlers/settings.js'), 'utf8');

  // Check for navigation buttons in success message
  assert(
    settingsContent.includes('IP-адресу збережено') &&
    settingsContent.includes('← Назад') &&
    settingsContent.includes('settings_ip') &&
    settingsContent.includes('⤴ Меню') &&
    settingsContent.includes('back_to_main'),
    'IP save confirmation should have navigation buttons'
  );

  // Find the IP save confirmation section
  const saveIndex = settingsContent.indexOf('IP-адресу збережено');
  const afterSave = settingsContent.substring(saveIndex, saveIndex + 600);

  // Make sure it doesn't use getMainMenu in the save confirmation
  assert(
    !afterSave.includes('getMainMenu'),
    'IP save confirmation should not use getMainMenu'
  );

  console.log('✓ IP save confirmation has correct navigation buttons\n');
} catch (error) {
  console.error('✗ Failed:', error.message);
  process.exit(1);
}

// Test 7: Verify config.POWER_DEBOUNCE_MINUTES is not used in checkUserPower
console.log('Test 7: Verify checkUserPower does not use static config');
try {
  const powerMonitorContent = fs.readFileSync(path.join(__dirname, '../src/powerMonitor.js'), 'utf8');

  // Find checkUserPower function
  const checkUserPowerStart = powerMonitorContent.indexOf('async function checkUserPower');
  const checkUserPowerEnd = powerMonitorContent.indexOf('async function checkAllUsers', checkUserPowerStart);
  const checkUserPowerFunction = powerMonitorContent.substring(checkUserPowerStart, checkUserPowerEnd);

  // Make sure config.POWER_DEBOUNCE_MINUTES is not used in this function
  assert(
    !checkUserPowerFunction.includes('config.POWER_DEBOUNCE_MINUTES'),
    'checkUserPower should not use config.POWER_DEBOUNCE_MINUTES'
  );

  // Make sure it uses getSetting instead
  assert(
    checkUserPowerFunction.includes("getSetting('power_debounce_minutes'"),
    'checkUserPower should use getSetting for debounce'
  );

  console.log('✓ checkUserPower uses getSetting instead of static config\n');
} catch (error) {
  console.error('✗ Failed:', error.message);
  process.exit(1);
}

console.log('✅ All tests passed!');
console.log('\n📋 Summary of fixes verified:');
console.log('  ✓ Bug 1: IP save shows navigation buttons instead of main menu');
console.log('  ✓ Bug 2: IP status uses correct telegram_id key');
console.log('  ✓ Bug 3: Debounce reads from database instead of static config');
console.log('  ✓ Bug 4: Duplicate IP check prevents overwriting existing IP');

