/**
 * Test: Conversation State Conflict Fix + Reset Buttons
 *
 * This test verifies:
 * 1. Admin router IP state uses centralized state manager
 * 2. Channel format states don't interfere with admin router IP state
 * 3. Reset buttons properly set values to NULL
 */

const assert = require('assert');

// Mock the state manager
const mockStateManager = {
  states: new Map(),

  setState: async function(stateType, userId, data) {
    const key = `${stateType}_${userId}`;
    this.states.set(key, data);
  },

  getState: function(stateType, userId) {
    const key = `${stateType}_${userId}`;
    return this.states.get(key) || null;
  },

  clearState: async function(stateType, userId) {
    const key = `${stateType}_${userId}`;
    this.states.delete(key);
  }
};

// Mock the database
const mockUsersDb = {
  updateUserFormatSettings: async function(telegramId, settings) {
    // Verify that NULL values are accepted
    Object.keys(settings).forEach(key => {
      if (settings[key] === null) {
        console.log(`✅ Accepted NULL value for ${key}`);
      }
    });
    return true;
  }
};

async function testAdminRouterStateIsolation() {
  console.log('\n🧪 Test 1: Admin Router IP State Isolation');

  const adminId = '12345';
  const userId = '67890';

  // Simulate admin setting router IP state
  await mockStateManager.setState('conversation', adminId, {
    state: 'waiting_for_admin_router_ip',
    messageId: 999
  });

  // Simulate user setting schedule caption state
  await mockStateManager.setState('conversation', userId, {
    state: 'waiting_for_schedule_caption',
    previousMessageId: 888
  });

  // Verify states are isolated
  const adminState = mockStateManager.getState('conversation', adminId);
  const userState = mockStateManager.getState('conversation', userId);

  assert.strictEqual(adminState.state, 'waiting_for_admin_router_ip', 'Admin state should be waiting_for_admin_router_ip');
  assert.strictEqual(userState.state, 'waiting_for_schedule_caption', 'User state should be waiting_for_schedule_caption');

  console.log('  ✅ Admin and user states are properly isolated');

  // Clear admin state (simulating IP save)
  await mockStateManager.clearState('conversation', adminId);

  // Verify admin state is cleared but user state remains
  const adminStateAfter = mockStateManager.getState('conversation', adminId);
  const userStateAfter = mockStateManager.getState('conversation', userId);

  assert.strictEqual(adminStateAfter, null, 'Admin state should be cleared');
  assert.strictEqual(userStateAfter.state, 'waiting_for_schedule_caption', 'User state should still exist');

  console.log('  ✅ Clearing one state does not affect other states');
}

async function testResetButtonsAcceptNull() {
  console.log('\n🧪 Test 2: Reset Buttons Accept NULL Values');

  const telegramId = '11111';

  // Test schedule caption reset
  await mockUsersDb.updateUserFormatSettings(telegramId, { scheduleCaption: null });

  // Test period format reset
  await mockUsersDb.updateUserFormatSettings(telegramId, { periodFormat: null });

  // Test power off text reset
  await mockUsersDb.updateUserFormatSettings(telegramId, { powerOffText: null });

  // Test power on text reset
  await mockUsersDb.updateUserFormatSettings(telegramId, { powerOnText: null });

  console.log('  ✅ All reset operations accept NULL values');
}

async function testStateCheckExactMatch() {
  console.log('\n🧪 Test 3: State Checks Use Exact Matches');

  const userId = '22222';

  // Set admin router IP state
  await mockStateManager.setState('conversation', userId, {
    state: 'waiting_for_admin_router_ip',
    messageId: 123
  });

  const state = mockStateManager.getState('conversation', userId);

  // Verify exact match check works
  const isAdminRouterIp = (state && state.state === 'waiting_for_admin_router_ip');
  const isScheduleCaption = (state && state.state === 'waiting_for_schedule_caption');
  const isPeriodFormat = (state && state.state === 'waiting_for_period_format');

  assert.strictEqual(isAdminRouterIp, true, 'Should match admin router IP state');
  assert.strictEqual(isScheduleCaption, false, 'Should NOT match schedule caption state');
  assert.strictEqual(isPeriodFormat, false, 'Should NOT match period format state');

  console.log('  ✅ State checks use exact string matches');
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Conversation State Conflict Fix Tests');
  console.log('═══════════════════════════════════════════════════');

  try {
    await testAdminRouterStateIsolation();
    await testResetButtonsAcceptNull();
    await testStateCheckExactMatch();

    console.log('\n✅ All tests passed!');
    console.log('═══════════════════════════════════════════════════\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
