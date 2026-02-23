const {
  formatNextEventMessage,
  formatTimerMessage,
  formatWelcomeMessage,
  formatHelpMessage,
  formatScheduleChanges,
  formatTemplate,
  getCurrentDateTimeForTemplate,
  formatErrorMessage,
  formatStatsForChannelPopup,
} = require('../../src/formatter');

describe('formatNextEventMessage', () => {
  test('returns no-outage message when nextEvent is null', () => {
    expect(formatNextEventMessage(null)).toBe('✅ Наступні відключення не заплановані');
  });

  test('formats power_off event', () => {
    const event = {
      type: 'power_off',
      minutes: 30,
      time: new Date(2024, 0, 15, 14, 0),
      isPossible: false,
    };
    const msg = formatNextEventMessage(event);
    expect(msg).toContain('Наступне відключення');
    expect(msg).toContain('30 хв');
    expect(msg).toContain('14:00');
  });

  test('formats power_on event', () => {
    const event = {
      type: 'power_on',
      minutes: 60,
      time: new Date(2024, 0, 15, 15, 0),
      isPossible: false,
    };
    const msg = formatNextEventMessage(event);
    expect(msg).toContain('Наступне включення');
    expect(msg).toContain('1 год');
  });

  test('adds possible warning for isPossible events', () => {
    const event = {
      type: 'power_off',
      minutes: 10,
      time: new Date(2024, 0, 15, 13, 0),
      isPossible: true,
    };
    const msg = formatNextEventMessage(event);
    expect(msg).toContain('Можливе відключення');
  });
});

describe('formatTimerMessage', () => {
  test('returns no-outage message when null', () => {
    expect(formatTimerMessage(null)).toBe('✅ Наступні відключення не заплановані');
  });

  test('formats power_off timer', () => {
    const event = {
      type: 'power_off',
      minutes: 45,
      time: new Date(2024, 0, 15, 12, 30),
    };
    const msg = formatTimerMessage(event);
    expect(msg).toContain('Відключення через');
    expect(msg).toContain('45 хв');
    expect(msg).toContain('12:30');
  });

  test('formats power_on timer', () => {
    const event = {
      type: 'power_on',
      minutes: 20,
      time: new Date(2024, 0, 15, 16, 0),
    };
    const msg = formatTimerMessage(event);
    expect(msg).toContain('Включення через');
    expect(msg).toContain('20 хв');
  });
});

describe('formatWelcomeMessage', () => {
  test('includes username when provided', () => {
    const msg = formatWelcomeMessage('Іван');
    expect(msg).toContain('Іван');
    expect(msg).toContain('СвітлоБот');
  });

  test('works without username', () => {
    const msg = formatWelcomeMessage(null);
    expect(msg).toContain('СвітлоБот');
  });

  test('escapes HTML in username', () => {
    const msg = formatWelcomeMessage('<script>');
    expect(msg).not.toContain('<script>');
    expect(msg).toContain('&lt;script&gt;');
  });
});

describe('formatHelpMessage', () => {
  test('contains help header', () => {
    const msg = formatHelpMessage();
    expect(msg).toContain('Довідка');
  });

  test('mentions schedule and status commands', () => {
    const msg = formatHelpMessage();
    expect(msg).toContain('Графік');
    expect(msg).toContain('Статус');
  });
});

describe('formatScheduleChanges', () => {
  test('returns "Немає змін" for empty changes', () => {
    expect(formatScheduleChanges({ added: [], removed: [], modified: [] })).toBe('Немає змін');
  });

  test('returns "Немає змін" for null', () => {
    expect(formatScheduleChanges(null)).toBe('Немає змін');
  });

  test('formats added events', () => {
    const changes = {
      added: [{ start: new Date(2024, 0, 15, 10, 0), end: new Date(2024, 0, 15, 11, 0) }],
      removed: [],
      modified: [],
    };
    const msg = formatScheduleChanges(changes);
    expect(msg).toContain('➕');
    expect(msg).toContain('10:00');
  });

  test('formats removed events', () => {
    const changes = {
      added: [],
      removed: [{ start: new Date(2024, 0, 15, 8, 0), end: new Date(2024, 0, 15, 9, 0) }],
      modified: [],
    };
    const msg = formatScheduleChanges(changes);
    expect(msg).toContain('➖');
    expect(msg).toContain('08:00');
  });
});

describe('formatTemplate', () => {
  test('replaces placeholders with values', () => {
    const result = formatTemplate('Hello {name}!', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  test('replaces multiple placeholders', () => {
    const result = formatTemplate('{a} + {b} = {c}', { a: '1', b: '2', c: '3' });
    expect(result).toBe('1 + 2 = 3');
  });

  test('replaces <br> with newline', () => {
    const result = formatTemplate('line1<br>line2');
    expect(result).toBe('line1\nline2');
  });

  test('returns empty string for null template', () => {
    expect(formatTemplate(null)).toBe('');
  });

  test('returns template unchanged when no variables', () => {
    expect(formatTemplate('no vars here')).toBe('no vars here');
  });

  test('handles null values in variables gracefully', () => {
    const result = formatTemplate('value={x}', { x: null });
    expect(result).toBe('value=');
  });
});

describe('getCurrentDateTimeForTemplate', () => {
  test('returns timeStr and dateStr', () => {
    const result = getCurrentDateTimeForTemplate();
    expect(result).toHaveProperty('timeStr');
    expect(result).toHaveProperty('dateStr');
    expect(result.timeStr).toMatch(/^\d{2}:\d{2}$/);
    expect(result.dateStr).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });
});

describe('formatErrorMessage', () => {
  test('returns non-empty error message', () => {
    const msg = formatErrorMessage();
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toContain('😅');
  });
});

describe('formatStatsForChannelPopup', () => {
  test('returns no-outage message when count is 0', () => {
    const msg = formatStatsForChannelPopup({ count: 0 });
    expect(msg).toContain('Відключень не було');
  });

  test('formats stats with count and durations', () => {
    const stats = {
      count: 3,
      totalMinutes: 180,
      avgMinutes: 60,
      longest: {
        duration_minutes: 90,
        start_time: new Date(2024, 0, 10, 10, 0).toISOString(),
        end_time: new Date(2024, 0, 10, 11, 30).toISOString(),
      },
      shortest: {
        duration_minutes: 30,
        start_time: new Date(2024, 0, 12, 14, 0).toISOString(),
        end_time: new Date(2024, 0, 12, 14, 30).toISOString(),
      },
    };
    const msg = formatStatsForChannelPopup(stats);
    expect(msg).toContain('Відключень: 3');
    expect(msg).toContain('3 год');
  });
});
