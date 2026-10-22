const RoomRegistry = require('../src/sockets/roomRegistry');

describe('RoomRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new RoomRegistry({ maxParticipants: 2 });
  });

  describe('joining a room', () => {
    it('adds a peer and returns the others in the room', () => {
      const p1 = registry.join('abc-defg-hij', {
        peerId: 'socket-1',
        userId: 'user-1',
        name: 'Alice',
      });

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
      });

      expect(p2.peers).toHaveLength(1);
      expect(p2.peers[0].peerId).toBe('socket-1');
      expect(registry.peerCount).toBe(2);
      expect(registry.roomCount).toBe(1);
    });

    it('rejects joining when room is at capacity (ROOM_FULL)', () => {
      registry.join('room-1', { peerId: 's1', userId: 'u1', name: 'Alice' });
      registry.join('room-1', { peerId: 's2', userId: 'u2', name: 'Bob' });

      expect(() => {
        registry.join('room-1', { peerId: 's3', userId: 'u3', name: 'Charlie' });
      }).toThrow(
        expect.objectContaining({
          code: 'ROOM_FULL',
          statusCode: 409,
        })
      );
    });

    it('rejects joining a second room without leaving the first (ALREADY_IN_ROOM)', () => {
      registry.join('room-1', { peerId: 's1', userId: 'u1', name: 'Alice' });

      expect(() => {
        registry.join('room-2', { peerId: 's1', userId: 'u1', name: 'Alice' });
      }).toThrow(
        expect.objectContaining({
          code: 'ALREADY_IN_ROOM',
          statusCode: 409,
        })
      );
    });

    it('is idempotent when rejoining the same room with the same socket', () => {
      const first = registry.join('room-1', { peerId: 's1', userId: 'u1', name: 'Alice' });
      const second = registry.join('room-1', { peerId: 's1', userId: 'u1', name: 'Alice' });

      expect(second.peer).toBe(first.peer);
      expect(registry.peerCount).toBe(1);
    });
  });

  describe('newer-session-wins rule', () => {
    it('evicts the older socket when the same user joins from another tab', () => {
      registry.join('room-1', { peerId: 's1-old', userId: 'u1', name: 'Alice' });
      registry.join('room-1', { peerId: 's2', userId: 'u2', name: 'Bob' });

      // Alice joins again from socket 's1-new'
      const joinResult = registry.join('room-1', {
        peerId: 's1-new',
        userId: 'u1',
        name: 'Alice',
      });

      expect(joinResult.replaced).toHaveLength(1);
      expect(joinResult.replaced[0].peerId).toBe('s1-old');
      expect(registry.getRoomCode('s1-old')).toBeNull();
      expect(registry.getRoomCode('s1-new')).toBe('room-1');
      expect(registry.peerCount).toBe(2);
    });
  });

  describe('leaving and cleanup', () => {
    it('removes the peer and deletes the room when the last peer leaves', () => {
      registry.join('room-1', { peerId: 's1', userId: 'u1', name: 'Alice' });
      registry.join('room-1', { peerId: 's2', userId: 'u2', name: 'Bob' });

      const left1 = registry.leave('s1');
      expect(left1).toMatchObject({
        code: 'room-1',
        peer: expect.objectContaining({ peerId: 's1' }),
        remaining: [expect.objectContaining({ peerId: 's2' })],
      });
      expect(registry.peerCount).toBe(1);
      expect(registry.roomCount).toBe(1);

      const left2 = registry.leave('s2');
      expect(left2).toMatchObject({
        code: 'room-1',
        peer: expect.objectContaining({ peerId: 's2' }),
        remaining: [],
      });
      expect(registry.peerCount).toBe(0);
      expect(registry.roomCount).toBe(0);
      expect(registry.getRoomCode('s2')).toBeNull();
    });

    it('returns null when leaving a room if socket was not in one', () => {
      expect(registry.leave('non-existent')).toBeNull();
    });
  });

  describe('media updates and peer lookups', () => {
    it('records audio and video state with setMedia', () => {
      registry.join('room-1', {
        peerId: 's1',
        userId: 'u1',
        name: 'Alice',
        audio: true,
        video: true,
      });

      const updated = registry.setMedia('s1', { audio: false, video: true });
      expect(updated.peer).toMatchObject({
        peerId: 's1',
        audio: false,
        video: true,
      });
      expect(registry.getPeer('s1').audio).toBe(false);
    });

    it('correctly checks areInSameRoom', () => {
      registry.join('room-1', { peerId: 's1', userId: 'u1', name: 'Alice' });
      registry.join('room-1', { peerId: 's2', userId: 'u2', name: 'Bob' });

      expect(registry.areInSameRoom('s1', 's2')).toBe(true);
      expect(registry.areInSameRoom('s1', 's1')).toBe(false);
      expect(registry.areInSameRoom('s1', 's3-unknown')).toBe(false);
    });
  });
});
