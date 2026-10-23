const RateLimiter = require('../src/sockets/rateLimit');

describe('RateLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new RateLimiter({ max: 5, windowMs: 5000 });
  });

  it('allows up to 5 messages within 5 seconds', () => {
    const key = 'socket-1';
    const baseTime = 1000000;

    for (let i = 0; i < 5; i++) {
      expect(limiter.check(key, baseTime + i * 100)).toBe(true);
    }
  });

  it('rejects the 6th message within 5 seconds', () => {
    const key = 'socket-1';
    const baseTime = 1000000;

    for (let i = 0; i < 5; i++) {
      limiter.check(key, baseTime + i * 100);
    }

    expect(limiter.check(key, baseTime + 600)).toBe(false);
  });

  it('allows a message once older messages fall outside the 5s window', () => {
    const key = 'socket-1';
    const baseTime = 1000000;

    // Send 5 messages at t = 1000s, 1001s, 1002s, 1003s, 1004s
    for (let i = 0; i < 5; i++) {
      limiter.check(key, baseTime + i * 1000);
    }

    // 6th message at 1004.5s is rejected
    expect(limiter.check(key, baseTime + 4500)).toBe(false);

    // At 1005.1s, the first message at 1000s has expired (window is 5000ms: cutoff is 1000.1s)
    expect(limiter.check(key, baseTime + 5100)).toBe(true);
  });

  it('tracks rate limits independently for different sockets', () => {
    const key1 = 'socket-1';
    const key2 = 'socket-2';
    const baseTime = 1000000;

    for (let i = 0; i < 5; i++) {
      limiter.check(key1, baseTime + i * 100);
    }

    expect(limiter.check(key1, baseTime + 600)).toBe(false);
    expect(limiter.check(key2, baseTime + 600)).toBe(true);
  });

  it('resets rate limits for a specific key', () => {
    const key1 = 'socket-1';
    const key2 = 'socket-2';
    const baseTime = 1000000;

    for (let i = 0; i < 5; i++) {
      limiter.check(key1, baseTime);
      limiter.check(key2, baseTime);
    }

    expect(limiter.check(key1, baseTime)).toBe(false);
    expect(limiter.check(key2, baseTime)).toBe(false);

    limiter.reset(key1);
    expect(limiter.check(key1, baseTime)).toBe(true);
    expect(limiter.check(key2, baseTime)).toBe(false);
  });

  it('resets all rate limits when no key is specified', () => {
    const key1 = 'socket-1';
    const key2 = 'socket-2';
    const baseTime = 1000000;

    for (let i = 0; i < 5; i++) {
      limiter.check(key1, baseTime);
      limiter.check(key2, baseTime);
    }

    limiter.reset();
    expect(limiter.check(key1, baseTime)).toBe(true);
    expect(limiter.check(key2, baseTime)).toBe(true);
  });

  it('returns false if key is missing or empty', () => {
    expect(limiter.check('')).toBe(false);
    expect(limiter.check(null)).toBe(false);
    expect(limiter.check(undefined)).toBe(false);
  });
});
