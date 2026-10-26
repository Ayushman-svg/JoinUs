const http = require('http');
const ioClient = require('socket.io-client');
const bcrypt = require('bcryptjs');

const app = require('../src/app');
const { initSockets } = require('../src/sockets');
const Meeting = require('../src/models/Meeting');
const { generateMeetingCode } = require('../src/utils/meetingCode');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./helpers/db');
const { createUser } = require('./helpers/users');
const { passcodeLimiter } = require('../src/utils/passcodeLimiter');

beforeAll(connectTestDB, 120000);
afterEach(async () => {
  passcodeLimiter.clear();
  await clearTestDB();
});
afterAll(disconnectTestDB);

function connectSocket(port, token) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve);
  });
}

function waitForEvent(socket, event, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for event "${event}"`));
    }, timeoutMs);

    function handler(data) {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(data);
    }

    socket.on(event, handler);
  });
}

describe('Host Security, Roles, and Join Gates Socket Integration', () => {
  let server;
  let port;
  const socketsToClose = [];

  beforeAll((done) => {
    server = http.createServer(app);
    initSockets(server);
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  afterEach(() => {
    while (socketsToClose.length) {
      const s = socketsToClose.pop();
      if (s.connected) s.disconnect();
    }
  });

  async function makeUserAndSocket(prefix) {
    const created = await createUser({
      name: `${prefix} User`,
      email: `${prefix.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`,
      password: 'password123',
    });
    const socket = await connectSocket(port, created.token);
    socketsToClose.push(socket);
    return { user: created.user, token: created.token, socket };
  }

  async function createMeeting(hostUser, overrides = {}) {
    const code = generateMeetingCode();
    const hostId = hostUser?.id || hostUser?._id || hostUser;
    const meeting = await Meeting.create({
      code,
      host: hostId,
      title: 'Security Room',
      startsAt: new Date(),
      waitingRoom: false,
      ...overrides,
    });
    return { code, meeting };
  }

  describe('Join gate checks in exact order', () => {
    test('rejects join when meeting is ended (MEETING_ENDED) or cancelled (MEETING_CANCELLED)', async () => {
      const { user: host } = await makeUserAndSocket('Host');
      const { socket: guestSocket } = await makeUserAndSocket('Guest');

      const { code: endedCode } = await createMeeting(host, { status: 'ended' });
      const endedAck = await emitAck(guestSocket, 'room:join', { code: endedCode });
      expect(endedAck).toMatchObject({
        ok: false,
        error: { code: 'MEETING_ENDED' },
      });

      const { code: cancelledCode } = await createMeeting(host, { status: 'cancelled' });
      const cancelledAck = await emitAck(guestSocket, 'room:join', { code: cancelledCode });
      expect(cancelledAck).toMatchObject({
        ok: false,
        error: { code: 'MEETING_CANCELLED' },
      });
    });

    test('blocked users cannot join (BLOCKED)', async () => {
      const { user: host } = await makeUserAndSocket('Host');
      const { user: guest, socket: guestSocket } = await makeUserAndSocket('Guest');

      const { code } = await createMeeting(host, { blocked: [guest.id] });

      const joinAck = await emitAck(guestSocket, 'room:join', { code });
      expect(joinAck).toMatchObject({
        ok: false,
        error: { code: 'BLOCKED' },
      });
    });

    test('locked meeting rejects normal participants but allows host and co-host (MEETING_LOCKED)', async () => {
      const { user: host, socket: hostSocket } = await makeUserAndSocket('Host');
      const { user: coHost, socket: coHostSocket } = await makeUserAndSocket('CoHost');
      const { socket: guestSocket } = await makeUserAndSocket('Guest');

      const { code } = await createMeeting(host, {
        coHosts: [coHost.id],
        settings: { locked: true },
      });

      // Participant rejected
      const guestJoinAck = await emitAck(guestSocket, 'room:join', { code });
      expect(guestJoinAck).toMatchObject({
        ok: false,
        error: { code: 'MEETING_LOCKED' },
      });

      // Host can join
      const hostJoinAck = await emitAck(hostSocket, 'room:join', { code });
      expect(hostJoinAck).toMatchObject({
        ok: true,
        status: 'admitted',
        isHost: true,
        role: 'host',
      });

      // Co-host can join
      const coHostJoinAck = await emitAck(coHostSocket, 'room:join', { code });
      expect(coHostJoinAck).toMatchObject({
        ok: true,
        status: 'admitted',
        isCoHost: true,
        role: 'co-host',
      });
    });

    test('passcode required, invalid, and 5-attempt rate limit (PASSCODE_REQUIRED, PASSCODE_INVALID, RATE_LIMITED)', async () => {
      const { user: host, socket: hostSocket } = await makeUserAndSocket('Host');
      const { socket: guestSocket } = await makeUserAndSocket('Guest');

      const salt = await bcrypt.genSalt(10);
      const passcodeHash = await bcrypt.hash('secret12', salt);
      const { code } = await createMeeting(host, { passcodeHash });

      // Host joins without passcode
      const hostJoin = await emitAck(hostSocket, 'room:join', { code });
      expect(hostJoin.ok).toBe(true);

      // 1. Guest without passcode -> PASSCODE_REQUIRED
      const noPassAck = await emitAck(guestSocket, 'room:join', { code });
      expect(noPassAck).toMatchObject({
        ok: false,
        error: { code: 'PASSCODE_REQUIRED' },
      });

      // 2. Guest with wrong passcode 4 times -> PASSCODE_INVALID
      for (let i = 1; i <= 4; i++) {
        const wrongAck = await emitAck(guestSocket, 'room:join', { code, passcode: `wrong${i}` });
        expect(wrongAck).toMatchObject({
          ok: false,
          error: { code: 'PASSCODE_INVALID' },
        });
      }

      // 5th wrong attempt
      const fifthAck = await emitAck(guestSocket, 'room:join', { code, passcode: 'wrong5' });
      expect(fifthAck).toMatchObject({
        ok: false,
        error: { code: 'PASSCODE_INVALID' },
      });

      // 6th attempt -> RATE_LIMITED even if correct passcode is provided now!
      const rateLimitedAck = await emitAck(guestSocket, 'room:join', { code, passcode: 'secret12' });
      expect(rateLimitedAck).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });
    });

    test('valid passcode admits participant', async () => {
      const { user: host, socket: hostSocket } = await makeUserAndSocket('Host');
      const { socket: guestSocket } = await makeUserAndSocket('Guest');

      const salt = await bcrypt.genSalt(10);
      const passcodeHash = await bcrypt.hash('open456', salt);
      const { code } = await createMeeting(host, { passcodeHash });

      await emitAck(hostSocket, 'room:join', { code });

      const joinAck = await emitAck(guestSocket, 'room:join', { code, passcode: 'open456' });
      expect(joinAck).toMatchObject({
        ok: true,
        status: 'admitted',
        role: 'participant',
      });
    });
  });

  describe('Role actions and permissions matrix', () => {
    test('every action by wrong role is FORBIDDEN', async () => {
      const { user: host, socket: hostSocket } = await makeUserAndSocket('Host');
      const { user: coHost, socket: coHostSocket } = await makeUserAndSocket('CoHost');
      const { socket: guestSocket } = await makeUserAndSocket('Guest');

      const { code } = await createMeeting(host, { coHosts: [coHost.id] });

      await emitAck(hostSocket, 'room:join', { code });
      await emitAck(coHostSocket, 'room:join', { code });
      await emitAck(guestSocket, 'room:join', { code });

      // Participant trying moderator actions
      const pLock = await emitAck(guestSocket, 'host:lock', { locked: true });
      expect(pLock.ok).toBe(false);
      expect(pLock.error.code).toBe('FORBIDDEN');

      const pSettings = await emitAck(guestSocket, 'host:settings', { muteOnEntry: true });
      expect(pSettings.ok).toBe(false);
      expect(pSettings.error.code).toBe('FORBIDDEN');

      const pMute = await emitAck(guestSocket, 'host:mute', { peerId: hostSocket.id });
      expect(pMute.ok).toBe(false);
      expect(pMute.error.code).toBe('FORBIDDEN');

      const pRemove = await emitAck(guestSocket, 'host:remove', { peerId: coHostSocket.id });
      expect(pRemove.ok).toBe(false);
      expect(pRemove.error.code).toBe('FORBIDDEN');

      // Participant trying host-only actions
      const pPromote = await emitAck(guestSocket, 'host:promote', { peerId: guestSocket.id });
      expect(pPromote.ok).toBe(false);
      expect(pPromote.error.code).toBe('FORBIDDEN');

      const pEnd = await emitAck(guestSocket, 'host:end', {});
      expect(pEnd.ok).toBe(false);
      expect(pEnd.error.code).toBe('FORBIDDEN');

      // Co-host trying host-only actions (promote, demote, end)
      const chPromote = await emitAck(coHostSocket, 'host:promote', { peerId: guestSocket.id });
      expect(chPromote.ok).toBe(false);
      expect(chPromote.error.code).toBe('FORBIDDEN');

      const chDemote = await emitAck(coHostSocket, 'host:demote', { peerId: coHostSocket.id });
      expect(chDemote.ok).toBe(false);
      expect(chDemote.error.code).toBe('FORBIDDEN');

      const chEnd = await emitAck(coHostSocket, 'host:end', {});
      expect(chEnd.ok).toBe(false);
      expect(chEnd.error.code).toBe('FORBIDDEN');
    });

    test('co-host can never act on the host', async () => {
      const { user: host, socket: hostSocket } = await makeUserAndSocket('Host');
      const { user: coHost, socket: coHostSocket } = await makeUserAndSocket('CoHost');

      const { code } = await createMeeting(host, { coHosts: [coHost.id] });

      await emitAck(hostSocket, 'room:join', { code });
      await emitAck(coHostSocket, 'room:join', { code });

      // Co-host tries to mute host
      const muteHost = await emitAck(coHostSocket, 'host:mute', { peerId: hostSocket.id });
      expect(muteHost.ok).toBe(false);
      expect(muteHost.error.code).toBe('FORBIDDEN');
      expect(muteHost.error.message).toMatch(/Co-hosts cannot act on the host/i);

      // Co-host tries to request-unmute host
      const unmuteHost = await emitAck(coHostSocket, 'host:request-unmute', { peerId: hostSocket.id });
      expect(unmuteHost.ok).toBe(false);
      expect(unmuteHost.error.code).toBe('FORBIDDEN');

      // Co-host tries to stop-video on host
      const stopVidHost = await emitAck(coHostSocket, 'host:stop-video', { peerId: hostSocket.id });
      expect(stopVidHost.ok).toBe(false);
      expect(stopVidHost.error.code).toBe('FORBIDDEN');

      // Co-host tries to rename host
      const renameHost = await emitAck(coHostSocket, 'host:rename', { peerId: hostSocket.id, name: 'Hacked' });
      expect(renameHost.ok).toBe(false);
      expect(renameHost.error.code).toBe('FORBIDDEN');

      // Co-host tries to remove host
      const removeHost = await emitAck(coHostSocket, 'host:remove', { peerId: hostSocket.id });
      expect(removeHost.ok).toBe(false);
      expect(removeHost.error.code).toBe('FORBIDDEN');

      // Co-host tries to lower host's hand
      const lowerHand = await emitAck(coHostSocket, 'hand:set', { raised: false, peerId: hostSocket.id });
      expect(lowerHand.ok).toBe(false);
      expect(lowerHand.error.code).toBe('FORBIDDEN');
    });

    test('host can promote and demote co-hosts with real-time role broadcasts', async () => {
      const { user: host, socket: hostSocket } = await makeUserAndSocket('Host');
      const { socket: guestSocket } = await makeUserAndSocket('Guest');

      const { code } = await createMeeting(host);
      await emitAck(hostSocket, 'room:join', { code });
      await emitAck(guestSocket, 'room:join', { code });

      const rolePromise1 = waitForEvent(guestSocket, 'peer:role-changed');
      const promoteAck = await emitAck(hostSocket, 'host:promote', { peerId: guestSocket.id });
      expect(promoteAck).toMatchObject({ ok: true, peerId: guestSocket.id, role: 'co-host' });

      const rolePayload1 = await rolePromise1;
      expect(rolePayload1).toMatchObject({
        peerId: guestSocket.id,
        role: 'co-host',
        isCoHost: true,
      });

      // Host demotes co-host back to participant
      const rolePromise2 = waitForEvent(guestSocket, 'peer:role-changed');
      const demoteAck = await emitAck(hostSocket, 'host:demote', { peerId: guestSocket.id });
      expect(demoteAck).toMatchObject({ ok: true, peerId: guestSocket.id, role: 'participant' });

      const rolePayload2 = await rolePromise2;
      expect(rolePayload2).toMatchObject({
        peerId: guestSocket.id,
        role: 'participant',
        isCoHost: false,
      });
    });

    test('moderator remote commands (mute, stop-video, request-unmute, rename, remove and block)', async () => {
      const { user: host, socket: hostSocket } = await makeUserAndSocket('Host');
      const { user: coHost, socket: coHostSocket } = await makeUserAndSocket('CoHost');
      const { user: guest, socket: guestSocket } = await makeUserAndSocket('Guest');

      const { code } = await createMeeting(host, { coHosts: [coHost.id] });
      await emitAck(hostSocket, 'room:join', { code });
      await emitAck(coHostSocket, 'room:join', { code });
      await emitAck(guestSocket, 'room:join', { code });

      // Co-host mutes participant
      const mutePromise = waitForEvent(guestSocket, 'host:command-mute');
      const muteAck = await emitAck(coHostSocket, 'host:mute', { peerId: guestSocket.id });
      expect(muteAck.ok).toBe(true);
      const muteCmd = await mutePromise;
      expect(muteCmd).toMatchObject({ by: expect.any(String) });

      // Co-host stops participant video
      const stopVidPromise = waitForEvent(guestSocket, 'host:command-stop-video');
      const stopVidAck = await emitAck(coHostSocket, 'host:stop-video', { peerId: guestSocket.id });
      expect(stopVidAck.ok).toBe(true);
      const stopVidCmd = await stopVidPromise;
      expect(stopVidCmd).toMatchObject({ by: expect.any(String) });

      // Co-host requests unmute (prompt only, never forced)
      const unmutePromise = waitForEvent(guestSocket, 'host:command-request-unmute');
      const unmuteAck = await emitAck(coHostSocket, 'host:request-unmute', { peerId: guestSocket.id });
      expect(unmuteAck.ok).toBe(true);
      const unmuteCmd = await unmutePromise;
      expect(unmuteCmd).toMatchObject({ by: expect.any(String) });

      // Co-host renames participant for this room
      const renamePromise = waitForEvent(hostSocket, 'peer:renamed');
      const renameAck = await emitAck(coHostSocket, 'host:rename', { peerId: guestSocket.id, name: 'RenamedGuest' });
      expect(renameAck).toMatchObject({ ok: true, name: 'RenamedGuest' });
      const renameEvent = await renamePromise;
      expect(renameEvent).toMatchObject({ peerId: guestSocket.id, name: 'RenamedGuest' });

      // Co-host removes and blocks participant
      const removedPromise = waitForEvent(guestSocket, 'room:removed');
      const removeAck = await emitAck(coHostSocket, 'host:remove', { peerId: guestSocket.id, block: true });
      expect(removeAck.ok).toBe(true);
      const removePayload = await removedPromise;
      expect(removePayload).toMatchObject({ reason: 'BLOCKED' });

      // Blocked guest cannot re-join
      const reJoinAck = await emitAck(guestSocket, 'room:join', { code });
      expect(reJoinAck).toMatchObject({
        ok: false,
        error: { code: 'BLOCKED' },
      });
    });

    test('settings enforcement: chatAllowed: false and shareAllowed: host-only', async () => {
      const { user: host, socket: hostSocket } = await makeUserAndSocket('Host');
      const { user: coHost, socket: coHostSocket } = await makeUserAndSocket('CoHost');
      const { socket: guestSocket } = await makeUserAndSocket('Guest');

      const { code } = await createMeeting(host, { coHosts: [coHost.id] });
      await emitAck(hostSocket, 'room:join', { code });
      await emitAck(coHostSocket, 'room:join', { code });
      await emitAck(guestSocket, 'room:join', { code });

      // Host disables chat and restricts screen sharing to host-only
      const settingsAck = await emitAck(hostSocket, 'host:settings', {
        chatAllowed: false,
        shareAllowed: 'host-only',
      });
      expect(settingsAck.ok).toBe(true);

      // Participant cannot send chat (CHAT_DISABLED)
      const chatAck = await emitAck(guestSocket, 'chat:send', { text: 'Hello everyone' });
      expect(chatAck).toMatchObject({
        ok: false,
        error: { code: 'CHAT_DISABLED' },
      });

      // Participant cannot share screen (SHARE_NOT_ALLOWED)
      const shareAck = await emitAck(guestSocket, 'share:start', { streamId: 'screen-123' });
      expect(shareAck).toMatchObject({
        ok: false,
        error: { code: 'SHARE_NOT_ALLOWED' },
      });

      // But co-host CAN chat and share screen
      const coHostChat = await emitAck(coHostSocket, 'chat:send', { text: 'Moderator announcement' });
      expect(coHostChat.ok).toBe(true);

      const coHostShare = await emitAck(coHostSocket, 'share:start', { streamId: 'cohost-screen' });
      expect(coHostShare.ok).toBe(true);
    });
  });
});
