/**
 * Test script for Growth Metrics System
 */

const {
  getCurrentStage,
  setGrowthStage,
  getGrowthMetrics,
  getStageSpecificMetrics,
  isRegistrationEnabled,
  setRegistrationEnabled,
  checkUserLimit,
  shouldWarnUserLimit,
  logUserRegistration,
  logWizardCompletion,
  logChannelConnection,
  logIpMonitoringSetup,
  getRecentGrowthEvents,
  checkGrowthHealth,
  GROWTH_STAGES
} = require('../src/growthMetrics');

console.log('🧪 Testing Growth Metrics System\n');

// Test 1: Check default stage
console.log('Test 1: Default Growth Stage');
const currentStage = getCurrentStage();
console.log(`✅ Current stage: ${currentStage.name} (ID: ${currentStage.id})`);
console.log(`   Max users: ${currentStage.maxUsers}`);
console.log('');

// Test 2: Check user limits
console.log('Test 2: User Limits');
const limit = checkUserLimit();
console.log(`✅ User limit check:`);
console.log(`   Current: ${limit.current}/${limit.max}`);
console.log(`   Remaining: ${limit.remaining}`);
console.log(`   Percentage: ${limit.percentage}%`);
console.log(`   Reached: ${limit.reached}`);
console.log('');

// Test 3: Check registration status
console.log('Test 3: Registration Status');
const regEnabled = isRegistrationEnabled();
console.log(`✅ Registration enabled: ${regEnabled}`);
console.log('');

// Test 4: Get growth metrics
console.log('Test 4: Growth Metrics');
const metrics = getGrowthMetrics();
console.log(`✅ Growth metrics:`);
console.log(`   Stage: ${metrics.stage.name}`);
console.log(`   Total users: ${metrics.users.total}`);
console.log(`   Active users: ${metrics.users.active}`);
console.log(`   With channels: ${metrics.users.withChannels}`);
console.log(`   Wizard completion: ${metrics.rates.wizardCompletion}%`);
console.log(`   Channel adoption: ${metrics.rates.channelAdoption}%`);
console.log('');

// Test 5: Stage-specific metrics
console.log('Test 5: Stage-Specific Metrics');
const stageMetrics = getStageSpecificMetrics();
console.log(`✅ Stage metrics for: ${stageMetrics.stageName}`);
if (stageMetrics.focus) {
  console.log('   Focus areas:');
  stageMetrics.focus.forEach(metric => {
    const unit = metric.unit ? ` ${metric.unit}` : '';
    const comment = metric.comment ? ` (${metric.comment})` : '';
    console.log(`   - ${metric.name}: ${metric.value}${unit}${comment}`);
  });
}
console.log('');

// Test 6: Growth health check
console.log('Test 6: Growth Health Check');
const health = checkGrowthHealth();
console.log(`✅ Health status:`);
console.log(`   Healthy: ${health.healthy}`);
console.log(`   Should stop: ${health.shouldStop}`);
if (health.reasons.length > 0) {
  console.log('   Reasons:');
  health.reasons.forEach(reason => {
    console.log(`   - ${reason}`);
  });
}
console.log('');

// Test 7: Test logging (simulation only)
console.log('Test 7: Event Logging (simulated)');
console.log('✅ Logging test events...');
try {
  logUserRegistration('test_user_1', { region: 'kyiv', queue: 'GPV1.1', username: 'testuser' });
  logWizardCompletion('test_user_1');
  logChannelConnection('test_user_1', 'test_channel_1');
  logIpMonitoringSetup('test_user_1');
  console.log('   ✅ Events logged successfully');
} catch (error) {
  console.log(`   ⚠️ Error logging events: ${error.message}`);
}
console.log('');

// Test 8: Get recent events
console.log('Test 8: Recent Growth Events');
const events = getRecentGrowthEvents(5);
console.log(`✅ Found ${events.length} recent events`);
if (events.length > 0) {
  events.forEach((event, index) => {
    console.log(`   ${index + 1}. ${event.eventType} at ${event.timestamp}`);
  });
}
console.log('');

// Test 9: Test stage transitions
console.log('Test 9: Stage Transition Test');
console.log('   Testing stage change (Stage 0 → Stage 1)...');
const success = setGrowthStage(1);
if (success) {
  const newStage = getCurrentStage();
  console.log(`   ✅ Stage changed to: ${newStage.name}`);

  // Change back to Stage 0
  setGrowthStage(0);
  const revertedStage = getCurrentStage();
  console.log(`   ✅ Reverted back to: ${revertedStage.name}`);
} else {
  console.log('   ❌ Stage change failed');
}
console.log('');

// Test 10: Registration toggle
console.log('Test 10: Registration Toggle Test');
const initialRegState = isRegistrationEnabled();
console.log(`   Initial state: ${initialRegState}`);
setRegistrationEnabled(!initialRegState);
const toggledState = isRegistrationEnabled();
console.log(`   After toggle: ${toggledState}`);
// Revert back
setRegistrationEnabled(initialRegState);
const finalState = isRegistrationEnabled();
console.log(`   ✅ Reverted to: ${finalState}`);
console.log('');

// Test 11: Display all stages
console.log('Test 11: All Growth Stages');
Object.values(GROWTH_STAGES).forEach(stage => {
  const maxUsers = stage.maxUsers === Infinity ? '∞' : stage.maxUsers;
  console.log(`   Stage ${stage.id}: ${stage.name} (max: ${maxUsers} users)`);
});
console.log('');

console.log('✅ All tests completed!\n');
console.log('📊 Summary:');
console.log(`   Current Stage: ${getCurrentStage().name}`);
console.log(`   Registration: ${isRegistrationEnabled() ? 'Enabled' : 'Disabled'}`);
console.log(`   Users: ${limit.current}/${limit.max}`);
console.log(`   System Health: ${health.healthy ? 'Healthy' : 'Issues detected'}`);
console.log('');
console.log('💡 Next steps:');
console.log('   1. Access admin panel with /admin');
console.log('   2. Navigate to "📈 Ріст" to see the growth dashboard');
console.log('   3. Monitor metrics regularly');
console.log('   4. Read ADMIN_GROWTH_GUIDE.md for detailed instructions');
