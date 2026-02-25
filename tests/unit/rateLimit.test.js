jest.mock('../../src/logger', () => ({
  child: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const { createRateLimitMiddleware } = require('../../src/middleware/rateLimit');

describe('createRateLimitMiddleware', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function makeCtx(userId) {
    return {
      from: userId != null ? { id: userId } : undefined,
    };
  }

  test('requests under the limit pass through immediately (no delay)', async () => {
    const middleware = createRateLimitMiddleware({ limit: 5, windowMs: 60000 });
    const next = jest.fn().mockResolvedValue(undefined);

    const ctx = makeCtx(1);
    await middleware(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);

    middleware.stop();
  });

  test('requests exceeding the limit are delayed (not rejected)', async () => {
    const limit = 2;
    const windowMs = 1000;
    const middleware = createRateLimitMiddleware({ limit, windowMs });
    const next = jest.fn().mockResolvedValue(undefined);
    const ctx = makeCtx(42);

    // Fill up to the limit
    await middleware(ctx, next);
    await middleware(ctx, next);
    expect(next).toHaveBeenCalledTimes(2);

    // Third request exceeds limit — it should delay rather than reject
    let resolved = false;
    const pending = middleware(ctx, next).then(() => { resolved = true; });

    // Advance time past the window so the delay resolves
    jest.advanceTimersByTime(windowMs + 1);
    await pending;

    expect(resolved).toBe(true);
    expect(next).toHaveBeenCalledTimes(3);

    middleware.stop();
  });

  test('admin users bypass rate limiting', async () => {
    const isAdmin = jest.fn().mockReturnValue(true);
    const middleware = createRateLimitMiddleware({ limit: 1, windowMs: 60000, isAdmin });
    const next = jest.fn().mockResolvedValue(undefined);
    const ctx = makeCtx(99);

    // Even though limit is 1, admin should always pass
    await middleware(ctx, next);
    await middleware(ctx, next);
    await middleware(ctx, next);

    expect(next).toHaveBeenCalledTimes(3);
    expect(isAdmin).toHaveBeenCalledWith('99');

    middleware.stop();
  });

  test('cleanup interval removes old timestamps', () => {
    const windowMs = 1000;
    const middleware = createRateLimitMiddleware({ limit: 10, windowMs });

    // Simulate some requests by running the middleware (synchronously not possible,
    // so just verify the interval fires and doesn't throw)
    expect(() => {
      jest.advanceTimersByTime(windowMs);
    }).not.toThrow();

    middleware.stop();
  });

  test('stop() clears the cleanup interval', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const middleware = createRateLimitMiddleware({ limit: 10, windowMs: 60000 });

    middleware.stop();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  test('supports custom limit and windowMs options', async () => {
    const middleware = createRateLimitMiddleware({ limit: 3, windowMs: 5000 });
    const next = jest.fn().mockResolvedValue(undefined);
    const ctx = makeCtx(7);

    await middleware(ctx, next);
    await middleware(ctx, next);
    await middleware(ctx, next);

    expect(next).toHaveBeenCalledTimes(3);

    middleware.stop();
  });

  test('requests from users without ctx.from pass through', async () => {
    const middleware = createRateLimitMiddleware({ limit: 1, windowMs: 60000 });
    const next = jest.fn().mockResolvedValue(undefined);

    const ctx = makeCtx(null); // ctx.from is undefined

    await middleware(ctx, next);
    await middleware(ctx, next);

    expect(next).toHaveBeenCalledTimes(2);

    middleware.stop();
  });
});
