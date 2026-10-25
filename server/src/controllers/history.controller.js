const mongoose = require('mongoose');

const AppError = require('../utils/AppError');
const Meeting = require('../models/Meeting');
const Message = require('../models/Message');

function computeDurationMs(meeting) {
  if (!meeting.startedAt || !meeting.lastActiveAt) return 0;
  return Math.max(0, new Date(meeting.lastActiveAt).getTime() - new Date(meeting.startedAt).getTime());
}

function toHistorySummary(m, userId) {
  const isHost = m.host?._id
    ? m.host._id.toString() === userId.toString()
    : m.host.toString() === userId.toString();

  return {
    code: m.code,
    title: m.title,
    startedAt: m.startedAt,
    durationMs: computeDurationMs(m),
    participantCount: m.attendees?.length || 1,
    host: { name: m.host?.name ?? 'Unknown' },
    status: m.status,
    isHost,
  };
}

async function listHistory(req, res) {
  const userId = req.user._id;

  const meetings = await Meeting.find({
    $or: [{ host: userId }, { attendees: userId }],
    startedAt: { $ne: null },
  })
    .sort({ startedAt: -1 })
    .limit(50)
    .populate('host', 'name')
    .lean();

  res.json({
    meetings: meetings.map((m) => toHistorySummary(m, userId)),
  });
}

async function getHistoryDetail(req, res) {
  const { code } = req.valid.params;
  const userId = req.user._id;

  const meeting = await Meeting.findOne({ code })
    .populate('host', 'name')
    .populate('attendees', 'name')
    .lean();

  if (!meeting) throw new AppError(404, 'MEETING_NOT_FOUND', 'Meeting not found');

  const isHost = meeting.host?._id
    ? meeting.host._id.toString() === userId.toString()
    : meeting.host.toString() === userId.toString();

  const isAttendee = meeting.attendees?.some(
    (a) => (a._id ? a._id.toString() : a.toString()) === userId.toString()
  );

  if (!isHost && !isAttendee) {
    throw new AppError(403, 'FORBIDDEN', "You don't have access to this meeting's history");
  }

  const summary = toHistorySummary(meeting, userId);
  const attendees = (meeting.attendees || []).map((a) => ({
    id: a._id ? a._id.toString() : a.toString(),
    name: a.name ?? 'Guest',
  }));

  res.json({
    meeting: {
      ...summary,
      attendees,
    },
  });
}

async function getMeetingMessages(req, res) {
  const { code } = req.valid.params;
  const { limit = 100, after } = req.valid.query;
  const userId = req.user._id;

  const meeting = await Meeting.findOne({ code }).select('_id host attendees').lean();
  if (!meeting) throw new AppError(404, 'MEETING_NOT_FOUND', 'Meeting not found');

  const isHost = meeting.host.toString() === userId.toString();
  const isAttendee = meeting.attendees?.some((a) => a.toString() === userId.toString());

  if (!isHost && !isAttendee) {
    throw new AppError(403, 'FORBIDDEN', "You don't have access to this meeting's messages");
  }

  const query = {
    meeting: meeting._id,
    $or: [
      { to: null },
      { to: { $exists: false } },
      { to: userId },
      { user: userId },
    ],
  };
  if (after && mongoose.Types.ObjectId.isValid(after)) {
    query._id = { $gt: new mongoose.Types.ObjectId(after) };
  }

  const messages = await Message.find(query)
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();

  const hostIdStr = meeting.host.toString();

  res.json({
    messages: messages.map((msg) => {
      const formatted = {
        id: msg._id.toString(),
        from: {
          id: msg.user.toString(),
          name: msg.name,
          isHost: msg.user.toString() === hostIdStr,
        },
        text: msg.text,
        createdAt: msg.createdAt,
      };
      if (msg.to) {
        formatted.to = {
          id: msg.to.toString(),
          name: msg.toName,
        };
      }
      return formatted;
    }),
  });
}

module.exports = {
  listHistory,
  getHistoryDetail,
  getMeetingMessages,
};
