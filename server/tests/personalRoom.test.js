const request = require('supertest');
const app = require('../src/app');
const Meeting = require('../src/models/Meeting');
const User = require('../src/models/User');

const { connectTestDB, clearTestDB, disconnectTestDB } = require('./helpers/db');
const { createUser, bearer } = require('./helpers/users');

beforeAll(connectTestDB, 120000);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

describe('FEATURE_SCHEDULING: Personal Meeting Room (/api/rooms/:slug)', () => {
  it('creates a fresh meeting when host opens room, and reuses it while active', async () => {
    const host = await createUser({ name: 'Carol Host', email: 'carol@example.com' });
    const userDoc = await User.findById(host.user.id);
    const slug = userDoc.personalRoomSlug;

    // 1. Host opens room for the first time
    const res1 = await request(app)
      .get(`/api/rooms/${slug}`)
      .set(bearer(host.token));

    expect(res1.status).toBe(200);
    expect(res1.body).toMatchObject({
      isHost: true,
      active: true,
      host: {
        name: 'Carol Host',
        slug,
      },
    });
    const code1 = res1.body.code;
    expect(code1).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);

    const meeting1 = await Meeting.findOne({ code: code1 });
    expect(meeting1.isPersonalRoom).toBe(true);
    expect(meeting1.status).toBe('active');

    // 2. Host opens room again: reuses active meeting
    const res2 = await request(app)
      .get(`/api/rooms/${slug}`)
      .set(bearer(host.token));

    expect(res2.status).toBe(200);
    expect(res2.body.code).toBe(code1);
  });

  it('never reuses an ended meeting and creates a fresh meeting when host re-opens', async () => {
    const host = await createUser({ name: 'Dan Host', email: 'dan@example.com' });
    const userDoc = await User.findById(host.user.id);
    const slug = userDoc.personalRoomSlug;

    // Host opens room -> meeting 1
    const res1 = await request(app)
      .get(`/api/rooms/${slug}`)
      .set(bearer(host.token));
    const code1 = res1.body.code;

    // Host ends meeting 1
    await Meeting.updateOne({ code: code1 }, { status: 'ended' });

    // Host opens room again -> must create fresh meeting, not reuse code1
    const res2 = await request(app)
      .get(`/api/rooms/${slug}`)
      .set(bearer(host.token));

    expect(res2.status).toBe(200);
    const code2 = res2.body.code;
    expect(code2).not.toBe(code1);

    const meeting2 = await Meeting.findOne({ code: code2 });
    expect(meeting2.status).toBe('active');
    expect(meeting2.isPersonalRoom).toBe(true);
  });

  it('guests see "The host has not started the room yet" when no active meeting, and see active meeting when started', async () => {
    const host = await createUser({ name: 'Eve Host', email: 'eve@example.com' });
    const guest = await createUser({ name: 'Frank Guest', email: 'frank@example.com' });
    const userDoc = await User.findById(host.user.id);
    const slug = userDoc.personalRoomSlug;

    // 1. Guest visits before host starts room
    const guestRes1 = await request(app)
      .get(`/api/rooms/${slug}`)
      .set(bearer(guest.token));

    expect(guestRes1.status).toBe(200);
    expect(guestRes1.body).toMatchObject({
      isHost: false,
      active: false,
      message: 'The host has not started the room yet',
      host: {
        name: 'Eve Host',
        slug,
      },
    });

    // Also works for unauthenticated guests
    const anonRes = await request(app).get(`/api/rooms/${slug}`);
    expect(anonRes.status).toBe(200);
    expect(anonRes.body.active).toBe(false);
    expect(anonRes.body.message).toBe('The host has not started the room yet');

    // 2. Host starts/opens room
    const hostRes = await request(app)
      .get(`/api/rooms/${slug}`)
      .set(bearer(host.token));
    const activeCode = hostRes.body.code;

    // 3. Guest visits now: sees active meeting code
    const guestRes2 = await request(app)
      .get(`/api/rooms/${slug}`)
      .set(bearer(guest.token));

    expect(guestRes2.status).toBe(200);
    expect(guestRes2.body).toMatchObject({
      isHost: false,
      active: true,
      code: activeCode,
      host: {
        name: 'Eve Host',
        slug,
      },
    });
  });

  it('returns 404 ROOM_NOT_FOUND for non-existent room slug', async () => {
    const res = await request(app).get('/api/rooms/non-existent-user-slug-999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROOM_NOT_FOUND');
  });
});
