#!/usr/bin/env node

const path = require('path');
/**
 * Test for critical database save bug fixes from problem statement:
 * 1. ScheduleService.js imports non-existent functions
 * 2. publisher.js does NOT await async database functions
 * 3. user_power_states.telegram_id has type INTEGER but users.telegram_id is TEXT
 * 4. test-state-persistence.js still uses SQLite (deprecated)
 * 5. powerMonitor.js saves user.id (internal DB id) into telegram_id column
 */

const assert = require('assert');
const fs = require('fs');

console.log('🧪 Testing Critical Database Bug Fixes (5 bugs)...\n');

// ============================================================================
// Test 1: Verify ScheduleService.js imports correct functions
// ============================================================================
console.log('Test 1: ScheduleService.js imports correct functions from scheduleHistory.js');

const scheduleServiceCode = fs.readFileSync(path.join(__dirname, '../src/services/ScheduleService.js'), 'utf8');
const scheduleHistoryCode = fs.readFileSync(path.join(__dirname, '../src/database/scheduleHistory.js'), 'utf8');

// Check that scheduleHistory.js exports the correct functions
assert(
  scheduleHistoryCode.includes('module.exports = {') &&
  scheduleHistoryCode.includes('addScheduleToHistory'),
  'scheduleHistory.js should export addScheduleToHistory'
);
assert(
  scheduleHistoryCode.includes('getLastSchedule'),
  'scheduleHistory.js should export getLastSchedule'
);
assert(
  scheduleHistoryCode.includes('getPreviousSchedule'),
  'scheduleHistory.js should export getPreviousSchedule'
);

// Check that ScheduleService.js imports the correct functions
assert(
  scheduleServiceCode.includes('getLastSchedule') &&
  scheduleServiceCode.includes('addScheduleToHistory'),
  'ScheduleService.js should import getLastSchedule and addScheduleToHistory'
);

// Check that old incorrect imports are removed
assert(
  !scheduleServiceCode.includes('getScheduleHistory') ||
  scheduleServiceCode.includes('async getScheduleHistory('), // Allow as method name
  'ScheduleService.js should not import getScheduleHistory (non-existent)'
);
assert(
  !scheduleServiceCode.includes('addScheduleHistory'),
  'ScheduleService.js should not import addScheduleHistory (non-existent)'
);

// Check that getScheduleHistory method calls getLastSchedule
const getScheduleHistoryMatch = scheduleServiceCode.match(/async getScheduleHistory\(userId.*?\)[\s\S]*?{[\s\S]*?return[\s\S]*?}/);
assert(getScheduleHistoryMatch, 'getScheduleHistory method should exist');
assert(
  getScheduleHistoryMatch[0].includes('getLastSchedule(userId)'),
  'getScheduleHistory method should call getLastSchedule(userId)'
);

// Check that recordScheduleChange uses correct parameter order
const recordScheduleChangeMatch = scheduleServiceCode.match(/async recordScheduleChange\(userId, region, queue, hash, data\)[\s\S]*?{[\s\S]*?addScheduleToHistory[\s\S]*?}/);
assert(recordScheduleChangeMatch, 'recordScheduleChange method should exist');
assert(
  recordScheduleChangeMatch[0].includes('addScheduleToHistory(userId, region, queue, data, hash)'),
  'recordScheduleChange should call addScheduleToHistory with correct parameter order: (userId, region, queue, data, hash)'
);

console.log('✓ ScheduleService.js correctly imports and uses scheduleHistory functions\n');

// ============================================================================
// Test 2: Verify publisher.js awaits async database functions
// ============================================================================
console.log('Test 2: publisher.js correctly awaits all async database functions');

const publisherCode = fs.readFileSync(path.join(__dirname, '../src/publisher.js'), 'utf8');

