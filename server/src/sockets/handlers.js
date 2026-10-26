const bcrypt = require('bcryptjs');
const AppError = require('../utils/AppError');
const { sanitizeError } = require('../utils/sanitizeLog');
const { MEETING_STATUS } = require('../config/constants');
const Meeting = require('../models/Meeting');
const Message = require('../models/Message');
const RateLimiter = require('./rateLimit');
const { passcodeLimiter } = require('../utils/passcodeLimiter');
const {
  joinSchema,
  mediaSchema,
  signalSchema,
  peerTargetSchema,
  emptySchema,
  chatSendSchema,
  shareStartSchema,
  reactionSendSchema,
  handSetSchema,
  feedbackSetSchema,
  hostLockSchema,
  hostSettingsSchema,
  hostRenameSchema,
  hostRemoveSchema,
  codeSchema,
} = require('./schemas');

const defaultRateLimiter = new RateLimiter();

const toPublicPeer = (peer, isHost = false, role = null) => {
  const host = Boolean(isHost || peer.isHost || peer.role === 'host');
  const coHost = Boolean(peer.isCoHost || peer.role === 'co-host');
  const peerRole = role || peer.role || (host ? 'host' : (coHost ? 'co-host' : 'participant'));
  return {
    peerId: peer.peerId,
    user: { id: peer.userId, name: peer.name },
    isHost: host,
    isCoHost: coHost,
    role: peerRole,
    audio: peer.audio,
    video: peer.video,
    handRaised: Boolean(peer.handRaised),
    raisedAt: peer.raisedAt || null,
    feedback: peer.feedback || null,
  };
};

function parse(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const field = result.error.issues[0].path.join('.') || 'payload';
    throw new AppError(400, 'VALIDATION_ERROR', `Invalid ${field}`);
  }
  return result.data;
}

function toAckError(err) {
  if (err instanceof AppError) return { code: err.code, message: err.message };
  console.error(sanitizeError(err));
  return { code: 'INTERNAL_ERROR', message: 'Something went wrong' };
}

// Registers an event whose handler returns the ack data (or throws an AppError).
// Every reply has the shape { ok: true, ...data } or { ok: false, error: { code, message } }.
function on(socket, event, handler) {
  socket.on(event, async (...args) => {
    const ack = typeof args[args.length - 1] === 'function' ? args.pop() : () => {};
    try {
      const data = await handler(args[0]);
      ack({ ok: true, ...data });
    } catch (err) {
      ack({ ok: false, error: toAckError(err) });
    }
  });
}

async function notifyHostWaitingUpdated(io, registry, code, hostIdOverride) {
  const waitingList = registry.getWaiting(code);
  console.log(`[room] waiting count: code=${code} count=${waitingList.length}`);
  let hostId = hostIdOverride || registry.getHost(code);
  if (!hostId) {
    try {
      const meeting = await Meeting.findOne({ code }).select('host coHosts').lean();
      if (meeting?.host) {
        hostId = meeting.host.toString();
        registry.setHost(code, hostId);
      }
      if (meeting?.coHosts?.length) {
        registry.setCoHosts(code, meeting.coHosts.map((id) => id.toString()));
      }
    } catch {
      /* ignore */
    }
  }
  const targets = new Set();
  if (hostId) targets.add(`user:${hostId}`);
  const coHosts = registry.coHosts.get(code);
  if (coHosts) {
    for (const ch of coHosts) {
      targets.add(`user:${ch}`);
    }
  }
  const targetArray = [...targets];
  if (targetArray.length > 0) {
    io.to(targetArray).emit('room:waiting-updated', { waiting: waitingList });
  }
  return targetArray.length;
}

async function recordAdmittedJoin(code, userId) {
  try {
    const now = new Date();
    const res = await Meeting.updateOne(
      { code, startedAt: null },
      {
        $set: { startedAt: now, lastActiveAt: now },
        $addToSet: { attendees: userId },
      }
    );
    if (res.matchedCount === 0) {
      await Meeting.updateOne(
        { code },
        {
          $set: { lastActiveAt: now },
          $addToSet: { attendees: userId },
        }
      );
    }
  } catch (err) {
    console.error(`Failed to record admitted join for meeting ${code}:`, sanitizeError(err));
  }
}

async function recordRoomInactive(code) {
  try {
    await Meeting.updateOne({ code }, { $set: { lastActiveAt: new Date() } });
  } catch (err) {
    console.error(`Failed to record room inactivity for meeting ${code}:`, sanitizeError(err));
  }
}

// Emits an event to every admitted peer in a meeting by collecting each peer's socket id,
// user channel, and the room code, and broadcasting via a single io.to() call so no one
// is missed and no one receives duplicate messages.
function emitToAdmitted(io, registry, code, event, payload) {
  const peers = registry.getPeers(code);
  const targets = new Set();
  targets.add(code);
  for (const peer of peers) {
    if (peer.peerId) targets.add(peer.peerId);
    if (peer.userId) targets.add(`user:${peer.userId}`);
  }
  const targetArray = [...targets];
  if (targetArray.length > 0) {
    io.to(targetArray).emit(event, payload);
  }
  console.log(`[chat] message emitted: code=${code} targetPeersCount=${peers.length}`);
  return peers.length;
}

// Emits an event strictly to the sender and recipient of a private message (their socket IDs and user channels).
// Never emits to the meeting room or other participants.
function emitPrivateMessage(io, registry, code, senderUserId, recipientUserId, event, payload) {
  const peers = registry.getPeers(code);
  const targets = new Set();
  targets.add(`user:${senderUserId}`);
  targets.add(`user:${recipientUserId}`);
  for (const peer of peers) {
    if (String(peer.userId) === String(senderUserId) || String(peer.userId) === String(recipientUserId)) {
      if (peer.peerId) targets.add(peer.peerId);
    }
  }
  const targetArray = [...targets];
  if (targetArray.length > 0) {
    io.to(targetArray).emit(event, payload);
  }
  console.log(`[chat] private message emitted: code=${code} sender=${senderUserId} recipient=${recipientUserId} targets=${targetArray.length}`);
}

