const { getCurrentTime, getMinutesDifference } = require('./utils');

const MIN_HOUR = 1;
const MAX_HOUR = 24;

// Helper function to create event date, handling hour=24 boundary
function createEventDate(baseDate, hourValue) {
  const hour = Math.floor(hourValue);
  const minute = (hourValue % 1) * 60;

  // Hour=24 means end of day. JavaScript's Date constructor automatically
  // rolls hour=24 to 00:00 of the next day, which is the correct behavior.
  // The formatter.js uses event.start (not event.end) for day assignment,
  // so an event starting at 23:00 today with end at 00:00 tomorrow is correctly
  // assigned to today's schedule.
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hour, minute);
}

// Парсити дані графіка для конкретної черги
function parseScheduleForQueue(data, queue) {
  try {
    // Validate inputs
    if (!data || typeof data !== 'object') {
      return {
        queue: queue || 'unknown',
        events: [],
        hasData: false,
      };
    }

    if (!queue || typeof queue !== 'string') {
      return {
        queue: 'unknown',
        events: [],
        hasData: false,
      };
    }

    const queueKey = `GPV${queue}`;

    // Перевірка структури даних
    if (!data.fact || typeof data.fact !== 'object' || !data.fact.data || typeof data.fact.data !== 'object') {
      return {
        queue,
        events: [],
        hasData: false,
      };
    }

    // Візьмемо перші два доступні timestamp з даних
    // Дані зберігаються в порядку: сьогодні, завтра
    const availableTimestamps = Object.keys(data.fact.data).map(Number).sort((a, b) => a - b);

    if (availableTimestamps.length === 0) {
      return {
        queue,
        events: [],
        hasData: false,
      };
    }

    // Просто використовуємо перші доступні timestamp
    // Перший - це дані для сьогодні (або останній доступний день)
    // Другий - це дані для завтра (якщо є)
    const todayTimestamp = availableTimestamps[0];
    const tomorrowTimestamp = availableTimestamps.length > 1 ? availableTimestamps[1] : null;

    const todaySchedule = data.fact.data[todayTimestamp]?.[queueKey];
    const tomorrowSchedule = data.fact.data[tomorrowTimestamp]?.[queueKey];

    if (!todaySchedule) {
      return {
        queue,
        events: [],
        hasData: false,
      };
    }

    // Парсимо години для сьогодні та завтра
    const todayParsed = parseHourlySchedule(todaySchedule);
    const tomorrowParsed = tomorrowSchedule ? parseHourlySchedule(tomorrowSchedule) : { planned: [], possible: [] };

    // Конвертуємо періоди в події з абсолютними timestamp
    const events = [];
    const todayDate = new Date(todayTimestamp * 1000);

    // Додаємо події сьогодні
    todayParsed.planned.forEach(period => {
      events.push({
        type: 'outage',
        start: createEventDate(todayDate, period.start),
        end: createEventDate(todayDate, period.end),
        isPossible: false,
      });
    });

    todayParsed.possible.forEach(period => {
      events.push({
        type: 'outage',
        start: createEventDate(todayDate, period.start),
        end: createEventDate(todayDate, period.end),
        isPossible: true,
      });
    });

    // Додаємо події завтра (тільки якщо є дані для завтра)
    if (tomorrowTimestamp && tomorrowSchedule) {
      const tomorrowDateObj = new Date(tomorrowTimestamp * 1000);

      tomorrowParsed.planned.forEach(period => {
        events.push({
          type: 'outage',
          start: createEventDate(tomorrowDateObj, period.start),
          end: createEventDate(tomorrowDateObj, period.end),
          isPossible: false,
        });
      });

      tomorrowParsed.possible.forEach(period => {
        events.push({
          type: 'outage',
          start: createEventDate(tomorrowDateObj, period.start),
          end: createEventDate(tomorrowDateObj, period.end),
          isPossible: true,
        });
      });
    }

    // Сортуємо події по часу початку
    events.sort((a, b) => a.start - b.start);

    return {
      queue,
      queueKey,
      events,
      hasData: events.length > 0,
    };
  } catch (error) {
    console.error(`Помилка парсингу графіка для черги ${queue}:`, error.message);
    return {
      queue,
      events: [],
      hasData: false,
      error: error.message,
    };
  }
}

