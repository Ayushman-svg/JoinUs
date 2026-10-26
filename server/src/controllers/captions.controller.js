const AppError = require('../utils/AppError');
const Meeting = require('../models/Meeting');
const Caption = require('../models/Caption');

/**
 * GET /api/meetings/:code/captions
 * Returns saved final caption segments for host and attendees (same access rules as chat).
 */
async function getMeetingCaptions(req, res) {
  const { code } = req.valid.params;
  const userId = req.user._id;

  const meeting = await Meeting.findOne({ code }).select('_id host attendees').lean();
  if (!meeting) {
    throw new AppError(404, 'MEETING_NOT_FOUND', 'Meeting not found');
  }

  const isHost = meeting.host.toString() === userId.toString();
  const isAttendee = meeting.attendees?.some((a) => a.toString() === userId.toString());

  if (!isHost && !isAttendee) {
    throw new AppError(403, 'FORBIDDEN', "You don't have access to this meeting's transcript");
  }

  const captions = await Caption.find({ meeting: meeting._id })
    .sort({ createdAt: 1 })
    .limit(5000)
    .lean();

  res.json({
    captions: captions.map((c) => ({
      id: c._id.toString(),
      user: c.user ? c.user.toString() : null,
      name: c.name,
      text: c.text,
      offsetMs: c.offsetMs || 0,
      createdAt: c.createdAt,
    })),
  });
}

module.exports = { getMeetingCaptions };
