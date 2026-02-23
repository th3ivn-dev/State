/**
 * Integration Test: State Manager Fix
 * 
 * Verifies that the admin handler properly uses the centralized state manager
 * instead of direct database calls.
 */

const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════════════════');
console.log('  Integration Test: State Manager Fix');
console.log('═══════════════════════════════════════════════════\n');

// Read the admin.js file
const adminJsPath = path.join(__dirname, '../src/handlers/admin.js');
const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');

// Test 1: Check that admin_router_set_ip uses setState
console.log('🧪 Test 1: admin_router_set_ip callback uses centralized state manager');

// setState should now be imported at the top level (not inline in function)
const hasStateManagerImport = adminJsContent.match(/^const \{[^}]*setState[^}]*\} = require\('\.\.\/state\/stateManager'\)/m) !== null;
const usesSetState = adminJsContent.match(/admin_router_set_ip[\s\S]*?await setState\('conversation'/);

if (!hasStateManagerImport) {
  console.error('  ❌ FAIL: setState not imported from stateManager in admin_router_set_ip block');
  process.exit(1);
}

if (!usesSetState) {
  console.error('  ❌ FAIL: admin_router_set_ip does not use setState');
  process.exit(1);
}

console.log('  ✅ admin_router_set_ip correctly uses setState from stateManager');

// Test 2: Check that handleAdminRouterIpConversation uses getState and clearState
console.log('\n🧪 Test 2: handleAdminRouterIpConversation uses centralized state manager');

// getState and clearState should be imported at the top level (not inline in function)
const usesGetState = adminJsContent.match(/^const \{[^}]*getState[^}]*clearState[^}]*\} = require\('\.\.\/state\/stateManager'\)|^const \{[^}]*clearState[^}]*getState[^}]*\} = require\('\.\.\/state\/stateManager'\)/m) !== null;
const callsGetState = adminJsContent.match(/handleAdminRouterIpConversation[\s\S]*?const state = getState\('conversation', telegramId\)/);
const callsClearState = adminJsContent.match(/handleAdminRouterIpConversation[\s\S]*?await clearState\('conversation', telegramId\)/);

if (!usesGetState) {
  console.error('  ❌ FAIL: handleAdminRouterIpConversation does not import getState/clearState');
  process.exit(1);
}

if (!callsGetState) {
  console.error('  ❌ FAIL: handleAdminRouterIpConversation does not use getState');
  process.exit(1);
}

if (!callsClearState) {
  console.error('  ❌ FAIL: handleAdminRouterIpConversation does not use clearState');
  process.exit(1);
}

console.log('  ✅ handleAdminRouterIpConversation correctly uses getState and clearState');

// Test 3: Verify no direct database calls remain in admin router IP handling
console.log('\n🧪 Test 3: No direct database state calls in admin router IP handling');

// Extract admin router IP section
const adminRouterIpSection = adminJsContent.match(/admin_router_set_ip[\s\S]*?return;[\s\S]*?handleAdminRouterIpConversation[\s\S]*?return true;\s*}\s*}/);

if (!adminRouterIpSection) {
  console.error('  ❌ FAIL: Could not find admin router IP section');
  process.exit(1);
}

const sectionText = adminRouterIpSection[0];
const hasDirectSaveUserState = sectionText.includes('saveUserState(');
const hasDirectGetUserState = sectionText.includes('getUserState(');
const hasDirectDeleteUserState = sectionText.includes('deleteUserState(');

if (hasDirectSaveUserState) {
  console.error('  ❌ FAIL: Direct saveUserState call found in admin router IP section');
  process.exit(1);
}

if (hasDirectGetUserState) {
  console.error('  ❌ FAIL: Direct getUserState call found in admin router IP section');
  process.exit(1);
}

if (hasDirectDeleteUserState) {
  console.error('  ❌ FAIL: Direct deleteUserState call found in admin router IP section');
  process.exit(1);
}

console.log('  ✅ No direct database state calls in admin router IP handling');

