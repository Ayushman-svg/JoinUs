const bcrypt = require('bcryptjs');
const AppError = require('../utils/AppError');
const { generateMeetingCode } = require('../utils/meetingCode');
const { generateIcs } = require('../utils/ics');
const { MEETING_STATUS } = require('../config/constants');
const Meeting = require('../models/Meeting');
const { getMeetingPhase } = require('../utils/meetingPhase');

const MAX_CODE_ATTEMPTS = 5;

const notFound = () => new AppError(404, 'MEETING_NOT_FOUND', 'Meeting not found');

function toEpoch(val) {
  if (!val) return 0;
  const t = new Date(val).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// Full view, returned to the host
function toOwnerJSON(meeting, { isLive = false, participantCount = 0, now = new Date() } = {}) {
  const phase = getMeetingPhase(meeting, { now, isLive });
  return {
    id: meeting.id,
    code: meeting.code,
    title: meeting.title,
    description: meeting.description || '',
    duration: meeting.duration || 30,
    timeZone: meeting.timeZone || 'UTC',
    recurrence: meeting.recurrence || null,
    isPersonalRoom: Boolean(meeting.isPersonalRoom),
    scheduledAt: meeting.scheduledAt,
    startsAt: meeting.startsAt,
    status: meeting.status,
    waitingRoom: meeting.waitingRoom,
    hasPasscode: Boolean(meeting.passcodeHash),
    settings: meeting.settings || {
      muteOnEntry: false,
      chatAllowed: true,
      shareAllowed: 'all',
      locked: false,
    },
    coHosts: meeting.coHosts || [],
    blocked: meeting.blocked || [],
    createdAt: meeting.createdAt,
    startedAt: meeting.startedAt ?? null,
    lastActiveAt: meeting.lastActiveAt ?? null,
    phase,
    isLive,
    participantCount,
  };
}

function expandOccurrences(meeting, { isLive, participantCount, now }) {
  const baseJson = toOwnerJSON(meeting, { isLive, participantCount, now });
  if (!meeting.recurrence?.frequency || !meeting.scheduledAt) {
    return [baseJson];
  }

  const { frequency, count, until } = meeting.recurrence;
  const maxOccurrences = Math.min(count || 20, 20);
  const occurrences = [baseJson];

  let current = new Date(meeting.scheduledAt);
  const untilDate = until ? new Date(until) : null;

  for (let i = 1; i < maxOccurrences; i += 1) {
    const next = new Date(current);
    if (frequency === 'daily') {
      next.setDate(next.getDate() + 1);
    } else if (frequency === 'weekly') {
      next.setDate(next.getDate() + 7);
    } else if (frequency === 'monthly') {
      next.setMonth(next.getMonth() + 1);
    }

    if (untilDate && next.getTime() > untilDate.getTime()) {
      break;
    }

    current = next;
    const occDoc = {
      ...meeting.toObject(),
      scheduledAt: next,
      startsAt: next,
    };
    const occPhase = getMeetingPhase(occDoc, { now, isLive: false });

    occurrences.push({
      ...baseJson,
      id: `${meeting.id}_occ_${i}`,
      scheduledAt: next,
      startsAt: next,
      phase: occPhase,
      isLive: false,
      participantCount: 0,
      isOccurrence: true,
      occurrenceIndex: i,
    });
  }

  return occurrences;
}

async function findOwnedMeeting(code, user) {
  const meeting = await Meeting.findOne({ code }).select('+passcodeHash');
  if (!meeting) throw notFound();
  if (!meeting.host.equals(user._id)) {
    throw new AppError(403, 'FORBIDDEN', 'Only the host can do this');
  }
  return meeting;
}

async function createMeeting(req, res) {
  const {
    title,
    description,
    duration,
    timeZone,
    recurrence,
    isPersonalRoom,
    scheduledAt,
    waitingRoom,
    passcode,
    settings,
    muteOnEntry,
  } = req.body;

  let passcodeHash = null;
  if (passcode) {
    passcodeHash = await bcrypt.hash(passcode, 10);
  }

  const initialSettings = {
    muteOnEntry: Boolean(muteOnEntry ?? settings?.muteOnEntry ?? false),
    chatAllowed: settings?.chatAllowed !== undefined ? Boolean(settings.chatAllowed) : true,
    shareAllowed: settings?.shareAllowed === 'host-only' ? 'host-only' : 'all',
    locked: Boolean(settings?.locked ?? false),
  };

  let meeting;
  for (let attempt = 1; ; attempt += 1) {
    try {
      meeting = await Meeting.create({
        code: generateMeetingCode(),
        title: title || `${req.user.name}'s meeting`,
        description: description || '',
        duration: duration || 30,
        timeZone: timeZone || 'UTC',
        recurrence: recurrence || null,
        isPersonalRoom: Boolean(isPersonalRoom),
        host: req.user._id,
        scheduledAt: scheduledAt || null,
        startsAt: scheduledAt || new Date(),
        waitingRoom: waitingRoom !== undefined ? Boolean(waitingRoom) : true,
        passcodeHash,
        settings: initialSettings,
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
  const meeting = await Meeting.findOne({ code: req.valid.params.code })
    .select('+passcodeHash')
    .populate('host', 'name');
  if (!meeting) throw notFound();

  const isLocked = Boolean(meeting.settings?.locked);

  res.json({
    meeting: {
      code: meeting.code,
      title: meeting.title,
      description: meeting.description || '',
      duration: meeting.duration || 30,
      timeZone: meeting.timeZone || 'UTC',
      recurrence: meeting.recurrence || null,
      isPersonalRoom: Boolean(meeting.isPersonalRoom),
      scheduledAt: meeting.scheduledAt,
      startsAt: meeting.startsAt,
      status: meeting.status,
      waitingRoom: meeting.waitingRoom,
      hasPasscode: Boolean(meeting.passcodeHash),
      locked: isLocked,
      settings: {
        muteOnEntry: Boolean(meeting.settings?.muteOnEntry),
        chatAllowed: meeting.settings?.chatAllowed !== false,
        shareAllowed: meeting.settings?.shareAllowed === 'host-only' ? 'host-only' : 'all',
        locked: isLocked,
      },
      host: {
        id: meeting.host?._id ? meeting.host._id.toString() : undefined,
        name: meeting.host?.name ?? 'Unknown',
      },
    },
  });
}

async function listMeetings(req, res) {
  const { filter, limit } = req.valid.query;
  const now = new Date();
  const registry = req.app?.get?.('registry');

  const rawMeetings = await Meeting.find({ host: req.user._id });

  const mapped = rawMeetings.flatMap((m) => {
    const peers = registry ? registry.getPeers(m.code) : [];
    const isLive = peers.length > 0;
    const participantCount = peers.length;
    return expandOccurrences(m, { isLive, participantCount, now });
  });

  let filtered = mapped;
  if (filter === 'upcoming') {
    filtered = mapped.filter((m) => m.phase === 'upcoming');
  } else if (filter === 'ongoing') {
    filtered = mapped.filter((m) => m.phase === 'ongoing');
  } else if (filter === 'past') {
    filtered = mapped.filter((m) => m.phase === 'past');
  }

  const phaseOrder = { ongoing: 0, upcoming: 1, past: 2 };

  filtered.sort((a, b) => {
    if (a.phase !== b.phase) {
      return (phaseOrder[a.phase] ?? 99) - (phaseOrder[b.phase] ?? 99);
    }
    if (a.phase === 'ongoing') {
      if (a.isLive !== b.isLive) {
        return a.isLive ? -1 : 1;
      }
      const aTime = toEpoch(a.lastActiveAt) || toEpoch(a.startedAt) || toEpoch(a.createdAt);
      const bTime = toEpoch(b.lastActiveAt) || toEpoch(b.startedAt) || toEpoch(b.createdAt);
      return bTime - aTime;
    }
    if (a.phase === 'upcoming') {
      return toEpoch(a.scheduledAt) - toEpoch(b.scheduledAt);
    }
    if (a.phase === 'past') {
      const aTime =
        toEpoch(a.lastActiveAt) ||
        toEpoch(a.startedAt) ||
        toEpoch(a.scheduledAt) ||
        toEpoch(a.createdAt);
      const bTime =
        toEpoch(b.lastActiveAt) ||
        toEpoch(b.startedAt) ||
        toEpoch(b.scheduledAt) ||
        toEpoch(b.createdAt);
      return bTime - aTime;
    }
    return 0;
  });

  res.json({ meetings: filtered.slice(0, limit) });
}

async function updateMeeting(req, res) {
  const meeting = await findOwnedMeeting(req.valid.params.code, req.user);

  if (meeting.status === MEETING_STATUS.CANCELLED) {
    throw new AppError(409, 'MEETING_CANCELLED', 'Cancelled meetings cannot be edited');
  }
  if (meeting.status === MEETING_STATUS.ENDED) {
    throw new AppError(409, 'MEETING_ENDED', 'Ended meetings cannot be edited');
  }

  const {
    title,
    description,
    duration,
    timeZone,
    recurrence,
    scheduledAt,
    passcode,
    settings,
    waitingRoom,
  } = req.body;

  if (title !== undefined) meeting.title = title;
  if (description !== undefined) meeting.description = description;
  if (duration !== undefined) meeting.duration = duration;
  if (timeZone !== undefined) meeting.timeZone = timeZone;
  if (recurrence !== undefined) meeting.recurrence = recurrence;
  if (scheduledAt !== undefined) {
    meeting.scheduledAt = scheduledAt;
    meeting.startsAt = scheduledAt;
  }
  if (waitingRoom !== undefined) {
    meeting.waitingRoom = Boolean(waitingRoom);
  }
  if (passcode !== undefined) {
    if (passcode === null || passcode === '') {
      meeting.passcodeHash = null;
    } else {
      meeting.passcodeHash = await bcrypt.hash(passcode, 10);
    }
  }
  if (settings !== undefined) {
    const current = meeting.settings ? meeting.settings.toObject() : {};
    meeting.settings = {
      muteOnEntry:
        settings.muteOnEntry !== undefined
          ? Boolean(settings.muteOnEntry)
          : current.muteOnEntry ?? false,
      chatAllowed:
        settings.chatAllowed !== undefined
          ? Boolean(settings.chatAllowed)
          : current.chatAllowed ?? true,
      shareAllowed:
        settings.shareAllowed !== undefined
          ? settings.shareAllowed
          : current.shareAllowed ?? 'all',
      locked:
        settings.locked !== undefined ? Boolean(settings.locked) : current.locked ?? false,
    };

    const registry = req.app?.get?.('registry');
    if (registry) {
      registry.setSettings?.(meeting.code, meeting.settings);
      if (settings.locked !== undefined) {
        registry.setLocked?.(meeting.code, meeting.settings.locked);
      }
    }
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

async function downloadCalendarIcs(req, res) {
  const meeting = await Meeting.findOne({ code: req.valid.params.code }).select('+passcodeHash');
  if (!meeting) throw notFound();

  const clientOrigin = process.env.CLIENT_ORIGIN?.split(',')[0] || 'http://localhost:5173';
  const icsContent = generateIcs(meeting, { baseUrl: clientOrigin });

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="meeting-${meeting.code}.ics"`);
  res.send(icsContent);
}

module.exports = {
  createMeeting,
  getMeeting,
  listMeetings,
  updateMeeting,
  cancelMeeting,
  downloadCalendarIcs,
};