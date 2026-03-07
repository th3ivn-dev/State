const { formatTime, formatDate, formatTimeRemaining, escapeHtml, formatDurationFromMs } = require('../utils');
const { REGIONS } = require('../constants/regions');

// Форматувати повідомлення про графік
function formatScheduleMessage(region, queue, scheduleData, nextEvent, changes = null, updateType = null, _isChannel = false) {
  // Defensive checks
  if (!region || !queue) {
    return '⚠️ Помилка: відсутні дані про регіон або чергу';
  }

  if (!scheduleData || typeof scheduleData !== 'object') {
    return '⚠️ Помилка: невірний формат даних графіка';
  }

  const _regionName = REGIONS[region]?.name || region;
  const lines = [];

  if (!scheduleData.hasData) {
    lines.push(`<i>💡 Графік відключень для черги ${queue}</i>`);
    lines.push('');
    lines.push('ℹ️ Немає даних про відключення');
    return lines.join('\n');
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const _todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
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

// Форматувати повідомлення про графік для каналу (новий формат)
function formatScheduleForChannel(region, queue, scheduleData, todayDate) {
  const _regionName = REGIONS[region]?.name || region;
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

module.exports = {
  formatScheduleMessage,
  formatScheduleForChannel,
  formatScheduleChanges,
  formatScheduleUpdateMessage,
};
