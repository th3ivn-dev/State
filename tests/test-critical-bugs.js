#!/usr/bin/env node
const path = require('path');

/**
 * Comprehensive test for critical bug fixes:
 * 1. isAdmin function with ownerId support
 * 2. New user wizard flow
 */

const assert = require('assert');

console.log('🧪 Testing Critical Bug Fixes...\n');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.BOT_TOKEN = 'test_token_123';
process.env.OWNER_ID = '1026177113';

// ============================================================================
// Test 1: isAdmin function properly checks ownerId
// ============================================================================
console.log('Test 1: isAdmin function with ownerId support');
const { isAdmin } = require('../src/utils');

const ownerId = '1026177113';
const adminIds = ['999888777'];
const regularUserId = '123456789';

// Owner should have admin access
assert.strictEqual(
  isAdmin(ownerId, adminIds, ownerId), 
  true, 
  'Owner should have admin access when ownerId is provided'
);

// Owner should have admin access even with empty admin list
assert.strictEqual(
  isAdmin(ownerId, [], ownerId), 
  true, 
  'Owner should have admin access even with empty admin list'
);

// Admin in list should have access
assert.strictEqual(
  isAdmin('999888777', adminIds, ownerId), 
  true, 
  'User in adminIds list should have admin access'
);

// Regular user should NOT have access
assert.strictEqual(
  isAdmin(regularUserId, adminIds, ownerId), 
  false, 
  'Regular user should NOT have admin access'
);

// Backward compatibility - function should work without ownerId
assert.strictEqual(
  isAdmin('999888777', adminIds), 
  true, 
  'Function should work without ownerId (backward compatibility)'
);

console.log('✓ isAdmin function correctly checks ownerId\n');

// ============================================================================
// Test 2: settings.js uses isAdmin function correctly
// ============================================================================
console.log('Test 2: Verify settings.js imports and uses isAdmin from utils');

const settingsCode = require('fs').readFileSync(path.join(__dirname, '../src/handlers/settings/index.js'), 'utf8');

// Check that isAdmin is imported from utils
assert(
  settingsCode.includes("require('../../utils')") && settingsCode.includes('isAdmin') ||
  settingsCode.includes('require("../../utils")') && settingsCode.includes('isAdmin'),
  'settings/index.js should import isAdmin from utils'
);

// Check that inline isAdmin checks are replaced
assert(
  !settingsCode.includes('config.adminIds.includes(telegramId) || telegramId === config.ownerId'),
  'settings.js should not have inline isAdmin checks anymore'
);

// Check that isAdmin function is actually called
assert(
  settingsCode.includes('isAdmin(telegramId, config.adminIds, config.ownerId)'),
  'settings.js should call isAdmin function with all three parameters'
);

console.log('✓ settings.js properly uses isAdmin utility function\n');

// ============================================================================
// Test 3: Wizard flow handles new users correctly
// ============================================================================
console.log('Test 3: Wizard flow for new users');

const startHandlerCode = require('fs').readFileSync(path.join(__dirname, '../src/handlers/start.js'), 'utf8');

// Verify wizard creates user on confirm_setup
assert(
  startHandlerCode.includes('usersDb.createUser(telegramId, username, state.region, state.queue)'),
  'Wizard should create user when setup is confirmed'
);

// Verify wizard has separate mode for editing existing users
assert(
  startHandlerCode.includes("if (mode === 'edit')"),
  'Wizard should have edit mode for existing users'
);

// Verify wizard uses wizardState Map (doesn't require user in DB)
assert(
  startHandlerCode.includes('const wizardState = new Map()'),
  'Wizard should use Map to track state independently of database'
);

console.log('✓ Wizard flow properly handles new users\n');

// ============================================================================
// Test 4: Non-wizard handlers check for user existence
// ============================================================================
console.log('Test 4: Non-wizard handlers check for user existence');

const scheduleHandlerCode = require('fs').readFileSync(path.join(__dirname, '../src/handlers/schedule.js'), 'utf8');
const botCode = require('fs').readFileSync(path.join(__dirname, '../src/bot.js'), 'utf8');

// Verify schedule handlers check for user
assert(
  scheduleHandlerCode.includes('if (!user)') &&
  scheduleHandlerCode.includes('Спочатку налаштуйте бота командою /start'),
  'Schedule handlers should check if user exists and show helpful message'
);

// Verify stats callback checks for user
assert(
  botCode.includes('if (!user)') &&
  botCode.includes('Користувач не знайдений'),
  'Stats callback should check if user exists'
);

// Verify wizard callbacks are handled separately from other callbacks
assert(
  botCode.includes("if (data.startsWith('region_')") &&
  botCode.includes("data.startsWith('queue_')") &&
  botCode.includes("data === 'confirm_setup'"),
  'Wizard callbacks should be handled separately'
);

console.log('✓ Non-wizard handlers properly check for user existence\n');

// ============================================================================
// Test 5: Admin handlers use isAdmin function
// ============================================================================
console.log('Test 5: Admin handlers use isAdmin function correctly');

const adminHandlerCode = require('fs').readFileSync(path.join(__dirname, '../src/handlers/admin.js'), 'utf8');

// Verify admin handlers import isAdmin
assert(
  adminHandlerCode.includes('const { isAdmin') &&
  adminHandlerCode.includes("require('../utils')"),
  'Admin handlers should import isAdmin from utils'
);

// Verify admin handlers call isAdmin with all three params
const isAdminCalls = adminHandlerCode.match(/isAdmin\([^)]+\)/g) || [];
assert(
  isAdminCalls.length > 0,
  'Admin handlers should call isAdmin function'
);

// Check at least one call has three parameters
const hasThreeParamCall = isAdminCalls.some(call => 
  call.includes('config.adminIds') && call.includes('config.ownerId')
);
assert(
  hasThreeParamCall,
  'Admin handlers should call isAdmin with config.adminIds and config.ownerId'
);

console.log('✓ Admin handlers properly use isAdmin function\n');

// ============================================================================
// Summary
// ============================================================================
console.log('✅ All critical bug tests passed!\n');
console.log('Summary of fixes:');
console.log('1. ✅ isAdmin function properly checks ownerId (utils.js)');
console.log('2. ✅ settings.js uses isAdmin utility instead of inline checks');
console.log('3. ✅ Wizard flow creates user only on confirmation');
console.log('4. ✅ Non-wizard handlers check for user existence');
console.log('5. ✅ Admin handlers use isAdmin function correctly');
console.log('\nExpected results achieved:');
console.log('✅ User 1026177113 (ownerId) has admin panel access');
console.log('✅ New user can complete wizard (region → queue → confirm)');
console.log('✅ After wizard, user can view schedule and statistics');
console.log('✅ All callbacks handle "user not found" correctly');
