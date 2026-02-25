const {
  REGIONS,
  REGION_CODES,
  QUEUES,
  KYIV_QUEUES,
  REGION_QUEUES,
  getQueuesForRegion,
} = require('../../src/constants/regions');

describe('REGIONS', () => {
  test('has expected region keys', () => {
    expect(REGIONS).toHaveProperty('kyiv');
    expect(REGIONS).toHaveProperty('kyiv-region');
    expect(REGIONS).toHaveProperty('odesa');
    expect(REGIONS).toHaveProperty('dnipro');
  });

  test('each region has required fields: name and code', () => {
    for (const [key, region] of Object.entries(REGIONS)) {
      expect(region).toHaveProperty('name');
      expect(region).toHaveProperty('code');
      expect(typeof region.name).toBe('string');
      expect(typeof region.code).toBe('string');
      expect(region.name).not.toBe('');
      expect(region.code).not.toBe('');
      expect(region.code).toBe(key);
    }
  });

  test('no region has empty name or code', () => {
    for (const region of Object.values(REGIONS)) {
      expect(region.name.trim()).not.toBe('');
      expect(region.code.trim()).not.toBe('');
    }
  });
});

describe('REGION_CODES', () => {
  test('contains all region keys', () => {
    expect(REGION_CODES).toEqual(expect.arrayContaining(Object.keys(REGIONS)));
    expect(REGION_CODES.length).toBe(Object.keys(REGIONS).length);
  });
});

describe('QUEUES', () => {
  test('is a non-empty array', () => {
    expect(Array.isArray(QUEUES)).toBe(true);
    expect(QUEUES.length).toBeGreaterThan(0);
  });

  test('each queue matches N.M format', () => {
    for (const queue of QUEUES) {
      expect(queue).toMatch(/^\d+\.\d+$/);
    }
  });

  test('contains standard queues 1.1 through 6.2', () => {
    expect(QUEUES).toContain('1.1');
    expect(QUEUES).toContain('1.2');
    expect(QUEUES).toContain('6.1');
    expect(QUEUES).toContain('6.2');
  });
});

describe('KYIV_QUEUES', () => {
  test('has more queues than the standard QUEUES list', () => {
    expect(KYIV_QUEUES.length).toBeGreaterThan(QUEUES.length);
  });

  test('contains standard queues plus additional Kyiv-specific queues', () => {
    expect(KYIV_QUEUES).toContain('1.1');
    expect(KYIV_QUEUES).toContain('7.1');
    expect(KYIV_QUEUES).toContain('60.1');
  });
});

describe('REGION_QUEUES', () => {
  test('kyiv maps to KYIV_QUEUES', () => {
    expect(REGION_QUEUES['kyiv']).toBe(KYIV_QUEUES);
  });

  test('other regions map to standard QUEUES', () => {
    expect(REGION_QUEUES['kyiv-region']).toBe(QUEUES);
    expect(REGION_QUEUES['dnipro']).toBe(QUEUES);
    expect(REGION_QUEUES['odesa']).toBe(QUEUES);
  });
});

describe('getQueuesForRegion', () => {
  test('returns KYIV_QUEUES for kyiv', () => {
    expect(getQueuesForRegion('kyiv')).toBe(KYIV_QUEUES);
  });

  test('returns QUEUES for other known regions', () => {
    expect(getQueuesForRegion('odesa')).toBe(QUEUES);
    expect(getQueuesForRegion('dnipro')).toBe(QUEUES);
    expect(getQueuesForRegion('kyiv-region')).toBe(QUEUES);
  });

  test('returns QUEUES for unknown regions', () => {
    expect(getQueuesForRegion('unknown-region')).toBe(QUEUES);
  });
});
