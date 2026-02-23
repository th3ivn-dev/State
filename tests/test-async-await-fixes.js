#!/usr/bin/env node
const path = require('path');

/**
 * Test for async/await bug fixes from issue:
 * 1. channelGuard.js - cleanOldSchedules() without await
 * 2. publisher.js - getSnapshotHashes() without await
 * 3. analytics.js - getIpMonitoringCount() without await
 * 4. scheduler.js - sentMsg can be null
 * 5. channelGuard.js - duplicate const { pool }
 * 6. powerMonitor.js - unused db import
 */

const assert = require('assert');
const fs = require('fs');

console.log('🧪 Testing Async/Await Bug Fixes...\n');

// ============================================================================
// Test 1: channelGuard.js awaits cleanOldSchedules()
// ============================================================================
console.log('Test 1: channelGuard.js awaits cleanOldSchedules()');

const channelGuardCode = fs.readFileSync(path.join(__dirname, '../src/channelGuard.js'), 'utf8');

// Check that cleanOldSchedules is awaited
const cleanOldSchedulesMatch = channelGuardCode.match(/console\.log\('🧹 Очищення старої історії графіків\.\.\.'\);[\s\S]*?cleanOldSchedules\(\)/);
assert(cleanOldSchedulesMatch, 'cleanOldSchedules() call should exist');

assert(
  cleanOldSchedulesMatch[0].includes('await cleanOldSchedules()'),
  'cleanOldSchedules() should be awaited'
);

// Ensure no non-awaited calls exist (except in require/import statements)
const lines = channelGuardCode.split('\n');
let hasNonAwaitedCalls = false;
for (const line of lines) {
  // Skip import lines
  if (line.includes('require(') || line.includes('const {')) continue;

  // Check for non-awaited calls
  if (line.includes('cleanOldSchedules()') && !line.includes('await cleanOldSchedules()')) {
    hasNonAwaitedCalls = true;
    console.error('Found non-awaited cleanOldSchedules:', line);
  }
}

assert(
  !hasNonAwaitedCalls,
  'cleanOldSchedules() should not be called without await'
);

console.log('✓ cleanOldSchedules() is correctly awaited\n');

// ============================================================================
// Test 2: publisher.js awaits getSnapshotHashes()
// ============================================================================
console.log('Test 2: publisher.js awaits getSnapshotHashes()');

const publisherCode = fs.readFileSync(path.join(__dirname, '../src/publisher.js'), 'utf8');

