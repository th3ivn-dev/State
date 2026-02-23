const path = require('path');
/**
 * Test for Admin Reply Navigation Fix
 * Verifies that the confirmation message after admin reply includes navigation buttons
 */

const fs = require('fs');

function testAdminReplyNavigation() {
  console.log('🧪 Testing admin reply navigation fix...\n');

  // Read the admin.js file
  const adminJsPath = path.join(__dirname, 'src', 'handlers', 'admin.js');
  const content = fs.readFileSync(adminJsPath, 'utf8');

  // Find the handleAdminReply function
  const handleAdminReplyMatch = content.match(/async function handleAdminReply\(bot, msg\) \{[\s\S]*?\n\}/);

  if (!handleAdminReplyMatch) {
    console.error('❌ FAIL: handleAdminReply function not found');
    return false;
  }

  const functionContent = handleAdminReplyMatch[0];

  // Check for the confirmation message with navigation
  const hasConfirmationMessage = functionContent.includes('✅ Відповідь надіслано користувачу.');
  const hasReplyMarkup = functionContent.includes('reply_markup');
  const hasInlineKeyboard = functionContent.includes('inline_keyboard');
  const hasAdminTicketsButton = functionContent.includes("'📩 Звернення'") &&
                                functionContent.includes("callback_data: 'admin_tickets'");
  const hasAdminMenuButton = functionContent.includes("'← Назад'") &&
                            functionContent.includes("callback_data: 'admin_menu'");
  const hasBackToMainButton = functionContent.includes("'⤴ Меню'") &&
                             functionContent.includes("callback_data: 'back_to_main'");

  // Check that unicode arrows are used (not emoji)
  const usesUnicodeBackArrow = functionContent.includes('← Назад');
  const usesUnicodeMenuArrow = functionContent.includes('⤴ Меню');

  console.log('✅ Confirmation message found:', hasConfirmationMessage);
  console.log('✅ Has reply_markup:', hasReplyMarkup);
  console.log('✅ Has inline_keyboard:', hasInlineKeyboard);
  console.log('✅ Has "📩 Звернення" button (admin_tickets):', hasAdminTicketsButton);
  console.log('✅ Has "← Назад" button (admin_menu):', hasAdminMenuButton);
  console.log('✅ Has "⤴ Меню" button (back_to_main):', hasBackToMainButton);
  console.log('✅ Uses unicode arrow for Back (←):', usesUnicodeBackArrow);
  console.log('✅ Uses unicode arrow for Menu (⤴):', usesUnicodeMenuArrow);

  const allChecksPassed = hasConfirmationMessage &&
                         hasReplyMarkup &&
                         hasInlineKeyboard &&
                         hasAdminTicketsButton &&
                         hasAdminMenuButton &&
                         hasBackToMainButton &&
                         usesUnicodeBackArrow &&
                         usesUnicodeMenuArrow;

  if (allChecksPassed) {
    console.log('\n✅ ALL TESTS PASSED: Navigation buttons correctly added to admin reply confirmation');
    return true;
  } else {
    console.log('\n❌ TESTS FAILED: Some navigation elements are missing');
    return false;
  }
}

// Run the test
const passed = testAdminReplyNavigation();
process.exit(passed ? 0 : 1);
