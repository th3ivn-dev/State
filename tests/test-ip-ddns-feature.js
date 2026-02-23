const path = require('path');
/**
 * Comprehensive Test Suite for IP Instruction + DDNS Support
 * Tests all acceptance criteria from the problem statement
 */

const assert = require('assert');

// Test colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`${GREEN}✓${RESET} ${description}`);
    testsPassed++;
  } catch (error) {
    console.log(`${RED}✗${RESET} ${description}`);
    console.log(`  ${RED}Error: ${error.message}${RESET}`);
    testsFailed++;
  }
}

console.log('\n=== IP Instruction + DDNS Support Test Suite ===\n');

// ============================================================================
// Task 1: IP Instruction Button and Text
// ============================================================================
console.log('Task 1: IP Instruction\n');

const { getIpMonitoringKeyboard } = require('../src/keyboards/inline');

test('IP monitoring menu should have instruction button', () => {
  const keyboard = getIpMonitoringKeyboard();
  const buttons = keyboard.reply_markup.inline_keyboard.flat();
  const instructionButton = buttons.find(btn => btn.text === 'ℹ️ Інструкція');
  assert(instructionButton, 'Instruction button not found');
  assert.strictEqual(instructionButton.callback_data, 'ip_instruction');
});

// Simulate the instruction handler
test('Instruction handler should exist for ip_instruction callback', () => {
  const fs = require('fs');
  const settingsContent = fs.readFileSync(path.join(__dirname, '../src/handlers/settings/ip.js'), 'utf8');
  assert(settingsContent.includes("data === 'ip_instruction'"),
    'ip_instruction handler not found in settings/ip.js');
});

test('Instruction text should contain all required sections', () => {
  const fs = require('fs');
  const settingsContent = fs.readFileSync(path.join(__dirname, '../src/handlers/settings/ip.js'), 'utf8');

  // Check for key sections
  const requiredSections = [
    'Налаштування моніторингу через IP',
    'Важливі умови',
    'Принцип роботи',
    'Варіанти налаштування',
    'Використання статичної IP-адреси',
    'Доменне імʼя DDNS',
    'Інструкції з налаштування DDNS',
    'ASUS',
    'TP-Link',
    'NETGEAR',
    'D-Link',
    'MikroTik',
    'Xiaomi',
    'Що потрібно ввести'
  ];

  for (const section of requiredSections) {
    assert(settingsContent.includes(section),
      `Missing section: ${section}`);
  }
});

test('Instruction should include example formats', () => {
  const fs = require('fs');
  const settingsContent = fs.readFileSync(path.join(__dirname, '../src/handlers/settings/ip.js'), 'utf8');

  // Note: Examples use intentionally invalid IPs (89.267.32.1 with octet 267 > 255)
  // to prevent users from accidentally using example addresses
  assert(settingsContent.includes('89.267.32.1'), 'Missing IPv4 example');
  assert(settingsContent.includes('89.267.32.1:80'), 'Missing IPv4+port example');
  assert(settingsContent.includes('myhome.ddns.net'), 'Missing DDNS example');
});

test('Instruction should include useful service links', () => {
  const fs = require('fs');
  const settingsContent = fs.readFileSync(path.join(__dirname, '../src/handlers/settings/ip.js'), 'utf8');

  assert(settingsContent.includes('https://2ip.ua/ua'), 'Missing 2ip.ua link');
  assert(settingsContent.includes('https://www.asus.com/ua-ua/support/FAQ/1011725/'),
    'Missing ASUS link');
});

// ============================================================================
// Task 2: IP/Domain Validation Function
// ============================================================================
console.log('\nTask 2: IP/Domain Validation\n');

// Import validation function
const fs = require('fs');
const settingsCode = fs.readFileSync('./src/handlers/settings/ip.js', 'utf8') + '\n' +
  fs.readFileSync('./src/handlers/settings/helpers.js', 'utf8');

// Extract and evaluate the validation function
const functionMatch = settingsCode.match(/function isValidIPorDomain\(input\) \{[\s\S]*?\n\}/);
assert(functionMatch, 'isValidIPorDomain function not found');
const isValidIPorDomain = eval(`(${functionMatch[0]})`);

// Test IPv4 validation
test('Should accept valid IPv4 address', () => {
  const result = isValidIPorDomain('192.168.1.1');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.type, 'ip');
  assert.strictEqual(result.address, '192.168.1.1');
  assert.strictEqual(result.host, '192.168.1.1');
  assert.strictEqual(result.port, null);
});

