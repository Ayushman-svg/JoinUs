/**
 * Pure in-memory sliding-window rate limiter.
 * Limits keys (e.g. socket IDs) to at most `max` actions within `windowMs`.
 */
class RateLimiter {
  constructor({ max = 5, windowMs = 5000 } = {}) {
    this.max = max;
    this.windowMs = windowMs;
    this.history = new Map();
  }

  /**
   * Returns true if allowed, false if rate limited.
   * Records the timestamp on success.
   */
  check(key, now = Date.now()) {
    if (!key) return false;
    const cutoff = now - this.windowMs;
    const timestamps = this.history.get(key);

    if (!timestamps) {
      this.history.set(key, [now]);
      return true;
    }

    const recent = timestamps.filter((t) => t > cutoff);
    if (recent.length >= this.max) {
      this.history.set(key, recent);
      return false;
    }

    recent.push(now);
    this.history.set(key, recent);
    return true;
  }

  /**
   * Resets rate limit tracking for a key, or all keys if none specified.
   */
  reset(key) {
    if (key !== undefined) {
      this.history.delete(key);
    } else {
      this.history.clear();
    }
  }
}

module.exports = RateLimiter;
