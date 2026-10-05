const AppError = require('../utils/AppError');
const { MEETING_STATUS } = require('../config/constants');
const Meeting = require('../models/Meeting');
const { joinSchema, signalSchema } = require('./schemas');

const toPublicPeer = (peer) => ({
  peerId: peer.peerId,
  user: { id: peer.userId, name: peer.name },
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

// Removes the socket from its room (if it is in one) and tells the others
function leaveRoom(io, registry, socket) {
  const left = registry.leave(socket.id);
  if (!left) return;
  socket.leave(left.code);
  io.to(left.code).emit('room:peer-left', { peerId: socket.id });
}

function registerHandlers(io, socket, registry) {
  on(socket, 'room:join', async (payload) => {
    const { code } = parse(joinSchema, payload);

    const meeting = await Meeting.findOne({ code }).select('status').lean();
    if (!meeting) throw new AppError(404, 'MEETING_NOT_FOUND', 'Meeting not found');
    if (meeting.status !== MEETING_STATUS.ACTIVE) {
      throw new AppError(409, 'MEETING_CANCELLED', 'This meeting was cancelled');
    }
    if (socket.disconnected) return {}; // went away during the lookup

    const alreadyInRoom = registry.getRoomCode(socket.id) === code;
    const { user } = socket.data; // verified at the handshake, never from the payload
    const { peer, peers, replaced } = registry.join(code, {
      peerId: socket.id,
      userId: user.id,
      name: user.name,
    });

    // Newer session wins: the older tab is removed and told why, and the others
    // see it leave before the new session appears
    for (const old of replaced) {
      const oldSocket = io.sockets.sockets.get(old.peerId);
      if (oldSocket) {
        oldSocket.emit('room:kicked', { reason: 'JOINED_ELSEWHERE' });
        await oldSocket.leave(code);
      }
      io.to(code).emit('room:peer-left', { peerId: old.peerId });
    }

    if (socket.disconnected) {
      leaveRoom(io, registry, socket);
      return {};
    }

    await socket.join(code);
    if (!alreadyInRoom) {
      socket.to(code).emit('room:peer-joined', toPublicPeer(peer));
    }

    return { peerId: socket.id, peers: peers.map(toPublicPeer) };
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