// Removes the socket from its room or waiting list (if in one) and notifies peers/host
function leaveRoom(io, registry, socket, limiters) {
  if (limiters) {
    if (limiters instanceof RateLimiter) {
      limiters.reset(socket.id);
    } else {
      for (const limiter of Object.values(limiters)) {
        limiter?.reset?.(socket.id);
      }
    }
  }
  const left = registry.leave(socket.id);
  if (!left) return;

  if (left.type === 'room') {
    socket.leave(left.code);
    io.to(left.code).emit('room:peer-left', { peerId: socket.id });
    if (left.screenShareEnded) {
      io.to(left.code).emit('room:screen-updated', { peerId: null, streamId: null });
    }
    if (left.remaining && left.remaining.length === 0) {
      recordRoomInactive(left.code);
    }
  } else if (left.type === 'waiting') {
    notifyHostWaitingUpdated(io, registry, left.code);
  }
  return left;
}

function assertHost(registry, socket, limiters) {
  return assertModerator(registry, socket, limiters);
}

function assertModerator(registry, socket, limiters) {
  const code = registry.getRoomCode(socket.id);
  if (!code) {
    throw new AppError(403, 'NOT_IN_ROOM', 'Join a meeting first');
  }
  const role = registry.getRole(code, socket.data.user.id);
  if (role !== 'host' && role !== 'co-host') {
    throw new AppError(403, 'FORBIDDEN', 'Only the host can do this');
  }
  if (limiters?.host && !limiters.host.check(socket.id)) {
    throw new AppError(429, 'RATE_LIMITED', 'Too many host requests, please slow down');
  }
  return code;
}

function assertHostOnly(registry, socket, limiters) {
  const code = registry.getRoomCode(socket.id);
  if (!code) {
    throw new AppError(403, 'NOT_IN_ROOM', 'Join a meeting first');
  }
  const role = registry.getRole(code, socket.data.user.id);
  if (role !== 'host') {
    throw new AppError(403, 'FORBIDDEN', 'Only the host can do this');
  }
  if (limiters?.host && !limiters.host.check(socket.id)) {
    throw new AppError(429, 'RATE_LIMITED', 'Too many host requests, please slow down');
  }
  return code;
}

function assertCanActOn(registry, code, actorPeerId, targetPeerId) {
  const actorRole = registry.getRole(code, actorPeerId);
  const targetRole = registry.getRole(code, targetPeerId);
  if (actorRole === 'co-host' && targetRole === 'host') {
    throw new AppError(403, 'FORBIDDEN', 'Co-hosts cannot act on the host');
  }
}

