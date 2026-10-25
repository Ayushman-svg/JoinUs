const AppError = require('../utils/AppError');
const { MEETING_STATUS } = require('../config/constants');
const Meeting = require('../models/Meeting');
const Message = require('../models/Message');
const RateLimiter = require('./rateLimit');
const {
  joinSchema,
  mediaSchema,
  signalSchema,
  peerTargetSchema,
  emptySchema,
  chatSendSchema,
  shareStartSchema,
  codeSchema,
} = require('./schemas');

const defaultRateLimiter = new RateLimiter();

const toPublicPeer = (peer) => ({
  peerId: peer.peerId,
  user: { id: peer.userId, name: peer.name },
  audio: peer.audio,
  video: peer.video,
});

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
  console.error(err);
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
      const meeting = await Meeting.findOne({ code }).select('host').lean();
      if (meeting?.host) {
        hostId = meeting.host.toString();
        registry.setHost(code, hostId);
      }
    } catch {
      /* ignore */
    }
  }
  if (!hostId) return 0;
  const roomName = `user:${hostId}`;
  const notifiedCount = io.sockets?.adapter?.rooms?.get(roomName)?.size || 0;
  io.to(roomName).emit('room:waiting-updated', { waiting: waitingList });
  return notifiedCount;
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
    console.error(`Failed to record admitted join for meeting ${code}:`, err);
  }
}

