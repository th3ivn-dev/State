const path = require('path');
const { formatTime, formatDate, formatTimeRemaining, escapeHtml, formatDurationFromMs, formatExactDuration } = require('./utils');
const { REGIONS } = require('./constants/regions');

// Форматувати повідомлення про графік
function formatScheduleMessage(region, queue, scheduleData, nextEvent, changes = null, updateType = null, isChannel = false) {
  // Defensive checks
  if (!region || !queue) {
    return '⚠️ Помилка: відсутні дані про регіон або чергу';
  }
  
  if (!scheduleData || typeof scheduleData !== 'object') {
    return '⚠️ Помилка: невірний формат даних графіка';
  }
  
  const regionName = REGIONS[region]?.name || region;
  const lines = [];
  
  if (!scheduleData.hasData) {
    lines.push(`<i>💡 Графік відключень для черги ${queue}</i>`);
    lines.push('');
    lines.push('ℹ️ Немає даних про відключення');
    return lines.join('\n');
  }
  
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  tomorrowEnd.setMilliseconds(-1);
  
  // Get day name
  const dayNames = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\'ятниця', 'Субота'];
  const todayName = dayNames[now.getDay()];
  const tomorrowName = dayNames[(now.getDay() + 1) % 7];
  
  // Format dates
  const todayDate = formatDate(now);
  const tomorrowDate = formatDate(tomorrowStart);
  
  // Day boundary for filtering (tomorrow's start)
  const dayAfterTomorrowStart = new Date(tomorrowStart);
  dayAfterTomorrowStart.setDate(dayAfterTomorrowStart.getDate() + 1);
  
  // Create a set of new event keys for marking
  const newEventKeys = new Set();
  if (changes && changes.added) {
    changes.added.forEach(event => {
      const key = `${event.start}_${event.end}`;
      newEventKeys.add(key);
    });
  }
  
  // Split events by day using event.start only (not event.end)
  // This fixes the hour=24 boundary issue where end can be in the next day
  const todayEvents = [];
  const tomorrowEvents = [];
  
  scheduleData.events.forEach(event => {
    const eventStart = new Date(event.start);
    if (eventStart >= todayStart && eventStart < tomorrowStart) {
      todayEvents.push(event);
    } else if (eventStart >= tomorrowStart && eventStart < dayAfterTomorrowStart) {
      tomorrowEvents.push(event);
    }
  });
  
  // Calculate total duration for today
  let todayTotalMinutes = 0;
  todayEvents.forEach(event => {
    const durationMs = new Date(event.end) - new Date(event.start);
    todayTotalMinutes += durationMs / 60000;
  });
  
  // Calculate total duration for tomorrow  
  let tomorrowTotalMinutes = 0;
  tomorrowEvents.forEach(event => {
    const durationMs = new Date(event.end) - new Date(event.start);
    tomorrowTotalMinutes += durationMs / 60000;
  });
  
  // Tomorrow's schedule - show if there are actual outages
  if (tomorrowEvents.length > 0) {
    // Determine header based on update type
    let header;
    if (updateType && updateType.tomorrowAppeared) {
      header = `<i>💡 Зʼявився графік відключень <b>на завтра, ${tomorrowDate} (${tomorrowName}),</b> для черги ${queue}:</i>`;
    } else {
      header = `<i>💡 Графік відключень <b>на завтра, ${tomorrowDate} (${tomorrowName}),</b> для черги ${queue}:</i>`;
    }
    lines.push(header);
    lines.push('');
    
    tomorrowEvents.forEach(event => {
      const start = formatTime(event.start);
      const end = formatTime(event.end);
      const durationMs = new Date(event.end) - new Date(event.start);
      const durationStr = formatDurationFromMs(durationMs);
      const key = `${event.start}_${event.end}`;
      const isNew = newEventKeys.has(key);
      const possibleLabel = event.isPossible ? ' ⚠️' : '';
      lines.push(`🪫 <b>${start} - ${end} (~${durationStr})</b>${possibleLabel}${isNew ? ' 🆕' : ''}`);
    });
    
    // Add total duration for tomorrow
    const totalHours = Math.floor(tomorrowTotalMinutes / 60);
    const totalMins = Math.round(tomorrowTotalMinutes % 60);
    let totalStr = '';
    if (totalHours > 0) {
      totalStr = `${totalHours} год`;
      if (totalMins > 0) totalStr += ` ${totalMins} хв`;
    } else {
      totalStr = `${totalMins} хв`;
    }
    lines.push(`Загалом без світла:<b> ~${totalStr}</b>`);
    lines.push('');
  }
  
  // Today's schedule
  if (todayEvents.length > 0) {
    // Determine header based on update type:
    // Scenario 1: Only today updated (no tomorrow context) - show full header
    // Scenario 2: Tomorrow appeared + today unchanged - show "без змін"
    // Scenario 3: Tomorrow appeared + today updated - show short "Оновлено графік на сьогодні:"
    let header;
    if (updateType && updateType.todayUnchanged && tomorrowEvents.length > 0) {
      // Scenario 2: When tomorrow's schedule appears and today's schedule is unchanged
      header = `<i>💡 Графік на сьогодні <b>без змін:</b></i>`;
    } else if (updateType && updateType.todayUpdated && updateType.tomorrowAppeared) {
      // Scenario 3: When both tomorrow appeared AND today changed - use short format
      header = `<i>💡 Оновлено графік <b>на сьогодні:</b></i>`;
    } else if (updateType && updateType.todayUpdated) {
      // Scenario 1: When only today's schedule is updated - use full format
      header = `<i>💡 Оновлено графік відключень <b>на сьогодні, ${todayDate} (${todayName}),</b> для черги ${queue}:</i>`;
    } else {
      // First time showing or no special context
      header = `<i>💡 Графік відключень <b>на сьогодні, ${todayDate} (${todayName}),</b> для черги ${queue}:</i>`;
    }
    lines.push(header);
    lines.push('');
    
    todayEvents.forEach(event => {
      const start = formatTime(event.start);
      const end = formatTime(event.end);
      const durationMs = new Date(event.end) - new Date(event.start);
      const durationStr = formatDurationFromMs(durationMs);
      const key = `${event.start}_${event.end}`;
      const isNew = newEventKeys.has(key);
      const possibleLabel = event.isPossible ? ' ⚠️' : '';
      lines.push(`🪫 <b>${start} - ${end} (~${durationStr})</b>${possibleLabel}${isNew ? ' 🆕' : ''}`);
    });
    
    // Add total duration for today
    const totalHours = Math.floor(todayTotalMinutes / 60);
    const totalMins = Math.round(todayTotalMinutes % 60);
    let totalStr = '';
    if (totalHours > 0) {
      totalStr = `${totalHours} год`;
      if (totalMins > 0) totalStr += ` ${totalMins} хв`;
    } else {
      totalStr = `${totalMins} хв`;
    }
    lines.push(`Загалом без світла:<b> ~${totalStr}</b>`);
  } else {
    lines.push(`<i>💡 Графік відключень <b>на сьогодні, ${todayDate} (${todayName}),</b> для черги ${queue}:</i>`);
    lines.push('');
    lines.push('✅ Відключень не заплановано');
  }
  
  return lines.join('\n');
}

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


