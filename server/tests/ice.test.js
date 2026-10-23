const request = require('supertest');

const app = require('../src/app');
const env = require('../src/config/env');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./helpers/db');
const { createUser, bearer } = require('./helpers/users');

beforeAll(connectTestDB, 120000);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

describe('ICE servers endpoint', () => {
  const originalFetch = global.fetch;
  const originalMeteredApp = env.meteredApp;
  const originalMeteredApiKey = env.meteredApiKey;

  afterEach(() => {
    global.fetch = originalFetch;
    env.meteredApp = originalMeteredApp;
    env.meteredApiKey = originalMeteredApiKey;
  });

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

  it('fetches TURN credentials from Metered API when configured', async () => {
    const { token } = await createUser();
    env.meteredApp = 'testapp';
    env.meteredApiKey = 'secret_key_123';

    const mockMeteredServers = [
      { urls: 'stun:stun.relay.metered.ca:80' },
      {
        urls: 'turn:global.relay.metered.ca:80',
        username: 'user123',
        credential: 'pass123',
      },
    ];

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockMeteredServers,
    });

    const res = await request(app)
      .get('/api/ice-servers')
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://testapp.metered.live/api/v1/turn/credentials?apiKey=secret_key_123',
      expect.any(Object)
    );
    expect(res.body.iceServers).toEqual(mockMeteredServers);
    // Never expose the API key to the client
    expect(JSON.stringify(res.body)).not.toContain('secret_key_123');
  });

  it('falls back to STUN-only if Metered fetch fails', async () => {
    const { token } = await createUser();
    env.meteredApp = 'testapp';
    env.meteredApiKey = 'secret_key_123';

    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const res = await request(app)
      .get('/api/ice-servers')
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.iceServers)).toBe(true);
    expect(res.body.iceServers[0].urls).toContain('stun:');
  });
});
