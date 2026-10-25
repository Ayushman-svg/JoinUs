const rateLimit = require('express-rate-limit');
const env = require('../config/env');

function createRateLimitHandler(defaultMessage) {
  return (req, res, next, options) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: options.message || defaultMessage,
      },
    });
  };
}

// In test environment, skip rate limiting unless explicitly enabled via x-test-rate-limit header
const shouldSkip = (req) => env.isTest && req.headers['x-test-rate-limit'] !== '1';

// General /api limiter: 300 requests per 15 min per IP by default
const apiLimiter = rateLimit({
  windowMs: env.rateLimitApiWindowMs,
  limit: env.rateLimitApiMax,
  standardHeaders: true,
  legacyHeaders: true,
  skip: shouldSkip,
  validate: { keyGeneratorIpFallback: false },
  message: 'Too many requests from this IP, please try again later',
  handler: createRateLimitHandler('Too many requests, please try again later'),
});

// Register: 5 requests per hour per IP by default
const registerLimiter = rateLimit({
  windowMs: env.rateLimitRegisterWindowMs,
  limit: env.rateLimitRegisterMax,
  standardHeaders: true,
  legacyHeaders: true,
  skip: shouldSkip,
  validate: { keyGeneratorIpFallback: false },
  message: 'Too many accounts created from this IP, please try again later',
  handler: createRateLimitHandler('Too many registration attempts, please try again in an hour'),
});

// Login: 10 attempts per 15 min per IP and email
const loginLimiter = rateLimit({
  windowMs: env.rateLimitLoginWindowMs,
  limit: env.rateLimitLoginMax,
  standardHeaders: true,
  legacyHeaders: true,
  skip: shouldSkip,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const email =
      typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return `${req.ip}_${email}`;
  },
  message: 'Too many login attempts, please try again in 15 minutes',
  handler: createRateLimitHandler('Too many login attempts, please try again later'),
});

module.exports = {
  apiLimiter,
  registerLimiter,
  loginLimiter,
};
