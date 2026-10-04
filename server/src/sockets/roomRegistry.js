const AppError = require('../utils/AppError');

// In-memory room state. Pure data structure: no socket.io imports, so it is unit-testable.
// A "peer" is one connected socket: peerId is the socket id, userId/name come from the
// verified user.
class RoomRegistry {
  constructor({ maxParticipants }) {
    this.maxParticipants = maxParticipants;
    this.rooms = new Map(); // meeting code -> Map(peerId -> peer)
    this.peerRooms = new Map(); // peerId -> meeting code
  }

  // Adds a peer to a room.
  // Returns { peer, peers, replaced }:
  //   peers    - everyone else now in the room
  //   replaced - older sessions of the same user that were removed (newer session wins)
  // Throws ROOM_FULL or ALREADY_IN_ROOM without changing any state.
  join(code, { peerId, userId, name }) {
    const currentCode = this.peerRooms.get(peerId);
    if (currentCode !== undefined && currentCode !== code) {
      throw new AppError(409, 'ALREADY_IN_ROOM', 'Leave your current meeting before joining another');
    }

    const room = this.rooms.get(code) ?? new Map();

    // Joining twice from the same socket changes nothing
    if (room.has(peerId)) {
      return { peer: room.get(peerId), peers: this.#others(room, peerId), replaced: [] };
    }

    const replaced = [...room.values()].filter((existing) => existing.userId === userId);
    if (room.size - replaced.length >= this.maxParticipants) {
      throw new AppError(409, 'ROOM_FULL', 'This meeting is full');
    }

    for (const old of replaced) {
      room.delete(old.peerId);
      this.peerRooms.delete(old.peerId);
    }

    const peer = Object.freeze({ peerId, userId, name, joinedAt: Date.now() });
    room.set(peerId, peer);
    this.rooms.set(code, room);
    this.peerRooms.set(peerId, code);

    return { peer, peers: this.#others(room, peerId), replaced };
  }

  // Removes a peer. Returns { code, peer, remaining } or null if it was not in a room.
  leave(peerId) {
    const code = this.peerRooms.get(peerId);
    if (code === undefined) return null;

    const room = this.rooms.get(code);
    const peer = room.get(peerId);
    room.delete(peerId);
    this.peerRooms.delete(peerId);
    if (room.size === 0) this.rooms.delete(code);

    return { code, peer, remaining: [...room.values()] };
  }

  getRoomCode(peerId) {
    return this.peerRooms.get(peerId) ?? null;
  }

  getPeer(peerId) {
    const code = this.peerRooms.get(peerId);
    return code === undefined ? null : this.rooms.get(code).get(peerId);
  }

  getPeers(code) {
    return [...(this.rooms.get(code)?.values() ?? [])];
  }

  // True only for two different peers in the same room
  areInSameRoom(peerIdA, peerIdB) {
    if (peerIdA === peerIdB) return false;
    const codeA = this.peerRooms.get(peerIdA);
    return codeA !== undefined && codeA === this.peerRooms.get(peerIdB);
  }

  get roomCount() {
    return this.rooms.size;
  }

  get peerCount() {
    return this.peerRooms.size;
  }

  #others(room, peerId) {
    return [...room.values()].filter((p) => p.peerId !== peerId);
  }
}

module.exports = RoomRegistry;
