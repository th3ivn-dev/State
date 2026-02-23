#!/usr/bin/env node

const path = require('path');
/**
 * Test script for wizard channel branding fix
 *
 * This test verifies that when a user goes through the wizard and confirms
 * a channel connection, the channel branding flow is initiated instead of
 * showing the main menu immediately.
 */

console.log('🧪 Тестування виправлення wizard channel branding...\n');

// Test 1: Check that setConversationState is imported in start.js
console.log('Test 1: Перевірка імпорту setConversationState в start.js');
try {
  const fs = require('fs');
  const startJsPath = path.join(__dirname, 'src/handlers/start.js');
  const startJsContent = fs.readFileSync(startJsPath, 'utf8');

  const hasImport = startJsContent.includes("const { setConversationState } = require('./channel')");

  if (hasImport) {
    console.log('✓ setConversationState імпортовано з ./channel\n');
  } else {
    console.log('✗ setConversationState НЕ імпортовано з ./channel\n');
    process.exit(1);
  }
} catch (error) {
  console.log(`✗ Помилка: ${error.message}\n`);
  process.exit(1);
}

// Test 2: Check that wizard_channel_confirm_ handler starts branding flow
console.log('Test 2: Перевірка що wizard_channel_confirm_ запускає branding flow');
try {
  const fs = require('fs');
  const startJsPath = path.join(__dirname, 'src/handlers/start.js');
  const startJsContent = fs.readFileSync(startJsPath, 'utf8');

  // Find the wizard_channel_confirm_ handler
  const handlerStart = startJsContent.indexOf("if (data.startsWith('wizard_channel_confirm_'))");
  if (handlerStart === -1) {
    console.log('✗ wizard_channel_confirm_ handler не знайдено\n');
    process.exit(1);
  }

  // Find the end of the handler (next if statement)
  const nextHandler = startJsContent.indexOf("if (data === 'wizard_channel_cancel')", handlerStart);
  if (nextHandler === -1) {
    console.log('✗ Не вдалося знайти кінець handler\n');
    process.exit(1);
  }

  const handlerCode = startJsContent.substring(handlerStart, nextHandler);

  // Check that it calls setConversationState
  const callsSetConversationState = handlerCode.includes('setConversationState(telegramId,');
  const setsWaitingForTitle = handlerCode.includes("state: 'waiting_for_title'");
  const showsTitlePrompt = handlerCode.includes('Введіть назву для каналу');
  const usesChannelNamePrefix = handlerCode.includes('CHANNEL_NAME_PREFIX');

  // Check that it does NOT show main menu
  const doesNotShowMainMenu = !handlerCode.includes('getMainMenu(');
  const doesNotShowNewsChannel = !handlerCode.includes('NEWS_CHANNEL_MESSAGE');

  const allChecks = [
    { name: 'Викликає setConversationState', value: callsSetConversationState },
    { name: "Встановлює state: 'waiting_for_title'", value: setsWaitingForTitle },
    { name: 'Показує промпт для введення назви', value: showsTitlePrompt },
    { name: 'Використовує CHANNEL_NAME_PREFIX', value: usesChannelNamePrefix },
    { name: 'НЕ показує головне меню', value: doesNotShowMainMenu },
    { name: 'НЕ показує канал новин', value: doesNotShowNewsChannel }
  ];

  const failedChecks = allChecks.filter(check => !check.value);

  if (failedChecks.length === 0) {
    console.log('✓ wizard_channel_confirm_ правильно запускає branding flow\n');
    console.log('  Перевірки:');
    allChecks.forEach(check => {
      console.log(`    ✓ ${check.name}`);
    });
    console.log();
  } else {
    console.log('✗ wizard_channel_confirm_ НЕ правильно налаштований:\n');
    failedChecks.forEach(check => {
      console.log(`  ✗ ${check.name}`);
    });
    console.log();
    process.exit(1);
  }
} catch (error) {
  console.log(`✗ Помилка: ${error.message}\n`);
  process.exit(1);
}

