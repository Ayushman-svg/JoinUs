const AppError = require('../utils/AppError');

const DEFAULT_MAX_PARTICIPANTS = 4;
const MAX_WAITING = 20;

// In-memory room state. Pure data structure: no socket.io imports, so it is unit-testable.
// A "peer" is one connected socket in an active room: peerId is the socket id, userId/name come
// from the verified user.
// A "waitingUser" is a connected socket waiting for host admission.
class RoomRegistry {
  constructor({ maxParticipants = DEFAULT_MAX_PARTICIPANTS, maxWaiting = MAX_WAITING } = {}) {
    this.maxParticipants = maxParticipants;
    this.maxWaiting = maxWaiting;

    this.rooms = new Map(); // meeting code -> Map(peerId -> peer)
    this.peerRooms = new Map(); // peerId -> meeting code

    this.waiting = new Map(); // meeting code -> Map(peerId -> waitingUser)
    this.waitingPeerRooms = new Map(); // peerId -> meeting code

    this.admittedUsers = new Map(); // meeting code -> Set(userId)
    this.deniedUsers = new Map(); // meeting code -> Set(userId)
    this.removedUsers = new Map(); // meeting code -> Set(userId)
    this.hosts = new Map(); // meeting code -> hostUserId
    this.screenSharers = new Map(); // meeting code -> { peerId, streamId }
  }

  isDenied(code, userId) {
    return Boolean(this.deniedUsers.get(code)?.has(String(userId)));
  }

  isRemoved(code, userId) {
    return Boolean(this.removedUsers.get(code)?.has(String(userId)));
  }

  setHost(code, hostId) {
    this.hosts.set(code, String(hostId));
  }

  getHost(code) {
    return this.hosts.get(code) ?? null;
  }

  isHost(code, userId) {
    const hostId = this.hosts.get(code);
    return hostId !== undefined && hostId === String(userId);
  }

  isHostInRoom(code) {
    const hostId = this.hosts.get(code);
    if (!hostId) return false;
    const room = this.rooms.get(code);
    if (!room) return false;
    for (const peer of room.values()) {
      if (String(peer.userId) === hostId) return true;
    }
    return false;
  }

  isAdmitted(code, userId) {
    return Boolean(this.admittedUsers.get(code)?.has(String(userId)));
  }

  // Adds a peer to a room or places them in the waiting list.
  // Returns:
  //   { status: 'admitted', peer, peers, replaced }
  // OR:
  //   { status: 'waiting', waitingUser, replaced, hostInRoom }
  // Throws ROOM_FULL, WAITING_FULL, or ALREADY_IN_ROOM.
  join(
    code,
    {
      peerId,
      userId,
      name,
      audio = true,
      video = true,
      isHost = false,
      waitingRoom = true,
    }
  ) {
    userId = String(userId);
    this.deniedUsers.get(code)?.delete(userId);
    this.removedUsers.get(code)?.delete(userId);

    const currentRoom = this.peerRooms.get(peerId) ?? this.waitingPeerRooms.get(peerId);
    if (currentRoom !== undefined && currentRoom !== code) {
      throw new AppError(409, 'ALREADY_IN_ROOM', 'Leave your current meeting before joining another');
    }

    if (isHost) {
      this.hosts.set(code, userId);
    }

    const shouldBypass = isHost || !waitingRoom || this.isAdmitted(code, userId);

    if (shouldBypass) {
      this.#removeFromWaiting(code, peerId);

      const res = this.#joinRoom(code, { peerId, userId, name, audio, video });

      if (!this.admittedUsers.has(code)) {
        this.admittedUsers.set(code, new Set());
      }
      this.admittedUsers.get(code).add(userId);

      return {
        status: 'admitted',
        peer: res.peer,
        peers: res.peers,
        replaced: res.replaced,
        screenSharer: this.getScreenSharer(code),
      };
    }

    // Guest in a waiting-room meeting: add to waiting list
    const waitingMap = this.waiting.get(code) ?? new Map();

    // Rejoining twice from the same socket in waiting changes nothing
    if (waitingMap.has(peerId)) {
      return {
        status: 'waiting',
        waitingUser: waitingMap.get(peerId),
        replaced: [],
        hostInRoom: this.isHostInRoom(code),
      };
    }

    const replaced = [...waitingMap.values()].filter((w) => w.userId === userId);
    if (waitingMap.size - replaced.length >= this.maxWaiting) {
      throw new AppError(409, 'WAITING_FULL', 'Waiting room is full');
    }

    for (const old of replaced) {
      waitingMap.delete(old.peerId);
      this.waitingPeerRooms.delete(old.peerId);
    }

    const waitingUser = Object.freeze({
      peerId,
      userId,
      name,
      audio,
      video,
      requestedAt: Date.now(),
    });

    waitingMap.set(peerId, waitingUser);
    this.waiting.set(code, waitingMap);
    this.waitingPeerRooms.set(peerId, code);

    return {
      status: 'waiting',
      waitingUser,
      replaced,
      hostInRoom: this.isHostInRoom(code),
    };
  }