// Check that updateSnapshotHashes is awaited
const updateSnapshotMatch = publisherCode.match(/await updateSnapshotHashes\s*\(/);
assert(
  updateSnapshotMatch,
  'publisher.js should await updateSnapshotHashes()'
);

// Check that addScheduleToHistory is awaited
const addScheduleMatch = publisherCode.match(/await addScheduleToHistory\s*\(/);
assert(
  addScheduleMatch,
  'publisher.js should await addScheduleToHistory()'
);

// Check that getPreviousSchedule is awaited
const getPreviousMatch = publisherCode.match(/const previousSchedule = await getPreviousSchedule\s*\(/);
assert(
  getPreviousMatch,
  'publisher.js should await getPreviousSchedule() when assigning to previousSchedule'
);

// Check that there are no non-awaited calls to these functions (excluding imports)
// Note: We allow the import statements but check there are no function calls without await
const lines = publisherCode.split('\n');
let hasNonAwaitedCalls = false;
for (const line of lines) {
  // Skip import lines
  if (line.includes('const {') || line.includes('require(')) continue;

  // Check for non-awaited calls (call without 'await' before it)
  if (line.includes('updateSnapshotHashes(') && !line.includes('await updateSnapshotHashes(')) {
    hasNonAwaitedCalls = true;
    console.error('Found non-awaited updateSnapshotHashes:', line);
  }
  if (line.includes('addScheduleToHistory(') && !line.includes('await addScheduleToHistory(')) {
    hasNonAwaitedCalls = true;
    console.error('Found non-awaited addScheduleToHistory:', line);
  }
  if (line.includes('getPreviousSchedule(') && !line.includes('await getPreviousSchedule(')) {
    hasNonAwaitedCalls = true;
    console.error('Found non-awaited getPreviousSchedule:', line);
  }
}

assert(
  !hasNonAwaitedCalls,
  'All async database function calls should be awaited'
);

console.log('✓ publisher.js correctly awaits all async database functions\n');

// ============================================================================
// Test 3: Verify user_power_states.telegram_id is TEXT not INTEGER
// ============================================================================
console.log('Test 3: user_power_states.telegram_id has correct TEXT type');

const dbCode = fs.readFileSync(path.join(__dirname, '../src/database/db.js'), 'utf8');

// Check that users.telegram_id is TEXT
assert(
  dbCode.includes('CREATE TABLE IF NOT EXISTS users') &&
  dbCode.match(/telegram_id\s+TEXT\s+UNIQUE\s+NOT\s+NULL/),
  'users.telegram_id should be TEXT UNIQUE NOT NULL'
);

// Check that user_power_states.telegram_id is also TEXT (not INTEGER)
const powerStatesMatch = dbCode.match(/CREATE TABLE IF NOT EXISTS user_power_states[\s\S]*?telegram_id\s+(\w+)\s+PRIMARY KEY/);
assert(powerStatesMatch, 'user_power_states table should exist');
assert(
  powerStatesMatch[1] === 'TEXT',
  'user_power_states.telegram_id should be TEXT, not INTEGER'
);

// Ensure it's not INTEGER
assert(
  !dbCode.match(/CREATE TABLE IF NOT EXISTS user_power_states[\s\S]*?telegram_id\s+INTEGER\s+PRIMARY KEY/),
  'user_power_states.telegram_id should NOT be INTEGER'
);

console.log('✓ user_power_states.telegram_id correctly uses TEXT type\n');

// ============================================================================
// Test 4: Verify test-state-persistence.js is deleted
// ============================================================================
console.log('Test 4: test-state-persistence.js (SQLite) file is deleted');

const testFilePath = path.join(__dirname, 'test-state-persistence.js');
const testFileExists = fs.existsSync(testFilePath);

assert(
  !testFileExists,
  'test-state-persistence.js should be deleted (deprecated SQLite test)'
);

console.log('✓ test-state-persistence.js correctly deleted\n');

// ============================================================================
// Test 5: Verify powerMonitor.js uses user.telegram_id for Map keys
// ============================================================================
console.log('Test 5: powerMonitor.js uses user.telegram_id (not user.id) for Map keys');

const powerMonitorCode = fs.readFileSync(path.join(__dirname, '../src/powerMonitor.js'), 'utf8');

// Check that getUserState is called with user.telegram_id in checkUserPower
const checkUserPowerMatch = powerMonitorCode.match(/async function checkUserPower\(user\)[\s\S]*?const userState = getUserState\((.*?)\)/);
assert(checkUserPowerMatch, 'checkUserPower should call getUserState');
assert(
  checkUserPowerMatch[1].trim() === 'user.telegram_id',
  'checkUserPower should call getUserState(user.telegram_id), not getUserState(user.id)'
);

// Check that saveUserStateToDb correctly inserts into telegram_id column
const saveUserStateToDB = powerMonitorCode.match(/async function saveUserStateToDb\(userId, state\)[\s\S]*?INSERT INTO user_power_states[\s\S]*?\(/);
assert(saveUserStateToDB, 'saveUserStateToDb function should exist');

// Check that the INSERT statement uses telegram_id column
assert(
  powerMonitorCode.includes('INSERT INTO user_power_states') &&
  powerMonitorCode.match(/INSERT INTO user_power_states[\s\S]*?telegram_id/),
  'saveUserStateToDb should insert into telegram_id column'
);

// Check that restoreUserStates reads from telegram_id
const restoreMatch = powerMonitorCode.match(/async function restoreUserStates[\s\S]*?userStates\.set\(row\.telegram_id/);
assert(
  restoreMatch,
  'restoreUserStates should use row.telegram_id as Map key'
);

// Verify that addOutageRecord still uses user.id (database foreign key)
const addOutageMatch = powerMonitorCode.match(/await addOutageRecord\(user\.id/);
assert(
  addOutageMatch,
  'addOutageRecord should still use user.id (database foreign key ID)'
);

console.log('✓ powerMonitor.js correctly uses telegram_id for Map keys\n');

// ============================================================================
// Summary
// ============================================================================
console.log('✅ All 5 critical database bug tests passed!\n');
console.log('Summary of fixes:');
console.log('1. ✅ ScheduleService.js imports correct functions (getLastSchedule, addScheduleToHistory)');
console.log('2. ✅ publisher.js awaits all async database functions');
console.log('3. ✅ user_power_states.telegram_id is TEXT (matches users.telegram_id)');
console.log('4. ✅ test-state-persistence.js (deprecated SQLite test) deleted');
console.log('5. ✅ powerMonitor.js uses user.telegram_id for Map keys');
console.log('\nExpected results:');
console.log('✅ No TypeError crashes from undefined imports');
console.log('✅ Schedule history and snapshots save correctly');
console.log('✅ Schedule comparison works (no longer returns Promise object)');
console.log('✅ Database type consistency prevents JOIN issues');
console.log('✅ Power states correctly keyed by telegram_id');