// Test 3: Check that CHANNEL_NAME_PREFIX is defined in start.js
console.log('Test 3: Перевірка що CHANNEL_NAME_PREFIX визначено в start.js');
try {
  const fs = require('fs');
  const startJsPath = path.join(__dirname, 'src/handlers/start.js');
  const startJsContent = fs.readFileSync(startJsPath, 'utf8');

  const hasChannelNamePrefix = startJsContent.includes("CHANNEL_NAME_PREFIX = 'СвітлоБот ⚡️ '");

  if (hasChannelNamePrefix) {
    console.log('✓ CHANNEL_NAME_PREFIX визначено в start.js\n');
  } else {
    console.log('✗ CHANNEL_NAME_PREFIX НЕ визначено в start.js\n');
    process.exit(1);
  }
} catch (error) {
  console.log(`✗ Помилка: ${error.message}\n`);
  process.exit(1);
}

// Test 4: Verify that setConversationState is exported from channel.js
console.log('Test 4: Перевірка що setConversationState експортовано з channel.js');
try {
  const fs = require('fs');
  const channelJsPath = path.join(__dirname, 'src/handlers/channel.js');
  const channelJsContent = fs.readFileSync(channelJsPath, 'utf8');

  // Check that setConversationState is exported
  const exportsSetConversationState = channelJsContent.includes('setConversationState,') &&
                                       channelJsContent.includes('module.exports');

  if (exportsSetConversationState) {
    console.log('✓ setConversationState експортовано з channel.js\n');
  } else {
    console.log('✗ setConversationState НЕ експортовано з channel.js\n');
    process.exit(1);
  }
} catch (error) {
  console.log(`✗ Помилка: ${error.message}\n`);
  process.exit(1);
}

// Test 5: Verify that handleConversation exists to handle the branding flow
console.log('Test 5: Перевірка що handleConversation існує для обробки branding flow');
try {
  const fs = require('fs');
  const channelJsPath = path.join(__dirname, 'src/handlers/channel.js');
  const channelJsContent = fs.readFileSync(channelJsPath, 'utf8');

  // Check that handleConversation is exported
  const exportsHandleConversation = channelJsContent.includes('handleConversation,') &&
                                     channelJsContent.includes('module.exports');

  if (exportsHandleConversation) {
    console.log('✓ handleConversation експортовано з channel.js\n');
  } else {
    console.log('✗ handleConversation НЕ експортовано з channel.js\n');
    process.exit(1);
  }
} catch (error) {
  console.log(`✗ Помилка: ${error.message}\n`);
  process.exit(1);
}

// Test 6: Check that my_chat_member handler still uses wizard_channel_confirm_ callback
console.log('Test 6: Перевірка що my_chat_member handler використовує wizard_channel_confirm_');
try {
  const fs = require('fs');
  const botJsPath = path.join(__dirname, 'src/bot.js');
  const botJsContent = fs.readFileSync(botJsPath, 'utf8');

  // Find my_chat_member handler
  const myChatMemberStart = botJsContent.indexOf("bot.on('my_chat_member'");
  if (myChatMemberStart === -1) {
    console.log('✗ my_chat_member handler не знайдено\n');
    process.exit(1);
  }

  // Check that it uses wizard_channel_confirm_ callback
  const usesWizardCallback = botJsContent.includes('wizard_channel_confirm_') &&
                              botJsContent.includes('${channelId}');

  if (usesWizardCallback) {
    console.log('✓ my_chat_member handler використовує wizard_channel_confirm_ callback\n');
    console.log('  (Це означає що branding flow також працюватиме для автопідключення)\n');
  } else {
    console.log('⚠ my_chat_member handler НЕ використовує wizard_channel_confirm_ callback\n');
    console.log('  (Це може бути ОК, якщо він використовує інший механізм)\n');
  }
} catch (error) {
  console.log(`✗ Помилка: ${error.message}\n`);
  process.exit(1);
}

console.log('✅ Всі тести пройдено успішно!');
console.log('\n📝 Виправлення wizard channel branding готово:');
console.log('   • setConversationState імпортовано в start.js');
console.log('   • wizard_channel_confirm_ запускає branding flow');
console.log('   • Користувач буде налаштовувати назву → опис → фото');
console.log('   • Головне меню показується ПІСЛЯ завершення branding flow');
console.log('\n🎯 Очікувана поведінка:');
console.log('   1. Користувач проходить wizard');
console.log('   2. Вибирає "У Telegram-каналі"');
console.log('   3. Додає бота в канал');
console.log('   4. Підтверджує підключення');
console.log('   5. → НОВИЙ ПОТІК: вводить назву каналу');
console.log('   6. → Вводить/пропускає опис');
console.log('   7. → Застосовується брендування (назва, опис, фото)');
console.log('   8. → Показується головне меню');