  // Host admits a waiting peer into the active room.
  // Returns { peer, peers, waitingUser, replaced }. Throws PEER_NOT_FOUND or ROOM_FULL.
  admit(code, peerId) {
    const waitingMap = this.waiting.get(code);
    const waitingUser = waitingMap?.get(peerId);
    if (!waitingUser) {
      throw new AppError(404, 'PEER_NOT_FOUND', 'Participant is not in the waiting room');
    }

    const room = this.rooms.get(code) ?? new Map();
    const replaced = [...room.values()].filter((existing) => existing.userId === waitingUser.userId);
    if (room.size - replaced.length >= this.maxParticipants) {
      throw new AppError(409, 'ROOM_FULL', 'This meeting is full');
    }

    waitingMap.delete(peerId);
    this.waitingPeerRooms.delete(peerId);
    if (waitingMap.size === 0) this.waiting.delete(code);

    if (!this.admittedUsers.has(code)) {
      this.admittedUsers.set(code, new Set());
    }
    this.admittedUsers.get(code).add(waitingUser.userId);

    const res = this.#joinRoom(code, {
      peerId,
      userId: waitingUser.userId,
      name: waitingUser.name,
      audio: waitingUser.audio,
      video: waitingUser.video,
    });

    return {
      peer: res.peer,
      peers: res.peers,
      waitingUser,
      replaced: res.replaced,
      screenSharer: this.getScreenSharer(code),
    };
  }

  // Host denies a waiting peer.
  // Returns { waitingUser }. Throws PEER_NOT_FOUND.
  deny(code, peerId) {
    const waitingMap = this.waiting.get(code);
    const waitingUser = waitingMap?.get(peerId);
    if (!waitingUser) {
      throw new AppError(404, 'PEER_NOT_FOUND', 'Participant is not in the waiting room');
    }

    waitingMap.delete(peerId);
    this.waitingPeerRooms.delete(peerId);
    if (waitingMap.size === 0) this.waiting.delete(code);

    if (!this.deniedUsers.has(code)) {
      this.deniedUsers.set(code, new Set());
    }
    this.deniedUsers.get(code).add(String(waitingUser.userId));

    return { waitingUser };
  }

  // Host admits all waiting participants up to room capacity.
  // Returns { admitted: [...], remainingWaiting: [...] }.
  admitAll(code) {
    const waitingMap = this.waiting.get(code);
    if (!waitingMap || waitingMap.size === 0) {
      return { admitted: [], remainingWaiting: [] };
    }

    const admitted = [];
    const waitingUsers = [...waitingMap.values()];

    for (const w of waitingUsers) {
      try {
        const result = this.admit(code, w.peerId);
        admitted.push(result);
      } catch (err) {
        if (err.code === 'ROOM_FULL') break;
        throw err;
      }
    }

    const remainingWaiting = this.getWaiting(code);
    return { admitted, remainingWaiting };
  }

  // Host removes an active participant from the meeting.
  // Revokes remembered admission so they must wait again if they try to return.
  // Returns { code, peer, remaining, screenShareEnded }. Throws PEER_NOT_FOUND.
  remove(code, peerId) {
    const room = this.rooms.get(code);
    const peer = room?.get(peerId);
    if (!peer) {
      throw new AppError(404, 'PEER_NOT_FOUND', 'Participant is not in this meeting');
    }

    const currentSharer = this.screenSharers.get(code);
    const screenShareEnded = Boolean(currentSharer && currentSharer.peerId === peerId);
    if (screenShareEnded) {
      this.screenSharers.delete(code);
    }

    room.delete(peerId);
    this.peerRooms.delete(peerId);
    if (room.size === 0) {
      this.rooms.delete(code);
      this.screenSharers.delete(code);
    }

    this.admittedUsers.get(code)?.delete(peer.userId);

    if (!this.removedUsers.has(code)) {
      this.removedUsers.set(code, new Set());
    }
    this.removedUsers.get(code).add(String(peer.userId));

    return {
      code,
      peer,
      remaining: [...(this.rooms.get(code)?.values() ?? [])],
      screenShareEnded,
    };
  }

  // Records a peer's microphone and camera state. Returns { code, peer } or null if not in a room.
  setMedia(peerId, { audio, video }) {
    const code = this.peerRooms.get(peerId);
    if (code === undefined) return null;
    const room = this.rooms.get(code);
    const peer = Object.freeze({ ...room.get(peerId), audio, video });
    room.set(peerId, peer);
    return { code, peer };
  }

  // Sets hand raised status for a peer. Returns { code, peer } or null.
  setHand(peerId, raised) {
    const code = this.peerRooms.get(peerId);
    if (code === undefined) return null;
    const room = this.rooms.get(code);
    const current = room?.get(peerId);
    if (!current) return null;
    const isRaised = Boolean(raised);
    const peer = Object.freeze({
      ...current,
      handRaised: isRaised,
      raisedAt: isRaised ? current.raisedAt || Date.now() : null,
    });
    room.set(peerId, peer);
    return { code, peer };
  }

  // Sets feedback status (yes, no, slower, faster, break, or null) for a peer. Returns { code, peer } or null.
  setFeedback(peerId, feedback) {
    const code = this.peerRooms.get(peerId);
    if (code === undefined) return null;
    const room = this.rooms.get(code);
    const current = room?.get(peerId);
    if (!current) return null;
    const peer = Object.freeze({
      ...current,
      feedback: feedback || null,
    });
    room.set(peerId, peer);
    return { code, peer };
  }

  // Removes a peer or waiting guest when leaving or disconnecting.
  // Returns { type: 'room' | 'waiting', code, peer?, waitingUser?, remaining?, remainingWaiting?, screenShareEnded? } or null.
  leave(peerId) {
    const roomCode = this.peerRooms.get(peerId);
    if (roomCode !== undefined) {
      const room = this.rooms.get(roomCode);
      const peer = room.get(peerId);

      const currentSharer = this.screenSharers.get(roomCode);
      const screenShareEnded = Boolean(currentSharer && currentSharer.peerId === peerId);
      if (screenShareEnded) {
        this.screenSharers.delete(roomCode);
      }

      room.delete(peerId);
      this.peerRooms.delete(peerId);
      if (room.size === 0) {
        this.rooms.delete(roomCode);
        this.screenSharers.delete(roomCode);
      }

      return {
        type: 'room',
        code: roomCode,
        peer,
        remaining: [...(this.rooms.get(roomCode)?.values() ?? [])],
        screenShareEnded,
      };
    }

    const waitingCode = this.waitingPeerRooms.get(peerId);
    if (waitingCode !== undefined) {
      const waitingMap = this.waiting.get(waitingCode);
      const waitingUser = waitingMap.get(peerId);
      waitingMap.delete(peerId);
      this.waitingPeerRooms.delete(peerId);
      if (waitingMap.size === 0) this.waiting.delete(waitingCode);

      return {
        type: 'waiting',
        code: waitingCode,
        waitingUser,
        remainingWaiting: this.getWaiting(waitingCode),
      };
    }

    return null;
  }

  // Host ends the meeting: removes all peers and waiting guests, and clears the room state.
  end(code) {
    this.screenSharers.delete(code);

    const room = this.rooms.get(code);
    const peers = room ? [...room.values()] : [];
    for (const p of peers) {
      this.peerRooms.delete(p.peerId);
    }
    this.rooms.delete(code);

    const waitingMap = this.waiting.get(code);
    const waitingUsers = waitingMap ? [...waitingMap.values()] : [];
    for (const w of waitingUsers) {
      this.waitingPeerRooms.delete(w.peerId);
    }
    this.waiting.delete(code);

    this.admittedUsers.delete(code);
    this.deniedUsers.delete(code);
    this.removedUsers.delete(code);
    this.hosts.delete(code);

    return { code, peers, waiting: waitingUsers };
  }

  // Screen share methods
  startScreenShare(code, peerId, streamId) {
    const room = this.rooms.get(code);
    if (!room || !room.has(peerId)) {
      throw new AppError(403, 'NOT_IN_ROOM', 'Participant is not in this meeting');
    }

    const current = this.screenSharers.get(code);
    if (current && current.peerId !== peerId) {
      throw new AppError(409, 'SCREEN_SHARE_BUSY', 'Someone else is already sharing their screen');
    }

    const shareState = Object.freeze({ peerId, streamId });
    this.screenSharers.set(code, shareState);
    return shareState;
  }

  stopScreenShare(code, peerId) {
    const current = this.screenSharers.get(code);
    if (!current) return null;
    if (current.peerId !== peerId) {
      throw new AppError(403, 'FORBIDDEN', 'Only the sharer can stop their screen share');
    }
    this.screenSharers.delete(code);
    return current;
  }

  clearScreenShare(code) {
    const current = this.screenSharers.get(code) ?? null;
    if (current) this.screenSharers.delete(code);
    return current;
  }

  getScreenSharer(code) {
    return this.screenSharers.get(code) ?? null;
  }

  getRoomCode(peerId) {
    return this.peerRooms.get(peerId) ?? null;
  }

  getWaitingCode(peerId) {
    return this.waitingPeerRooms.get(peerId) ?? null;
  }

  getPeer(peerId) {
    const code = this.peerRooms.get(peerId);
    return code === undefined ? null : this.rooms.get(code).get(peerId);
  }

  getPeers(code) {
    return [...(this.rooms.get(code)?.values() ?? [])];
  }

  getWaiting(code) {
    const waitingMap = this.waiting.get(code);
    if (!waitingMap) return [];
    return [...waitingMap.values()].map((w) => ({
      peerId: w.peerId,
      user: { id: w.userId, name: w.name },
      audio: w.audio,
      video: w.video,
    }));
  }

  // True only for two different peers in the same active room (never for waiting sockets)
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

  get waitingCount() {
    return this.waitingPeerRooms.size;
  }

  #joinRoom(code, { peerId, userId, name, audio, video }) {
    const room = this.rooms.get(code) ?? new Map();

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

    const peer = Object.freeze({
      peerId,
      userId,
      name,
      audio,
      video,
      handRaised: false,
      raisedAt: null,
      feedback: null,
      joinedAt: Date.now(),
    });
    room.set(peerId, peer);
    this.rooms.set(code, room);
    this.peerRooms.set(peerId, code);

    return { peer, peers: this.#others(room, peerId), replaced };
  }

  #removeFromWaiting(code, peerId) {
    const waitingMap = this.waiting.get(code);
    if (waitingMap?.has(peerId)) {
      waitingMap.delete(peerId);
      this.waitingPeerRooms.delete(peerId);
      if (waitingMap.size === 0) this.waiting.delete(code);
    }
  }

  #others(room, peerId) {
    return [...room.values()].filter((p) => p.peerId !== peerId);
  }
}

module.exports = RoomRegistry;
