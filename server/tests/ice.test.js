const request = require('supertest');

const app = require('../src/app');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./helpers/db');
const { createUser, bearer } = require('./helpers/users');

beforeAll(connectTestDB, 120000);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

describe('ICE servers endpoint', () => {
  it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/ice-servers');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns STUN configuration for authenticated users', async () => {
    const { token } = await createUser();

    const res = await request(app)
      .get('/api/ice-servers')
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.iceServers)).toBe(true);
    expect(res.body.iceServers.length).toBeGreaterThanOrEqual(1);
    expect(res.body.iceServers[0].urls).toContain('stun:');
  });
});
