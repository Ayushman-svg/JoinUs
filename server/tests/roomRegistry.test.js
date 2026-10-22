const RoomRegistry = require('../src/sockets/roomRegistry');

describe('RoomRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new RoomRegistry({ maxParticipants: 2, maxWaiting: 20 });
  });

  describe('joining an open room (waitingRoom = false or isHost = true)', () => {
    it('adds a peer and returns status admitted with others in the room', () => {
      const p1 = registry.join('abc-defg-hij', {
        peerId: 'socket-1',
        userId: 'user-1',
        name: 'Alice',
        waitingRoom: false,
      });

      expect(p1.status).toBe('admitted');
      expect(p1.peer).toMatchObject({
        peerId: 'socket-1',
        userId: 'user-1',
        name: 'Alice',
        audio: true,
        video: true,
      });
      expect(p1.peers).toEqual([]);
      expect(p1.replaced).toEqual([]);
      expect(registry.getRoomCode('socket-1')).toBe('abc-defg-hij');

      const p2 = registry.join('abc-defg-hij', {
        peerId: 'socket-2',
        userId: 'user-2',
        name: 'Bob',
        waitingRoom: false,
      });

      expect(p2.status).toBe('admitted');
      expect(p2.peers).toHaveLength(1);
      expect(p2.peers[0].peerId).toBe('socket-1');
      expect(registry.peerCount).toBe(2);
      expect(registry.roomCount).toBe(1);
    });

    it('rejects joining when room is at capacity (ROOM_FULL)', () => {
      registry.join('room-1', { peerId: 's1', userId: 'u1', name: 'Alice', waitingRoom: false });
      registry.join('room-1', { peerId: 's2', userId: 'u2', name: 'Bob', waitingRoom: false });

      expect(() => {
        registry.join('room-1', { peerId: 's3', userId: 'u3', name: 'Charlie', waitingRoom: false });
      }).toThrow(
        expect.objectContaining({
          code: 'ROOM_FULL',
          statusCode: 409,
        })
      );
    });

    it('rejects joining a second room without leaving the first (ALREADY_IN_ROOM)', () => {
      registry.join('room-1', { peerId: 's1', userId: 'u1', name: 'Alice', waitingRoom: false });

      expect(() => {
        registry.join('room-2', { peerId: 's1', userId: 'u1', name: 'Alice', waitingRoom: false });
      }).toThrow(
        expect.objectContaining({
          code: 'ALREADY_IN_ROOM',
          statusCode: 409,
        })
      );
    });

    it('is idempotent when rejoining the same room with the same socket', () => {
      const first = registry.join('room-1', { peerId: 's1', userId: 'u1', name: 'Alice', waitingRoom: false });
      const second = registry.join('room-1', { peerId: 's1', userId: 'u1', name: 'Alice', waitingRoom: false });

      expect(second.peer).toBe(first.peer);
      expect(registry.peerCount).toBe(1);
    });
  });

  describe('host bypass and host lookup', () => {
    it('lets the host join directly even if waitingRoom is true', () => {
      const res = registry.join('room-1', {
        peerId: 'host-socket',
        userId: 'host-1',
        name: 'Host User',
        isHost: true,
        waitingRoom: true,
      });

      expect(res.status).toBe('admitted');
      expect(registry.getHost('room-1')).toBe('host-1');
      expect(registry.isHost('room-1', 'host-1')).toBe(true);
      expect(registry.isHost('room-1', 'other')).toBe(false);
      expect(registry.isHostInRoom('room-1')).toBe(true);
    });

    it('reports isHostInRoom false when host has not joined yet', () => {
      registry.setHost('room-1', 'host-1');
      expect(registry.isHostInRoom('room-1')).toBe(false);

      const guestJoin = registry.join('room-1', {
        peerId: 'guest-1',
        userId: 'guest-user',
        name: 'Guest',
        isHost: false,
        waitingRoom: true,
      });

      expect(guestJoin.status).toBe('waiting');
      expect(guestJoin.hostInRoom).toBe(false);
    });
  });

  describe('waiting room and admission', () => {
    it('places non-host guests in the waiting list by default', () => {
      registry.join('room-1', {
        peerId: 'host-s',
        userId: 'host-u',
        name: 'Host',
        isHost: true,
        waitingRoom: true,
      });

      const guestRes = registry.join('room-1', {
        peerId: 'guest-s1',
        userId: 'guest-u1',
        name: 'Guest 1',
        audio: true,
        video: false,
        waitingRoom: true,
      });

      expect(guestRes.status).toBe('waiting');
      expect(guestRes.waitingUser).toMatchObject({
        peerId: 'guest-s1',
        userId: 'guest-u1',
        name: 'Guest 1',
        audio: true,
        video: false,
      });
      expect(guestRes.hostInRoom).toBe(true);
      expect(registry.waitingCount).toBe(1);
      expect(registry.peerCount).toBe(1); // Only host is in the active room

      const waitingList = registry.getWaiting('room-1');
      expect(waitingList).toHaveLength(1);
      expect(waitingList[0]).toMatchObject({
        peerId: 'guest-s1',
        user: { id: 'guest-u1', name: 'Guest 1' },
      });
    });

    it('enforces newer-session-wins in the waiting room', () => {
      registry.join('room-1', {
        peerId: 'g1-old',
        userId: 'g1',
        name: 'Guest',
        waitingRoom: true,
      });

      const second = registry.join('room-1', {
        peerId: 'g1-new',
        userId: 'g1',
        name: 'Guest',
        waitingRoom: true,
      });

      expect(second.status).toBe('waiting');
      expect(second.replaced).toHaveLength(1);
      expect(second.replaced[0].peerId).toBe('g1-old');
      expect(registry.getWaitingCode('g1-old')).toBeNull();
      expect(registry.getWaitingCode('g1-new')).toBe('room-1');
      expect(registry.waitingCount).toBe(1);
    });

    it('enforces the waiting room capacity cap (WAITING_FULL)', () => {
      const smallRegistry = new RoomRegistry({ maxParticipants: 6, maxWaiting: 2 });
      smallRegistry.join('room-1', { peerId: 'w1', userId: 'u1', name: 'User 1', waitingRoom: true });
      smallRegistry.join('room-1', { peerId: 'w2', userId: 'u2', name: 'User 2', waitingRoom: true });

      expect(() => {
        smallRegistry.join('room-1', { peerId: 'w3', userId: 'u3', name: 'User 3', waitingRoom: true });
      }).toThrow(
        expect.objectContaining({
          code: 'WAITING_FULL',
          statusCode: 409,
        })
      );
    });

    it('host can admit a waiting peer into the active room', () => {
      registry.join('room-1', { peerId: 'h1', userId: 'u-host', name: 'Host', isHost: true });
      registry.join('room-1', { peerId: 'g1', userId: 'u-guest', name: 'Guest', waitingRoom: true });

      expect(registry.waitingCount).toBe(1);
      expect(registry.peerCount).toBe(1);

      const admitRes = registry.admit('room-1', 'g1');
      expect(admitRes.peer.peerId).toBe('g1');
      expect(admitRes.peers).toHaveLength(1);
      expect(admitRes.peers[0].peerId).toBe('h1');
      expect(registry.waitingCount).toBe(0);
      expect(registry.peerCount).toBe(2);
      expect(registry.areInSameRoom('h1', 'g1')).toBe(true);
    });

    it('remembers admitted users across reconnects (page refresh bypasses waiting)', () => {
      registry.join('room-1', { peerId: 'h1', userId: 'u-host', name: 'Host', isHost: true });
      registry.join('room-1', { peerId: 'g1', userId: 'u-guest', name: 'Guest', waitingRoom: true });
      registry.admit('room-1', 'g1');

      // Guest disconnects / leaves
      registry.leave('g1');
      expect(registry.peerCount).toBe(1);

      // Guest reconnects from a new socket 'g1-refreshed'
      const reconnectRes = registry.join('room-1', {
        peerId: 'g1-refreshed',
        userId: 'u-guest',
        name: 'Guest',
        waitingRoom: true, // Still configured with waitingRoom true
      });

      // Bypasses waiting because they were already admitted!
      expect(reconnectRes.status).toBe('admitted');
      expect(reconnectRes.peer.peerId).toBe('g1-refreshed');
      expect(registry.peerCount).toBe(2);
      expect(registry.waitingCount).toBe(0);
    });

    it('host can deny a waiting peer', () => {
      registry.join('room-1', { peerId: 'h1', userId: 'u-host', name: 'Host', isHost: true });
      registry.join('room-1', { peerId: 'g1', userId: 'u-guest', name: 'Guest', waitingRoom: true });

      const denyRes = registry.deny('room-1', 'g1');
      expect(denyRes.waitingUser.peerId).toBe('g1');
      expect(registry.waitingCount).toBe(0);
      expect(registry.peerCount).toBe(1);
      expect(registry.getWaitingCode('g1')).toBeNull();
    });

    it('host can admit all waiting participants up to room capacity', () => {
      // Room holds at most 2 participants
      registry.join('room-1', { peerId: 'h1', userId: 'host', name: 'Host', isHost: true });
      registry.join('room-1', { peerId: 'g1', userId: 'u1', name: 'G1', waitingRoom: true });
      registry.join('room-1', { peerId: 'g2', userId: 'u2', name: 'G2', waitingRoom: true });

      const res = registry.admitAll('room-1');
      // Only 1 slot was open (host takes 1), so G1 is admitted and G2 remains waiting
      expect(res.admitted).toHaveLength(1);
      expect(res.admitted[0].peer.peerId).toBe('g1');
      expect(res.remainingWaiting).toHaveLength(1);
      expect(res.remainingWaiting[0].peerId).toBe('g2');
      expect(registry.peerCount).toBe(2);
    });
  });

  describe('host remove and end meeting', () => {
    it('host can remove a participant and revokes their remembered admission', () => {
      registry.join('room-1', { peerId: 'h1', userId: 'u-host', name: 'Host', isHost: true });
      registry.join('room-1', { peerId: 'g1', userId: 'u-guest', name: 'Guest', waitingRoom: true });
      registry.admit('room-1', 'g1');

      const removeRes = registry.remove('room-1', 'g1');
      expect(removeRes.peer.peerId).toBe('g1');
      expect(registry.peerCount).toBe(1);
      expect(registry.getRoomCode('g1')).toBeNull();

      // Since admission was revoked, joining again must go to waiting room
      const rejoinRes = registry.join('room-1', {
        peerId: 'g1-again',
        userId: 'u-guest',
        name: 'Guest',
        waitingRoom: true,
      });
      expect(rejoinRes.status).toBe('waiting');
    });

    it('host end meeting clears all peers and waiting entries', () => {
      registry.join('room-1', { peerId: 'h1', userId: 'u-host', name: 'Host', isHost: true });
      registry.join('room-1', { peerId: 'g1', userId: 'u1', name: 'Guest 1', waitingRoom: false });
      registry.join('room-1', { peerId: 'w1', userId: 'u2', name: 'Wait 1', waitingRoom: true });

      const endRes = registry.end('room-1');
      expect(endRes.peers).toHaveLength(2);
      expect(endRes.waiting).toHaveLength(1);
      expect(registry.roomCount).toBe(0);
      expect(registry.peerCount).toBe(0);
      expect(registry.waitingCount).toBe(0);
      expect(registry.getRoomCode('h1')).toBeNull();
      expect(registry.getWaitingCode('w1')).toBeNull();
    });
  });

  describe('leaving while waiting vs in room', () => {
    it('removes waiting peer when they disconnect/leave', () => {
      registry.join('room-1', { peerId: 'w1', userId: 'u1', name: 'Waiting User', waitingRoom: true });
      expect(registry.waitingCount).toBe(1);

      const leaveRes = registry.leave('w1');
      expect(leaveRes).toMatchObject({
        type: 'waiting',
        code: 'room-1',
        waitingUser: expect.objectContaining({ peerId: 'w1' }),
        remainingWaiting: [],
      });
      expect(registry.waitingCount).toBe(0);
    });

    it('removes active peer when they disconnect/leave', () => {
      registry.join('room-1', { peerId: 'p1', userId: 'u1', name: 'Active User', waitingRoom: false });
      expect(registry.peerCount).toBe(1);

      const leaveRes = registry.leave('p1');
      expect(leaveRes).toMatchObject({
        type: 'room',
        code: 'room-1',
        peer: expect.objectContaining({ peerId: 'p1' }),
        remaining: [],
      });
      expect(registry.peerCount).toBe(0);
    });
  });

  describe('media updates and areInSameRoom', () => {
    it('updates media for active room peers', () => {
      registry.join('room-1', { peerId: 'p1', userId: 'u1', name: 'User 1', waitingRoom: false });
      const updated = registry.setMedia('p1', { audio: false, video: true });
      expect(updated.peer.audio).toBe(false);
    });

    it('areInSameRoom returns false for waiting sockets', () => {
      registry.join('room-1', { peerId: 'h1', userId: 'host', name: 'Host', isHost: true });
      registry.join('room-1', { peerId: 'w1', userId: 'wait', name: 'Wait', waitingRoom: true });

      expect(registry.areInSameRoom('h1', 'w1')).toBe(false);
    });
  });
});
