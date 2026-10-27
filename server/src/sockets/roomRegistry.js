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
    this.coHosts = new Map(); // meeting code -> Set(userId)
    this.blockedUsers = new Map(); // meeting code -> Set(userId)
    this.roomSettings = new Map(); // meeting code -> { muteOnEntry, chatAllowed, shareAllowed, locked }
    this.screenSharers = new Map(); // meeting code -> { peerId, streamId }
    this.activePolls = new Map(); // meeting code -> { ...poll, votes: Map(userId -> [optionIds]) }
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

  setCoHosts(code, userIds = []) {
    const set = new Set(userIds.map(String));
    this.coHosts.set(code, set);
  }

  isCoHost(code, userId) {
    return Boolean(this.coHosts.get(code)?.has(String(userId)));
  }

  getRole(code, peerIdOrUserId) {
    let userId = String(peerIdOrUserId);
    const peer = this.getPeer(peerIdOrUserId);
    if (peer) {
      userId = String(peer.userId);
    }
    if (this.isHost(code, userId)) return 'host';
    if (this.isCoHost(code, userId)) return 'co-host';
    return 'participant';
  }

  canModerate(code, peerIdOrUserId) {
    const role = this.getRole(code, peerIdOrUserId);
    return role === 'host' || role === 'co-host';
  }

  canActOn(code, actorPeerId, targetPeerId) {
    const actorRole = this.getRole(code, actorPeerId);
    if (actorRole !== 'host' && actorRole !== 'co-host') return false;

    const targetRole = this.getRole(code, targetPeerId);
    // Co-hosts can NEVER act on the host!
    if (actorRole === 'co-host' && targetRole === 'host') return false;

    return true;
  }

  setSettings(code, settings = {}) {
    const current = this.getSettings(code);
    const updated = Object.freeze({
      muteOnEntry: settings.muteOnEntry !== undefined ? Boolean(settings.muteOnEntry) : current.muteOnEntry,
      chatAllowed: settings.chatAllowed !== undefined ? Boolean(settings.chatAllowed) : current.chatAllowed,
      shareAllowed: settings.shareAllowed !== undefined ? settings.shareAllowed : current.shareAllowed,
      locked: settings.locked !== undefined ? Boolean(settings.locked) : current.locked,
    });
    this.roomSettings.set(code, updated);
    return updated;
  }

  getSettings(code) {
    return (
      this.roomSettings.get(code) ??
      Object.freeze({
        muteOnEntry: false,
        chatAllowed: true,
        shareAllowed: 'all',
        locked: false,
      })
    );
  }

  setLocked(code, locked) {
    return this.setSettings(code, { locked: Boolean(locked) });
  }

  isLocked(code) {
    return Boolean(this.getSettings(code).locked);
  }

  addBlocked(code, userId) {
    if (!this.blockedUsers.has(code)) {
      this.blockedUsers.set(code, new Set());
    }
    this.blockedUsers.get(code).add(String(userId));
  }

  isBlocked(code, userId) {
    return Boolean(this.blockedUsers.get(code)?.has(String(userId)));
  }

  setBlockedUsers(code, userIds = []) {
    const set = new Set(userIds.map(String));
    this.blockedUsers.set(code, set);
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
      isCoHost = false,
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
    if (isCoHost) {
      if (!this.coHosts.has(code)) {
        this.coHosts.set(code, new Set());
      }
      this.coHosts.get(code).add(userId);
    }

    const shouldBypass =
      isHost ||
      isCoHost ||
      this.isCoHost(code, userId) ||
      !waitingRoom ||
      this.isAdmitted(code, userId);

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
        settings: this.getSettings(code),
        role: res.peer.role,
        activePoll: this.formatPollForUser(code, userId),
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
      settings: this.getSettings(code),
      role: res.peer.role,
      activePoll: this.formatPollForUser(code, waitingUser.userId),
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
  // Returns { code, peer, remaining, screenShareEnded, blocked }. Throws PEER_NOT_FOUND.
  remove(code, peerId, { block = false } = {}) {
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
    this.coHosts.get(code)?.delete(String(peer.userId));

    if (block) {
      this.addBlocked(code, peer.userId);
    }

    if (!this.removedUsers.has(code)) {
      this.removedUsers.set(code, new Set());
    }
    this.removedUsers.get(code).add(String(peer.userId));

    return {
      code,
      peer,
      remaining: [...(this.rooms.get(code)?.values() ?? [])],
      screenShareEnded,
      blocked: Boolean(block),
    };
  }

  promoteCoHost(code, peerId) {
    const room = this.rooms.get(code);
    const peer = room?.get(peerId);
    if (!peer) {
      throw new AppError(404, 'PEER_NOT_FOUND', 'Participant is not in this meeting');
    }

    if (!this.coHosts.has(code)) {
      this.coHosts.set(code, new Set());
    }
    this.coHosts.get(code).add(String(peer.userId));

    const updated = Object.freeze({
      ...peer,
      role: 'co-host',
      isCoHost: true,
    });
    room.set(peerId, updated);
    return { code, peer: updated, role: 'co-host' };
  }

  demoteCoHost(code, peerId) {
    const room = this.rooms.get(code);
    const peer = room?.get(peerId);
    if (!peer) {
      throw new AppError(404, 'PEER_NOT_FOUND', 'Participant is not in this meeting');
    }

    this.coHosts.get(code)?.delete(String(peer.userId));

    const updated = Object.freeze({
      ...peer,
      role: 'participant',
      isCoHost: false,
    });
    room.set(peerId, updated);
    return { code, peer: updated, role: 'participant' };
  }

  renamePeer(code, peerId, newName) {
    const room = this.rooms.get(code);
    const peer = room?.get(peerId);
    if (!peer) {
      throw new AppError(404, 'PEER_NOT_FOUND', 'Participant is not in this meeting');
    }
    const trimmed = (newName || '').trim();
    if (!trimmed) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Name cannot be empty');
    }

    const previousName = peer.name;
    const updated = Object.freeze({
      ...peer,
      name: trimmed,
    });
    room.set(peerId, updated);
    return { code, peer: updated, previousName };
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
    this.coHosts.delete(code);
    this.blockedUsers.delete(code);
    this.roomSettings.delete(code);
    this.activePolls.delete(code);

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

  // Poll state management
  setActivePoll(code, pollData) {
    const existing = this.activePolls.get(code);
    const votes = existing && existing.id === String(pollData.id || pollData._id) ? existing.votes : new Map();
    const poll = {
      id: String(pollData.id || pollData._id),
      meeting: code,
      createdBy: String(pollData.createdBy),
      question: pollData.question,
      options: pollData.options.map((o) => ({ id: o.id, text: o.text })),
      multiple: Boolean(pollData.multiple),
      anonymous: Boolean(pollData.anonymous),
      shareResults: Boolean(pollData.shareResults),
      status: pollData.status || 'open',
      createdAt: pollData.createdAt || Date.now(),
      votes,
    };
    this.activePolls.set(code, poll);
    return poll;
  }

  getActivePoll(code) {
    return this.activePolls.get(code) ?? null;
  }

  clearActivePoll(code) {
    const current = this.activePolls.get(code) ?? null;
    if (current) this.activePolls.delete(code);
    return current;
  }

  closeActivePoll(code) {
    const poll = this.activePolls.get(code);
    if (!poll) return null;
    poll.status = 'closed';
    return poll;
  }

  recordVote(code, pollId, userId, optionIds) {
    const poll = this.activePolls.get(code);
    if (!poll || poll.id !== String(pollId)) {
      throw new AppError(404, 'POLL_NOT_FOUND', 'Active poll not found');
    }
    if (poll.status !== 'open') {
      throw new AppError(400, 'POLL_NOT_OPEN', 'Poll is closed for voting');
    }
    const uid = String(userId);
    if (poll.votes.has(uid)) {
      throw new AppError(409, 'ALREADY_VOTED', 'You have already voted in this poll');
    }
    if (!Array.isArray(optionIds) || optionIds.length === 0) {
      throw new AppError(400, 'INVALID_OPTION', 'At least one option must be selected');
    }
    if (!poll.multiple && optionIds.length > 1) {
      throw new AppError(400, 'INVALID_OPTION', 'Multiple options not allowed');
    }
    const validIds = new Set(poll.options.map((o) => o.id));
    for (const id of optionIds) {
      if (!validIds.has(id)) {
        throw new AppError(400, 'INVALID_OPTION', `Invalid option selected: ${id}`);
      }
    }
    poll.votes.set(uid, [...optionIds]);
    return {
      poll,
      totalVotes: poll.votes.size,
    };
  }

  formatPollForUser(code, userId, poll = null) {
    const active = poll || this.activePolls.get(code);
    if (!active) return null;

    const uid = String(userId);
    const canModerate = this.canModerate(code, uid);

    if (!canModerate && active.status === 'draft') {
      return null;
    }

    const totalVotes = active.votes ? active.votes.size : 0;
    const showResults = canModerate || (active.status === 'closed' && active.shareResults);

    const counts = {};
    for (const opt of active.options) {
      counts[opt.id] = 0;
    }
    if (active.votes) {
      for (const chosenIds of active.votes.values()) {
        for (const optId of chosenIds) {
          if (counts[optId] !== undefined) {
            counts[optId] += 1;
          }
        }
      }
    }

    const options = active.options.map((opt) => {
      const item = { id: opt.id, text: opt.text };
      if (showResults) {
        const count = counts[opt.id] || 0;
        item.voteCount = count;
        item.votes = count;
        item.percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      }
      return item;
    });

    const userVote = active.votes ? active.votes.get(uid) || null : null;
    const hasVoted = Boolean(userVote);

    return {
      id: active.id,
      question: active.question,
      options,
      multiple: active.multiple,
      anonymous: active.anonymous,
      shareResults: active.shareResults,
      status: active.status,
      createdAt: active.createdAt,
      totalVotes: showResults ? totalVotes : undefined,
      hasVoted,
      userVote,
    };
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

    const isHost = this.isHost(code, userId);
    const isCoHost = this.isCoHost(code, userId);
    const role = isHost ? 'host' : isCoHost ? 'co-host' : 'participant';

    const peer = Object.freeze({
      peerId,
      userId,
      name,
      audio,
      video,
      role,
      isHost,
      isCoHost,
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