// Check that getSnapshotHashes is awaited
const getSnapshotMatch = publisherCode.match(/const userSnapshots = (await )?getSnapshotHashes\(/);
assert(getSnapshotMatch, 'getSnapshotHashes() call should exist');

assert(
  getSnapshotMatch[1] === 'await ',
  'getSnapshotHashes() should be awaited'
);

console.log('✓ getSnapshotHashes() is correctly awaited\n');

// ============================================================================
// Test 3: analytics.js awaits getIpMonitoringCount()
// ============================================================================
console.log('Test 3: analytics.js awaits getIpMonitoringCount() and stores in variable');

const analyticsCode = fs.readFileSync(path.join(__dirname, '../src/analytics.js'), 'utf8');

// Check that getIpMonitoringCount is awaited and stored in variable
const getAnalyticsMatch = analyticsCode.match(/async function getAnalytics\(\)[\s\S]*?{[\s\S]*?const ipCount = await getIpMonitoringCount\(\);/);
assert(
  getAnalyticsMatch,
  'getAnalytics() should define: const ipCount = await getIpMonitoringCount();'
);

// Check that ipCount is used instead of direct function calls
const analyticsFunction = analyticsCode.match(/async function getAnalytics\(\)[\s\S]*?return {[\s\S]*?};[\s]*}/);
assert(analyticsFunction, 'getAnalytics() function should exist');

assert(
  analyticsFunction[0].includes('configured: ipCount'),
  'ipMonitoring.configured should use ipCount variable'
);

assert(
  analyticsFunction[0].includes('percentage: stats.total > 0 ? Math.round((ipCount / stats.total) * 100)'),
  'ipMonitoring.percentage should use ipCount variable'
);

// Ensure there are no direct calls to getIpMonitoringCount() in return statement
assert(
  !analyticsFunction[0].match(/configured:.*getIpMonitoringCount\(\)/),
  'configured should not call getIpMonitoringCount() directly'
);

assert(
  !analyticsFunction[0].match(/percentage:.*getIpMonitoringCount\(\)/),
  'percentage should not call getIpMonitoringCount() directly'
);

console.log('✓ getIpMonitoringCount() is correctly awaited and stored in variable\n');

// ============================================================================
// Test 4: scheduler.js has null check for sentMsg
// ============================================================================
console.log('Test 4: scheduler.js has null check before accessing sentMsg.message_id');

const schedulerCode = fs.readFileSync(path.join(__dirname, '../src/scheduler.js'), 'utf8');

// Check that there's a null check before accessing sentMsg.message_id
const schedulerMatch = schedulerCode.match(/const sentMsg = await publishScheduleWithPhoto[\s\S]*?if \(sentMsg && sentMsg\.message_id\)[\s\S]*?{[\s\S]*?await usersDb\.updateUserPostId\(user\.id, sentMsg\.message_id\)/);
assert(
  schedulerMatch,
  'scheduler.js should have null check: if (sentMsg && sentMsg.message_id) before updateUserPostId'
);

console.log('✓ sentMsg null check is correctly implemented\n');

// ============================================================================
// Test 5: channelGuard.js has no duplicate const { pool }
// ============================================================================
console.log('Test 5: channelGuard.js has no duplicate const { pool } in checkExistingUsers()');

// Check the checkExistingUsers function
const checkExistingUsersMatch = channelGuardCode.match(/async function checkExistingUsers\(botInstance\)[\s\S]*?^}/m);
assert(checkExistingUsersMatch, 'checkExistingUsers function should exist');

const checkExistingUsersFunction = checkExistingUsersMatch[0];

// Count occurrences of "const { pool } = require"
const poolDeclarations = (checkExistingUsersFunction.match(/const \{ pool \} = require\('\.\/database\/db'\)/g) || []).length;

assert(
  poolDeclarations <= 1,
  `checkExistingUsers should have at most 1 pool declaration, found ${poolDeclarations}`
);

// Check that pool is declared at the top level of the file (not in function)
const topLevelPoolMatch = channelGuardCode.match(/^const \{ pool \} = require\('\.\/database\/db'\);/m);
const poolInFunction = checkExistingUsersFunction.match(/const \{ pool \} = require\('\.\/database\/db'\);/);

if (topLevelPoolMatch) {
  assert(
    poolDeclarations === 0,
    'If pool is declared at top level, checkExistingUsers should not redeclare it'
  );
  console.log('✓ pool is declared at top level, no redeclaration in checkExistingUsers');
} else {
  assert(
    poolDeclarations === 1,
    'If pool is not at top level, checkExistingUsers should declare it exactly once'
  );
  console.log('✓ pool is declared once in checkExistingUsers');
}

console.log('');

// ============================================================================
// Test 6: powerMonitor.js has no unused db import
// ============================================================================
console.log('Test 6: powerMonitor.js has no unused db import');

const powerMonitorCode = fs.readFileSync(path.join(__dirname, '../src/powerMonitor.js'), 'utf8');

// Check that there's no "const db = require('./database/db');"
assert(
  !powerMonitorCode.match(/^const db = require\('\.\/database\/db'\);/m),
  'powerMonitor.js should not have: const db = require(\'./database/db\');'
);

// Check that pool is still imported
assert(
  powerMonitorCode.includes("const { pool } = require('./database/db');"),
  'powerMonitor.js should have: const { pool } = require(\'./database/db\');'
);

console.log('✓ Unused db import is removed, pool import remains\n');

// ============================================================================
// Summary
// ============================================================================
console.log('✅ All 6 async/await bug tests passed!\n');

console.log('Summary of fixes:');
console.log('1. ✅ channelGuard.js awaits cleanOldSchedules()');
console.log('2. ✅ publisher.js awaits getSnapshotHashes()');
console.log('3. ✅ analytics.js awaits getIpMonitoringCount() and stores in variable');
console.log('4. ✅ scheduler.js has null check for sentMsg before accessing message_id');
console.log('5. ✅ channelGuard.js has no duplicate const { pool } declaration');
console.log('6. ✅ powerMonitor.js has no unused db import\n');

console.log('Expected results:');
console.log('✅ No runtime TypeError from missing await');
console.log('✅ No duplicate variable declaration errors');
console.log('✅ Database operations complete before use');
console.log('✅ Proper null safety prevents crashes');
console.log('✅ Clean imports without unused variables');
