const { formatTime, formatTimeRemaining } = require('../utils');

// Форматувати повідомлення про наступну подію
function formatNextEventMessage(nextEvent) {
  if (!nextEvent) {
    return '✅ Наступні відключення не заплановані';
  }

  const lines = [];

  if (nextEvent.type === 'power_off') {
    lines.push('⏰ <b>Наступне відключення</b>');
    lines.push(`🔴 Через: ${formatTimeRemaining(nextEvent.minutes)}`);
    lines.push(`🕐 Час: ${formatTime(nextEvent.time)}`);
    if (nextEvent.isPossible) {
      lines.push('⚠️ Можливе відключення');
    }
  } else {
    lines.push('⏰ <b>Наступне включення</b>');
    lines.push(`🟢 Через: ${formatTimeRemaining(nextEvent.minutes)}`);
    lines.push(`🕐 Час: ${formatTime(nextEvent.time)}`);
    if (nextEvent.isPossible) {
      lines.push('⚠️ Можливе включення');
    }
  }

  return lines.join('\n');
}

// Форматувати повідомлення про таймер
function formatTimerMessage(nextEvent) {
  if (!nextEvent) {
    return '✅ Наступні відключення не заплановані';
  }

  const lines = [];

  if (nextEvent.type === 'power_off') {
    lines.push('⏰ <b>Відключення через:</b>');
    lines.push(`🔴 ${formatTimeRemaining(nextEvent.minutes)}`);
  } else {
    lines.push('⏰ <b>Включення через:</b>');
    lines.push(`🟢 ${formatTimeRemaining(nextEvent.minutes)}`);
  }

  lines.push(`🕐 ${formatTime(nextEvent.time)}`);

  return lines.join('\n');
}

// Форматувати таймер для popup (канальні кнопки timer_userId)
function formatTimerPopup(nextEvent, scheduleData) {
  const lines = [];

  if (!nextEvent) {
    // No outages today
    lines.push('🎉 Сьогодні без відключень!');
    lines.push('');

    // Try to show tomorrow's schedule
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

    const tomorrowEvents = scheduleData.events.filter(event => {
      const eventStart = new Date(event.start);
      return eventStart >= tomorrowStart && eventStart < tomorrowEnd;
    });

    if (tomorrowEvents.length > 0) {
      lines.push('📅 Завтра:');
      tomorrowEvents.forEach(event => {
        const start = formatTime(event.start);
        const end = formatTime(event.end);
        lines.push(`• ${start}–${end}`);
      });
    } else {
      lines.push('ℹ️ Дані на завтра ще не опубліковані');
    }
  } else if (nextEvent.type === 'power_off') {
    // Light is currently on
    lines.push('За графіком зараз:');
    lines.push('🟢 Світло зараз є');
    lines.push('');

    const hours = Math.floor(nextEvent.minutes / 60);
    const mins = nextEvent.minutes % 60;
    let timeStr = '';
    if (hours > 0) {
      timeStr = `${hours} год`;
      if (mins > 0) timeStr += ` ${mins} хв`;
    } else {
      timeStr = `${mins} хв`;
    }

    lines.push(`⏳ Вимкнення через ${timeStr}`);
    const start = formatTime(nextEvent.time);
    const end = nextEvent.endTime ? formatTime(nextEvent.endTime) : '?';
    lines.push(`📅 Очікуємо - ${start}–${end}`);

    // Show other outages today
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    const otherOutages = scheduleData.events.filter(event => {
      const eventStart = new Date(event.start);
      return eventStart > new Date(nextEvent.time) &&
             eventStart >= todayStart &&
             eventStart <= todayEnd;
    });

    if (otherOutages.length > 0) {
      lines.push('');
      lines.push('Інші відключення сьогодні:');
      otherOutages.forEach(event => {
        const s = formatTime(event.start);
        const e = formatTime(event.end);
        lines.push(`• ${s}–${e}`);
      });
    }
  } else {
    // Light is currently off
    lines.push('За графіком зараз:');
    lines.push('🔴 Світла немає');
    lines.push('');

    const hours = Math.floor(nextEvent.minutes / 60);
    const mins = nextEvent.minutes % 60;
    let timeStr = '';
    if (hours > 0) {
      timeStr = `${hours} год`;
      if (mins > 0) timeStr += ` ${mins} хв`;
    } else {
      timeStr = `${mins} хв`;
    }

    lines.push(`⏳ До увімкнення ${timeStr}`);
    const start = nextEvent.startTime ? formatTime(nextEvent.startTime) : '?';
    const end = formatTime(nextEvent.time);
    lines.push(`📅 Поточне - ${start}–${end}`);
  }

  return lines.join('\n');
}

module.exports = {
  formatNextEventMessage,
  formatTimerMessage,
  formatTimerPopup,
};
