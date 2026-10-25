const request = require('supertest');
const app = require('../src/app');
const env = require('../src/config/env');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./helpers/db');
const { createUser } = require('./helpers/users');

beforeAll(connectTestDB, 120000);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

describe('REST rate limiting', () => {
  it('returns 429 with RATE_LIMITED code and Retry-After header when login attempts exceed limit', async () => {
    const { credentials } = await createUser({ email: 'rl-login@example.com' });
    const limit = env.rateLimitLoginMax; // default 10

    // Send up to limit attempts
    for (let i = 0; i < limit; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .set('x-test-rate-limit', '1')
        .send({ email: credentials.email, password: 'wrongpassword' });
      expect(res.status).toBe(401);
    }

    // Attempt limit + 1 should be rate limited
    const limited = await request(app)
      .post('/api/auth/login')
      .set('x-test-rate-limit', '1')
      .send({ email: credentials.email, password: 'wrongpassword' });

    expect(limited.status).toBe(429);
    expect(limited.body.error).toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('returns 429 with RATE_LIMITED code and Retry-After header when register attempts exceed limit', async () => {
    const limit = env.rateLimitRegisterMax; // default 5

    for (let i = 0; i < limit; i++) {
      const res = await request(app)
        .post('/api/auth/register')
        .set('x-test-rate-limit', '1')
        .send({
          name: `User ${i}`,
          email: `unique-${i}-${Date.now()}@example.com`,
          password: 'password123',
        });
      expect(res.status).toBe(201);
    }

    // Exceeding limit
    const limited = await request(app)
      .post('/api/auth/register')
      .set('x-test-rate-limit', '1')
      .send({
        name: 'Blocked User',
        email: `blocked-${Date.now()}@example.com`,
        password: 'password123',
      });

    expect(limited.status).toBe(429);
    expect(limited.body.error).toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(limited.headers['retry-after']).toBeDefined();
  });
});
