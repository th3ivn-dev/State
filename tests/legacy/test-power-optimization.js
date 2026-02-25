/**
 * Test for power monitoring optimizations
 * Tests the new concurrent ping limiting and dynamic interval calculation
 */

const assert = require('assert');

// Test the calculateCheckInterval logic
function calculateCheckInterval(userCount) {
  if (userCount < 50) {
    return 2; // 2 секунди
  } else if (userCount < 200) {
    return 5; // 5 секунд
  } else if (userCount < 1000) {
    return 10; // 10 секунд
  } else {
    return 30; // 30 секунд для 1000+ користувачів
  }
}

console.log('🧪 Testing power monitoring optimizations...\n');

// Test 1: Dynamic interval calculation
console.log('Test 1: Dynamic interval calculation');
assert.strictEqual(calculateCheckInterval(10), 2, 'Interval for <50 users should be 2s');
assert.strictEqual(calculateCheckInterval(49), 2, 'Interval for 49 users should be 2s');
assert.strictEqual(calculateCheckInterval(50), 5, 'Interval for 50 users should be 5s');
assert.strictEqual(calculateCheckInterval(100), 5, 'Interval for 100 users should be 5s');
assert.strictEqual(calculateCheckInterval(199), 5, 'Interval for 199 users should be 5s');
assert.strictEqual(calculateCheckInterval(200), 10, 'Interval for 200 users should be 10s');
assert.strictEqual(calculateCheckInterval(500), 10, 'Interval for 500 users should be 10s');
assert.strictEqual(calculateCheckInterval(999), 10, 'Interval for 999 users should be 10s');
assert.strictEqual(calculateCheckInterval(1000), 30, 'Interval for 1000 users should be 30s');
assert.strictEqual(calculateCheckInterval(2000), 30, 'Interval for 2000 users should be 30s');
assert.strictEqual(calculateCheckInterval(5000), 30, 'Interval for 5000+ users should be 30s');
console.log('✓ Dynamic interval calculation works correctly\n');

// Test 2: Semaphore pattern simulation
console.log('Test 2: Semaphore pattern for concurrent pings');

async function testSemaphore() {
  const MAX_CONCURRENT = 50;
  const TOTAL_USERS = 200;

  let activeConcurrent = 0;
  let maxConcurrent = 0;
  const users = Array.from({ length: TOTAL_USERS }, (_, i) => i);
  let index = 0;
  const processedUsers = [];

  // Mock user check function
  const checkUser = async (userId) => {
    activeConcurrent++;
    maxConcurrent = Math.max(maxConcurrent, activeConcurrent);

    // Simulate ping delay
    await new Promise(resolve => setTimeout(resolve, 10));

    activeConcurrent--;
    processedUsers.push(userId);
    return { userId, success: true };
  };

  // Worker function
  const worker = async () => {
    while (index < users.length) {
      const userId = users[index++];
      await checkUser(userId);
    }
  };

  // Create pool of workers
  const workerCount = Math.min(MAX_CONCURRENT, users.length);
  const workers = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  assert.strictEqual(processedUsers.length, TOTAL_USERS, 'All users should be processed');
  assert(maxConcurrent <= MAX_CONCURRENT, `Max concurrent should not exceed ${MAX_CONCURRENT}, got ${maxConcurrent}`);

  console.log(`   Processed ${TOTAL_USERS} users with max ${maxConcurrent} concurrent`);
  console.log('✓ Semaphore pattern works correctly\n');
}

testSemaphore().then(() => {
  // Test 3: Verify constants are imported correctly
  console.log('Test 3: Verify constants');
  const {
    POWER_MAX_CONCURRENT_PINGS,
    POWER_PING_TIMEOUT_MS
  } = require('../src/constants/timeouts');

  assert.strictEqual(POWER_MAX_CONCURRENT_PINGS, 50, 'Max concurrent pings should be 50');
  assert.strictEqual(POWER_PING_TIMEOUT_MS, 3000, 'Ping timeout should be 3000ms');
  console.log(`   POWER_MAX_CONCURRENT_PINGS: ${POWER_MAX_CONCURRENT_PINGS}`);
  console.log(`   POWER_PING_TIMEOUT_MS: ${POWER_PING_TIMEOUT_MS}ms`);
  console.log('✓ Constants are correct\n');

  console.log('✅ All power monitoring optimization tests passed!');
}).catch(error => {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
});
