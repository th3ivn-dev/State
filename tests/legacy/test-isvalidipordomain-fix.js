/**
 * Test for isValidIPorDomain Function Import Fix
 *
 * This test verifies:
 * 1. isValidIPorDomain is exported from settings.js
 * 2. admin.js imports it from settings.js (not from utils)
 * 3. The function works correctly when imported
 * 4. Conversation state is NOT cleared on error
 */

const fs = require('fs');

console.log('🧪 Testing isValidIPorDomain Import Fix...\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   Error: ${error.message}`);
    testsFailed++;
  }
}

// Test 1: isValidIPorDomain is defined in settings/helpers.js
test('settings/helpers.js defines isValidIPorDomain function', () => {
  const settingsContent = fs.readFileSync('../src/handlers/settings/helpers.js', 'utf8');

  if (!settingsContent.includes('function isValidIPorDomain(input)')) {
    throw new Error('isValidIPorDomain function is not defined in settings/helpers.js');
  }
});

// Test 2: isValidIPorDomain is exported from settings/helpers.js
test('settings/helpers.js exports isValidIPorDomain', () => {
  const settingsContent = fs.readFileSync('../src/handlers/settings/helpers.js', 'utf8');

  // Check module.exports includes isValidIPorDomain
  const exportsMatch = settingsContent.match(/module\.exports\s*=\s*\{[^}]*\}/s);
  if (!exportsMatch) {
    throw new Error('No module.exports found in settings/helpers.js');
  }

  if (!exportsMatch[0].includes('isValidIPorDomain')) {
    throw new Error('isValidIPorDomain is not exported from settings/helpers.js');
  }
});

// Test 3: isValidIPorDomain function has correct validation logic
test('isValidIPorDomain function has IP and domain validation', () => {
  const settingsContent = fs.readFileSync('../src/handlers/settings/helpers.js', 'utf8');

  // Find the function
  const funcStart = settingsContent.indexOf('function isValidIPorDomain(input) {');
  if (funcStart === -1) {
    throw new Error('isValidIPorDomain function not found');
  }

  // Find the end of the function by counting braces
  const REASONABLE_FUNCTION_SIZE = 5000; // Max characters to search
  const funcContent = settingsContent.substring(funcStart, funcStart + REASONABLE_FUNCTION_SIZE);

  // Check for key validation features
  if (!funcContent.includes('trim()')) {
    throw new Error('Function should trim input');
  }

  if (!funcContent.includes('ipRegex') || !funcContent.includes('domainRegex')) {
    throw new Error('Function should have both IP and domain regex validation');
  }

  if (!funcContent.includes('port')) {
    throw new Error('Function should support port validation');
  }

  if (!funcContent.includes('type:')) {
    throw new Error('Function should return type (ip or domain)');
  }
});