// Форматувати повідомлення про зміну графіка
function formatScheduleUpdateMessage(region, queue) {
  const regionName = REGIONS[region]?.name || region;
  const lines = [];
  lines.push('🔄 <b>Графік оновлено!</b>');
  lines.push(`📍 ${escapeHtml(regionName)}, Черга ${queue}`);
  lines.push('');
  lines.push('Натисніть 📊 Графік для перегляду.');
  return lines.join('\n');
}

// Форматувати welcome message
function formatWelcomeMessage(username) {
  const name = username ? escapeHtml(username) : '';
  const lines = [];
  lines.push(`👋 Привіт${name ? ', ' + name : ''}! Я СвітлоБот 🤖`);
  lines.push('');
  lines.push('Я допоможу відстежувати відключення світла');
  lines.push('та повідомлю, коли воно зʼявиться або зникне.');
  lines.push('');
  lines.push('Давайте налаштуємося. Оберіть свій регіон:');
  return lines.join('\n');
}

// Форматувати help message
function formatHelpMessage() {
  const lines = [];
  lines.push('<b>📖 Довідка</b>');
  lines.push('');
  lines.push('<b>Основні функції:</b>');
  lines.push('📊 Графік — Показати графік відключень');
  lines.push('💡 Статус — Перевірити наявність світла');
  lines.push('⚙️ Налаштування — Налаштування бота');
  lines.push('❓ Допомога — Ця довідка');
  lines.push('');
  lines.push('<b>Як працює бот:</b>');
  lines.push('• Бот автоматично перевіряє графіки');
  lines.push('• При зміні графіка ви отримаєте сповіщення');
  lines.push('• Можна підключити бота до свого каналу');
  lines.push('• Можна моніторити наявність світла через роутер');
  lines.push('');
  
  // Add bot version from package.json
  try {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = require(packageJsonPath);
    lines.push(`<i>СвітлоБот v${packageJson.version}</i>`);
  } catch (e) {
    lines.push('<i>СвітлоБот</i>');
  }
  
  return lines.join('\n');
}