// Парсити погодинний графік
function parseHourlySchedule(hourlyData) {
  const planned = [];
  const possible = [];

  for (let hour = MIN_HOUR; hour <= MAX_HOUR; hour++) {
    const factValue = hourlyData[hour];

    if (factValue === 'no' || factValue === 'first' || factValue === 'second') {
      addOutagePeriod(planned, hour, factValue);
    } else if (factValue === 'maybe' || factValue === 'mfirst' || factValue === 'msecond') {
      addOutagePeriod(possible, hour, factValue);
    }
  }

  return {
    planned: mergeConsecutivePeriods(planned),
    possible: mergeConsecutivePeriods(possible),
  };
}

// Додати період відключення
// Примітка: дані використовують 1-based індексацію годин (1-24)
// де hour=14 означає період 13:00-14:00
// тому ми використовуємо (hour - 1) для початку періоду
function addOutagePeriod(periods, hour, value) {
  if (value === 'no' || value === 'maybe') {
    // Повна година відключення (наприклад, hour=14 -> 13:00-14:00)
    addOrExtendPeriod(periods, hour - 1, hour);
  } else if (value === 'first' || value === 'mfirst') {
    // Перша половина години (наприклад, hour=14 -> 13:00-13:30)
    addOrExtendPeriod(periods, hour - 1, hour - 0.5);
  } else if (value === 'second' || value === 'msecond') {
    // Друга половина години (наприклад, hour=14 -> 13:30-14:00)
    addOrExtendPeriod(periods, hour - 0.5, hour);
  }
}

// Додати або розширити період
function addOrExtendPeriod(periods, start, end) {
  const lastPeriod = periods[periods.length - 1];

  if (lastPeriod && lastPeriod.end === start) {
    // Розширюємо існуючий період
    lastPeriod.end = end;
  } else {
    // Додаємо новий період
    periods.push({ start, end });
  }
}

// Об'єднати послідовні періоди
function mergeConsecutivePeriods(periods) {
  const merged = [];

  for (const period of periods) {
    const last = merged[merged.length - 1];

    if (last && last.end === period.start) {
      last.end = period.end;
    } else {
      merged.push({ ...period });
    }
  }

  return merged;
}

// Знайти наступну подію (відключення або включення)
function findNextEvent(scheduleData) {
  const now = getCurrentTime();
  const events = scheduleData.events || [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    // Перевіряємо чи ми зараз у періоді відключення
    if (now >= event.start && now < event.end) {
      // Walk forward through consecutive back-to-back outage events
      let endTime = event.end;
      let j = i + 1;
      while (j < events.length && events[j].start.getTime() === endTime.getTime()) {
        endTime = events[j].end;
        j++;
      }
      return {
        type: 'power_on',
        time: endTime,
        startTime: event.start,
        endTime: null,
        minutes: getMinutesDifference(endTime, now),
        isPossible: event.isPossible,
      };
    }

    // Перевіряємо чи відключення ще попереду
    if (now < event.start) {
      return {
        type: 'power_off',
        time: event.start,
        endTime: event.end,
        minutes: getMinutesDifference(event.start, now),
        isPossible: event.isPossible,
      };
    }
  }

  return null;
}

// Отримати події на сьогодні
function getTodayEvents(scheduleData) {
  const now = getCurrentTime();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const events = scheduleData.events || [];

  return events.filter(event => {
    return event.start <= todayEnd && event.end >= todayStart;
  });
}

// Отримати події на завтра
function getTomorrowEvents(scheduleData) {
  const now = getCurrentTime();
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59);

  const events = scheduleData.events || [];

  return events.filter(event => {
    return event.start <= tomorrowEnd && event.end >= tomorrowStart;
  });
}

// Перевірити чи зараз відключення
function isCurrentlyOff(scheduleData) {
  const now = getCurrentTime();
  const events = scheduleData.events || [];

  for (const event of events) {
    if (now >= event.start && now < event.end) {
      return true;
    }
  }

  return false;
}

module.exports = {
  parseScheduleForQueue,
  findNextEvent,
  getTodayEvents,
  getTomorrowEvents,
  isCurrentlyOff,
};