test('Should accept IPv4 with port', () => {
  const result = isValidIPorDomain('192.168.1.1:8080');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.type, 'ip');
  assert.strictEqual(result.address, '192.168.1.1:8080');
  assert.strictEqual(result.host, '192.168.1.1');
  assert.strictEqual(result.port, 8080);
});

test('Should reject invalid IPv4 octet (> 255)', () => {
  const result = isValidIPorDomain('256.168.1.1');
  assert.strictEqual(result.valid, false);
  assert(result.error.includes('0 до 255'));
});

test('Should reject invalid port (> 65535)', () => {
  const result = isValidIPorDomain('192.168.1.1:99999');
  assert.strictEqual(result.valid, false);
  assert(result.error.includes('65535'));
});

test('Should reject invalid port (< 1)', () => {
  const result = isValidIPorDomain('192.168.1.1:0');
  assert.strictEqual(result.valid, false);
  assert(result.error.includes('1 до 65535'));
});

// Test DDNS domain validation
test('Should accept valid DDNS domain', () => {
  const result = isValidIPorDomain('myhome.ddns.net');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.type, 'domain');
  assert.strictEqual(result.address, 'myhome.ddns.net');
  assert.strictEqual(result.host, 'myhome.ddns.net');
  assert.strictEqual(result.port, null);
});

test('Should accept DDNS domain with port', () => {
  const result = isValidIPorDomain('myhome.ddns.net:8080');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.type, 'domain');
  assert.strictEqual(result.address, 'myhome.ddns.net:8080');
  assert.strictEqual(result.host, 'myhome.ddns.net');
  assert.strictEqual(result.port, 8080);
});

test('Should accept domain with subdomain', () => {
  const result = isValidIPorDomain('router.home.example.com');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.type, 'domain');
});

test('Should accept domain with hyphens', () => {
  const result = isValidIPorDomain('my-router.ddns-service.net');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.type, 'domain');
});

// Test error cases
test('Should reject address with spaces', () => {
  const result = isValidIPorDomain('192.168.1.1 :80');
  assert.strictEqual(result.valid, false);
  assert(result.error.includes('пробіли'));
});

test('Should reject invalid format', () => {
  const result = isValidIPorDomain('invalid_address');
  assert.strictEqual(result.valid, false);
  assert(result.error.includes('Невірний формат'));
});

test('Should trim whitespace from input', () => {
  const result = isValidIPorDomain('  192.168.1.1  ');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.address, '192.168.1.1');
});

// ============================================================================
// Task 3: checkRouterAvailability with DDNS Support
// ============================================================================
console.log('\nTask 3: Router Availability Check\n');

const powerMonitorContent = fs.readFileSync(path.join(__dirname, '../src/powerMonitor.js'), 'utf8');

test('checkRouterAvailability should extract host from address', () => {
  assert(powerMonitorContent.includes('let host = addressToCheck'),
    'Host extraction not found');
});

test('checkRouterAvailability should extract port from address', () => {
  assert(powerMonitorContent.includes('const portMatch = addressToCheck.match'),
    'Port extraction not found');
  assert(powerMonitorContent.includes('(\\d+)$'),
    'Port regex pattern not found');
});

test('checkRouterAvailability should use extracted host and port in fetch', () => {
  assert(powerMonitorContent.includes('`http://${host}:${port}`'),
    'Fetch with host:port not found');
});

test('checkRouterAvailability should default to port 80', () => {
  assert(powerMonitorContent.includes('ROUTER_PORT || 80'),
    'Default port 80 not found');
});

// ============================================================================
// Task 4: Timeout Returns to Main Menu
// ============================================================================
console.log('\nTask 4: Timeout Handling\n');

test('IP setup should have final timeout handler', () => {
  assert(settingsCode.includes('finalTimeout = setTimeout'),
    'Final timeout not found');
  assert(settingsCode.includes('300000'),
    '5 minute (300000ms) timeout not found');
});

test('Timeout handler should send main menu', () => {
  const finalTimeoutSection = settingsCode.substring(
    settingsCode.indexOf('finalTimeout = setTimeout'),
    settingsCode.indexOf('finalTimeout = setTimeout') + 1000
  );

  assert(finalTimeoutSection.includes('sendMainMenu') ||
         finalTimeoutSection.includes('getMainMenu'),
  'Main menu not sent on timeout');
});

