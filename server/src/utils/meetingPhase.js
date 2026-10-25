const { MEETING_STATUS, MEETING_OPEN_WINDOW_MS } = require('../config/constants');

function toEpoch(val) {
  if (!val) return null;
  const time = new Date(val).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Computes the meeting phase: 'ongoing' | 'upcoming' | 'past'
 *
 * Rules:
 * 1. Status cancelled or ended -> 'past'
 * 2. Scheduled meeting (has scheduledAt) with scheduledAt > now -> 'upcoming'
 * 3. Scheduled meeting whose time has passed:
 *    - 'ongoing' if it was started (startedAt set) or is live,
 *    - or if not started but scheduledAt is within the last 4 hours (MEETING_OPEN_WINDOW_MS)
 *    - otherwise 'past'
 * 4. Instant meeting:
 *    - 'ongoing' if status active AND startedAt is set AND (isLive OR now - (lastActiveAt ?? startedAt) < MEETING_OPEN_WINDOW_MS)
 *    - otherwise 'past' (an instant meeting nobody ever joined is 'past')
 *
 * @param {Object} meeting
 * @param {Object} [options]
 * @param {Date|number|string} [options.now=new Date()]
 * @param {boolean} [options.isLive=false]
 * @returns {'ongoing' | 'upcoming' | 'past'}
 */
function getMeetingPhase(meeting, { now = new Date(), isLive = false } = {}) {
  if (!meeting) return 'past';

  const status = meeting.status;
  if (
    status === MEETING_STATUS.CANCELLED ||
    status === MEETING_STATUS.ENDED ||
    status === 'cancelled' ||
    status === 'ended'
  ) {
    return 'past';
  }

  const nowMs =
    typeof now === 'number'
      ? now
      : now instanceof Date
      ? now.getTime()
      : new Date(now).getTime();

  const scheduledMs = toEpoch(meeting.scheduledAt);
  const startedMs = toEpoch(meeting.startedAt);
  const lastActiveMs = toEpoch(meeting.lastActiveAt);

  // Scheduled meeting
  if (scheduledMs !== null) {
    if (scheduledMs > nowMs) {
      return 'upcoming';
    }
    // Scheduled time has passed
    if (startedMs !== null || isLive) {
      return 'ongoing';
    }
    if (nowMs - scheduledMs < MEETING_OPEN_WINDOW_MS) {
      return 'ongoing';
    }
    return 'past';
  }

  // Instant meeting
  if (status === MEETING_STATUS.ACTIVE || status === 'active') {
    if (startedMs !== null) {
      const activeRef = lastActiveMs !== null ? lastActiveMs : startedMs;
      if (isLive || nowMs - activeRef < MEETING_OPEN_WINDOW_MS) {
        return 'ongoing';
      }
    }
  }

  return 'past';
}

module.exports = { getMeetingPhase };
