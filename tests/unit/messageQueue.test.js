jest.mock('../../src/logger', () => ({
  child: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
  }),
}));

jest.mock('../../src/utils/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
  }),
}));

// Import the class so we can create isolated instances per test
const { MessageQueue } = (() => {
  // Re-export the class by accessing it through the module internals
  const mq = require('../../src/utils/messageQueue');
  // The module exports a singleton; reconstruct the class for isolated testing
  return { MessageQueue: mq.constructor };
})();

// Use the singleton but reset between tests
const messageQueue = require('../../src/utils/messageQueue');

describe('messageQueue', () => {
  let mockBot;

  beforeEach(() => {
    // Reset singleton state
    messageQueue.bot = null;
    messageQueue.queue = [];
    messageQueue.processing = false;
    messageQueue.draining = false;
    messageQueue.metrics = { sent: 0, retries: 0, failures: 0 };

    mockBot = {
      api: {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
      },
    };
  });

  test('init() stores bot reference', () => {
    messageQueue.init(mockBot);
    expect(messageQueue.bot).toBe(mockBot);
  });

  test('getMetrics() returns proper structure with pending, sent, failed counts', () => {
    messageQueue.init(mockBot);
    messageQueue.metrics.sent = 5;
    messageQueue.metrics.failures = 2;

    const metrics = messageQueue.getMetrics();

    expect(metrics).toHaveProperty('sent', 5);
    expect(metrics).toHaveProperty('failures', 2);
    expect(metrics).toHaveProperty('queueSize');
    expect(metrics).toHaveProperty('processing');
    expect(typeof metrics.queueSize).toBe('number');
    expect(typeof metrics.processing).toBe('boolean');
  });

  test('getMetrics() queueSize reflects queue length', () => {
    messageQueue.init(mockBot);
    expect(messageQueue.getMetrics().queueSize).toBe(0);
  });

  test('drain() resolves when queue is empty', async () => {
    messageQueue.init(mockBot);
    // Queue is empty and not processing — drain should resolve immediately
    await expect(messageQueue.drain(500)).resolves.toBeUndefined();
  });

  test('sendMessage() calls bot.api.sendMessage with correct args', async () => {
    messageQueue.init(mockBot);

    const result = await messageQueue.sendMessage(123, 'Привіт!', { parse_mode: 'HTML' });

    expect(mockBot.api.sendMessage).toHaveBeenCalledWith(123, 'Привіт!', { parse_mode: 'HTML' });
    expect(result).toEqual({ message_id: 1 });
  });

  test('enqueue() rejects when bot is not initialized', async () => {
    // bot is null (not initialized)
    await expect(messageQueue.enqueue('sendMessage', [123, 'test'])).rejects.toThrow(
      'Message queue not initialized'
    );
  });
});
