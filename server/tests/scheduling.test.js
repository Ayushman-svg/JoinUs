const request = require('supertest');
const app = require('../src/app');
const Meeting = require('../src/models/Meeting');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./helpers/db');
const { createUser, bearer } = require('./helpers/users');
const { generateIcs, escapeIcsText, formatIcsDate } = require('../src/utils/ics');

beforeAll(connectTestDB, 120000);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe('FEATURE_SCHEDULING: Scheduling, Recurrence, and .ICS Export', () => {
  it('stores and returns duration, timeZone, description, and recurrence on meeting creation and update', async () => {
    const { token } = await createUser();
    const scheduledTime = new Date(Date.now() + 2 * DAY_MS).toISOString();

    const res = await request(app)
      .post('/api/meetings')
      .set(bearer(token))
      .send({
        title: 'Sprint Planning',
        description: 'Review backlog and plan sprint objectives.',
        duration: 45,
        timeZone: 'America/New_York',
        scheduledAt: scheduledTime,
        waitingRoom: true,
        recurrence: {
          frequency: 'weekly',
          count: 4,
        },
      });

    expect(res.status).toBe(201);
    const meeting = res.body.meeting;
    expect(meeting.title).toBe('Sprint Planning');
    expect(meeting.description).toBe('Review backlog and plan sprint objectives.');
    expect(meeting.duration).toBe(45);
    expect(meeting.timeZone).toBe('America/New_York');
    expect(meeting.recurrence).toMatchObject({
      frequency: 'weekly',
      count: 4,
    });

    // Public details endpoint includes scheduling metadata
    const publicRes = await request(app).get(`/api/meetings/${meeting.code}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.meeting.duration).toBe(45);
    expect(publicRes.body.meeting.timeZone).toBe('America/New_York');
    expect(publicRes.body.meeting.description).toBe('Review backlog and plan sprint objectives.');

    // Update meeting updates the series metadata
    const updateRes = await request(app)
      .patch(`/api/meetings/${meeting.code}`)
      .set(bearer(token))
      .send({
        duration: 60,
        description: 'Updated agenda with backlog review.',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.meeting.duration).toBe(60);
    expect(updateRes.body.meeting.description).toBe('Updated agenda with backlog review.');
  });

  describe('.ics calendar output', () => {
    it('generates compliant .ics output with correct UTC times and escaped text', async () => {
      const { token } = await createUser();
      const startTime = new Date('2026-11-15T14:30:00.000Z');

      const createRes = await request(app)
        .post('/api/meetings')
        .set(bearer(token))
        .send({
          title: 'Design Review, Team & Stakeholders; v1.0',
          description: 'Special notes:\n1. First line, with comma;\n2. Second line with semicolon; and \\backslash.',
          duration: 90,
          timeZone: 'Europe/London',
          scheduledAt: startTime.toISOString(),
        });

      const code = createRes.body.meeting.code;

      const icsRes = await request(app).get(`/api/meetings/${code}/calendar.ics`);
      expect(icsRes.status).toBe(200);
      expect(icsRes.headers['content-type']).toContain('text/calendar');
      expect(icsRes.headers['content-disposition']).toContain(`attachment; filename="meeting-${code}.ics"`);

      const text = icsRes.text;

      // Basic structure
      expect(text).toContain('BEGIN:VCALENDAR');
      expect(text).toContain('VERSION:2.0');
      expect(text).toContain('BEGIN:VEVENT');
      expect(text).toContain(`UID:${code}@joinus`);
      expect(text).toContain('STATUS:CONFIRMED');
      expect(text).toContain('END:VEVENT');
      expect(text).toContain('END:VCALENDAR');

      // DTSTART and DTEND (90 minutes after 14:30:00Z -> 16:00:00Z)
      expect(text).toContain('DTSTART:20261115T143000Z');
      expect(text).toContain('DTEND:20261115T160000Z');

      // Escaped text in SUMMARY and DESCRIPTION (RFC 5545 escaping)
      expect(text).toContain('SUMMARY:Design Review\\, Team & Stakeholders\\; v1.0');
      expect(text).toContain('First line\\, with comma\\;');
      expect(text).toContain('Second line with semicolon\\; and \\\\backslash.');
      expect(text).toContain(`Meeting Code: ${code}`);
    });

    it('returns 404 for non-existent meeting .ics request', async () => {
      const res = await request(app).get('/api/meetings/non-existent-code/calendar.ics');
      expect(res.status).toBe(404);
    });

    it('ics utility unit test escapes all special characters per RFC 5545', () => {
      expect(escapeIcsText('Hello, world; test\nnewline\\slash')).toBe(
        'Hello\\, world\\; test\\nnewline\\\\slash'
      );
      expect(formatIcsDate(new Date('2026-10-27T08:15:30.000Z'))).toBe('20261027T081530Z');
    });
  });

  describe('recurrence expansion', () => {
    it('expands recurrence rules into upcoming occurrences up to count', async () => {
      const { token } = await createUser();
      const firstDate = new Date(Date.now() + DAY_MS);

      const createRes = await request(app)
        .post('/api/meetings')
        .set(bearer(token))
        .send({
          title: 'Daily Standup',
          duration: 15,
          scheduledAt: firstDate.toISOString(),
          recurrence: {
            frequency: 'daily',
            count: 3,
          },
        });

      const code = createRes.body.meeting.code;

      const listRes = await request(app)
        .get('/api/meetings?filter=upcoming')
        .set(bearer(token));

      expect(listRes.status).toBe(200);
      const matches = listRes.body.meetings.filter((m) => m.code === code);
      expect(matches.length).toBe(3);

      // Verify successive occurrences are spaced 1 day apart
      const day0 = new Date(matches[0].scheduledAt).getTime();
      const day1 = new Date(matches[1].scheduledAt).getTime();
      const day2 = new Date(matches[2].scheduledAt).getTime();

      expect(Math.round((day1 - day0) / DAY_MS)).toBe(1);
      expect(Math.round((day2 - day1) / DAY_MS)).toBe(1);
    });
  });
});
