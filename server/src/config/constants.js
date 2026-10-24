const MEETING_STATUS = Object.freeze({
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  ENDED: 'ended',
});

// A meeting counts as "upcoming" until this long after its start time
const MEETING_OPEN_WINDOW_MS = 4 * 60 * 60 * 1000;

// Maximum peers in one room (default cap for mesh calls)
const MAX_PARTICIPANTS = 4;

module.exports = { MEETING_STATUS, MEETING_OPEN_WINDOW_MS, MAX_PARTICIPANTS };