// Форматувати повідомлення про графік для каналу (новий формат)
function formatScheduleForChannel(region, queue, scheduleData, todayDate) {
  const regionName = REGIONS[region]?.name || region;
  const lines = [];
  
  // Заголовок
  const date = todayDate || new Date();
  const dayNames = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\'ятниця', 'Субота'];
  const dayName = dayNames[date.getDay()];
  const dateStr = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
  
  lines.push(`💡 Графік відключень <b>на сьогодні, ${dateStr} (${dayName})</b>, для черги ${queue}:`);
  lines.push('');
  
  if (!scheduleData.hasData || scheduleData.events.length === 0) {
    lines.push('✅ Відключень не заплановано');
    return lines.join('\n');
  }
  
  // Розділяємо події на планові та можливі (тільки на сьогодні)
  const todayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
  
  const todayPlanned = [];
  const todayPossible = [];
  
  scheduleData.events.forEach(event => {
    if (event.start >= todayStart && event.start <= todayEnd) {
      if (event.isPossible) {
        todayPossible.push(event);
      } else {
        todayPlanned.push(event);
      }
    }
  });
  
  // Планові відключення
  if (todayPlanned.length > 0) {
    todayPlanned.forEach(event => {
      const start = formatTime(event.start);
      const end = formatTime(event.end);
      const durationMs = event.end - event.start;
      const durationStr = formatDurationFromMs(durationMs);
      lines.push(`🪫 <b>${start} - ${end} (~${durationStr})</b>`);
    });
  }
  
  return lines.join('\n');
}

// Форматувати статистику для popup в каналі
function formatStatsForChannelPopup(stats) {
  if (stats.count === 0) {
    return '📊 За тиждень:\n\n✅ Відключень не було';
  }
  
  const lines = [];
  lines.push('📊 За тиждень:');
  lines.push('');
  lines.push(`⚡ Відключень: ${stats.count}`);
  
  // Форматувати загальний час
  const totalDuration = formatExactDuration(stats.totalMinutes);
  lines.push(`🕓 Загальний час без світла: ${totalDuration}`);
  
  // Середня тривалість
  const avgDuration = formatExactDuration(stats.avgMinutes);
  lines.push(`📉 Середня тривалість: ${avgDuration}`);
  
  // Найдовше відключення
  if (stats.longest) {
    const longDuration = formatExactDuration(stats.longest.duration_minutes);
    const longDate = new Date(stats.longest.start_time);
    const longDateStr = `${String(longDate.getDate()).padStart(2, '0')}.${String(longDate.getMonth() + 1).padStart(2, '0')}`;
    const longStartTime = `${String(longDate.getHours()).padStart(2, '0')}:${String(longDate.getMinutes()).padStart(2, '0')}`;
    const longEndDate = new Date(stats.longest.end_time);
    const longEndTime = `${String(longEndDate.getHours()).padStart(2, '0')}:${String(longEndDate.getMinutes()).padStart(2, '0')}`;
    
    lines.push(`🏆 Найдовше: ${longDuration} (${longDateStr} ${longStartTime}-${longEndTime})`);
  }
  
  // Найкоротше відключення
  if (stats.shortest) {
    const shortDuration = formatExactDuration(stats.shortest.duration_minutes);
    const shortDate = new Date(stats.shortest.start_time);
    const shortDateStr = `${String(shortDate.getDate()).padStart(2, '0')}.${String(shortDate.getMonth() + 1).padStart(2, '0')}`;
    const shortStartTime = `${String(shortDate.getHours()).padStart(2, '0')}:${String(shortDate.getMinutes()).padStart(2, '0')}`;
    const shortEndDate = new Date(stats.shortest.end_time);
    const shortEndTime = `${String(shortEndDate.getHours()).padStart(2, '0')}:${String(shortEndDate.getMinutes()).padStart(2, '0')}`;
    
    lines.push(`🔋 Найкоротше: ${shortDuration} (${shortDateStr} ${shortStartTime}-${shortEndTime})`);
  }
  
  return lines.join('\n');
}