test('Timeout handler should show timeout message', () => {
  assert(settingsCode.includes('Час вийшов'),
    'Timeout message not found');
  assert(settingsCode.includes('Режим налаштування IP завершено'),
    'IP setup completion message not found');
});

test('Timeout handler should clear IP setup state', () => {
  const finalTimeoutSection = settingsCode.substring(
    settingsCode.indexOf('finalTimeout = setTimeout'),
    settingsCode.indexOf('finalTimeout = setTimeout') + 500
  );

  assert(finalTimeoutSection.includes('clearIpSetupState'),
    'clearIpSetupState not called on timeout');
});

// ============================================================================
// Task 5: Instruction Button in IP Menu
// ============================================================================
console.log('\nTask 5: Instruction Button Position\n');

test('Instruction button should be first in IP monitoring menu', () => {
  const keyboard = getIpMonitoringKeyboard();
  const firstButton = keyboard.reply_markup.inline_keyboard[0][0];
  assert.strictEqual(firstButton.text, 'ℹ️ Інструкція');
  assert.strictEqual(firstButton.callback_data, 'ip_instruction');
});

test('IP monitoring menu should have all required buttons', () => {
  const keyboard = getIpMonitoringKeyboard();
  const allButtons = keyboard.reply_markup.inline_keyboard.flat();
  const buttonTexts = allButtons.map(btn => btn.text);

  assert(buttonTexts.includes('ℹ️ Інструкція'), 'Missing instruction button');
  assert(buttonTexts.includes('✚ Налаштувати IP'), 'Missing setup button');
  assert(buttonTexts.includes('📋 Показати поточний'), 'Missing show button');
  assert(buttonTexts.includes('🗑️ Видалити IP'), 'Missing delete button');
  assert(buttonTexts.includes('← Назад'), 'Missing back button');
});

// ============================================================================
// Integration Tests
// ============================================================================
console.log('\nIntegration Tests\n');

test('All keyboard exports should be available', () => {
  const {
    getMainMenu,
    getIpMonitoringKeyboard,
    getIpCancelKeyboard
  } = require('../src/keyboards/inline');

  assert(typeof getMainMenu === 'function', 'getMainMenu not exported');
  assert(typeof getIpMonitoringKeyboard === 'function',
    'getIpMonitoringKeyboard not exported');
  assert(typeof getIpCancelKeyboard === 'function',
    'getIpCancelKeyboard not exported');
});

test('Settings module should export required functions', () => {
  // Check that module can be loaded
  assert(fs.existsSync('./src/handlers/settings/index.js'),
    'settings/index.js not found');

  // Check for key function exports
  assert(settingsCode.includes('module.exports'),
    'No exports found in settings files');
});

// ============================================================================
// Edge Cases
// ============================================================================
console.log('\nEdge Cases\n');

test('Should handle IPv4 with standard port 80', () => {
  const result = isValidIPorDomain('192.168.1.1:80');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.port, 80);
});

test('Should handle IPv4 with port 443', () => {
  const result = isValidIPorDomain('192.168.1.1:443');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.port, 443);
});

test('Should handle domain with port 8080', () => {
  const result = isValidIPorDomain('router.local.net:8080');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.port, 8080);
});

test('Should accept partial IP as domain (edge case)', () => {
  // Note: 192.168.1 could be a valid domain name, so it's accepted as domain type
  const result = isValidIPorDomain('192.168.1');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.type, 'domain'); // Treated as domain, not IP
});

test('Should reject single word (not a domain)', () => {
  const result = isValidIPorDomain('router');
  assert.strictEqual(result.valid, false);
});

test('Should accept long TLD domains', () => {
  const result = isValidIPorDomain('router.example.co.uk');
  assert.strictEqual(result.valid, true);
});

// ============================================================================
// Summary
// ============================================================================
console.log('\n' + '='.repeat(60));
console.log('Test Summary:');
console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
if (testsFailed > 0) {
  console.log(`${RED}Failed: ${testsFailed}${RESET}`);
  console.log('='.repeat(60));
  process.exit(1);
} else {
  console.log(`${RED}Failed: ${testsFailed}${RESET}`);
  console.log('='.repeat(60));
  console.log(`${GREEN}✓ All tests passed!${RESET}\n`);
  process.exit(0);
}
