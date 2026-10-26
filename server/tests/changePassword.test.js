const request = require('supertest');

const app = require('../src/app');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./helpers/db');
const { createUser, bearer } = require('./helpers/users');

beforeAll(connectTestDB, 120000);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

describe('FEATURE_SETTINGS: Change Password (POST /api/auth/change-password)', () => {
  it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({
        currentPassword: 'password123',
        newPassword: 'newSecretPassword1',
      });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects incorrect current password with 400 INVALID_CURRENT_PASSWORD', async () => {
    const { token } = await createUser({ password: 'password123' });

    const res = await request(app)
      .post('/api/auth/change-password')
      .set(bearer(token))
      .send({
        currentPassword: 'wrongCurrentPassword',
        newPassword: 'newSecretPassword1',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    expect(res.body.error.message).toMatch(/incorrect/i);
  });

  it('rejects new password under 8 characters with 400 VALIDATION_ERROR', async () => {
    const { token } = await createUser({ password: 'password123' });

    const res = await request(app)
      .post('/api/auth/change-password')
      .set(bearer(token))
      .send({
        currentPassword: 'password123',
        newPassword: 'short',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'newPassword' }),
      ])
    );
  });

  it('successfully updates password and enables logging in with the new password', async () => {
    const { token, credentials } = await createUser({
      email: 'change.me@example.com',
      password: 'initialPassword1',
    });

    const res = await request(app)
      .post('/api/auth/change-password')
      .set(bearer(token))
      .send({
        currentPassword: 'initialPassword1',
        newPassword: 'brandNewPassword2026',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, message: 'Password updated successfully' });

    // Login with old password fails
    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: credentials.email,
        password: 'initialPassword1',
      });
    expect(oldLogin.status).toBe(401);

    // Login with new password succeeds
    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: credentials.email,
        password: 'brandNewPassword2026',
      });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.token).toEqual(expect.any(String));
  });

  it('enforces rate limiting on repeated change-password attempts', async () => {
    const { token } = await createUser({ password: 'password123' });

    // Make 5 attempts
    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post('/api/auth/change-password')
        .set(bearer(token))
        .set('x-test-rate-limit', '1')
        .send({
          currentPassword: 'wrongPassword',
          newPassword: 'newSecretPassword1',
        });
    }

    // 6th attempt should be blocked by rate limiter
    const blocked = await request(app)
      .post('/api/auth/change-password')
      .set(bearer(token))
      .set('x-test-rate-limit', '1')
      .send({
        currentPassword: 'wrongPassword',
        newPassword: 'newSecretPassword1',
      });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});
