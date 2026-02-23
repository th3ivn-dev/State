const {
  formatTime,
  formatDate,
  formatDateTime,
  getMinutesDifference,
  formatTimeRemaining,
  isAdmin,
  escapeHtml,
  formatUptime,
  formatDuration,
  formatDurationFromMs,
  formatExactDuration,
  formatInterval,
  formatMemory,
} = require('../../src/utils');

describe('formatTime', () => {
  test('formats a date to HH:MM', () => {
    const date = new Date(2024, 0, 15, 9, 5); // 09:05
    expect(formatTime(date)).toBe('09:05');
  });

  test('returns "невідомо" for null', () => {
    expect(formatTime(null)).toBe('невідомо');
  });

  test('returns "невідомо" for undefined', () => {
    expect(formatTime(undefined)).toBe('невідомо');
  });
});

describe('formatDate', () => {
  test('formats date as DD.MM.YYYY', () => {
    const date = new Date(2024, 0, 5); // Jan 5, 2024
    expect(formatDate(date)).toBe('05.01.2024');
  });

  test('returns "невідомо" for null', () => {
    expect(formatDate(null)).toBe('невідомо');
  });
});

describe('formatDateTime', () => {
  test('combines date and time', () => {
    const date = new Date(2024, 0, 15, 9, 5);
    expect(formatDateTime(date)).toBe(`${formatDate(date)} ${formatTime(date)}`);
  });

  test('returns "невідомо" for null', () => {
    expect(formatDateTime(null)).toBe('невідомо');
  });
});

describe('getMinutesDifference', () => {
  test('returns positive minutes when date1 is after date2', () => {
    const d1 = new Date(2024, 0, 1, 10, 30);
    const d2 = new Date(2024, 0, 1, 10, 0);
    expect(getMinutesDifference(d1, d2)).toBe(30);
  });

  test('returns negative minutes when date1 is before date2', () => {
    const d1 = new Date(2024, 0, 1, 9, 0);
    const d2 = new Date(2024, 0, 1, 10, 0);
    expect(getMinutesDifference(d1, d2)).toBe(-60);
  });

  test('returns 0 for identical dates', () => {
    const d = new Date(2024, 0, 1, 12, 0);
    expect(getMinutesDifference(d, d)).toBe(0);
  });
});

describe('formatTimeRemaining', () => {
  test('returns "минуло" for negative', () => {
    expect(formatTimeRemaining(-1)).toBe('минуло');
  });

  test('returns "зараз" for zero', () => {
    expect(formatTimeRemaining(0)).toBe('зараз');
  });

  test('formats minutes only', () => {
    expect(formatTimeRemaining(45)).toBe('45 хв');
  });

  test('formats hours only', () => {
    expect(formatTimeRemaining(120)).toBe('2 год');
  });

  test('formats hours and minutes', () => {
    expect(formatTimeRemaining(90)).toBe('1 год 30 хв');
  });
});

describe('isAdmin', () => {
  test('returns true if userId is in adminIds', () => {
    expect(isAdmin('123', ['123', '456'])).toBe(true);
  });

  test('returns false if userId not in adminIds', () => {
    expect(isAdmin('999', ['123', '456'])).toBe(false);
  });

  test('returns true if userId matches ownerId', () => {
    expect(isAdmin('789', [], '789')).toBe(true);
  });

  test('works with numeric userId coerced to string', () => {
    expect(isAdmin(123, ['123'])).toBe(true);
  });
});

describe('escapeHtml', () => {
  test('escapes & < > characters', () => {
    expect(escapeHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  test('escapes quotes', () => {
    expect(escapeHtml('"hello" \'world\'')).toBe('&quot;hello&quot; &#039;world&#039;');
  });

  test('returns empty string for falsy input', () => {
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml(null)).toBe('');
  });
});

describe('formatUptime', () => {
  test('formats seconds under a minute', () => {
    expect(formatUptime(30)).toBe('< 1 хв');
  });

  test('formats minutes', () => {
    expect(formatUptime(150)).toBe('2 хв');
  });

  test('formats hours and minutes', () => {
    expect(formatUptime(3661)).toBe('1 год 1 хв');
  });

  test('formats days hours minutes', () => {
    expect(formatUptime(90061)).toBe('1 д 1 год 1 хв');
  });
});

describe('formatDuration', () => {
  test('returns "< 1 хв" for less than 60 seconds', () => {
    expect(formatDuration(59)).toBe('< 1 хв');
  });

  test('returns minutes for 1-59 minutes', () => {
    expect(formatDuration(120)).toBe('2 хв');
  });

  test('returns hours for exactly 1 hour', () => {
    expect(formatDuration(3600)).toBe('1 год');
  });

  test('returns hours and minutes', () => {
    expect(formatDuration(3660)).toBe('1 год 1 хв');
  });

  test('returns days for 1+ days', () => {
    expect(formatDuration(86400)).toBe('1 день');
  });
});

describe('formatDurationFromMs', () => {
  test('returns хв for < 1 hour', () => {
    expect(formatDurationFromMs(30 * 60 * 1000)).toBe('30 хв');
  });

  test('returns whole hours without decimal', () => {
    expect(formatDurationFromMs(2 * 3600 * 1000)).toBe('2 год');
  });

  test('returns decimal hours for non-whole', () => {
    expect(formatDurationFromMs(1.5 * 3600 * 1000)).toBe('1.5 год');
  });
});

describe('formatExactDuration', () => {
  test('returns "менше хвилини" for 0 minutes', () => {
    expect(formatExactDuration(0)).toBe('менше хвилини');
  });

  test('formats minutes only', () => {
    expect(formatExactDuration(45)).toBe('45 хв');
  });

  test('formats hours only', () => {
    expect(formatExactDuration(120)).toBe('2 год');
  });

  test('formats hours and minutes', () => {
    expect(formatExactDuration(90)).toBe('1 год 30 хв');
  });
});

describe('formatInterval', () => {
  test('returns seconds for < 60', () => {
    expect(formatInterval(30)).toBe('30 сек');
  });

  test('returns whole minutes for divisible value', () => {
    expect(formatInterval(120)).toBe('2 хв');
  });

  test('returns seconds when minutes is not integer', () => {
    expect(formatInterval(90)).toBe('90 сек');
  });
});

describe('formatMemory', () => {
  test('converts bytes to MB with 2 decimal places', () => {
    expect(formatMemory(1048576)).toBe('1.00 MB');
  });

  test('handles fractional MB', () => {
    expect(formatMemory(512 * 1024)).toBe('0.50 MB');
  });
});
