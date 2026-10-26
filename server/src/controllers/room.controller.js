const AppError = require('../utils/AppError');
const User = require('../models/User');
const Meeting = require('../models/Meeting');
const { generateMeetingCode } = require('../utils/meetingCode');
const { MEETING_STATUS } = require('../config/constants');

const notFound = () => new AppError(404, 'ROOM_NOT_FOUND', 'Personal meeting room not found');

async function resolvePersonalRoom(req, res) {
  const slug = String(req.params.slug || '').trim().toLowerCase();
  if (!slug) throw notFound();

  // Find host by personalRoomSlug
  const host = await User.findOne({ personalRoomSlug: slug });
  if (!host) throw notFound();

  const isHost = Boolean(req.user && req.user._id && req.user._id.equals(host._id));

  if (isHost) {
    // Host opens room: reuse active meeting or create fresh meeting.
    // Never reuse an ended or cancelled meeting, ensuring history stays correct.
    let meeting = await Meeting.findOne({
      host: host._id,
      isPersonalRoom: true,
      status: MEETING_STATUS.ACTIVE,
    }).sort({ createdAt: -1 });

    if (!meeting) {
      meeting = await Meeting.create({
        code: generateMeetingCode(),
        title: `${host.name}'s Personal Room`,
        host: host._id,
        isPersonalRoom: true,
        status: MEETING_STATUS.ACTIVE,
        waitingRoom: true,
        startsAt: new Date(),
      });
    }

    return res.json({
      isHost: true,
      active: true,
      code: meeting.code,
      host: {
        id: host.id,
        name: host.name,
        slug: host.personalRoomSlug,
      },
    });
  }

  // Guest view: see active meeting or 'The host has not started the room yet'
  const activeMeeting = await Meeting.findOne({
    host: host._id,
    isPersonalRoom: true,
    status: MEETING_STATUS.ACTIVE,
  }).sort({ createdAt: -1 });

  if (activeMeeting) {
    return res.json({
      isHost: false,
      active: true,
      code: activeMeeting.code,
      host: {
        id: host.id,
        name: host.name,
        slug: host.personalRoomSlug,
      },
    });
  }

  return res.json({
    isHost: false,
    active: false,
    message: 'The host has not started the room yet',
    host: {
      id: host.id,
      name: host.name,
      slug: host.personalRoomSlug,
    },
  });
}

module.exports = { resolvePersonalRoom };