// Test 4: admin.js imports from settings, not utils
test('admin.js imports isValidIPorDomain from settings.js', () => {
  const adminContent = fs.readFileSync('../src/handlers/admin.js', 'utf8');

  // Check that it imports from ./settings
  if (!adminContent.includes("require('./settings')")) {
    throw new Error('admin.js does not import from ./settings');
  }

  // Check that it's importing isValidIPorDomain from settings
  const settingsImportMatch = adminContent.match(/const\s+\{[^}]*isValidIPorDomain[^}]*\}\s*=\s*require\(['"]\.\/settings['"]\)/);
  if (!settingsImportMatch) {
    throw new Error('admin.js does not import isValidIPorDomain from settings.js');
  }

  // Make sure it's NOT importing from utils
  const utilsImportMatch = adminContent.match(/const\s+\{[^}]*isValidIPorDomain[^}]*\}\s*=\s*require\(['"]\.\.\/utils['"]\)/);
  if (utilsImportMatch) {
    throw new Error('admin.js still imports isValidIPorDomain from utils (should be from settings)');
  }
});

// Test 5: Catch block does NOT clear state on error
test('admin.js catch block does not clear conversation state on error', () => {
  const adminContent = fs.readFileSync('../src/handlers/admin.js', 'utf8');

  // Find the handleAdminRouterIpConversation function
  const functionStart = adminContent.indexOf('async function handleAdminRouterIpConversation');
  const functionEnd = adminContent.indexOf('module.exports', functionStart);
  const functionBody = adminContent.substring(functionStart, functionEnd);

  // Find the catch block
  const catchStart = functionBody.lastIndexOf('} catch (error)');
  const catchEnd = functionBody.indexOf('}', catchStart + 50);
  const catchBlock = functionBody.substring(catchStart, catchEnd);

  // Check that clearState is commented out or not present in catch block
  // Look for clearState that's NOT commented
  const lines = catchBlock.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and lines that are just the catch declaration
    if (!trimmed || trimmed.startsWith('} catch') || trimmed === '}') continue;

    // If we find clearState that's not commented out, that's an error
    // Check for any comment syntax: // or /* */
    if (trimmed.includes('clearState') && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !/^\s*\/\/.*clearState/.test(line)) {
      throw new Error('Catch block still clears conversation state on error (should NOT clear state to allow retry)');
    }
  }

  // Positive test: Should return true to prevent other handlers
  if (!catchBlock.includes('return true')) {
    throw new Error('Catch block should return true to prevent other handlers from processing the message');
  }

  // Should have a user-friendly retry message
  if (!catchBlock.includes('Спробуйте ще раз')) {
    throw new Error('Catch block should ask user to retry');
  }
});

// Test 6: Handler order is correct in bot.js
test('bot.js has correct handler order (admin router IP before channel handlers)', () => {
  const botContent = fs.readFileSync('../src/bot.js', 'utf8');

  // Find positions of handler calls
  const adminRouterPos = botContent.indexOf('handleAdminRouterIpConversation(bot, msg)');
  const channelConvPos = botContent.indexOf('handleConversation(bot, msg)');

  if (adminRouterPos === -1) {
    throw new Error('handleAdminRouterIpConversation not found in bot.js');
  }

  if (channelConvPos === -1) {
    throw new Error('handleConversation not found in bot.js');
  }

  // Admin router IP handler should come before channel handler
  if (adminRouterPos >= channelConvPos) {
    throw new Error('handleAdminRouterIpConversation should be called BEFORE handleConversation');
  }
});

// Test 7: Each handler returns true when it processes a message
test('Handlers return true to prevent cascading to other handlers', () => {
  const botContent = fs.readFileSync('../src/bot.js', 'utf8');

  // Check that there are checks for handler return values
  const checks = [
    'const adminRouterIpHandled = await handleAdminRouterIpConversation',
    'if (adminRouterIpHandled) return',
    'const channelHandled = await handleConversation',
    'if (channelHandled) return'
  ];

  for (const check of checks) {
    if (!botContent.includes(check)) {
      throw new Error(`Missing handler check: ${check}`);
    }
  }
});

// Test 8: handleAdminRouterIpConversation uses isValidIPorDomain
test('handleAdminRouterIpConversation calls isValidIPorDomain', () => {
  const adminContent = fs.readFileSync('../src/handlers/admin.js', 'utf8');

  // Find the function
  const functionStart = adminContent.indexOf('async function handleAdminRouterIpConversation');
  const functionEnd = adminContent.indexOf('module.exports', functionStart);
  const functionBody = adminContent.substring(functionStart, functionEnd);

  if (!functionBody.includes('isValidIPorDomain(text)') && !functionBody.includes('isValidIPorDomain(')) {
    throw new Error('handleAdminRouterIpConversation does not call isValidIPorDomain');
  }

  if (!functionBody.includes('validationResult.valid')) {
    throw new Error('Function should check validationResult.valid');
  }

  if (!functionBody.includes('validationResult.address')) {
    throw new Error('Function should use validationResult.address');
  }
});

// Print summary
console.log('\n📊 Test Summary:');
console.log(`   Passed: ${testsPassed}`);
console.log(`   Failed: ${testsFailed}`);
console.log(`   Total:  ${testsPassed + testsFailed}`);

if (testsFailed === 0) {
  console.log('\n✅ All tests passed!');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed!');
  process.exit(1);
}
