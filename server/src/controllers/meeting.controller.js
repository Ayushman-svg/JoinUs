const AppError = require('../utils/AppError');
const { generateMeetingCode } = require('../utils/meetingCode');
const { MEETING_STATUS, MEETING_OPEN_WINDOW_MS } = require('../config/constants');
const Meeting = require('../models/Meeting');

const MAX_CODE_ATTEMPTS = 5;

const notFound = () => new AppError(404, 'MEETING_NOT_FOUND', 'Meeting not found');

// Full view, returned to the host
function toOwnerJSON(meeting) {
  return {
    id: meeting.id,
    code: meeting.code,
    title: meeting.title,
    scheduledAt: meeting.scheduledAt,
    startsAt: meeting.startsAt,
    status: meeting.status,
    createdAt: meeting.createdAt,
  };
}

async function findOwnedMeeting(code, user) {
  const meeting = await Meeting.findOne({ code });
  if (!meeting) throw notFound();
  if (!meeting.host.equals(user._id)) {
    throw new AppError(403, 'FORBIDDEN', 'Only the host can do this');
  }
  return meeting;
}

async function createMeeting(req, res) {
  const { title, scheduledAt } = req.body;

  let meeting;
  for (let attempt = 1; ; attempt += 1) {
    try {
      meeting = await Meeting.create({
        code: generateMeetingCode(),
        title: title || `${req.user.name}'s meeting`,
        host: req.user._id,
        scheduledAt: scheduledAt || null,
        startsAt: scheduledAt || new Date(),
      });
      break;
    } catch (err) {
      // 11000 = duplicate code: generate another one
      if (err.code !== 11000 || attempt >= MAX_CODE_ATTEMPTS) throw err;
    }
  }

  res.status(201).json({ meeting: toOwnerJSON(meeting) });
}

// Public: anyone with the code can see the basics
async function getMeeting(req, res) {
  const meeting = await Meeting.findOne({ code: req.valid.params.code }).populate('host', 'name');
  if (!meeting) throw notFound();

  res.json({
    meeting: {
      code: meeting.code,
      title: meeting.title,
      scheduledAt: meeting.scheduledAt,
      startsAt: meeting.startsAt,
      status: meeting.status,
      host: { name: meeting.host?.name ?? 'Unknown' },
    },
  });
}

async function listMeetings(req, res) {
  const { filter, limit } = req.valid.query;
  const cutoff = new Date(Date.now() - MEETING_OPEN_WINDOW_MS);
  const mine = { host: req.user._id };

  let query = mine;
  let sort = { startsAt: -1 };

  if (filter === 'upcoming') {
    query = { ...mine, status: MEETING_STATUS.ACTIVE, startsAt: { $gte: cutoff } };
    sort = { startsAt: 1 };
  } else if (filter === 'past') {
    query = {
      ...mine,
      $or: [{ status: MEETING_STATUS.CANCELLED }, { startsAt: { $lt: cutoff } }],
    };
  }

  const meetings = await Meeting.find(query).sort(sort).limit(limit);
  res.json({ meetings: meetings.map(toOwnerJSON) });
}

async function updateMeeting(req, res) {
  const meeting = await findOwnedMeeting(req.valid.params.code, req.user);

  if (meeting.status === MEETING_STATUS.CANCELLED) {
    throw new AppError(409, 'MEETING_CANCELLED', 'Cancelled meetings cannot be edited');
  }

  const { title, scheduledAt } = req.body;
  if (title !== undefined) meeting.title = title;
  if (scheduledAt !== undefined) {
    meeting.scheduledAt = scheduledAt;
    meeting.startsAt = scheduledAt;
  }

  await meeting.save();
  res.json({ meeting: toOwnerJSON(meeting) });
}

// Soft cancel: the record stays so it still shows up in history
async function cancelMeeting(req, res) {
  const meeting = await findOwnedMeeting(req.valid.params.code, req.user);

  if (meeting.status !== MEETING_STATUS.CANCELLED) {
    meeting.status = MEETING_STATUS.CANCELLED;
    await meeting.save();
  }

  res.json({ meeting: toOwnerJSON(meeting) });
}

module.exports = { createMeeting, getMeeting, listMeetings, updateMeeting, cancelMeeting };