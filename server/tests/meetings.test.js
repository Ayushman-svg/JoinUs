const request = require('supertest');

const app = require('../src/app');
const Meeting = require('../src/models/Meeting');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./helpers/db');
const { createUser, bearer } = require('./helpers/users');

beforeAll(connectTestDB, 120000);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

const DAY_MS = 24 * 60 * 60 * 1000;

describe('creating meetings', () => {
  it('requires auth and creates an instant meeting with a code like abc-defg-hij', async () => {
    const { token } = await createUser();

    const anonymous = await request(app).post('/api/meetings').send({});
    expect(anonymous.status).toBe(401);

    const res = await request(app)
      .post('/api/meetings')
      .set(bearer(token))
      .send({ title: 'Standup' });

    expect(res.status).toBe(201);
    expect(res.body.meeting.code).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    expect(res.body.meeting).toMatchObject({
      title: 'Standup',
      scheduledAt: null,
      status: 'active',
      waitingRoom: true,
    });

    const noWaitingRoom = await request(app)
      .post('/api/meetings')
      .set(bearer(token))
      .send({ title: 'Open sync', waitingRoom: false });
    expect(noWaitingRoom.status).toBe(201);
    expect(noWaitingRoom.body.meeting.waitingRoom).toBe(false);
  });

  it('schedules a future meeting, lists it as upcoming and rejects a past time', async () => {
    const { token } = await createUser();
    const future = new Date(Date.now() + DAY_MS).toISOString();

    const created = await request(app)
      .post('/api/meetings')
      .set(bearer(token))
      .send({ title: 'Planning', scheduledAt: future });
    expect(created.status).toBe(201);
    expect(created.body.meeting.scheduledAt).toBe(future);

    const upcoming = await request(app).get('/api/meetings?filter=upcoming').set(bearer(token));
    expect(upcoming.status).toBe(200);
    expect(upcoming.body.meetings.map((m) => m.code)).toContain(created.body.meeting.code);

    const past = await request(app)
      .post('/api/meetings')
      .set(bearer(token))
      .send({ title: 'Old', scheduledAt: '2020-01-01T00:00:00.000Z' });
    expect(past.status).toBe(400);
    expect(past.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('meeting access rules', () => {
  it('shows minimal public info to anyone but lets only the host edit or cancel', async () => {
    const host = await createUser({ name: 'Host Person' });
    const other = await createUser({ name: 'Other Person' });

    const created = await request(app)
      .post('/api/meetings')
      .set(bearer(host.token))
      .send({ title: 'Design review' });
    const { code } = created.body.meeting;

    // Public lookup: no token needed, no private fields leaked
    const publicView = await request(app).get(`/api/meetings/${code}`);
    expect(publicView.status).toBe(200);
    expect(publicView.body.meeting).toMatchObject({
      code,
      title: 'Design review',
      host: { name: 'Host Person' },
      waitingRoom: true,
    });
    expect(publicView.body.meeting).not.toHaveProperty('id');
    expect(JSON.stringify(publicView.body)).not.toContain(host.user.email);

    // Another user cannot change anything
    const strangerEdit = await request(app)
      .patch(`/api/meetings/${code}`)
      .set(bearer(other.token))
      .send({ title: 'Hijacked' });
    expect(strangerEdit.status).toBe(403);
    const strangerCancel = await request(app)
      .delete(`/api/meetings/${code}`)
      .set(bearer(other.token));
    expect(strangerCancel.status).toBe(403);

    // The host can edit, then cancel; cancelled meetings are frozen
    const edit = await request(app)
      .patch(`/api/meetings/${code}`)
      .set(bearer(host.token))
      .send({ title: 'Design review v2' });
    expect(edit.status).toBe(200);
    expect(edit.body.meeting.title).toBe('Design review v2');

    const cancel = await request(app).delete(`/api/meetings/${code}`).set(bearer(host.token));
    expect(cancel.status).toBe(200);
    expect(cancel.body.meeting.status).toBe('cancelled');

    const editCancelled = await request(app)
      .patch(`/api/meetings/${code}`)
      .set(bearer(host.token))
      .send({ title: 'Too late' });
    expect(editCancelled.status).toBe(409);
    expect(editCancelled.body.error.code).toBe('MEETING_CANCELLED');

    const past = await request(app).get('/api/meetings?filter=past').set(bearer(host.token));
    expect(past.body.meetings.map((m) => m.code)).toContain(code);
  });

  it('ended meetings count as past and cannot be edited', async () => {
    const host = await createUser({ name: 'Meeting Host' });
    const Meeting = require('../src/models/Meeting');

    const created = await request(app)
      .post('/api/meetings')
      .set(bearer(host.token))
      .send({ title: 'Finished call' });
    const { code } = created.body.meeting;

    // Simulate ending the meeting
    await Meeting.updateOne({ code }, { status: 'ended' });

    // Should not appear in upcoming
    const upcoming = await request(app).get('/api/meetings?filter=upcoming').set(bearer(host.token));
    expect(upcoming.body.meetings.map((m) => m.code)).not.toContain(code);

    // Should appear in past
    const past = await request(app).get('/api/meetings?filter=past').set(bearer(host.token));
    expect(past.body.meetings.map((m) => m.code)).toContain(code);

    // Cannot be edited
    const edit = await request(app)
      .patch(`/api/meetings/${code}`)
      .set(bearer(host.token))
      .send({ title: 'Try editing ended' });
    expect(edit.status).toBe(409);
    expect(edit.body.error.code).toBe('MEETING_ENDED');
  });

  it('tracks attendees, startedAt, lastActiveAt, and calculates durationMs on Meeting', async () => {
    const host = await createUser({ name: 'Host User' });
    const attendee = await createUser({ name: 'Attendee User' });
    const Meeting = require('../src/models/Meeting');

    const created = await request(app)
      .post('/api/meetings')
      .set(bearer(host.token))
      .send({ title: 'Tracked meeting' });
    const { code } = created.body.meeting;

    const started = new Date(Date.now() - 60000);
    const lastActive = new Date();

    await Meeting.updateOne(
      { code },
      {
        $addToSet: { attendees: attendee.user.id },
        $set: { startedAt: started, lastActiveAt: lastActive },
      }
    );

    const doc = await Meeting.findOne({ code });
    expect(doc.attendees).toHaveLength(1);
    expect(doc.attendees[0].toString()).toBe(attendee.user.id);
    expect(doc.startedAt.getTime()).toBe(started.getTime());
    expect(doc.lastActiveAt.getTime()).toBe(lastActive.getTime());
    expect(doc.durationMs).toBeGreaterThanOrEqual(59000);
  });
});

describe('Message model', () => {
  it('creates and validates persisted messages with snapshots and trimmed text', async () => {
    const host = await createUser({ name: 'Host Sender' });
    const Meeting = require('../src/models/Meeting');
    const Message = require('../src/models/Message');

    const meeting = await Meeting.create({
      code: 'msg-test-one',
      title: 'Message test',
      host: host.user.id,
      startsAt: new Date(),
    });

    const msg = await Message.create({
      meeting: meeting._id,
      user: host.user.id,
      name: host.user.name,
      text: '   Hello world!   ',
    });

    expect(msg.name).toBe('Host Sender');
    expect(msg.text).toBe('Hello world!'); // trimmed
    expect(msg.createdAt).toBeInstanceOf(Date);
    expect(msg.meeting.toString()).toBe(meeting._id.toString());
    expect(msg.user.toString()).toBe(host.user.id);

    // Rejects empty text
    await expect(
      Message.create({
        meeting: meeting._id,
        user: host.user.id,
        name: host.user.name,
        text: '   ',
      })
    ).rejects.toThrow();

    // Rejects text exceeding 1000 characters
    await expect(
      Message.create({
        meeting: meeting._id,
        user: host.user.id,
        name: host.user.name,
        text: 'a'.repeat(1001),
      })
    ).rejects.toThrow();
  });
});

describe('meeting phase, live state, and filtering', () => {
  it('returns phase, isLive, participantCount, startedAt, and lastActiveAt on meeting list', async () => {
    const host = await createUser({ name: 'Phase Host' });

    // 1. Scheduled in future -> upcoming
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    await request(app)
      .post('/api/meetings')
      .set(bearer(host.token))
      .send({ title: 'Future Call', scheduledAt: future });

    // 2. Started meeting within 4 hours -> ongoing
    const ongoingMeeting = await Meeting.create({
      code: 'ong-oing-one',
      title: 'Ongoing Call',
      host: host.user.id,
      startsAt: new Date(Date.now() - 30 * 60 * 1000),
      startedAt: new Date(Date.now() - 30 * 60 * 1000),
      lastActiveAt: new Date(Date.now() - 10 * 60 * 1000),
      status: 'active',
    });

    // 3. Ended meeting -> past
    await Meeting.create({
      code: 'end-eddd-one',
      title: 'Ended Call',
      host: host.user.id,
      startsAt: new Date(Date.now() - 60 * 60 * 1000),
      status: 'ended',
    });

    // Mock registry with ongoingMeeting being live
    const mockRegistry = {
      getPeers: (code) => (code === ongoingMeeting.code ? [{ peerId: 'p1' }, { peerId: 'p2' }] : []),
    };
    app.set('registry', mockRegistry);

    // List all
    const resAll = await request(app).get('/api/meetings').set(bearer(host.token));
    expect(resAll.status).toBe(200);
    expect(resAll.body.meetings).toHaveLength(3);

    const ongoingItem = resAll.body.meetings.find((m) => m.code === ongoingMeeting.code);
    expect(ongoingItem).toMatchObject({
      phase: 'ongoing',
      isLive: true,
      participantCount: 2,
    });
    expect(ongoingItem).toHaveProperty('startedAt');
    expect(ongoingItem).toHaveProperty('lastActiveAt');

    // Filter ongoing
    const resOngoing = await request(app).get('/api/meetings?filter=ongoing').set(bearer(host.token));
    expect(resOngoing.status).toBe(200);
    expect(resOngoing.body.meetings.map((m) => m.code)).toEqual([ongoingMeeting.code]);

    // Filter upcoming
    const resUpcoming = await request(app).get('/api/meetings?filter=upcoming').set(bearer(host.token));
    expect(resUpcoming.status).toBe(200);
    expect(resUpcoming.body.meetings.every((m) => m.phase === 'upcoming')).toBe(true);

    // Filter past
    const resPast = await request(app).get('/api/meetings?filter=past').set(bearer(host.token));
    expect(resPast.status).toBe(200);
    expect(resPast.body.meetings.every((m) => m.phase === 'past')).toBe(true);

    app.set('registry', null);
  });
});

