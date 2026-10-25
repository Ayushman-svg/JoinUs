const request = require('supertest');
const express = require('express');

const app = require('../src/app');
const env = require('../src/config/env');
const { errorHandler } = require('../src/middleware/errorHandler');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./helpers/db');
const { createUser, bearer } = require('./helpers/users');

beforeAll(connectTestDB, 120000);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

describe('Security review & hardened error handling', () => {
  it('enforces minimum password length of 8 on registration with a clear message', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Short Password User',
        email: 'short-pass@example.com',
        password: 'short',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const passwordError = res.body.error.details.find((d) => d.field === 'password');
    expect(passwordError).toBeDefined();
    expect(passwordError.message).toContain('at least 8 characters');
  });

  it('never returns stack traces or internal details in error responses', async () => {
    // Test app with a route that throws an unexpected Error
    const testApp = express();
    testApp.get('/throw-unexpected', () => {
      throw new Error('Database password is super_secret_pass');
    });
    testApp.use(errorHandler);

    const res = await request(testApp).get('/throw-unexpected');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    // Stack trace must never be sent in the JSON body
    expect(res.body.error.stack).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('super_secret_pass');
  });

  it('hardens Metered TURN error logging so credentials and apiKey are never logged', async () => {
    const { token } = await createUser();
    env.meteredApp = 'testapp';
    env.meteredApiKey = 'secret_turn_api_key_xyz';

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const originalFetch = global.fetch;

    global.fetch = jest.fn().mockRejectedValue(
      new Error('fetch failed: https://testapp.metered.live/api/v1/turn/credentials?apiKey=secret_turn_api_key_xyz')
    );

    try {
      const res = await request(app)
        .get('/api/ice-servers')
        .set(bearer(token));

      expect(res.status).toBe(200);
      expect(warnSpy).toHaveBeenCalled();
      for (const call of warnSpy.mock.calls) {
        const loggedText = call.join(' ');
        expect(loggedText).not.toContain('secret_turn_api_key_xyz');
        expect(loggedText).not.toContain('https://');
      }
    } finally {
      warnSpy.mockRestore();
      global.fetch = originalFetch;
      env.meteredApp = '';
      env.meteredApiKey = '';
    }
  });
});