async function recordRoomInactive(code) {
  try {
    await Meeting.updateOne({ code }, { $set: { lastActiveAt: new Date() } });
  } catch (err) {
    console.error(`Failed to record room inactivity for meeting ${code}:`, err);
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
  const code = registry.getRoomCode(socket.id);
  if (!code) {
    throw new AppError(403, 'NOT_IN_ROOM', 'Join a meeting first');
  }
  if (!registry.isHost(code, socket.data.user.id)) {
    throw new AppError(403, 'FORBIDDEN', 'Only the host can do this');
  }
  if (limiters?.host && !limiters.host.check(socket.id)) {
    throw new AppError(429, 'RATE_LIMITED', 'Too many host requests, please slow down');
  }
  return code;
}

function registerHandlers(io, socket, registry, rateLimiterInput = defaultRateLimiter) {
  const limiters =
    rateLimiterInput instanceof RateLimiter
      ? {
          chat: rateLimiterInput,
          join: new RateLimiter({ max: 10, windowMs: 10000 }),
          signal: new RateLimiter({ max: 300, windowMs: 10000 }),
          host: new RateLimiter({ max: 30, windowMs: 10000 }),
        }
      : rateLimiterInput || {
          chat: defaultRateLimiter,
          join: new RateLimiter({ max: 10, windowMs: 10000 }),
          signal: new RateLimiter({ max: 300, windowMs: 10000 }),
          host: new RateLimiter({ max: 30, windowMs: 10000 }),
        };

  on(socket, 'room:join', async (payload) => {
    if (limiters.join && !limiters.join.check(socket.id)) {
      throw new AppError(429, 'RATE_LIMITED', 'Too many join attempts, please slow down');
    }
    const { code, audio, video } = parse(joinSchema, payload);

    const meeting = await Meeting.findOne({ code }).select('status host waitingRoom').lean();
    if (!meeting) throw new AppError(404, 'MEETING_NOT_FOUND', 'Meeting not found');
    if (meeting.status === MEETING_STATUS.ENDED) {
      throw new AppError(409, 'MEETING_ENDED', 'This meeting has ended');
    }
    if (meeting.status !== MEETING_STATUS.ACTIVE) {
      throw new AppError(409, 'MEETING_CANCELLED', 'This meeting was cancelled');
    }
    if (socket.disconnected) return {}; // went away during the lookup

    const hostId = meeting.host.toString();
    const isHost = hostId === socket.data.user.id.toString();
    const waitingRoom = meeting.waitingRoom !== false;

    registry.setHost(code, hostId);

    const alreadyInRoom = registry.getRoomCode(socket.id) === code;
    const { user } = socket.data; // verified at the handshake, never from the payload

    const joinResult = registry.join(code, {
      peerId: socket.id,
      userId: user.id,
      name: user.name,
      audio,
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
      return { status: 'waiting', hostInRoom: Boolean(joinResult.hostInRoom) };
    }

    // Admitted to active room
    const peersInRoom = io.sockets?.adapter?.rooms?.get(code)?.size || 0;
    let notifiedCount = 0;
    await socket.join(code);
    await recordAdmittedJoin(code, user.id);
    if (!alreadyInRoom) {
      socket.to(code).emit('room:peer-joined', toPublicPeer(joinResult.peer));
      notifiedCount = peersInRoom;
    }

    // Send host their current waiting list upon entering the room
    if (isHost) {
      socket.emit('room:waiting-updated', { waiting: registry.getWaiting(code) });
      notifiedCount += 1;
    }

    console.log(
      `[room] join: code=${code} userId=${user.id} isHost=${isHost} status=admitted hostInRoom=${registry.isHostInRoom(code)} notifiedSockets=${notifiedCount}`
    );

    return {
      status: 'admitted',
      peerId: socket.id,
      peers: joinResult.peers.map(toPublicPeer),
      isHost,
      screenSharer: registry.getScreenSharer(code),
    };
  });

  // Query authenticated caller's own status in a meeting
  on(socket, 'room:status', async (payload) => {
    const { code } = parse(codeSchema, payload);

    const meeting = await Meeting.findOne({ code }).select('status host').lean();
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

    // 2. Host
    const isHostUser = String(meeting.host) === userId || registry.isHost(code, userId);
    if (isHostUser) {
      return {
        status: 'host',
        peers: registry.getPeers(code).filter((p) => String(p.userId) !== userId).map(toPublicPeer),
        screenSharer: registry.getScreenSharer(code),
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
      return { status: 'waiting' };
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
        peers: roomPeers.filter((p) => String(p.userId) !== userId).map(toPublicPeer),
        screenSharer: registry.getScreenSharer(code),
      };
    }

    // 7. None
    return { status: 'none' };
  });

  // Host queries the waiting list (database authorized, does not require socket in room registry)
  on(socket, 'host:list-waiting', async (payload) => {
    if (limiters?.host && !limiters.host.check(socket.id)) {
      throw new AppError(429, 'RATE_LIMITED', 'Too many host requests, please slow down');
    }
    const { code } = parse(codeSchema, payload);

    const meeting = await Meeting.findOne({ code }).select('host').lean();
    if (!meeting) {
      throw new AppError(404, 'MEETING_NOT_FOUND', 'Meeting not found');
    }

    const hostId = meeting.host.toString();
    if (hostId !== socket.data.user.id.toString()) {
      throw new AppError(403, 'FORBIDDEN', 'Only the host can do this');
    }

    registry.setHost(code, hostId);
    return { waiting: registry.getWaiting(code) };
  });

  // Host admits a waiting guest
  on(socket, 'host:admit', async (payload) => {
    const code = assertHost(registry, socket, limiters);
    const { peerId } = parse(peerTargetSchema, payload);

    const { peer, peers } = registry.admit(code, peerId);
    await recordAdmittedJoin(code, peer.userId);

    const admitPayload = {
      peerId,
      peers: peers.map(toPublicPeer),
      screenSharer: registry.getScreenSharer(code),
    };

    const guestSocket = io.sockets.sockets.get(peerId);
    if (guestSocket) {
      await guestSocket.join(code);
      guestSocket.emit('room:admitted', admitPayload);
      guestSocket.to(code).emit('room:peer-joined', toPublicPeer(peer));
    } else {
      io.to(peerId).emit('room:admitted', admitPayload);
      io.to(code).emit('room:peer-joined', toPublicPeer(peer));
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

  // Host denies a waiting guest
  on(socket, 'host:deny', async (payload) => {
    const code = assertHost(registry, socket, limiters);
    const { peerId } = parse(peerTargetSchema, payload);

    const { waitingUser } = registry.deny(code, peerId);
    io.to(peerId).emit('room:denied', {});
    if (waitingUser?.userId) {
      io.to(`user:${waitingUser.userId}`).emit('room:denied', {});
    }

    await notifyHostWaitingUpdated(io, registry, code);
    return {};
  });

  // Host admits all waiting participants up to room capacity
  on(socket, 'host:admit-all', async (payload) => {
    const code = assertHost(registry, socket, limiters);
    parse(emptySchema, payload);

    const { admitted } = registry.admitAll(code);
    for (const item of admitted) {
      await recordAdmittedJoin(code, item.peer.userId);
      const admitPayload = {
        peerId: item.peer.peerId,
        peers: item.peers.map(toPublicPeer),
        screenSharer: registry.getScreenSharer(code),
      };

      const guestSocket = io.sockets.sockets.get(item.peer.peerId);
      if (guestSocket) {
        await guestSocket.join(code);
        guestSocket.emit('room:admitted', admitPayload);
        guestSocket.to(code).emit('room:peer-joined', toPublicPeer(item.peer));
      } else {
        io.to(item.peer.peerId).emit('room:admitted', admitPayload);
        io.to(code).emit('room:peer-joined', toPublicPeer(item.peer));
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

  // Host removes an active participant
  on(socket, 'host:remove', async (payload) => {
    const code = assertHost(registry, socket, limiters);
    const { peerId } = parse(peerTargetSchema, payload);

    if (peerId === socket.id) {
      throw new AppError(400, 'CANNOT_REMOVE_SELF', 'Cannot remove yourself');
    }

    const removed = registry.remove(code, peerId);
    const removePayload = { reason: 'REMOVED_BY_HOST' };

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

  // Host ends the meeting for everyone
  on(socket, 'host:end', async (payload) => {
    const code = assertHost(registry, socket, limiters);
    parse(emptySchema, payload);

    await Meeting.updateOne(
      { code },
      { $set: { status: MEETING_STATUS.ENDED, lastActiveAt: new Date() } }
    ).catch((err) => console.error(`Failed to update meeting status on end for ${code}:`, err));

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
    const code = assertHost(registry, socket, limiters);
    parse(emptySchema, payload);

    const cleared = registry.clearScreenShare(code);
    if (cleared) {
      io.to(code).emit('room:screen-updated', { peerId: null, streamId: null });
    }
    return {};
  });

  // chat:send { text }
  on(socket, 'chat:send', async (payload) => {
    const { text } = parse(chatSendSchema, payload);

    const code = registry.getRoomCode(socket.id);
    if (!code) {
      throw new AppError(403, 'NOT_IN_ROOM', 'Join a meeting first');
    }

    if (!limiters.chat.check(socket.id)) {
      throw new AppError(429, 'RATE_LIMITED', "You're sending messages too fast");
    }

    const meeting = await Meeting.findOne({ code }).select('_id').lean();
    if (!meeting) {
      throw new AppError(404, 'MEETING_NOT_FOUND', 'Meeting not found');
    }

    const { user } = socket.data;
    let saved;
    try {
      saved = await Message.create({
        meeting: meeting._id,
        user: user.id,
        name: user.name,
        text,
      });
    } catch (err) {
      console.error(`Failed to persist chat message in room ${code}:`, err);
      throw new AppError(500, 'CHAT_FAILED', 'Failed to save message');
    }

    const message = {
      id: saved._id.toString(),
      from: {
        id: user.id,
        name: user.name,
      },
      text: saved.text,
      createdAt: saved.createdAt.toISOString(),
    };

    emitToAdmitted(io, registry, code, 'chat:message', message);

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
    const left = leaveRoom(io, registry, socket, limiters);
    const removedFrom = left
      ? (left.type === 'waiting' ? `waiting:${left.code}` : `room:${left.code}`)
      : 'none';
    console.log(`[room] disconnect: peerId=${socket.id} removedFrom=${removedFrom}`);
  });
}

module.exports = { registerHandlers, leaveRoom, emitToAdmitted };
