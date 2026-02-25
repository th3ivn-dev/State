jest.mock('../../src/database/db', () => ({
  getSetting: jest.fn(),
  setSetting: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/database/users', () => ({
  getUserStats: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  child: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const { getSetting, setSetting } = require('../../src/database/db');
const usersDb = require('../../src/database/users');

const {
  GROWTH_STAGES,
  getCurrentStage,
  checkUserLimit,
  isRegistrationEnabled,
} = require('../../src/growthMetrics');

describe('GROWTH_STAGES', () => {
  test('has expected stage keys', () => {
    expect(GROWTH_STAGES).toHaveProperty('STAGE_0');
    expect(GROWTH_STAGES).toHaveProperty('STAGE_1');
    expect(GROWTH_STAGES).toHaveProperty('STAGE_2');
    expect(GROWTH_STAGES).toHaveProperty('STAGE_3');
    expect(GROWTH_STAGES).toHaveProperty('STAGE_4');
  });

  test('each stage has id, name, and maxUsers', () => {
    for (const stage of Object.values(GROWTH_STAGES)) {
      expect(stage).toHaveProperty('id');
      expect(stage).toHaveProperty('name');
      expect(stage).toHaveProperty('maxUsers');
      expect(typeof stage.id).toBe('number');
      expect(typeof stage.name).toBe('string');
    }
  });

  test('STAGE_4 has Infinity maxUsers', () => {
    expect(GROWTH_STAGES.STAGE_4.maxUsers).toBe(Infinity);
  });

  test('stages have sequential ids 0-4', () => {
    const ids = Object.values(GROWTH_STAGES).map(s => s.id).sort((a, b) => a - b);
    expect(ids).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('getCurrentStage', () => {
  test('returns a valid stage object', async () => {
    getSetting.mockResolvedValue('0');
    const stage = await getCurrentStage();

    expect(stage).toHaveProperty('id');
    expect(stage).toHaveProperty('name');
    expect(stage).toHaveProperty('maxUsers');
  });

  test('returns STAGE_0 when growth_stage setting is "0"', async () => {
    getSetting.mockResolvedValue('0');
    const stage = await getCurrentStage();
    expect(stage.id).toBe(0);
  });

  test('returns STAGE_2 when growth_stage setting is "2"', async () => {
    getSetting.mockResolvedValue('2');
    const stage = await getCurrentStage();
    expect(stage.id).toBe(2);
  });

  test('falls back to STAGE_0 for unknown stage id', async () => {
    getSetting.mockResolvedValue('99');
    const stage = await getCurrentStage();
    expect(stage).toBe(GROWTH_STAGES.STAGE_0);
  });
});

describe('checkUserLimit', () => {
  test('returns proper structure', async () => {
    getSetting.mockResolvedValue('0');
    usersDb.getUserStats.mockResolvedValue({ total: 10, active: 8, withChannels: 3 });

    const result = await checkUserLimit();

    expect(result).toHaveProperty('reached');
    expect(result).toHaveProperty('current');
    expect(result).toHaveProperty('max');
    expect(result).toHaveProperty('remaining');
    expect(result).toHaveProperty('percentage');
    expect(typeof result.reached).toBe('boolean');
  });

  test('reached is false when under limit', async () => {
    getSetting.mockResolvedValue('0'); // STAGE_0 maxUsers = 50
    usersDb.getUserStats.mockResolvedValue({ total: 10, active: 10, withChannels: 0 });

    const result = await checkUserLimit();

    expect(result.reached).toBe(false);
    expect(result.current).toBe(10);
    expect(result.remaining).toBe(40);
  });

  test('reached is true when at or over limit', async () => {
    getSetting.mockResolvedValue('0'); // STAGE_0 maxUsers = 50
    usersDb.getUserStats.mockResolvedValue({ total: 50, active: 50, withChannels: 0 });

    const result = await checkUserLimit();

    expect(result.reached).toBe(true);
    expect(result.remaining).toBe(0);
  });
});

describe('isRegistrationEnabled', () => {
  test('returns true when setting is "1"', async () => {
    getSetting.mockResolvedValue('1');
    const enabled = await isRegistrationEnabled();
    expect(enabled).toBe(true);
  });

  test('returns false when setting is "0"', async () => {
    getSetting.mockResolvedValue('0');
    const enabled = await isRegistrationEnabled();
    expect(enabled).toBe(false);
  });

  test('returns a boolean', async () => {
    getSetting.mockResolvedValue('1');
    const result = await isRegistrationEnabled();
    expect(typeof result).toBe('boolean');
  });
});
