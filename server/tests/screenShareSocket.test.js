const http = require('http');
const ioClient = require('socket.io-client');

const app = require('../src/app');
const { initSockets } = require('../src/sockets');
const Meeting = require('../src/models/Meeting');
const { generateMeetingCode } = require('../src/utils/meetingCode');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./helpers/db');
const { createUser } = require('./helpers/users');

beforeAll(connectTestDB, 120000);
afterEach(clearTestDB);
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

describe('Screen share and room capacity socket integration', () => {
  let server;
  let ioInstance;
  let port;
  const socketsToClose = [];

  beforeAll((done) => {
    server = http.createServer(app);
    const { io } = initSockets(server);
    ioInstance = io;
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    for (const s of socketsToClose) {
      if (s.connected) s.disconnect();
    }
    ioInstance.close(() => {
      done();
    });
  });

  afterEach(() => {
    while (socketsToClose.length > 0) {
      const s = socketsToClose.pop();
      if (s.connected) s.disconnect();
    }
  });

  async function createMeeting(hostId, overrides = {}) {
    return Meeting.create({
      code: generateMeetingCode(),
      title: 'Screen Share Meeting',
      host: hostId,
      startsAt: new Date(),
      waitingRoom: false, // Default false for simple multi-party join
      ...overrides,
    });
  }

  it('broadcasts room:screen-updated on share:start and rejects second share with SCREEN_SHARE_BUSY', async () => {
    const host = await createUser({ name: 'Host Alice' });
    const guest = await createUser({ name: 'Guest Bob' });
    const meeting = await createMeeting(host.user.id);

    const hostSocket = await connectSocket(port, host.token);
    const guestSocket = await connectSocket(port, guest.token);
    socketsToClose.push(hostSocket, guestSocket);

    await emitAck(hostSocket, 'room:join', { code: meeting.code });
    await emitAck(guestSocket, 'room:join', { code: meeting.code });

    const guestReceivedScreenPromise = new Promise((resolve) => {
      guestSocket.once('room:screen-updated', resolve);
    });

    // Host starts screen share
    const shareAck = await emitAck(hostSocket, 'share:start', { streamId: 'screen-stream-host' });
    expect(shareAck).toEqual({ ok: true });

    const update = await guestReceivedScreenPromise;
    expect(update).toEqual({ peerId: hostSocket.id, streamId: 'screen-stream-host' });

    // Guest attempts to share concurrently: rejected
    const secondShareAck = await emitAck(guestSocket, 'share:start', { streamId: 'screen-stream-guest' });
    expect(secondShareAck).toMatchObject({
      ok: false,
      error: expect.objectContaining({ code: 'SCREEN_SHARE_BUSY' }),
    });
  });

  it('rejects non-host from stopping another peer screen share via host:stop-share', async () => {
    const host = await createUser({ name: 'Host Alice' });
    const guest = await createUser({ name: 'Guest Bob' });
    const meeting = await createMeeting(host.user.id);

    const hostSocket = await connectSocket(port, host.token);
    const guestSocket = await connectSocket(port, guest.token);
    socketsToClose.push(hostSocket, guestSocket);

    await emitAck(hostSocket, 'room:join', { code: meeting.code });
    await emitAck(guestSocket, 'room:join', { code: meeting.code });

    await emitAck(hostSocket, 'share:start', { streamId: 'screen-host-1' });

    // Guest tries host:stop-share -> FORBIDDEN
    const guestStopAck = await emitAck(guestSocket, 'host:stop-share', {});
    expect(guestStopAck).toMatchObject({
      ok: false,
      error: expect.objectContaining({ code: 'FORBIDDEN' }),
    });

    // Host can stop the share
    const hostStopAck = await emitAck(hostSocket, 'host:stop-share', {});
    expect(hostStopAck).toEqual({ ok: true });
  });

  it('clears screen share when sharer leaves or disconnects', async () => {
    const host = await createUser({ name: 'Host Alice' });
    const guest = await createUser({ name: 'Guest Bob' });
    const meeting = await createMeeting(host.user.id);

    const hostSocket = await connectSocket(port, host.token);
    const guestSocket = await connectSocket(port, guest.token);
    socketsToClose.push(hostSocket, guestSocket);

    await emitAck(hostSocket, 'room:join', { code: meeting.code });
    await emitAck(guestSocket, 'room:join', { code: meeting.code });

    await emitAck(guestSocket, 'share:start', { streamId: 'screen-guest-1' });

    const hostScreenClearPromise = new Promise((resolve) => {
      hostSocket.once('room:screen-updated', resolve);
    });

    // Guest disconnects
    guestSocket.disconnect();

    const screenUpdate = await hostScreenClearPromise;
    expect(screenUpdate).toEqual({ peerId: null, streamId: null });
  });

  it('provides the current sharer to late joiners in the join ack', async () => {
    const host = await createUser({ name: 'Host Alice' });
    const guest = await createUser({ name: 'Guest Bob' });
    const meeting = await createMeeting(host.user.id);

    const hostSocket = await connectSocket(port, host.token);
    socketsToClose.push(hostSocket);

    await emitAck(hostSocket, 'room:join', { code: meeting.code });
    await emitAck(hostSocket, 'share:start', { streamId: 'screen-host-stream-123' });

    // Guest joins after screen share has already started
    const guestSocket = await connectSocket(port, guest.token);
    socketsToClose.push(guestSocket);

    const guestJoinAck = await emitAck(guestSocket, 'room:join', { code: meeting.code });
    expect(guestJoinAck).toMatchObject({
      ok: true,
      status: 'admitted',
      screenSharer: {
        peerId: hostSocket.id,
        streamId: 'screen-host-stream-123',
      },
    });
  });

  it('enforces room cap and returns ROOM_FULL for the 5th participant', async () => {
    const users = await Promise.all([
      createUser({ name: 'User 1' }),
      createUser({ name: 'User 2' }),
      createUser({ name: 'User 3' }),
      createUser({ name: 'User 4' }),
      createUser({ name: 'User 5' }),
    ]);

    const meeting = await createMeeting(users[0].user.id);
    const connectedSockets = [];

    for (let i = 0; i < 4; i++) {
      const s = await connectSocket(port, users[i].token);
      connectedSockets.push(s);
      socketsToClose.push(s);
      const ack = await emitAck(s, 'room:join', { code: meeting.code });
      expect(ack.ok).toBe(true);
      expect(ack.status).toBe('admitted');
    }

    // 5th person joins -> ROOM_FULL
    const s5 = await connectSocket(port, users[4].token);
    connectedSockets.push(s5);
    socketsToClose.push(s5);
    const ack5 = await emitAck(s5, 'room:join', { code: meeting.code });

    expect(ack5).toMatchObject({
      ok: false,
      error: expect.objectContaining({ code: 'ROOM_FULL' }),
    });
  });
});