// Test 4: Check channel.js for reset button callbacks
console.log('\n🧪 Test 4: Reset button callbacks implemented in channel.js');

const channelJsPath = path.join(__dirname, '../src/handlers/channel.js');
const channelJsContent = fs.readFileSync(channelJsPath, 'utf8');

const hasResetCaption = channelJsContent.includes("data === 'format_reset_caption'");
const hasResetPeriods = channelJsContent.includes("data === 'format_reset_periods'");
const hasResetPowerOff = channelJsContent.includes("data === 'format_reset_power_off'");
const hasResetPowerOn = channelJsContent.includes("data === 'format_reset_power_on'");

if (!hasResetCaption) {
  console.error('  ❌ FAIL: format_reset_caption callback not found');
  process.exit(1);
}

if (!hasResetPeriods) {
  console.error('  ❌ FAIL: format_reset_periods callback not found');
  process.exit(1);
}

if (!hasResetPowerOff) {
  console.error('  ❌ FAIL: format_reset_power_off callback not found');
  process.exit(1);
}

if (!hasResetPowerOn) {
  console.error('  ❌ FAIL: format_reset_power_on callback not found');
  process.exit(1);
}

console.log('  ✅ All 4 reset button callbacks implemented');

// Test 5: Check that reset callbacks set values to null
console.log('\n🧪 Test 5: Reset callbacks set values to NULL');

const resetCaptionNull = channelJsContent.match(/format_reset_caption[\s\S]*?scheduleCaption: null/);
const resetPeriodsNull = channelJsContent.match(/format_reset_periods[\s\S]*?periodFormat: null/);
const resetPowerOffNull = channelJsContent.match(/format_reset_power_off[\s\S]*?powerOffText: null/);
const resetPowerOnNull = channelJsContent.match(/format_reset_power_on[\s\S]*?powerOnText: null/);

if (!resetCaptionNull) {
  console.error('  ❌ FAIL: format_reset_caption does not set scheduleCaption to null');
  process.exit(1);
}

if (!resetPeriodsNull) {
  console.error('  ❌ FAIL: format_reset_periods does not set periodFormat to null');
  process.exit(1);
}

if (!resetPowerOffNull) {
  console.error('  ❌ FAIL: format_reset_power_off does not set powerOffText to null');
  process.exit(1);
}

if (!resetPowerOnNull) {
  console.error('  ❌ FAIL: format_reset_power_on does not set powerOnText to null');
  process.exit(1);
}

console.log('  ✅ All reset callbacks correctly set values to NULL');

// Test 6: Check keyboards have reset buttons
console.log('\n🧪 Test 6: Keyboards and handlers have reset buttons');

const keyboardsPath = path.join(__dirname, '../src/keyboards/inline.js');
const keyboardsContent = fs.readFileSync(keyboardsPath, 'utf8');

// Check for power reset buttons in keyboards/inline.js
const hasResetPowerOffButton = keyboardsContent.includes("'format_reset_power_off'");
const hasResetPowerOnButton = keyboardsContent.includes("'format_reset_power_on'");

if (!hasResetPowerOffButton) {
  console.error('  ❌ FAIL: Reset power off button not in keyboard');
  process.exit(1);
}

if (!hasResetPowerOnButton) {
  console.error('  ❌ FAIL: Reset power on button not in keyboard');
  process.exit(1);
}

// Check for schedule reset buttons in channel.js (inline keyboard)
const hasResetCaptionButton = channelJsContent.includes("callback_data: 'format_reset_caption'");
const hasResetPeriodsButton = channelJsContent.includes("callback_data: 'format_reset_periods'");

if (!hasResetCaptionButton) {
  console.error('  ❌ FAIL: Reset caption button not in inline keyboard');
  process.exit(1);
}

if (!hasResetPeriodsButton) {
  console.error('  ❌ FAIL: Reset periods button not in inline keyboard');
  process.exit(1);
}

console.log('  ✅ All reset buttons present in keyboards');

console.log('\n✅ All integration tests passed!');
console.log('═══════════════════════════════════════════════════\n');
process.exit(0);
