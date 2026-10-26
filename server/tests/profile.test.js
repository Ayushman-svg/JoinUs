const request = require('supertest');

const app = require('../src/app');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./helpers/db');
const { createUser, bearer } = require('./helpers/users');

beforeAll(connectTestDB, 120000);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

describe('FEATURE_SETTINGS: Profile and Meeting Defaults (PATCH /api/auth/me)', () => {
  it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .patch('/api/auth/me')
      .send({ name: 'Hacker Bob' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('updates name, timeZone, defaultWaitingRoom, and defaultMuteOnEntry with validation', async () => {
    const { token } = await createUser({ name: 'Original Name', email: 'user@example.com' });

    const res = await request(app)
      .patch('/api/auth/me')
      .set(bearer(token))
      .send({
        name: 'New Name',
        timeZone: 'Asia/Tokyo',
        defaultWaitingRoom: false,
        defaultMuteOnEntry: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      name: 'New Name',
      timeZone: 'Asia/Tokyo',
      defaultWaitingRoom: false,
      defaultMuteOnEntry: true,
      email: 'user@example.com',
    });

    // Verify GET /api/auth/me also returns updated user data
    const meRes = await request(app)
      .get('/api/auth/me')
      .set(bearer(token));

    expect(meRes.status).toBe(200);
    expect(meRes.body.user).toMatchObject({
      name: 'New Name',
      timeZone: 'Asia/Tokyo',
      defaultWaitingRoom: false,
      defaultMuteOnEntry: true,
    });
  });

  it('treats email as read-only and ignores attempts to modify email', async () => {
    const { token } = await createUser({ name: 'Alice Smith', email: 'alice@example.com' });

    const res = await request(app)
      .patch('/api/auth/me')
      .set(bearer(token))
      .send({
        name: 'Alice Cooper',
        email: 'alice.hacked@evil.com',
      });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Alice Cooper');
    expect(res.body.user.email).toBe('alice@example.com');
  });

  it('rejects invalid names with 400 VALIDATION_ERROR', async () => {
    const { token } = await createUser({ name: 'Bob Dylan' });

    const shortName = await request(app)
      .patch('/api/auth/me')
      .set(bearer(token))
      .send({ name: 'B' });

    expect(shortName.status).toBe(400);
    expect(shortName.body.error.code).toBe('VALIDATION_ERROR');

    const longName = await request(app)
      .patch('/api/auth/me')
      .set(bearer(token))
      .send({ name: 'x'.repeat(51) });

    expect(longName.status).toBe(400);
    expect(longName.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('applies user defaultWaitingRoom and defaultMuteOnEntry when creating a new meeting', async () => {
    const { token } = await createUser({ name: 'Meeting Host' });

    // Update host defaults: no waiting room, mute on entry
    await request(app)
      .patch('/api/auth/me')
      .set(bearer(token))
      .send({
        defaultWaitingRoom: false,
        defaultMuteOnEntry: true,
      });

    // Create a meeting without specifying waitingRoom or muteOnEntry
    const res = await request(app)
      .post('/api/meetings')
      .set(bearer(token))
      .send({
        title: 'Team Standup',
      });

    expect(res.status).toBe(201);
    expect(res.body.meeting.waitingRoom).toBe(false);
    expect(res.body.meeting.settings.muteOnEntry).toBe(true);
  });
});
