const { isInWizard, getWizardState, setWizardState } = require('./start');
const { setPendingChannel, removePendingChannel } = require('../state/pendingChannels');
const { escapeHtml } = require('../utils');
const { isTelegramUserInactiveError } = require('../utils/errorHandler');
const usersDb = require('../database/users');
const { checkPauseForChannelActions } = require('../utils/guards');
const logger = require('../utils/logger');

function handleChatMember(bot, channelInstructionMessages) {
  return async (ctx) => {
    try {
      const update = ctx.myChatMember;
      const chat = update.chat;
      const newStatus = update.new_chat_member.status;
      const oldStatus = update.old_chat_member.status;
      const userId = String(update.from.id); // User who added the bot (convert to String for consistency)

      // Перевіряємо що це канал
      if (chat.type !== 'channel') return;

      const channelId = String(chat.id);
      const channelTitle = chat.title || 'Без назви';

      // Бота додали як адміністратора
      if (newStatus === 'administrator' && oldStatus !== 'administrator') {
        // Перевірка режиму паузи
        const pauseCheck = await checkPauseForChannelActions();
        if (pauseCheck.blocked) {
          // Бот на паузі - не дозволяємо додавання каналів
          try {
            await bot.api.sendMessage(
              userId,
              pauseCheck.message
            );
          } catch (error) {
            if (isTelegramUserInactiveError(error)) {
              logger.info('ℹ️ Користувач недоступний — сповіщення про паузу пропущено', { userId });
            } else {
              logger.error('Error sending pause message in my_chat_member:', error);
            }
          }
          return;
        }

        const channelUsername = chat.username ? `@${chat.username}` : chat.title;

        // Перевіряємо чи канал вже зайнятий іншим користувачем
        const existingUser = await usersDb.getUserByChannelId(channelId);
        if (existingUser && existingUser.telegram_id !== userId) {
          // Канал вже зайнятий - повідомляємо користувача
          logger.info(`Channel ${channelId} already connected to user ${existingUser.telegram_id}`);

          try {
            await bot.api.sendMessage(
              userId,
              '⚠️ <b>Канал вже підключений</b>\n\n' +
              `Канал "${escapeHtml(channelTitle)}" вже підключено до іншого користувача.\n\n` +
              'Кожен канал може бути підключений тільки до одного облікового запису.\n\n' +
              'Якщо це ваш канал — зверніться до підтримки.'
            );
          } catch (error) {
            if (isTelegramUserInactiveError(error)) {
              logger.info('ℹ️ Користувач недоступний — сповіщення про зайнятий канал пропущено', { userId });
            } else {
              logger.error('Error sending occupied channel notification:', error);
            }
          }
          return;
        }

        // Перевіряємо чи користувач в wizard на етапі channel_setup

        if (isInWizard(userId)) {
          const wizardState = getWizardState(userId);

          if (wizardState && wizardState.step === 'channel_setup') {
            // Користувач в wizard - замінюємо інструкцію на підтвердження

            // Видаляємо попереднє повідомлення якщо є
            if (wizardState.lastMessageId) {
              try {
                await bot.api.deleteMessage(userId, wizardState.lastMessageId);
              } catch (e) {
                logger.info('Could not delete wizard instruction message:', e.message);
              }
            }

            // Зберігаємо pending channel
            setPendingChannel(channelId, {
              channelId,
              channelUsername: chat.username ? `@${chat.username}` : null,
              channelTitle: channelTitle,
              telegramId: userId,
              timestamp: Date.now()
            });

            // Надсилаємо підтвердження
            const confirmMessage = await bot.api.sendMessage(
              userId,
              `✅ Канал знайдено: "<b>${escapeHtml(channelTitle)}</b>"\n\n` +
              `Використовувати його для сповіщень?`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '✅ Так, підключити', callback_data: `wizard_channel_confirm_${channelId}` }],
                    [{ text: '❌ Ні', callback_data: 'wizard_channel_cancel' }]
                  ]
                }
              }
            );

            // Оновлюємо wizard state з новим message ID
            setWizardState(userId, {
              ...wizardState,
              lastMessageId: confirmMessage.message_id,
              pendingChannelId: channelId
            });

            logger.info('Bot added to channel during wizard: () by user', { channelUsername, channelId, userId });
            return; // Не продовжуємо стандартну логіку
          }
        }

        // Спробувати видалити старе повідомлення з інструкцією
        // (якщо є збережений message_id)
        const lastInstructionMessageId = channelInstructionMessages.get(userId);
        if (lastInstructionMessageId) {
          try {
            await bot.api.deleteMessage(userId, lastInstructionMessageId);
            channelInstructionMessages.delete(userId);
            logger.info('Deleted instruction message for user', { lastInstructionMessageId, userId });
          } catch (e) {
            logger.info('Could not delete instruction message:', e.message);
          }
        }

        // Отримати користувача з БД
        const user = await usersDb.getUserByTelegramId(userId);

        if (user && user.channel_id) {
          // У користувача вже є канал - запитати про заміну
          const currentChannelTitle = user.channel_title || 'Поточний канал';

          try {
            await bot.api.sendMessage(userId,
              `✅ Ви додали мене в канал "<b>${escapeHtml(channelTitle)}</b>"!\n\n` +
              `⚠️ У вас вже підключений канал "<b>${escapeHtml(currentChannelTitle)}</b>".\n` +
              `Замінити на новий?`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '✅ Так, замінити', callback_data: `replace_channel_${channelId}` }],
                    [{ text: '❌ Залишити поточний', callback_data: 'keep_current_channel' }]
                  ]
                }
              }
            );
          } catch (error) {
            if (isTelegramUserInactiveError(error)) {
              logger.info('ℹ️ Користувач недоступний — запит на заміну каналу пропущено', { userId });
            } else {
              logger.error('Error sending replace channel prompt:', error);
            }
          }
        } else {
          // У користувача немає каналу - запропонувати підключити
          try {
            await bot.api.sendMessage(userId,
              `✅ Канал знайдено: "<b>${escapeHtml(channelTitle)}</b>"\n\n` +
              `Використовувати його для сповіщень?`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '✅ Так, підключити', callback_data: `connect_channel_${channelId}` }],
                    [{ text: '❌ Ні', callback_data: 'cancel_channel_connect' }]
                  ]
                }
              }
            );
          } catch (error) {
            if (isTelegramUserInactiveError(error)) {
              logger.info('ℹ️ Користувач недоступний — запит на підключення каналу пропущено', { userId });
            } else {
              logger.error('Error sending connect channel prompt:', error);
            }
          }
        }

        // Зберегти інформацію про канал тимчасово для callback
        setPendingChannel(channelId, {
          channelId,
          channelUsername,
          channelTitle: chat.title,
          telegramId: userId,
          timestamp: Date.now()
        });

        logger.info('Bot added as admin to channel: () by user', { channelUsername, channelId, userId });
      }

      // Бота видалили з каналу
      if ((newStatus === 'left' || newStatus === 'kicked') &&
          (oldStatus === 'administrator' || oldStatus === 'member')) {

        logger.info('Bot removed from channel: ()', { channelTitle, channelId });

        // Видаляємо з pending channels
        removePendingChannel(channelId);

        // Перевіряємо чи користувач в wizard з цим каналом

        if (isInWizard(userId)) {
          const wizardState = getWizardState(userId);

          if (wizardState && wizardState.pendingChannelId === channelId) {
            // Оновлюємо повідомлення
            if (wizardState.lastMessageId) {
              try {
                await bot.api.editMessageText(
                  userId,
                  wizardState.lastMessageId,
                  `❌ <b>Бота видалено з каналу</b>\n\n` +
                  `Канал "${escapeHtml(channelTitle)}" більше недоступний.\n\n` +
                  `Щоб підключити канал, додайте бота як адміністратора.`,
                  {
                    reply_markup: {
                      inline_keyboard: [
                        [{ text: '← Назад', callback_data: 'wizard_notify_back' }]
                      ]
                    }
                  }
                );
              } catch (e) {
                logger.info('Could not update wizard message after bot removal:', e.message);
              }
            }

            // Очищаємо pending channel з wizard state
            setWizardState(userId, {
              ...wizardState,
              pendingChannelId: null
            });
          }
        }

        const user = await usersDb.getUserByTelegramId(userId);

        // Також перевіряємо чи це був підключений канал користувача
        if (user && String(user.channel_id) === channelId) {
          try {
            await bot.api.sendMessage(userId,
              `⚠️ Мене видалили з каналу "<b>${escapeHtml(channelTitle)}</b>".\n\n` +
              `Сповіщення в цей канал більше не надсилатимуться.`
            );
          } catch (error) {
            if (isTelegramUserInactiveError(error)) {
              logger.info('ℹ️ Користувач недоступний — сповіщення про видалення каналу пропущено', { userId });
            } else {
              logger.error('Error sending channel removal notification:', error);
            }
          }

          // Очистити channel_id в БД
          await usersDb.updateUser(userId, { channel_id: null, channel_title: null });
        }
      }

    } catch (error) {
      logger.error('Error in my_chat_member handler:', error);
    }
  };
}

module.exports = { handleChatMember };
