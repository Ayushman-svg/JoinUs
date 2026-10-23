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

describe('Waiting room and host controls socket integration', () => {
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
      title: 'Host Meeting',
      host: hostId,
      startsAt: new Date(),
      waitingRoom: true,
      ...overrides,
    });
  }

  it('puts a guest in waiting and notifies the host with room:waiting-updated', async () => {
    const host = await createUser({ name: 'Host Alice' });
    const guest = await createUser({ name: 'Guest Bob' });
    const meeting = await createMeeting(host.user.id);

    const hostSocket = await connectSocket(port, host.token);
    socketsToClose.push(hostSocket);

    // Host joins directly
    const hostJoinAck = await emitAck(hostSocket, 'room:join', { code: meeting.code });
    expect(hostJoinAck).toMatchObject({
      ok: true,
      status: 'admitted',
      peerId: hostSocket.id,
      peers: [],
    });

    const waitingPromise = new Promise((resolve) => {
      hostSocket.once('room:waiting-updated', resolve);
    });

    const guestSocket = await connectSocket(port, guest.token);
    socketsToClose.push(guestSocket);

    // Guest joins: status is waiting
    const guestJoinAck = await emitAck(guestSocket, 'room:join', { code: meeting.code });
    expect(guestJoinAck).toMatchObject({
      ok: true,
      status: 'waiting',
    });

    // Host receives room:waiting-updated with the guest
    const waitingEvent = await waitingPromise;
    expect(waitingEvent.waiting).toHaveLength(1);
    expect(waitingEvent.waiting[0]).toMatchObject({
      peerId: guestSocket.id,
      user: { id: guest.user.id, name: 'Guest Bob' },
    });
  });

  it('ensures a waiting guest cannot signal or receive peer events', async () => {
    const host = await createUser({ name: 'Host Alice' });
    const guest = await createUser({ name: 'Guest Bob' });
    const meeting = await createMeeting(host.user.id);

    const hostSocket = await connectSocket(port, host.token);
    const guestSocket = await connectSocket(port, guest.token);
    socketsToClose.push(hostSocket, guestSocket);

    await emitAck(hostSocket, 'room:join', { code: meeting.code });
    await emitAck(guestSocket, 'room:join', { code: meeting.code });

    // Guest in waiting tries to signal the host
    const signalAck = await emitAck(guestSocket, 'signal', {
      to: hostSocket.id,
      description: { type: 'offer', sdp: 'fake-sdp' },
    });
    expect(signalAck).toMatchObject({
      ok: false,
      error: { code: 'NOT_IN_ROOM' },
    });

    // Verify guest does not receive room:peer-joined
    let guestGotPeerJoined = false;
    guestSocket.on('room:peer-joined', () => {
      guestGotPeerJoined = true;
    });

    // Another participant joins directly (e.g. host rejoining or open room)
    const hostSocket2 = await connectSocket(port, host.token);
    socketsToClose.push(hostSocket2);
    await emitAck(hostSocket2, 'room:join', { code: meeting.code });

    // Wait a brief tick to confirm no event arrived at the waiting guest
    await new Promise((r) => setTimeout(r, 50));
    expect(guestGotPeerJoined).toBe(false);
  });

  it('admits a guest when the host calls host:admit', async () => {
    const host = await createUser({ name: 'Host Alice' });
    const guest = await createUser({ name: 'Guest Bob' });
    const meeting = await createMeeting(host.user.id);

    const hostSocket = await connectSocket(port, host.token);
    const guestSocket = await connectSocket(port, guest.token);
    socketsToClose.push(hostSocket, guestSocket);

    await emitAck(hostSocket, 'room:join', { code: meeting.code });
    await emitAck(guestSocket, 'room:join', { code: meeting.code });

    const admittedPromise = new Promise((resolve) => {
      guestSocket.once('room:admitted', resolve);
    });
    const hostPeerJoinedPromise = new Promise((resolve) => {
      hostSocket.once('room:peer-joined', resolve);
    });

    const admitAck = await emitAck(hostSocket, 'host:admit', { peerId: guestSocket.id });
    expect(admitAck).toMatchObject({ ok: true });

    // Guest receives room:admitted
    const admittedData = await admittedPromise;
    expect(admittedData.peerId).toBe(guestSocket.id);
    expect(admittedData.peers).toHaveLength(1);
    expect(admittedData.peers[0].peerId).toBe(hostSocket.id);

    // Host receives room:peer-joined
    const peerJoinedData = await hostPeerJoinedPromise;
    expect(peerJoinedData.peerId).toBe(guestSocket.id);
    expect(peerJoinedData.user.name).toBe('Guest Bob');

    const updatedMeeting = await Meeting.findOne({ code: meeting.code });
    expect(updatedMeeting.startedAt).toBeTruthy();
    expect(updatedMeeting.attendees.map((id) => id.toString())).toContain(host.user.id);
    expect(updatedMeeting.attendees.map((id) => id.toString())).toContain(guest.user.id);
  });

  it('denies a guest when the host calls host:deny', async () => {
    const host = await createUser({ name: 'Host Alice' });
    const guest = await createUser({ name: 'Guest Bob' });
    const meeting = await createMeeting(host.user.id);

    const hostSocket = await connectSocket(port, host.token);
    const guestSocket = await connectSocket(port, guest.token);
    socketsToClose.push(hostSocket, guestSocket);

    await emitAck(hostSocket, 'room:join', { code: meeting.code });
    await emitAck(guestSocket, 'room:join', { code: meeting.code });

    const deniedPromise = new Promise((resolve) => {
      guestSocket.once('room:denied', resolve);
    });

    const denyAck = await emitAck(hostSocket, 'host:deny', { peerId: guestSocket.id });
    expect(denyAck).toMatchObject({ ok: true });

    await deniedPromise;
  });

  it('rejects non-host calling host:* controls with FORBIDDEN', async () => {
    const host = await createUser({ name: 'Host Alice' });
    const guest = await createUser({ name: 'Guest Bob' });
    // Meeting with waitingRoom false so guest can enter active room directly
    const meeting = await createMeeting(host.user.id, { waitingRoom: false });

    const guestSocket = await connectSocket(port, guest.token);
    socketsToClose.push(guestSocket);
    await emitAck(guestSocket, 'room:join', { code: meeting.code });

    const admitAck = await emitAck(guestSocket, 'host:admit', { peerId: 'some-peer' });
    expect(admitAck).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Only the host can do this' },
    });

    const endAck = await emitAck(guestSocket, 'host:end', {});
    expect(endAck).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
  });

  it('allows an admitted guest to reconnect and skip waiting', async () => {
    const host = await createUser({ name: 'Host Alice' });
    const guest = await createUser({ name: 'Guest Bob' });
    const meeting = await createMeeting(host.user.id);

    const hostSocket = await connectSocket(port, host.token);
    const guestSocket1 = await connectSocket(port, guest.token);
    socketsToClose.push(hostSocket, guestSocket1);

    await emitAck(hostSocket, 'room:join', { code: meeting.code });
    await emitAck(guestSocket1, 'room:join', { code: meeting.code });
    await emitAck(hostSocket, 'host:admit', { peerId: guestSocket1.id });

    // Guest disconnects
    guestSocket1.disconnect();

    // Guest reconnects with fresh socket
    const guestSocket2 = await connectSocket(port, guest.token);
    socketsToClose.push(guestSocket2);

    const rejoinAck = await emitAck(guestSocket2, 'room:join', { code: meeting.code });
    expect(rejoinAck).toMatchObject({
      ok: true,
      status: 'admitted',
      peerId: guestSocket2.id,
    });
  });

  it('host:end sends room:ended and blocks later joins with MEETING_ENDED', async () => {
    const host = await createUser({ name: 'Host Alice' });
    const guest = await createUser({ name: 'Guest Bob' });
    const meeting = await createMeeting(host.user.id, { waitingRoom: false });

    const hostSocket = await connectSocket(port, host.token);
    const guestSocket = await connectSocket(port, guest.token);
    socketsToClose.push(hostSocket, guestSocket);

    await emitAck(hostSocket, 'room:join', { code: meeting.code });
    await emitAck(guestSocket, 'room:join', { code: meeting.code });

    const hostEndedPromise = new Promise((resolve) => hostSocket.once('room:ended', resolve));
    const guestEndedPromise = new Promise((resolve) => guestSocket.once('room:ended', resolve));

    const endAck = await emitAck(hostSocket, 'host:end', {});
    expect(endAck).toMatchObject({ ok: true });

    await Promise.all([hostEndedPromise, guestEndedPromise]);

    // Later join attempt is rejected with MEETING_ENDED
    const lateUser = await createUser({ name: 'Late Charlie' });
    const lateSocket = await connectSocket(port, lateUser.token);
    socketsToClose.push(lateSocket);

    const lateJoinAck = await emitAck(lateSocket, 'room:join', { code: meeting.code });
    expect(lateJoinAck).toMatchObject({
      ok: false,
      error: { code: 'MEETING_ENDED' },
    });

    const endedMeeting = await Meeting.findOne({ code: meeting.code });
    expect(endedMeeting.status).toBe('ended');
    expect(endedMeeting.lastActiveAt).toBeTruthy();
  });
});
