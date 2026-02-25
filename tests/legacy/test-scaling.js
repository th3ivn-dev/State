#!/usr/bin/env node

/**
 * Test scaling improvements
 */

const assert = require('assert');

console.log('🧪 Testing scaling improvements...\n');

// Test 1: Constants
console.log('Test 1: Constants module');
const timeouts = require('../src/constants/timeouts');
assert(timeouts.TELEGRAM_RATE_LIMIT_PER_SEC === 25, 'Rate limit should be 25/sec');
assert(timeouts.POWER_MAX_CONCURRENT_PINGS === 50, 'Max concurrent pings should be 50');
assert(timeouts.SCHEDULER_MAX_PARALLEL_REGIONS === 5, 'Max parallel regions should be 5');
console.log('✅ Constants loaded correctly\n');

// Test 2: Logger
console.log('Test 2: Logger module');
const { createLogger } = require('../src/utils/logger');
const logger = createLogger('Test');
assert(typeof logger.info === 'function', 'Logger should have info method');
assert(typeof logger.error === 'function', 'Logger should have error method');
assert(typeof logger.success === 'function', 'Logger should have success method');
assert(typeof logger.time === 'function', 'Logger should have time method');
console.log('✅ Logger works correctly\n');

// Test 3: Message Queue
console.log('Test 3: Message Queue module');
const messageQueue = require('../src/utils/messageQueue');
assert(typeof messageQueue.init === 'function', 'MessageQueue should have init method');
assert(typeof messageQueue.sendMessage === 'function', 'MessageQueue should have sendMessage method');
assert(typeof messageQueue.drain === 'function', 'MessageQueue should have drain method');
assert(typeof messageQueue.getMetrics === 'function', 'MessageQueue should have getMetrics method');
const metrics = messageQueue.getMetrics();
assert(typeof metrics.sent === 'number', 'Metrics should have sent count');
assert(typeof metrics.queueSize === 'number', 'Metrics should have queue size');
console.log('✅ Message Queue module works correctly\n');

// Test 4: Health Check
console.log('Test 4: Health Check module');
const { startHealthCheck, stopHealthCheck } = require('../src/healthcheck');
assert(typeof startHealthCheck === 'function', 'Should have startHealthCheck function');
assert(typeof stopHealthCheck === 'function', 'Should have stopHealthCheck function');
console.log('✅ Health Check module works correctly\n');

// Test 5: Database functions (skip if DATABASE_URL not set)
console.log('Test 5: Database new functions');
if (process.env.DATABASE_URL) {
  const users = require('../src/database/users');
  assert(typeof users.getActiveUsersByRegionQueue === 'function', 'Should have getActiveUsersByRegionQueue');
  assert(typeof users.batchUpdateHashes === 'function', 'Should have batchUpdateHashes');
  assert(typeof users.getUserCount === 'function', 'Should have getUserCount');
  console.log('✅ New database functions exist\n');
} else {
  console.log('⏭️  Skipped (DATABASE_URL not set)\n');
}

// Test 6: Config
console.log('Test 6: Config scaling parameters');
const config = require('../src/config');
assert(typeof config.DB_POOL_MAX === 'number', 'DB_POOL_MAX should be a number');
assert(typeof config.DB_POOL_MIN === 'number', 'DB_POOL_MIN should be a number');
assert(typeof config.TELEGRAM_RATE_LIMIT === 'number', 'TELEGRAM_RATE_LIMIT should be a number');
assert(typeof config.SCHEDULER_BATCH_SIZE === 'number', 'SCHEDULER_BATCH_SIZE should be a number');
assert(config.DB_POOL_MAX >= 50, 'DB_POOL_MAX should be at least 50');
console.log('✅ Config has all scaling parameters\n');

// Test 7: Formatter defensive coding
console.log('Test 7: Formatter defensive coding');
const { formatTemplate } = require('../src/formatter');
assert(formatTemplate(null) === '', 'formatTemplate should handle null');
assert(formatTemplate('test') === 'test', 'formatTemplate should handle string without variables');
assert(formatTemplate('Hello {name}', { name: 'World' }) === 'Hello World', 'formatTemplate should replace variables');
assert(formatTemplate('Hello {name}', null) === 'Hello {name}', 'formatTemplate should handle null variables');
console.log('✅ Formatter handles edge cases\n');

// Test 8: Parser defensive coding
console.log('Test 8: Parser defensive coding');
const { parseScheduleForQueue } = require('../src/parser');
const result1 = parseScheduleForQueue(null, '1.1');
assert(result1.hasData === false, 'parseScheduleForQueue should handle null data');
const result2 = parseScheduleForQueue({}, '1.1');
assert(result2.hasData === false, 'parseScheduleForQueue should handle empty data');
console.log('✅ Parser handles edge cases\n');

console.log('✨ All scaling improvement tests passed!\n');
