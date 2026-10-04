const request = require('supertest');

const app = require('../src/app');
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
    });
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
});
