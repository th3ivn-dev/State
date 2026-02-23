const { getGrowthKeyboard, getGrowthStageKeyboard, getGrowthRegistrationKeyboard } = require('../../keyboards/inline');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/errorHandler');
const {
  getCurrentStage,
  setGrowthStage,
  getGrowthMetrics,
  getStageSpecificMetrics,
  isRegistrationEnabled,
  setRegistrationEnabled,
  getRecentGrowthEvents,
  checkGrowthHealth,
  GROWTH_STAGES
} = require('../../growthMetrics');

// Callback handler for growth management callbacks
async function handleGrowthCallback(bot, query, chatId, userId, data) {
  if (data === 'admin_growth') {
    const metrics = await getGrowthMetrics();
    const health = await checkGrowthHealth();

    let message = '📈 <b>Управління ростом</b>\n\n';
    message += `🎯 Етап: <b>${metrics.stage.name}</b>\n`;
    message += `👥 Користувачів: ${metrics.users.total} / ${metrics.users.limit.max === Infinity ? '∞' : metrics.users.limit.max}\n`;
    message += `📊 Прогрес: ${metrics.users.limit.percentage}%\n\n`;

    if (metrics.users.limit.remaining > 0 && metrics.users.limit.remaining < 10) {
      message += `⚠️ Залишилось місць: ${metrics.users.limit.remaining}\n\n`;
    }

    message += `📊 Метрики:\n`;
    message += `• Завершили wizard: ${metrics.rates.wizardCompletion}%\n`;
    message += `• Підключили канали: ${metrics.rates.channelAdoption}%\n\n`;

    message += `🔐 Реєстрація: ${metrics.registration.enabled ? '🟢 Увімкнена' : '🔴 Вимкнена'}\n\n`;

    if (!health.healthy) {
      message += `⚠️ <b>Попередження:</b>\n`;
      health.reasons.forEach(reason => {
        message += `• ${reason}\n`;
      });
    }

    await safeEditMessageText(bot, message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getGrowthKeyboard().reply_markup
    });
    return;
  }

  if (data === 'growth_metrics') {
    const metrics = await getGrowthMetrics();
    const stageMetrics = await getStageSpecificMetrics();

    let message = '📊 <b>Метрики росту</b>\n\n';
    message += `<b>Загальні:</b>\n`;
    message += `👥 Всього: ${metrics.users.total}\n`;
    message += `✅ Активних: ${metrics.users.active}\n`;
    message += `📺 З каналами: ${metrics.users.withChannels}\n\n`;

    message += `<b>Етап ${stageMetrics.stageId}: ${stageMetrics.stageName}</b>\n\n`;

    if (stageMetrics.focus) {
      message += `<b>Фокус метрики:</b>\n`;
      stageMetrics.focus.forEach(metric => {
        const unit = metric.unit ? ` ${metric.unit}` : '';
        const total = metric.total ? `/${metric.total}` : '';
        const comment = metric.comment ? ` (${metric.comment})` : '';
        message += `• ${metric.name}: ${metric.value}${total}${unit}${comment}\n`;
      });
    }

    await safeEditMessageText(bot, message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getGrowthKeyboard().reply_markup
    });
    return;
  }

  if (data === 'growth_stage') {
    const currentStage = await getCurrentStage();
    const metrics = await getGrowthMetrics();

    let message = '🎯 <b>Керування етапом росту</b>\n\n';
    message += `Поточний етап: <b>${currentStage.name}</b>\n`;
    message += `Користувачів: ${metrics.users.total} / ${currentStage.maxUsers === Infinity ? '∞' : currentStage.maxUsers}\n\n`;
    message += `⚠️ Змінюйте етап тільки після підтвердження готовності системи!\n\n`;
    message += `Оберіть новий етап:`;

    await safeEditMessageText(bot, message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getGrowthStageKeyboard(currentStage.id).reply_markup
    });
    return;
  }

  if (data.startsWith('growth_stage_')) {
    const stageId = parseInt(data.replace('growth_stage_', ''), 10);
    const stage = Object.values(GROWTH_STAGES).find(s => s.id === stageId);

    if (stage) {
      await setGrowthStage(stageId);
      await safeAnswerCallbackQuery(bot, query.id, {
        text: `✅ Етап змінено на: ${stage.name}`,
        show_alert: true
      });

      // Return to growth stage view
      const currentStage = await getCurrentStage();
      const metrics = await getGrowthMetrics();

      let message = '🎯 <b>Керування етапом росту</b>\n\n';
      message += `Поточний етап: <b>${currentStage.name}</b>\n`;
      message += `Користувачів: ${metrics.users.total} / ${currentStage.maxUsers === Infinity ? '∞' : currentStage.maxUsers}\n\n`;
      message += `⚠️ Змінюйте етап тільки після підтвердження готовності системи!\n\n`;
      message += `Оберіть новий етап:`;

      await safeEditMessageText(bot, message, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getGrowthStageKeyboard(currentStage.id).reply_markup
      });
    }
    return;
  }

  if (data === 'growth_registration') {
    const enabled = await isRegistrationEnabled();
    const metrics = await getGrowthMetrics();

    let message = '🔐 <b>Керування реєстрацією</b>\n\n';
    message += `Статус: ${enabled ? '🟢 Увімкнена' : '🔴 Вимкнена'}\n\n`;
    message += `Поточний етап: ${metrics.stage.name}\n`;
    message += `Користувачів: ${metrics.users.total} / ${metrics.users.limit.max === Infinity ? '∞' : metrics.users.limit.max}\n\n`;

    if (metrics.users.limit.reached) {
      message += `⚠️ Ліміт користувачів досягнуто!\n\n`;
    }

    message += `Вимкніть реєстрацію для контролю росту або при виникненні проблем.\n`;

    await safeEditMessageText(bot, message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getGrowthRegistrationKeyboard(enabled).reply_markup
    });
    return;
  }

  if (data === 'growth_reg_status') {
    // Just a status indicator, do nothing
    return;
  }

  if (data === 'growth_reg_toggle') {
    const currentEnabled = await isRegistrationEnabled();
    await setRegistrationEnabled(!currentEnabled);
    const newEnabled = !currentEnabled;

    await safeAnswerCallbackQuery(bot, query.id, {
      text: newEnabled ? '🟢 Реєстрацію увімкнено' : '🔴 Реєстрацію вимкнено',
      show_alert: true
    });

    // Refresh view
    const metrics = await getGrowthMetrics();

    let message = '🔐 <b>Керування реєстрацією</b>\n\n';
    message += `Статус: ${newEnabled ? '🟢 Увімкнена' : '🔴 Вимкнена'}\n\n`;
    message += `Поточний етап: ${metrics.stage.name}\n`;
    message += `Користувачів: ${metrics.users.total} / ${metrics.users.limit.max === Infinity ? '∞' : metrics.users.limit.max}\n\n`;

    if (metrics.users.limit.reached) {
      message += `⚠️ Ліміт користувачів досягнуто!\n\n`;
    }

    message += `Вимкніть реєстрацію для контролю росту або при виникненні проблем.\n`;

    await safeEditMessageText(bot, message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getGrowthRegistrationKeyboard(newEnabled).reply_markup
    });
    return;
  }

  if (data === 'growth_events') {
    const events = await getRecentGrowthEvents(10);

    let message = '📝 <b>Останні події росту</b>\n\n';

    if (events.length === 0) {
      message += 'Немає подій для відображення.\n';
    } else {
      events.forEach((event, index) => {
        const timestamp = new Date(event.timestamp).toLocaleString('uk-UA');
        message += `${index + 1}. <b>${event.eventType}</b>\n`;
        message += `   ${timestamp}\n`;
        if (event.data.stage !== undefined) {
          message += `   Етап: ${event.data.stage}\n`;
        }
        message += '\n';
      });
    }

    await safeEditMessageText(bot, message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: getGrowthKeyboard().reply_markup
    });
    return;
  }
}

module.exports = {
  handleGrowthCallback,
};
