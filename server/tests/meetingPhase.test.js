const { getMeetingPhase } = require('../src/utils/meetingPhase');
const { MEETING_STATUS, MEETING_OPEN_WINDOW_MS } = require('../src/config/constants');

describe('getMeetingPhase utility', () => {
  const baseTime = 1700000000000; // Reference timestamp
  const now = new Date(baseTime);

  describe('Cancelled and Ended meetings', () => {
    it('returns "past" for ended meeting even if it started 5 minutes ago', () => {
      const meeting = {
        status: MEETING_STATUS.ENDED,
        startedAt: new Date(baseTime - 5 * 60 * 1000),
        lastActiveAt: new Date(baseTime - 1 * 60 * 1000),
      };
      expect(getMeetingPhase(meeting, { now })).toBe('past');
    });

    it('returns "past" for ended meeting even if marked isLive', () => {
      const meeting = {
        status: MEETING_STATUS.ENDED,
        startedAt: new Date(baseTime - 5 * 60 * 1000),
      };
      expect(getMeetingPhase(meeting, { now, isLive: true })).toBe('past');
    });

    it('returns "past" for cancelled meeting even if scheduled in the future', () => {
      const meeting = {
        status: MEETING_STATUS.CANCELLED,
        scheduledAt: new Date(baseTime + 3600 * 1000),
      };
      expect(getMeetingPhase(meeting, { now })).toBe('past');
    });
  });

  describe('Scheduled meetings', () => {
    it('returns "upcoming" if scheduledAt is in the future', () => {
      const meeting = {
        status: MEETING_STATUS.ACTIVE,
        scheduledAt: new Date(baseTime + 10 * 60 * 1000),
      };
      expect(getMeetingPhase(meeting, { now })).toBe('upcoming');
    });

    it('returns "ongoing" if scheduled time has passed and meeting was started', () => {
      const meeting = {
        status: MEETING_STATUS.ACTIVE,
        scheduledAt: new Date(baseTime - 60 * 60 * 1000),
        startedAt: new Date(baseTime - 50 * 60 * 1000),
      };
      expect(getMeetingPhase(meeting, { now })).toBe('ongoing');
    });

    it('returns "ongoing" if scheduled time has passed and meeting is currently live', () => {
      const meeting = {
        status: MEETING_STATUS.ACTIVE,
        scheduledAt: new Date(baseTime - 5 * 60 * 60 * 1000), // > 4h ago
      };
      expect(getMeetingPhase(meeting, { now, isLive: true })).toBe('ongoing');
    });

    it('returns "ongoing" if not started but scheduled within the open window (last 4 hours)', () => {
      const meeting = {
        status: MEETING_STATUS.ACTIVE,
        scheduledAt: new Date(baseTime - 2 * 60 * 60 * 1000), // 2h ago
      };
      expect(getMeetingPhase(meeting, { now })).toBe('ongoing');
    });

    it('returns "past" at exactly the 4-hour window boundary for unstarted scheduled meeting', () => {
      const meeting = {
        status: MEETING_STATUS.ACTIVE,
        scheduledAt: new Date(baseTime - MEETING_OPEN_WINDOW_MS),
      };
      expect(getMeetingPhase(meeting, { now })).toBe('past');
    });

    it('returns "past" if unstarted scheduled meeting is older than 4 hours', () => {
      const meeting = {
        status: MEETING_STATUS.ACTIVE,
        scheduledAt: new Date(baseTime - MEETING_OPEN_WINDOW_MS - 1000),
      };
      expect(getMeetingPhase(meeting, { now })).toBe('past');
    });
  });

  describe('Instant meetings', () => {
    it('returns "past" if nobody ever joined (startedAt is null/missing)', () => {
      const meeting = {
        status: MEETING_STATUS.ACTIVE,
        createdAt: new Date(baseTime - 10 * 60 * 1000),
      };
      expect(getMeetingPhase(meeting, { now })).toBe('past');
    });

    it('returns "ongoing" if active, startedAt is set, and currently live', () => {
      const meeting = {
        status: MEETING_STATUS.ACTIVE,
        startedAt: new Date(baseTime - 5 * 60 * 60 * 1000),
        lastActiveAt: new Date(baseTime - 5 * 60 * 60 * 1000),
      };
      expect(getMeetingPhase(meeting, { now, isLive: true })).toBe('ongoing');
    });

    it('returns "ongoing" if active, startedAt is set, and lastActiveAt is within 4 hours', () => {
      const meeting = {
        status: MEETING_STATUS.ACTIVE,
        startedAt: new Date(baseTime - 30 * 60 * 1000),
        lastActiveAt: new Date(baseTime - 15 * 60 * 1000),
      };
      expect(getMeetingPhase(meeting, { now, isLive: false })).toBe('ongoing');
    });

    it('uses startedAt if lastActiveAt is null and checks 4 hour window', () => {
      const meeting = {
        status: MEETING_STATUS.ACTIVE,
        startedAt: new Date(baseTime - 30 * 60 * 1000),
      };
      expect(getMeetingPhase(meeting, { now, isLive: false })).toBe('ongoing');
    });

    it('returns "past" at exactly the 4-hour window boundary from last activity', () => {
      const meeting = {
        status: MEETING_STATUS.ACTIVE,
        startedAt: new Date(baseTime - 5 * 60 * 60 * 1000),
        lastActiveAt: new Date(baseTime - MEETING_OPEN_WINDOW_MS),
      };
      expect(getMeetingPhase(meeting, { now, isLive: false })).toBe('past');
    });

    it('returns "past" if last activity was more than 4 hours ago and not live', () => {
      const meeting = {
        status: MEETING_STATUS.ACTIVE,
        startedAt: new Date(baseTime - 5 * 60 * 60 * 1000),
        lastActiveAt: new Date(baseTime - (MEETING_OPEN_WINDOW_MS + 1000)),
      };
      expect(getMeetingPhase(meeting, { now, isLive: false })).toBe('past');
    });
  });

  describe('Edge cases', () => {
    it('returns "past" for null or undefined input', () => {
      expect(getMeetingPhase(null)).toBe('past');
      expect(getMeetingPhase(undefined)).toBe('past');
    });

    it('handles ISO string dates and numeric timestamps properly', () => {
      const meeting = {
        status: 'active',
        scheduledAt: new Date(baseTime + 10000).toISOString(),
      };
      expect(getMeetingPhase(meeting, { now: baseTime })).toBe('upcoming');
    });
  });
});