// Форматувати зміни графіка для popup
function formatScheduleChanges(changes) {
  if (!changes || (!changes.added.length && !changes.removed.length && !changes.modified.length)) {
    return 'Немає змін';
  }
  
  const lines = [];
  lines.push('📝 <b>Зміни:</b>');
  lines.push('');
  
  // Added periods
  if (changes.added.length > 0) {
    changes.added.forEach(event => {
      const start = formatTime(event.start);
      const end = formatTime(event.end);
      lines.push(`➕ ${start}-${end}`);
    });
  }
  
  // Removed periods
  if (changes.removed.length > 0) {
    changes.removed.forEach(event => {
      const start = formatTime(event.start);
      const end = formatTime(event.end);
      lines.push(`➖ ${start}-${end}`);
    });
  }
  
  // Modified periods
  if (changes.modified.length > 0) {
    changes.modified.forEach(({ old, new: newEvent }) => {
      const oldStart = formatTime(old.start);
      const oldEnd = formatTime(old.end);
      const newStart = formatTime(newEvent.start);
      const newEnd = formatTime(newEvent.end);
      lines.push(`🔄 ${oldStart}-${oldEnd} → ${newStart}-${newEnd}`);
    });
  }
  
  if (changes.summary) {
    lines.push('');
    lines.push(`Всього: ${changes.summary}`);
  }
  
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


function formatTemplate(template, variables = {}) {
  if (!template || typeof template !== 'string') return '';
  if (!variables || typeof variables !== 'object') return template;
  
  let result = template;
  
  // Заміна змінних - use simple string replace for better performance
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    // Safely convert value to string, handle null/undefined
    const replacement = (value !== null && value !== undefined) ? String(value) : '';
    while (result.includes(placeholder)) {
      result = result.replace(placeholder, replacement);
    }
  }
  
  // Заміна <br> на новий рядок
  result = result.replace(/<br>/g, '\n');
  
  return result;
}

// Форматувати поточну дату/час для шаблонів
function getCurrentDateTimeForTemplate() {
  const now = new Date();
  return {
    timeStr: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    dateStr: `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`
  };
}

// Форматувати повідомлення про помилку
function formatErrorMessage() {
  const lines = [];
  lines.push('😅 Щось пішло не так.');
  lines.push('');
  lines.push('Якщо помітили, що щось не працює —');
  lines.push('напишіть нам, будь ласка!');
  return lines.join('\n');
}

module.exports = {
  formatScheduleMessage,
  formatNextEventMessage,
  formatTimerMessage,
  formatTimerPopup,
  formatScheduleUpdateMessage,
  formatWelcomeMessage,
  formatHelpMessage,
  formatScheduleForChannel,
  formatStatsForChannelPopup,
  formatScheduleChanges,
  formatTemplate,
  getCurrentDateTimeForTemplate,
  formatErrorMessage,
};
