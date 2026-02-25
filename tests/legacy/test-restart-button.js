#!/usr/bin/env node
const path = require('path');

/**
 * Test for restart button in admin panel
 */

const assert = require('assert');
const fs = require('fs');

console.log('🧪 Testing restart button implementation...\n');

// Test 1: Check that restart button is added to admin keyboard
console.log('Test 1: Verify restart button in admin keyboard');
const keyboardContent = fs.readFileSync(path.join(__dirname, '../src/keyboards/inline.js'), 'utf8');

const hasRestartButton = keyboardContent.includes("{ text: '🔄 Перезапуск', callback_data: 'admin_restart' }");
assert(hasRestartButton, 'Admin keyboard should have restart button');
console.log('✓ Restart button added to admin keyboard\n');

// Test 2: Check that getRestartConfirmKeyboard function exists
console.log('Test 2: Verify getRestartConfirmKeyboard function exists');
const hasRestartConfirmFunction = keyboardContent.includes('function getRestartConfirmKeyboard()');
assert(hasRestartConfirmFunction, 'getRestartConfirmKeyboard function should exist');

const hasConfirmButton = keyboardContent.includes("{ text: '✅ Так, перезапустити', callback_data: 'admin_restart_confirm' }");
assert(hasConfirmButton, 'Restart confirmation keyboard should have confirm button');

const hasCancelButton = keyboardContent.includes("{ text: '❌ Скасувати', callback_data: 'admin_menu' }");
assert(hasCancelButton, 'Restart confirmation keyboard should have cancel button');
console.log('✓ getRestartConfirmKeyboard function correctly implemented\n');

// Test 3: Check that getRestartConfirmKeyboard is exported
console.log('Test 3: Verify getRestartConfirmKeyboard is exported');
const hasExport = keyboardContent.includes('getRestartConfirmKeyboard,');
assert(hasExport, 'getRestartConfirmKeyboard should be exported');
console.log('✓ getRestartConfirmKeyboard is exported\n');

// Test 4: Check that admin_restart handler exists
console.log('Test 4: Verify admin_restart handler exists in admin.js');
const adminContent = fs.readFileSync(path.join(__dirname, '../src/handlers/admin.js'), 'utf8');

const hasRestartHandler = adminContent.includes("if (data === 'admin_restart')");
assert(hasRestartHandler, 'admin_restart handler should exist');

const showsConfirmation = adminContent.match(/admin_restart[\s\S]*?getRestartConfirmKeyboard/);
assert(showsConfirmation, 'admin_restart should show confirmation keyboard');

const hasWarningMessage = adminContent.match(/admin_restart[\s\S]*?Бот буде недоступний/);
assert(hasWarningMessage, 'admin_restart should show warning message');
console.log('✓ admin_restart handler correctly implemented\n');

// Test 5: Check that admin_restart_confirm handler exists
console.log('Test 5: Verify admin_restart_confirm handler exists in admin.js');
const hasConfirmHandler = adminContent.includes("if (data === 'admin_restart_confirm')");
assert(hasConfirmHandler, 'admin_restart_confirm handler should exist');

const hasProcessExit = adminContent.match(/admin_restart_confirm[\s\S]*?process\.exit\(1\)/);
assert(hasProcessExit, 'admin_restart_confirm should call process.exit(1)');

const hasSaveUserStates = adminContent.match(/admin_restart_confirm[\s\S]*?saveAllUserStates/);
assert(hasSaveUserStates, 'admin_restart_confirm should call saveAllUserStates');

const hasStopMonitoring = adminContent.match(/admin_restart_confirm[\s\S]*?stopPowerMonitoring/);
assert(hasStopMonitoring, 'admin_restart_confirm should call stopPowerMonitoring');

const hasTimeout = adminContent.match(/admin_restart_confirm[\s\S]*?setTimeout/);
assert(hasTimeout, 'admin_restart_confirm should use setTimeout for graceful shutdown');
console.log('✓ admin_restart_confirm handler correctly implemented\n');

// Test 6: Verify routing in bot.js
console.log('Test 6: Verify routing in bot.js');
const botContent = fs.readFileSync(path.join(__dirname, '../src/bot.js'), 'utf8');

const hasAdminRouting = botContent.includes("data.startsWith('admin_')");
assert(hasAdminRouting, 'bot.js should route admin_* callbacks');

const routesToAdminHandler = botContent.match(/data\.startsWith\('admin_'\)[\s\S]*?handleAdminCallback/);
assert(routesToAdminHandler, 'admin_* callbacks should route to handleAdminCallback');
console.log('✓ Routing correctly configured in bot.js\n');

// Test 7: Security - verify admin checks are in place
console.log('Test 7: Verify admin security checks');
// Check for individual security components
assert(adminContent.includes('isAdmin'), 'handleAdminCallback should call isAdmin');
assert(adminContent.includes('userId'), 'handleAdminCallback should use userId');
assert(adminContent.includes('config.adminIds'), 'handleAdminCallback should check config.adminIds');
assert(adminContent.includes('config.ownerId'), 'handleAdminCallback should check config.ownerId');
console.log('✓ Admin security checks are in place\n');

console.log('✅ All tests passed!\n');
console.log('Summary:');
console.log('  ✓ Restart button added to admin keyboard');
console.log('  ✓ getRestartConfirmKeyboard function exists and is exported');
console.log('  ✓ admin_restart handler shows confirmation dialog');
console.log('  ✓ admin_restart_confirm handler performs graceful shutdown');
console.log('  ✓ Routing configured correctly in bot.js');
console.log('  ✓ Admin security checks are in place');
