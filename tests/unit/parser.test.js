const {
  parseScheduleForQueue,
  getTodayEvents,
  getTomorrowEvents,
  isCurrentlyOff,
} = require('../../src/parser');

// Helper to build minimal valid API data for a queue
function buildData(queueKey, todayTs, todaySchedule, tomorrowTs = null, tomorrowSchedule = null) {
  const factData = {
    [todayTs]: { [queueKey]: todaySchedule },
  };
  if (tomorrowTs && tomorrowSchedule) {
    factData[tomorrowTs] = { [queueKey]: tomorrowSchedule };
  }
  return { fact: { today: todayTs, data: factData } };
}

// A fixed base timestamp (midnight 2024-01-15 UTC)
const BASE_TS = 1705276800;

describe('parseScheduleForQueue', () => {
  test('returns hasData:false for null data', () => {
    const result = parseScheduleForQueue(null, '1.1');
    expect(result.hasData).toBe(false);
    expect(result.events).toEqual([]);
  });

  test('returns hasData:false for missing queue', () => {
    const result = parseScheduleForQueue({}, null);
    expect(result.hasData).toBe(false);
  });

  test('returns hasData:false when data.fact is absent', () => {
    const result = parseScheduleForQueue({ foo: 'bar' }, '1.1');
    expect(result.hasData).toBe(false);
  });

  test('returns hasData:false when queue key not found in data', () => {
    const data = buildData('GPV1.1', BASE_TS, { 2: 'no', 3: 'no' });
    const result = parseScheduleForQueue(data, '2.2');
    expect(result.hasData).toBe(false);
  });

  test('parses a single planned outage hour correctly', () => {
    // hour=2 with value='no' → period 01:00-02:00
    const data = buildData('GPV1.1', BASE_TS, { 2: 'no' });
    const result = parseScheduleForQueue(data, '1.1');
    expect(result.hasData).toBe(true);
    expect(result.events.length).toBe(1);
    expect(result.events[0].isPossible).toBe(false);
  });

  test('parses a possible outage (maybe) correctly', () => {
    const data = buildData('GPV1.1', BASE_TS, { 5: 'maybe' });
    const result = parseScheduleForQueue(data, '1.1');
    expect(result.hasData).toBe(true);
    expect(result.events[0].isPossible).toBe(true);
  });

  test('merges consecutive planned hours into one event', () => {
    // hours 2, 3, 4 are all 'no' → should merge into single period 01:00-04:00
    const data = buildData('GPV1.1', BASE_TS, { 2: 'no', 3: 'no', 4: 'no' });
    const result = parseScheduleForQueue(data, '1.1');
    expect(result.events.length).toBe(1);
  });

  test('includes tomorrow events when provided', () => {
    const tomorrowTs = BASE_TS + 86400;
    const data = buildData('GPV1.1', BASE_TS, { 3: 'no' }, tomorrowTs, { 5: 'no' });
    const result = parseScheduleForQueue(data, '1.1');
    expect(result.events.length).toBe(2);
  });

  test('returns correct queue and queueKey in result', () => {
    const data = buildData('GPV2.1', BASE_TS, { 10: 'no' });
    const result = parseScheduleForQueue(data, '2.1');
    expect(result.queue).toBe('2.1');
    expect(result.queueKey).toBe('GPV2.1');
  });

  test('handles first/second half-hour values', () => {
    const data = buildData('GPV1.1', BASE_TS, { 8: 'first', 9: 'second' });
    const result = parseScheduleForQueue(data, '1.1');
    // first half of hour 8 → 07:00-07:30, second half of hour 9 → 08:30-09:00
    expect(result.events.length).toBe(2);
  });
});

describe('isCurrentlyOff', () => {
  test('returns false for empty events', () => {
    expect(isCurrentlyOff({ events: [] })).toBe(false);
  });

  test('returns false when all events are in the future', () => {
    const future = new Date(Date.now() + 3600000);
    const future2 = new Date(Date.now() + 7200000);
    expect(isCurrentlyOff({ events: [{ start: future, end: future2 }] })).toBe(false);
  });

  test('returns true when now falls within an event', () => {
    const past = new Date(Date.now() - 3600000);
    const future = new Date(Date.now() + 3600000);
    expect(isCurrentlyOff({ events: [{ start: past, end: future }] })).toBe(true);
  });
});

describe('getTodayEvents', () => {
  test('returns empty array for no events', () => {
    expect(getTodayEvents({ events: [] })).toEqual([]);
  });

  test('filters out events from other days', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 2);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(yesterdayEnd.getHours() + 1);
    expect(getTodayEvents({ events: [{ start: yesterday, end: yesterdayEnd }] })).toEqual([]);
  });
});

describe('getTomorrowEvents', () => {
  test('returns empty array for no events', () => {
    expect(getTomorrowEvents({ events: [] })).toEqual([]);
  });

  test('returns tomorrow events', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(11, 0, 0, 0);
    const result = getTomorrowEvents({ events: [{ start: tomorrow, end: tomorrowEnd }] });
    expect(result.length).toBe(1);
  });
});