function registerHandlers(io, socket, registry, rateLimiterInput = defaultRateLimiter) {
  const limiters =
    rateLimiterInput instanceof RateLimiter
      ? {
          chat: rateLimiterInput,
          join: new RateLimiter({ max: 10, windowMs: 10000 }),
          signal: new RateLimiter({ max: 300, windowMs: 10000 }),
          host: new RateLimiter({ max: 30, windowMs: 10000 }),
          reaction: new RateLimiter({ max: 1, windowMs: 1000 }),
        }
      : rateLimiterInput || {
          chat: defaultRateLimiter,
          join: new RateLimiter({ max: 10, windowMs: 10000 }),
          signal: new RateLimiter({ max: 300, windowMs: 10000 }),
          host: new RateLimiter({ max: 30, windowMs: 10000 }),
          reaction: new RateLimiter({ max: 1, windowMs: 1000 }),
        };

  if (!limiters.reaction) {
    limiters.reaction = new RateLimiter({ max: 1, windowMs: 1000 });
  }

  on(socket, 'room:join', async (payload) => {
    if (limiters.join && !limiters.join.check(socket.id)) {
      throw new AppError(429, 'RATE_LIMITED', 'Too many join attempts, please slow down');
    }
    const { code, audio, video, passcode } = parse(joinSchema, payload);

    // Join check 1: meeting exists and is active
    const meeting = await Meeting.findOne({ code })
      .select('status host passcodeHash coHosts blocked settings waitingRoom')
      .lean();
    if (!meeting) throw new AppError(404, 'MEETING_NOT_FOUND', 'Meeting not found');
    if (meeting.status === MEETING_STATUS.ENDED) {
      throw new AppError(409, 'MEETING_ENDED', 'This meeting has ended');
    }
    if (meeting.status !== MEETING_STATUS.ACTIVE) {
      throw new AppError(409, 'MEETING_CANCELLED', 'This meeting was cancelled');
    }
    if (socket.disconnected) return {}; // went away during the lookup

    const hostId = meeting.host.toString();
    const userId = socket.data.user.id.toString();
    const isHost = hostId === userId;
    const isCoHost =
      (meeting.coHosts || []).some((id) => id.toString() === userId) ||
      registry.isCoHost(code, userId);

    registry.setHost(code, hostId);
    if (meeting.coHosts?.length) {
      registry.setCoHosts(code, meeting.coHosts.map((id) => id.toString()));
    }
    if (meeting.blocked?.length) {
      registry.setBlockedUsers(code, meeting.blocked.map((id) => id.toString()));
    }
    if (meeting.settings) {
      const current = registry.getSettings(code);
      registry.setSettings(code, {
        muteOnEntry: current.muteOnEntry || Boolean(meeting.settings.muteOnEntry),
        chatAllowed:
          current.chatAllowed !== undefined
            ? current.chatAllowed
            : meeting.settings.chatAllowed !== false,
        shareAllowed: current.shareAllowed || meeting.settings.shareAllowed || 'all',
        locked: current.locked || Boolean(meeting.settings.locked),
      });
    }

    // Join check 2: not blocked (BLOCKED)
    const isUserBlocked =
      (meeting.blocked || []).some((id) => id.toString() === userId) ||
      registry.isBlocked(code, userId);
    if (isUserBlocked) {
      throw new AppError(403, 'BLOCKED', 'You have been blocked from this meeting');
    }

    const alreadyInRoom = registry.getRoomCode(socket.id) === code;
    const alreadyAdmitted = alreadyInRoom || registry.isAdmitted(code, userId);

    // Join check 3: not locked unless host, co-host or already admitted (MEETING_LOCKED)
    const isLocked = registry.isLocked(code) || Boolean(meeting.settings?.locked);
    if (isLocked && !isHost && !isCoHost && !alreadyAdmitted) {
      throw new AppError(403, 'MEETING_LOCKED', 'This meeting is locked');
    }

    // Join check 4: passcode (PASSCODE_REQUIRED or PASSCODE_INVALID; 5 wrong attempts per user and meeting per 10 minutes then RATE_LIMITED)
    if (meeting.passcodeHash && !isHost && !isCoHost && !alreadyAdmitted) {
      const userKey = userId || socket.handshake.address;
      if (passcodeLimiter.isBlocked(userKey, code)) {
        throw new AppError(
          429,
          'RATE_LIMITED',
          'Too many incorrect passcode attempts. Please try again in 10 minutes.'
        );
      }
      if (!passcode) {
        throw new AppError(401, 'PASSCODE_REQUIRED', 'Passcode is required for this meeting');
      }
      const match = await bcrypt.compare(passcode, meeting.passcodeHash);
      if (!match) {
        passcodeLimiter.recordFailure(userKey, code);
        throw new AppError(401, 'PASSCODE_INVALID', 'Invalid meeting passcode');
      }
      passcodeLimiter.reset(userKey, code);
    }

    // Join checks 5 & 6: waiting room & capacity
    const waitingRoom = meeting.waitingRoom !== false;
    const roomSettings = registry.getSettings(code);
    const initialAudio = roomSettings.muteOnEntry && !isHost && !isCoHost ? false : audio;
    const { user } = socket.data;

    const joinResult = registry.join(code, {
      peerId: socket.id,
      userId: user.id,
      name: user.name,
      audio: initialAudio,
      video,
      isHost,
      waitingRoom,
    });

    // Newer session wins: older socket is kicked
    for (const old of joinResult.replaced) {
      const oldSocket = io.sockets.sockets.get(old.peerId);
      if (oldSocket) {
        oldSocket.emit('room:kicked', { reason: 'JOINED_ELSEWHERE' });
        await oldSocket.leave(code);
      }
      if (joinResult.status === 'admitted') {
        io.to(code).emit('room:peer-left', { peerId: old.peerId });
      }
    }

    if (socket.disconnected) {
      leaveRoom(io, registry, socket);
      return {};
    }

    if (joinResult.status === 'waiting') {
      // Waiting sockets do NOT join the broadcast room and receive no peer signals
      const notifiedCount = await notifyHostWaitingUpdated(io, registry, code, hostId);
      console.log(
        `[room] join: code=${code} userId=${user.id} isHost=${isHost} status=waiting hostInRoom=${Boolean(joinResult.hostInRoom)} notifiedSockets=${notifiedCount}`
      );
      return {
        status: 'waiting',
        hostInRoom: Boolean(joinResult.hostInRoom),
        settings: registry.getSettings(code),
        locked: registry.isLocked(code),
      };
    }

    // Admitted to active room
    const peersInRoom = io.sockets?.adapter?.rooms?.get(code)?.size || 0;
    let notifiedCount = 0;
    await socket.join(code);
    await recordAdmittedJoin(code, user.id);
    if (!alreadyInRoom) {
      socket.to(code).emit(
        'room:peer-joined',
        toPublicPeer(joinResult.peer, isHost, joinResult.role)
      );
      notifiedCount = peersInRoom;
    }

    // Send host their current waiting list upon entering the room
    if (isHost || joinResult.role === 'co-host') {
      socket.emit('room:waiting-updated', { waiting: registry.getWaiting(code) });
      notifiedCount += 1;
    }

    console.log(
      `[room] join: code=${code} userId=${user.id} isHost=${isHost} role=${joinResult.role} status=admitted hostInRoom=${registry.isHostInRoom(code)} notifiedSockets=${notifiedCount}`
    );

    return {
      status: 'admitted',
      peerId: socket.id,
      peers: joinResult.peers.map((p) =>
        toPublicPeer(p, registry.isHost(code, p.userId), registry.getRole(code, p.userId))
      ),
      isHost,
      isCoHost: joinResult.role === 'co-host',
      role: joinResult.role,
      settings: registry.getSettings(code),
      locked: registry.isLocked(code),
      screenSharer: registry.getScreenSharer(code),
      handRaised: Boolean(joinResult.peer.handRaised),
      raisedAt: joinResult.peer.raisedAt || null,
      feedback: joinResult.peer.feedback || null,
    };
  });

  // Query authenticated caller's own status in a meeting
  on(socket, 'room:status', async (payload) => {
    const { code } = parse(codeSchema, payload);

    const meeting = await Meeting.findOne({ code }).select('status host coHosts settings').lean();
    if (!meeting) {
      throw new AppError(404, 'MEETING_NOT_FOUND', 'Meeting not found');
    }

    const userId = String(socket.data.user.id);

    // 1. Database ended or cancelled status wins
    if (
      meeting.status === MEETING_STATUS.ENDED ||
      meeting.status === MEETING_STATUS.CANCELLED
    ) {
      return { status: 'ended' };
    }

    const isHostUser = String(meeting.host) === userId || registry.isHost(code, userId);
    const isCoHostUser =
      (meeting.coHosts || []).some((id) => id.toString() === userId) ||
      registry.isCoHost(code, userId);
    const myRole = isHostUser ? 'host' : (isCoHostUser ? 'co-host' : registry.getRole(code, userId));

    // 2. Host
    if (isHostUser) {
      return {
        status: 'host',
        peers: registry
          .getPeers(code)
          .filter((p) => String(p.userId) !== userId)
          .map((p) => toPublicPeer(p, registry.isHost(code, p.userId), registry.getRole(code, p.userId))),
        screenSharer: registry.getScreenSharer(code),
        role: 'host',
        isHost: true,
        isCoHost: false,
        settings: registry.getSettings(code),
        locked: registry.isLocked(code),
      };
    }

    // 3. Denied
    if (registry.isDenied(code, userId)) {
      return { status: 'denied' };
    }

    // 4. Removed
    if (registry.isRemoved(code, userId)) {
      return { status: 'removed' };
    }

    // 5. Waiting
    const waitingUsers = registry.getWaiting(code);
    if (waitingUsers.some((w) => String(w.user?.id || w.userId) === userId)) {
      return {
        status: 'waiting',
        settings: registry.getSettings(code),
        locked: registry.isLocked(code),
      };
    }

    // 6. Admitted
    const roomPeers = registry.getPeers(code);
    const myPeer = roomPeers.find((p) => String(p.userId) === userId);
    if (myPeer || registry.isAdmitted(code, userId)) {
      try {
        await socket.join(code);
      } catch {
        /* ignore */
      }
      return {
        status: 'admitted',
        peerId: myPeer ? myPeer.peerId : socket.id,
        peers: roomPeers
          .filter((p) => String(p.userId) !== userId)
          .map((p) => toPublicPeer(p, registry.isHost(code, p.userId), registry.getRole(code, p.userId))),
        screenSharer: registry.getScreenSharer(code),
        role: myRole,
        isHost: false,
        isCoHost: isCoHostUser,
        settings: registry.getSettings(code),
        locked: registry.isLocked(code),
      };
    }

    // 7. None
    return {
      status: 'none',
      settings: registry.getSettings(code),
      locked: registry.isLocked(code),
    };
  });

  // Host or co-host queries the waiting list
  on(socket, 'host:list-waiting', async (payload) => {
    if (limiters?.host && !limiters.host.check(socket.id)) {
      throw new AppError(429, 'RATE_LIMITED', 'Too many host requests, please slow down');
    }
    const { code } = parse(codeSchema, payload);

    const meeting = await Meeting.findOne({ code }).select('host coHosts').lean();
    if (!meeting) {
      throw new AppError(404, 'MEETING_NOT_FOUND', 'Meeting not found');
    }

    const hostId = meeting.host.toString();
    const userId = socket.data.user.id.toString();
    const isHost = hostId === userId;
    const isCoHost =
      (meeting.coHosts || []).some((id) => id.toString() === userId) ||
      registry.isCoHost(code, userId);

    if (!isHost && !isCoHost) {
      throw new AppError(403, 'FORBIDDEN', 'Only the host or co-host can do this');
    }

    registry.setHost(code, hostId);
    if (meeting.coHosts?.length) {
      registry.setCoHosts(code, meeting.coHosts.map((id) => id.toString()));
    }
    return { waiting: registry.getWaiting(code) };
  });

  // Host or co-host admits a waiting guest
  on(socket, 'host:admit', async (payload) => {
    const code = assertModerator(registry, socket, limiters);
    const { peerId } = parse(peerTargetSchema, payload);

    const { peer, peers } = registry.admit(code, peerId);
    await recordAdmittedJoin(code, peer.userId);

    const admitPayload = {
      peerId,
      peers: peers.map((p) =>
        toPublicPeer(p, registry.isHost(code, p.userId), registry.getRole(code, p.userId))
      ),
      screenSharer: registry.getScreenSharer(code),
      settings: registry.getSettings(code),
      locked: registry.isLocked(code),
      role: 'participant',
    };

    const guestSocket = io.sockets.sockets.get(peerId);
    if (guestSocket) {
      await guestSocket.join(code);
      guestSocket.emit('room:admitted', admitPayload);
      guestSocket.to(code).emit(
        'room:peer-joined',
        toPublicPeer(peer, registry.isHost(code, peer.userId), registry.getRole(code, peer.userId))
      );
    } else {
      io.to(peerId).emit('room:admitted', admitPayload);
      io.to(code).emit(
        'room:peer-joined',
        toPublicPeer(peer, registry.isHost(code, peer.userId), registry.getRole(code, peer.userId))
      );
    }

    io.to(`user:${peer.userId}`).emit('room:admitted', admitPayload);
    try {
      const userSockets = await io.in(`user:${peer.userId}`).fetchSockets();
      for (const s of userSockets) {
        s.join(code);
      }
    } catch {
      /* ignore */
    }

    const socketFound = Boolean(guestSocket);
    const userSocketsCount = io.sockets?.adapter?.rooms?.get(`user:${peer.userId}`)?.size || 0;
    console.log(
      `[room] host:admit: targetPeerId=${peerId} socketFound=${socketFound} userSocketsCount=${userSocketsCount}`
    );

    notifyHostWaitingUpdated(io, registry, code);
    return {};
  });

  // Host or co-host denies a waiting guest
  on(socket, 'host:deny', async (payload) => {
    const code = assertModerator(registry, socket, limiters);
    const { peerId } = parse(peerTargetSchema, payload);

    const { waitingUser } = registry.deny(code, peerId);
    io.to(peerId).emit('room:denied', {});
    if (waitingUser?.userId) {
      io.to(`user:${waitingUser.userId}`).emit('room:denied', {});
    }

    await notifyHostWaitingUpdated(io, registry, code);
    return {};
  });

  // Host or co-host admits all waiting participants up to room capacity
  on(socket, 'host:admit-all', async (payload) => {
    const code = assertModerator(registry, socket, limiters);
    parse(emptySchema, payload);

    const { admitted } = registry.admitAll(code);
    for (const item of admitted) {
      await recordAdmittedJoin(code, item.peer.userId);
      const admitPayload = {
        peerId: item.peer.peerId,
        peers: item.peers.map((p) =>
          toPublicPeer(p, registry.isHost(code, p.userId), registry.getRole(code, p.userId))
        ),
        screenSharer: registry.getScreenSharer(code),
        settings: registry.getSettings(code),
        locked: registry.isLocked(code),
        role: 'participant',
      };

      const guestSocket = io.sockets.sockets.get(item.peer.peerId);
      if (guestSocket) {
        await guestSocket.join(code);
        guestSocket.emit('room:admitted', admitPayload);
        guestSocket.to(code).emit(
          'room:peer-joined',
          toPublicPeer(
            item.peer,
            registry.isHost(code, item.peer.userId),
            registry.getRole(code, item.peer.userId)
          )
        );
      } else {
        io.to(item.peer.peerId).emit('room:admitted', admitPayload);
        io.to(code).emit(
          'room:peer-joined',
          toPublicPeer(
            item.peer,
            registry.isHost(code, item.peer.userId),
            registry.getRole(code, item.peer.userId)
          )
        );
      }

      io.to(`user:${item.peer.userId}`).emit('room:admitted', admitPayload);
      try {
        const userSockets = await io.in(`user:${item.peer.userId}`).fetchSockets();
        for (const s of userSockets) {
          s.join(code);
        }
      } catch {
        /* ignore */
      }
    }

    notifyHostWaitingUpdated(io, registry, code);
    return {};
  });

  // Host or co-host locks/unlocks the room
  on(socket, 'host:lock', async (payload) => {
    const code = assertModerator(registry, socket, limiters);
    const { locked } = parse(hostLockSchema, payload);

    const updatedSettings = registry.setLocked(code, locked);
    await Meeting.updateOne({ code }, { $set: { 'settings.locked': locked } }).catch(() => {});

    io.to(code).emit('room:locked', { locked });
    io.to(code).emit('room:settings-changed', { settings: updatedSettings });
    return { locked };
  });

  // Host or co-host updates room security settings
  on(socket, 'host:settings', async (payload) => {
    const code = assertModerator(registry, socket, limiters);
    const input = payload?.settings ? payload.settings : payload;
    const newSettings = parse(hostSettingsSchema, input);
    const updatedSettings = registry.setSettings(code, newSettings);

    const updateFields = {};
    if (newSettings.muteOnEntry !== undefined) updateFields['settings.muteOnEntry'] = newSettings.muteOnEntry;
    if (newSettings.chatAllowed !== undefined) updateFields['settings.chatAllowed'] = newSettings.chatAllowed;
    if (newSettings.shareAllowed !== undefined) updateFields['settings.shareAllowed'] = newSettings.shareAllowed;
    if (newSettings.locked !== undefined) updateFields['settings.locked'] = newSettings.locked;
    if (Object.keys(updateFields).length > 0) {
      await Meeting.updateOne({ code }, { $set: updateFields }).catch(() => {});
    }

    io.to(code).emit('room:settings-changed', { settings: updatedSettings });
    if (newSettings.locked !== undefined) {
      io.to(code).emit('room:locked', { locked: updatedSettings.locked });
    }
    return { settings: updatedSettings };
  });

  // Host ONLY promotes a participant to co-host
  on(socket, 'host:promote', async (payload) => {
    const code = assertHostOnly(registry, socket, limiters);
    const { peerId } = parse(peerTargetSchema, payload);

    const targetPeer = registry.getPeer(peerId);
    if (!targetPeer) {
      throw new AppError(404, 'PEER_NOT_FOUND', 'Participant is not in this meeting');
    }

    registry.promoteCoHost(code, peerId);
    await Meeting.updateOne({ code }, { $addToSet: { coHosts: targetPeer.userId } }).catch(() => {});

    io.to(code).emit('peer:role-changed', {
      peerId,
      userId: targetPeer.userId,
      role: 'co-host',
      isCoHost: true,
    });
    return { peerId, role: 'co-host' };
  });

  // Host ONLY demotes a co-host to participant
  on(socket, 'host:demote', async (payload) => {
    const code = assertHostOnly(registry, socket, limiters);
    const { peerId } = parse(peerTargetSchema, payload);

    const targetPeer = registry.getPeer(peerId);
    if (!targetPeer) {
      throw new AppError(404, 'PEER_NOT_FOUND', 'Participant is not in this meeting');
    }

    registry.demoteCoHost(code, peerId);
    await Meeting.updateOne({ code }, { $pull: { coHosts: targetPeer.userId } }).catch(() => {});

    io.to(code).emit('peer:role-changed', {
      peerId,
      userId: targetPeer.userId,
      role: 'participant',
      isCoHost: false,
    });
    return { peerId, role: 'participant' };
  });

  // Host or co-host instructs client to mute microphone
  on(socket, 'host:mute', async (payload) => {
    const code = assertModerator(registry, socket, limiters);
    const { peerId } = parse(peerTargetSchema, payload);

    assertCanActOn(registry, code, socket.id, peerId);
    const targetPeer = registry.getPeer(peerId);
    if (!targetPeer) {
      throw new AppError(404, 'PEER_NOT_FOUND', 'Participant is not in this meeting');
    }

    const hostName = socket.data?.user?.name || 'Host';
    io.to(peerId).emit('host:command-mute', { by: hostName });
    if (targetPeer.userId) {
      io.to(`user:${targetPeer.userId}`).emit('host:command-mute', { by: hostName });
    }
    return { peerId };
  });

  // Host or co-host mutes all participants (excluding caller and room host)
  on(socket, 'host:mute-all', async (payload) => {
    const code = assertModerator(registry, socket, limiters);
    parse(emptySchema, payload);

    const hostName = socket.data?.user?.name || 'Host';
    const peers = registry.getPeers(code);
    for (const peer of peers) {
      if (peer.peerId === socket.id) continue;
      if (registry.isHost(code, peer.userId)) continue;

      io.to(peer.peerId).emit('host:command-mute', { by: hostName });
      if (peer.userId) {
        io.to(`user:${peer.userId}`).emit('host:command-mute', { by: hostName });
      }
    }
    return {};
  });

  // Host or co-host requests participant to unmute (dismissable prompt, never forced)
  on(socket, 'host:request-unmute', async (payload) => {
    const code = assertModerator(registry, socket, limiters);
    const { peerId } = parse(peerTargetSchema, payload);

    assertCanActOn(registry, code, socket.id, peerId);
    const targetPeer = registry.getPeer(peerId);
    if (!targetPeer) {
      throw new AppError(404, 'PEER_NOT_FOUND', 'Participant is not in this meeting');
    }

    const hostName = socket.data?.user?.name || 'Host';
    io.to(peerId).emit('host:command-request-unmute', { by: hostName });
    if (targetPeer.userId) {
      io.to(`user:${targetPeer.userId}`).emit('host:command-request-unmute', { by: hostName });
    }
    return { peerId };
  });

  // Host or co-host stops a participant's video
  on(socket, 'host:stop-video', async (payload) => {
    const code = assertModerator(registry, socket, limiters);
    const { peerId } = parse(peerTargetSchema, payload);

    assertCanActOn(registry, code, socket.id, peerId);
    const targetPeer = registry.getPeer(peerId);
    if (!targetPeer) {
      throw new AppError(404, 'PEER_NOT_FOUND', 'Participant is not in this meeting');
    }

    const hostName = socket.data?.user?.name || 'Host';
    io.to(peerId).emit('host:command-stop-video', { by: hostName });
    if (targetPeer.userId) {
      io.to(`user:${targetPeer.userId}`).emit('host:command-stop-video', { by: hostName });
    }
    return { peerId };
  });

  // Host or co-host renames a participant for this room only
  on(socket, 'host:rename', async (payload) => {
    const code = assertModerator(registry, socket, limiters);
    const { peerId, name } = parse(hostRenameSchema, payload);

    assertCanActOn(registry, code, socket.id, peerId);
    const renamedResult = registry.renamePeer(code, peerId, name);
    if (!renamedResult) {
      throw new AppError(404, 'PEER_NOT_FOUND', 'Participant is not in this meeting');
    }
    const renamed = renamedResult.peer || renamedResult;

    io.to(code).emit('peer:renamed', {
      peerId,
      userId: renamed.userId,
      name: renamed.name,
    });
    io.to(code).emit('room:peer-updated', {
      peerId,
      name: renamed.name,
    });
    return { peerId, name: renamed.name };
  });

  // Host or co-host removes an active participant (optional block)
  on(socket, 'host:remove', async (payload) => {
    const code = assertModerator(registry, socket, limiters);
    const { peerId, block } = parse(hostRemoveSchema, payload);

    if (peerId === socket.id) {
      throw new AppError(400, 'CANNOT_REMOVE_SELF', 'Cannot remove yourself');
    }

    assertCanActOn(registry, code, socket.id, peerId);

    const targetPeer = registry.getPeer(peerId);
    if (block && targetPeer?.userId) {
      await Meeting.updateOne(
        { code },
        { $addToSet: { blocked: targetPeer.userId } }
      ).catch(() => {});
      registry.addBlocked(code, targetPeer.userId);
    }

    const removed = registry.remove(code, peerId, { block: Boolean(block) });
    const reason = block ? 'BLOCKED' : 'REMOVED_BY_HOST';
    const removePayload = { reason };

    io.to(peerId).emit('room:removed', removePayload);
    if (removed.peer?.userId) {
      io.to(`user:${removed.peer.userId}`).emit('room:removed', removePayload);
      try {
        const userSockets = await io.in(`user:${removed.peer.userId}`).fetchSockets();
        for (const s of userSockets) {
          s.leave(code);
        }
      } catch {
        /* ignore */
      }
    }

    const targetSocket = io.sockets.sockets.get(peerId);
    if (targetSocket) {
      await targetSocket.leave(code);
    }

    io.to(code).emit('room:peer-left', { peerId });
    if (removed.screenShareEnded) {
      io.to(code).emit('room:screen-updated', { peerId: null, streamId: null });
    }
    if (removed.remaining && removed.remaining.length === 0) {
      recordRoomInactive(code);
    }
    return {};
  });

  // Host ONLY ends the meeting for everyone
  on(socket, 'host:end', async (payload) => {
    const code = assertHostOnly(registry, socket, limiters);
    parse(emptySchema, payload);

    await Meeting.updateOne(
      { code },
      { $set: { status: MEETING_STATUS.ENDED, lastActiveAt: new Date() } }
    ).catch((err) => console.error(`Failed to update meeting status on end for ${code}:`, sanitizeError(err)));

    const { peers, waiting } = registry.end(code);
    if (waiting && waiting.length > 0) {
      console.log(`[room] waiting count: code=${code} count=0`);
    }

    io.to(code).emit('room:ended', {});

    const hostUserCount = io.sockets?.adapter?.rooms?.get(`user:${socket.data.user.id}`)?.size || 0;
    io.to(`user:${socket.data.user.id}`).emit('room:ended', {});
    console.log(
      `[room] host:end: targetPeerId=${socket.id} socketFound=true userSocketsCount=${hostUserCount}`
    );

    for (const w of waiting) {
      const socketFound = Boolean(io.sockets.sockets.get(w.peerId));
      const userSocketsCount = w.userId
        ? io.sockets?.adapter?.rooms?.get(`user:${w.userId}`)?.size || 0
        : 0;
      io.to(w.peerId).emit('room:ended', {});
      if (w.userId) {
        io.to(`user:${w.userId}`).emit('room:ended', {});
      }
      console.log(
        `[room] host:end: targetPeerId=${w.peerId} socketFound=${socketFound} userSocketsCount=${userSocketsCount}`
      );
    }

    for (const p of peers) {
      const socketFound = Boolean(io.sockets.sockets.get(p.peerId));
      const userSocketsCount = p.userId
        ? io.sockets?.adapter?.rooms?.get(`user:${p.userId}`)?.size || 0
        : 0;
      io.to(p.peerId).emit('room:ended', {});
      if (p.userId) {
        io.to(`user:${p.userId}`).emit('room:ended', {});
      }
      const s = io.sockets.sockets.get(p.peerId);
      s?.leave(code);
      console.log(
        `[room] host:end: targetPeerId=${p.peerId} socketFound=${socketFound} userSocketsCount=${userSocketsCount}`
      );
    }

    return {};
  });

  // Microphone and camera state relay
  on(socket, 'media:update', (payload) => {
    const { audio, video } = parse(mediaSchema, payload);

    const updated = registry.setMedia(socket.id, { audio, video });
    if (!updated) throw new AppError(403, 'NOT_IN_ROOM', 'Join a meeting first');

    socket.to(updated.code).emit('room:peer-updated', { peerId: socket.id, audio, video });
    return {};
  });

  // Screen sharing handlers
  on(socket, 'share:start', (payload) => {
    const { streamId } = parse(shareStartSchema, payload);
    const code = registry.getRoomCode(socket.id);
    if (!code) {
      throw new AppError(403, 'NOT_IN_ROOM', 'Join a meeting first');
    }

    const settings = registry.getSettings(code);
    const canModerate = registry.canModerate(code, socket.data.user.id);
    if (settings.shareAllowed === 'host-only' && !canModerate) {
      throw new AppError(403, 'SHARE_NOT_ALLOWED', 'Screen sharing is restricted to hosts');
    }

    registry.startScreenShare(code, socket.id, streamId);
    io.to(code).emit('room:screen-updated', { peerId: socket.id, streamId });
    return {};
  });

  on(socket, 'share:stop', (payload) => {
    parse(emptySchema, payload);
    const code = registry.getRoomCode(socket.id);
    if (!code) {
      throw new AppError(403, 'NOT_IN_ROOM', 'Join a meeting first');
    }

    const stopped = registry.stopScreenShare(code, socket.id);
    if (stopped) {
      io.to(code).emit('room:screen-updated', { peerId: null, streamId: null });
    }
    return {};
  });

  on(socket, 'host:stop-share', (payload) => {
    const code = assertModerator(registry, socket, limiters);
    parse(emptySchema, payload);

    const cleared = registry.clearScreenShare(code);
    if (cleared) {
      io.to(code).emit('room:screen-updated', { peerId: null, streamId: null });
    }
    return {};
  });

  // reaction:send { kind }
  // Admitted peers only, zod validation, 1 reaction/sec rate limit, broadcast to admitted peers
  on(socket, 'reaction:send', async (payload) => {
    const { kind } = parse(reactionSendSchema, payload);

    const code = registry.getRoomCode(socket.id);
    if (!code) {
      throw new AppError(403, 'NOT_IN_ROOM', 'Participant is not in this meeting');
    }

    if (limiters.reaction && !limiters.reaction.check(socket.id)) {
      throw new AppError(429, 'RATE_LIMITED', "You're sending reactions too fast");
    }

    const { user } = socket.data;
    const reactionPayload = {
      peerId: socket.id,
      userId: user.id,
      name: user.name,
      kind,
      timestamp: Date.now(),
    };

    emitToAdmitted(io, registry, code, 'reaction:new', reactionPayload);
    return { ...reactionPayload };
  });

  // hand:set { raised, peerId? }
  // Admitted peers only, zod validation, stored in room registry, broadcast to admitted peers
  on(socket, 'hand:set', async (payload) => {
    const { raised, peerId: requestedPeerId } = parse(handSetSchema, payload);

    const code = registry.getRoomCode(socket.id);
    if (!code) {
      throw new AppError(403, 'NOT_IN_ROOM', 'Participant is not in this meeting');
    }

    // A host or co-host can lower another peer's hand; otherwise target is self
    let targetPeerId = socket.id;
    if (requestedPeerId && requestedPeerId !== socket.id) {
      if (!registry.canModerate(code, socket.data.user.id)) {
        throw new AppError(403, 'FORBIDDEN', 'Only the host or co-host can modify other participants');
      }
      assertCanActOn(registry, code, socket.id, requestedPeerId);
      targetPeerId = requestedPeerId;
    }

    const updated = registry.setHand(targetPeerId, raised);
    if (!updated) {
      throw new AppError(404, 'PEER_NOT_FOUND', 'Participant is not in this meeting');
    }

    const targetPeer = updated.peer;
    const handPayload = {
      peerId: targetPeer.peerId,
      userId: targetPeer.userId,
      name: targetPeer.name,
      raised: targetPeer.handRaised,
      raisedAt: targetPeer.raisedAt,
    };

    emitToAdmitted(io, registry, code, 'hand:changed', handPayload);
    io.to(code).emit('room:peer-updated', {
      peerId: targetPeer.peerId,
      handRaised: targetPeer.handRaised,
      raisedAt: targetPeer.raisedAt,
    });

    return { ...handPayload };
  });

  // feedback:set { kind }
  // Admitted peers only, zod validation, stored in room registry, broadcast to admitted peers
  on(socket, 'feedback:set', async (payload) => {
    const { kind } = parse(feedbackSetSchema, payload);

    const code = registry.getRoomCode(socket.id);
    if (!code) {
      throw new AppError(403, 'NOT_IN_ROOM', 'Participant is not in this meeting');
    }

    const updated = registry.setFeedback(socket.id, kind);
    if (!updated) {
      throw new AppError(404, 'PEER_NOT_FOUND', 'Participant is not in this meeting');
    }

    const { user } = socket.data;
    const feedbackPayload = {
      peerId: socket.id,
      userId: user.id,
      name: user.name,
      kind: updated.peer.feedback,
    };

    emitToAdmitted(io, registry, code, 'feedback:changed', feedbackPayload);
    io.to(code).emit('room:peer-updated', {
      peerId: socket.id,
      feedback: updated.peer.feedback,
    });

    return { ...feedbackPayload };
  });

  // chat:send { text, to? }
  on(socket, 'chat:send', async (payload) => {
    const { text, to } = parse(chatSendSchema, payload);

    const code = registry.getRoomCode(socket.id);
    if (!code) {
      throw new AppError(403, 'NOT_IN_ROOM', 'Join a meeting first');
    }

    const settings = registry.getSettings(code);
    const canModerate = registry.canModerate(code, socket.data.user.id);
    if (!settings.chatAllowed && !canModerate) {
      throw new AppError(403, 'CHAT_DISABLED', 'Chat is disabled by the host');
    }

    if (!limiters.chat.check(socket.id)) {
      throw new AppError(429, 'RATE_LIMITED', "You're sending messages too fast");
    }

    const { user } = socket.data;

    let recipientPeer = null;
    if (to) {
      if (String(to) === String(user.id)) {
        throw new AppError(400, 'CANNOT_MESSAGE_SELF', 'Cannot message yourself');
      }
      const peers = registry.getPeers(code);
      recipientPeer = peers.find((p) => String(p.userId) === String(to));
      if (!recipientPeer) {
        throw new AppError(404, 'RECIPIENT_NOT_IN_ROOM', 'Recipient is not admitted or has left');
      }
    }

    const meeting = await Meeting.findOne({ code }).select('_id host').lean();
    if (!meeting) {
      throw new AppError(404, 'MEETING_NOT_FOUND', 'Meeting not found');
    }

    let saved;
    try {
      const docData = {
        meeting: meeting._id,
        user: user.id,
        name: user.name,
        text,
      };
      if (recipientPeer) {
        docData.to = recipientPeer.userId;
        docData.toName = recipientPeer.name;
      }
      saved = await Message.create(docData);
    } catch (err) {
      console.error(`Failed to persist chat message in room ${code}:`, sanitizeError(err));
      throw new AppError(500, 'CHAT_FAILED', 'Failed to save message');
    }

    const hostId = meeting.host ? meeting.host.toString() : '';
    const message = {
      id: saved._id.toString(),
      from: {
        id: user.id,
        name: user.name,
        isHost: user.id.toString() === hostId,
      },
      text: saved.text,
      createdAt: saved.createdAt.toISOString(),
    };
    if (saved.to) {
      message.to = {
        id: saved.to.toString(),
        name: saved.toName,
      };
    }

    if (recipientPeer) {
      emitPrivateMessage(io, registry, code, user.id, recipientPeer.userId, 'chat:message', message);
    } else {
      emitToAdmitted(io, registry, code, 'chat:message', message);
    }

    return { message };
  });

  on(socket, 'room:leave', () => {
    leaveRoom(io, registry, socket, limiters);
    return {};
  });

  on(socket, 'signal', (payload) => {
    if (limiters.signal && !limiters.signal.check(socket.id)) {
      throw new AppError(429, 'RATE_LIMITED', 'Too many signaling messages, please slow down');
    }
    const { to, description, candidate } = parse(signalSchema, payload);

    if (registry.getRoomCode(socket.id) === null) {
      throw new AppError(403, 'NOT_IN_ROOM', 'Join a meeting first');
    }
    // Same answer for "no such peer" and "peer in another room": rooms stay private
    if (!registry.areInSameRoom(socket.id, to)) {
      throw new AppError(404, 'PEER_NOT_FOUND', 'That participant is not in this meeting');
    }

    // "from" is always the real sender, whatever the payload claimed
    io.to(to).emit('signal', {
      from: socket.id,
      ...(description && { description }),
      ...(candidate && { candidate }),
    });
    return {};
  });

  socket.on('disconnect', () => {
    limiters?.reaction?.reset(socket.id);
    const left = leaveRoom(io, registry, socket, limiters);
    const removedFrom = left
      ? (left.type === 'waiting' ? `waiting:${left.code}` : `room:${left.code}`)
      : 'none';
    console.log(`[room] disconnect: peerId=${socket.id} removedFrom=${removedFrom}`);
  });
}

module.exports = { registerHandlers, leaveRoom, emitToAdmitted };
