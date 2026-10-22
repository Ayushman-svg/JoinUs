const AppError = require('../utils/AppError');
const { MEETING_STATUS } = require('../config/constants');
const Meeting = require('../models/Meeting');
const {
  joinSchema,
  mediaSchema,
  signalSchema,
  peerTargetSchema,
  emptySchema,
} = require('./schemas');

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

function notifyHostWaitingUpdated(io, registry, code) {
  const hostId = registry.getHost(code);
  if (!hostId) return;
  const peers = registry.getPeers(code);
  const waitingList = registry.getWaiting(code);
  for (const peer of peers) {
    if (peer.userId === hostId) {
      io.to(peer.peerId).emit('room:waiting-updated', { waiting: waitingList });
    }
  }
}

// Removes the socket from its room or waiting list (if in one) and notifies peers/host
function leaveRoom(io, registry, socket) {
  const left = registry.leave(socket.id);
  if (!left) return;

  if (left.type === 'room') {
    socket.leave(left.code);
    io.to(left.code).emit('room:peer-left', { peerId: socket.id });
  } else if (left.type === 'waiting') {
    notifyHostWaitingUpdated(io, registry, left.code);
  }
}

function assertHost(registry, socket) {
  const code = registry.getRoomCode(socket.id);
  if (!code) {
    throw new AppError(403, 'NOT_IN_ROOM', 'Join a meeting first');
  }
  if (!registry.isHost(code, socket.data.user.id)) {
    throw new AppError(403, 'FORBIDDEN', 'Only the host can do this');
  }
  return code;
}

function registerHandlers(io, socket, registry) {
  on(socket, 'room:join', async (payload) => {
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
      notifyHostWaitingUpdated(io, registry, code);
      return { status: 'waiting', hostInRoom: Boolean(joinResult.hostInRoom) };
    }

    // Admitted to active room
    await socket.join(code);
    if (!alreadyInRoom) {
      socket.to(code).emit('room:peer-joined', toPublicPeer(joinResult.peer));
    }

    // Send host their current waiting list upon entering the room
    if (isHost) {
      socket.emit('room:waiting-updated', { waiting: registry.getWaiting(code) });
    }

    return {
      status: 'admitted',
      peerId: socket.id,
      peers: joinResult.peers.map(toPublicPeer),
    };
  });

  // Host admits a waiting guest
  on(socket, 'host:admit', async (payload) => {
    const code = assertHost(registry, socket);
    const { peerId } = parse(peerTargetSchema, payload);

    const { peer, peers } = registry.admit(code, peerId);
    const guestSocket = io.sockets.sockets.get(peerId);
    if (guestSocket) {
      await guestSocket.join(code);
      guestSocket.emit('room:admitted', {
        peerId,
        peers: peers.map(toPublicPeer),
      });
      guestSocket.to(code).emit('room:peer-joined', toPublicPeer(peer));
    } else {
      io.to(code).emit('room:peer-joined', toPublicPeer(peer));
    }

    notifyHostWaitingUpdated(io, registry, code);
    return {};
  });

  // Host denies a waiting guest
  on(socket, 'host:deny', (payload) => {
    const code = assertHost(registry, socket);
    const { peerId } = parse(peerTargetSchema, payload);

    registry.deny(code, peerId);
    const guestSocket = io.sockets.sockets.get(peerId);
    if (guestSocket) {
      guestSocket.emit('room:denied', {});
    }

    notifyHostWaitingUpdated(io, registry, code);
    return {};
  });

  // Host admits all waiting participants up to room capacity
  on(socket, 'host:admit-all', async (payload) => {
    const code = assertHost(registry, socket);
    parse(emptySchema, payload);

    const { admitted } = registry.admitAll(code);
    for (const item of admitted) {
      const guestSocket = io.sockets.sockets.get(item.peer.peerId);
      if (guestSocket) {
        await guestSocket.join(code);
        guestSocket.emit('room:admitted', {
          peerId: item.peer.peerId,
          peers: item.peers.map(toPublicPeer),
        });
        guestSocket.to(code).emit('room:peer-joined', toPublicPeer(item.peer));
      } else {
        io.to(code).emit('room:peer-joined', toPublicPeer(item.peer));
      }
    }

    notifyHostWaitingUpdated(io, registry, code);
    return {};
  });

  // Host removes an active participant
  on(socket, 'host:remove', async (payload) => {
    const code = assertHost(registry, socket);
    const { peerId } = parse(peerTargetSchema, payload);

    if (peerId === socket.id) {
      throw new AppError(400, 'CANNOT_REMOVE_SELF', 'Cannot remove yourself');
    }

    registry.remove(code, peerId);

    const targetSocket = io.sockets.sockets.get(peerId);
    if (targetSocket) {
      targetSocket.emit('room:removed', { reason: 'REMOVED_BY_HOST' });
      await targetSocket.leave(code);
    }

    io.to(code).emit('room:peer-left', { peerId });
    return {};
  });

  // Host ends the meeting for everyone
  on(socket, 'host:end', async (payload) => {
    const code = assertHost(registry, socket);
    parse(emptySchema, payload);

    await Meeting.updateOne({ code }, { status: MEETING_STATUS.ENDED });

    const { peers, waiting } = registry.end(code);

    io.to(code).emit('room:ended', {});
    for (const w of waiting) {
      io.to(w.peerId).emit('room:ended', {});
    }

    for (const p of peers) {
      const s = io.sockets.sockets.get(p.peerId);
      s?.leave(code);
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

  on(socket, 'room:leave', () => {
    leaveRoom(io, registry, socket);
    return {};
  });

  on(socket, 'signal', (payload) => {
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

  socket.on('disconnect', () => leaveRoom(io, registry, socket));
}

module.exports = { registerHandlers, leaveRoom };
