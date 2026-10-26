/**
 * In-memory rate limiter for meeting passcode attempts:
 * 5 wrong attempts per user/IP and meeting per 10 minutes then RATE_LIMITED.
 */
class PasscodeLimiter {
  constructor({ maxAttempts = 5, windowMs = 10 * 60 * 1000 } = {}) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.attempts = new Map();
  }

  getKey(userIdOrIp, meetingCode) {
    const userPart = userIdOrIp || 'anonymous';
    const codePart = (meetingCode || '').toLowerCase().trim();
    return `${userPart}:${codePart}`;
  }

  isBlocked(userIdOrIp, meetingCode) {
    const key = this.getKey(userIdOrIp, meetingCode);
    const record = this.attempts.get(key);
    if (!record) return false;

    if (Date.now() > record.resetAt) {
      this.attempts.delete(key);
      return false;
    }

    return record.count >= this.maxAttempts;
  }

  recordFailure(userIdOrIp, meetingCode) {
    const key = this.getKey(userIdOrIp, meetingCode);
    const now = Date.now();
    let record = this.attempts.get(key);

    if (!record || now > record.resetAt) {
      record = { count: 1, resetAt: now + this.windowMs };
      this.attempts.set(key, record);
    } else {
      record.count += 1;
    }

    return record.count >= this.maxAttempts;
  }

  reset(userIdOrIp, meetingCode) {
    const key = this.getKey(userIdOrIp, meetingCode);
    this.attempts.delete(key);
  }

  clear() {
    this.attempts.clear();
  }
}

// Global singleton
const passcodeLimiter = new PasscodeLimiter();

module.exports = {
  PasscodeLimiter,
  passcodeLimiter,
};
