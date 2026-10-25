const request = require('supertest');

const app = require('../src/app');
const Meeting = require('../src/models/Meeting');
const Message = require('../src/models/Message');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./helpers/db');
const { createUser, bearer } = require('./helpers/users');

beforeAll(connectTestDB, 120000);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

describe('History and messages REST API', () => {
  it('GET /api/history returns only started meetings for the host or attendee, newest first', async () => {
    const host = await createUser({ name: 'Host Alice' });
    const attendee = await createUser({ name: 'Attendee Bob' });
    const outsider = await createUser({ name: 'Outsider Charlie' });

    const now = Date.now();

    // Meeting 1: hosted by Alice, attended by Bob, started 1 hour ago
    const m1 = await Meeting.create({
      code: 'his-albob-001',
      title: 'Alice & Bob Sync',
      host: host.user.id,
      startsAt: new Date(now - 3600000),
      startedAt: new Date(now - 3600000),
      lastActiveAt: new Date(now - 1800000),
      attendees: [host.user.id, attendee.user.id],
      status: 'ended',
    });

    // Meeting 2: hosted by Alice, never started (startedAt: null)
    await Meeting.create({
      code: 'his-alice-002',
      title: 'Unstarted Alice Call',
      host: host.user.id,
      startsAt: new Date(now - 10000),
      startedAt: null,
      status: 'active',
    });

    // Meeting 3: hosted by Charlie, Bob attendee, started 10 minutes ago
    const m3 = await Meeting.create({
      code: 'his-chabob-003',
      title: 'Charlie & Bob 1:1',
      host: outsider.user.id,
      startsAt: new Date(now - 600000),
      startedAt: new Date(now - 600000),
      lastActiveAt: new Date(now - 300000),
      attendees: [outsider.user.id, attendee.user.id],
      status: 'ended',
    });

    // Unauthenticated request rejected
    const anon = await request(app).get('/api/history');
    expect(anon.status).toBe(401);

    // Host Alice: should see m1 only (m2 was not started, m3 she is not part of)
    const resAlice = await request(app).get('/api/history').set(bearer(host.token));
    expect(resAlice.status).toBe(200);
    expect(resAlice.body.meetings).toHaveLength(1);
    expect(resAlice.body.meetings[0]).toMatchObject({
      code: m1.code,
      title: 'Alice & Bob Sync',
      isHost: true,
      participantCount: 2,
      host: { name: 'Host Alice' },
      status: 'ended',
    });
    expect(resAlice.body.meetings[0].durationMs).toBe(1800000);

    // Attendee Bob: should see m3 and m1 in newest-first order
    const resBob = await request(app).get('/api/history').set(bearer(attendee.token));
    expect(resBob.status).toBe(200);
    expect(resBob.body.meetings).toHaveLength(2);
    expect(resBob.body.meetings[0].code).toBe(m3.code);
    expect(resBob.body.meetings[0].isHost).toBe(false);
    expect(resBob.body.meetings[1].code).toBe(m1.code);
    expect(resBob.body.meetings[1].isHost).toBe(false);
  });

  it('GET /api/history/:code provides summary and attendees to host and attendee, rejects outsider with 403', async () => {
    const host = await createUser({ name: 'Host Alice' });
    const attendee = await createUser({ name: 'Attendee Bob' });
    const outsider = await createUser({ name: 'Outsider Charlie' });

    const m = await Meeting.create({
      code: 'det-albob-001',
      title: 'Detailed Meeting',
      host: host.user.id,
      startsAt: new Date(),
      startedAt: new Date(Date.now() - 300000),
      lastActiveAt: new Date(),
      attendees: [host.user.id, attendee.user.id],
      status: 'ended',
    });

    // Host can view
    const hostRes = await request(app)
      .get(`/api/history/${m.code}`)
      .set(bearer(host.token));
    expect(hostRes.status).toBe(200);
    expect(hostRes.body.meeting).toMatchObject({
      code: m.code,
      title: 'Detailed Meeting',
      isHost: true,
      participantCount: 2,
      host: { name: 'Host Alice' },
    });
    expect(hostRes.body.meeting.attendees).toHaveLength(2);
    expect(hostRes.body.meeting.attendees.map((a) => a.name)).toEqual(
      expect.arrayContaining(['Host Alice', 'Attendee Bob'])
    );

    // Attendee can view
    const attendeeRes = await request(app)
      .get(`/api/history/${m.code}`)
      .set(bearer(attendee.token));
    expect(attendeeRes.status).toBe(200);
    expect(attendeeRes.body.meeting.isHost).toBe(false);

    // Outsider gets 403
    const outsiderRes = await request(app)
      .get(`/api/history/${m.code}`)
      .set(bearer(outsider.token));
    expect(outsiderRes.status).toBe(403);
    expect(outsiderRes.body.error.code).toBe('FORBIDDEN');

    // Unknown code gets 404
    const notFoundRes = await request(app)
      .get('/api/history/non-existent-code')
      .set(bearer(host.token));
    expect(notFoundRes.status).toBe(404);
  });

  it('GET /api/meetings/:code/messages returns chat history for host and attendees, rejects outsider', async () => {
    const host = await createUser({ name: 'Host Alice' });
    const attendee = await createUser({ name: 'Attendee Bob' });
    const outsider = await createUser({ name: 'Outsider Charlie' });

    const m = await Meeting.create({
      code: 'msg-albob-001',
      title: 'Meeting with Chat',
      host: host.user.id,
      startsAt: new Date(),
      startedAt: new Date(),
      attendees: [host.user.id, attendee.user.id],
    });

    const msg1 = await Message.create({
      meeting: m._id,
      user: host.user.id,
      name: host.user.name,
      text: 'First message from host',
      createdAt: new Date(Date.now() - 5000),
    });

    const msg2 = await Message.create({
      meeting: m._id,
      user: attendee.user.id,
      name: attendee.user.name,
      text: 'Second message from attendee',
      createdAt: new Date(Date.now() - 1000),
    });

    // Host can read
    const hostRes = await request(app)
      .get(`/api/meetings/${m.code}/messages`)
      .set(bearer(host.token));
    expect(hostRes.status).toBe(200);
    expect(hostRes.body.messages).toHaveLength(2);
    expect(hostRes.body.messages[0]).toMatchObject({
      id: msg1._id.toString(),
      from: { id: host.user.id, name: 'Host Alice', isHost: true },
      text: 'First message from host',
    });
    expect(hostRes.body.messages[1]).toMatchObject({
      id: msg2._id.toString(),
      from: { id: attendee.user.id, name: 'Attendee Bob', isHost: false },
      text: 'Second message from attendee',
    });

    // Query messages after msg1
    const afterRes = await request(app)
      .get(`/api/meetings/${m.code}/messages?after=${msg1._id.toString()}`)
      .set(bearer(host.token));
    expect(afterRes.status).toBe(200);
    expect(afterRes.body.messages).toHaveLength(1);
    expect(afterRes.body.messages[0]).toMatchObject({
      id: msg2._id.toString(),
      from: { id: attendee.user.id, isHost: false },
      text: 'Second message from attendee',
    });

    // Attendee can read with limit
    const attendeeRes = await request(app)
      .get(`/api/meetings/${m.code}/messages?limit=1`)
      .set(bearer(attendee.token));
    expect(attendeeRes.status).toBe(200);
    expect(attendeeRes.body.messages).toHaveLength(1);
    expect(attendeeRes.body.messages[0].id).toBe(msg1._id.toString());

    // Outsider gets 403
    const outsiderRes = await request(app)
      .get(`/api/meetings/${m.code}/messages`)
      .set(bearer(outsider.token));
    expect(outsiderRes.status).toBe(403);
    expect(outsiderRes.body.error.code).toBe('FORBIDDEN');

    // Invalid limit returns 400
    const invalidLimit = await request(app)
      .get(`/api/meetings/${m.code}/messages?limit=0`)
      .set(bearer(host.token));
    expect(invalidLimit.status).toBe(400);
    expect(invalidLimit.body.error.code).toBe('VALIDATION_ERROR');
  });
});
