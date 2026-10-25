const http = require('http');
const ioClient = require('socket.io-client');

const app = require('../src/app');
const { initSockets } = require('../src/sockets');
const Meeting = require('../src/models/Meeting');
const Message = require('../src/models/Message');
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

describe('Chat socket authorization, validation and rate limit', () => {
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

  afterEach(async () => {
    while (socketsToClose.length > 0) {
      const s = socketsToClose.pop();
      if (s.connected) s.disconnect();
    }
    await new Promise((r) => setTimeout(r, 50));
  });

  async function createMeeting(hostId, overrides = {}) {
    return Meeting.create({
      code: generateMeetingCode(),
      title: 'Chat Test Meeting',
      host: hostId,
      startsAt: new Date(),
      waitingRoom: false,
      ...overrides,
    });
  }

  it('an admitted user sends and others receive it and it is stored', async () => {
    const host = await createUser({ name: 'Alice' });
    const guest = await createUser({ name: 'Bob' });
    const meeting = await createMeeting(host.user.id);

    const hostSocket = await connectSocket(port, host.token);
    const guestSocket = await connectSocket(port, guest.token);
    socketsToClose.push(hostSocket, guestSocket);

    await emitAck(hostSocket, 'room:join', { code: meeting.code });
    await emitAck(guestSocket, 'room:join', { code: meeting.code });

    const messagePromise = waitForEvent(guestSocket, 'chat:message');
    const hostMessagePromise = waitForEvent(hostSocket, 'chat:message');

    const ack = await emitAck(hostSocket, 'chat:send', { text: '  Hello world!  ' });
    expect(ack.ok).toBe(true);
    expect(ack.message).toMatchObject({
      id: expect.any(String),
      from: { id: host.user.id.toString(), name: 'Alice' },
      text: 'Hello world!',
      createdAt: expect.any(String),
    });

    const receivedByGuest = await messagePromise;
    expect(receivedByGuest).toEqual(ack.message);

    const receivedByHost = await hostMessagePromise;
    expect(receivedByHost).toEqual(ack.message);

    // Stored in MongoDB
    const stored = await Message.findById(ack.message.id);
    expect(stored).not.toBeNull();
    expect(stored.text).toBe('Hello world!');
    expect(stored.name).toBe('Alice');
    expect(stored.user.toString()).toBe(host.user.id.toString());
    expect(stored.meeting.toString()).toBe(meeting._id.toString());
  });

  it('a waiting guest cannot send or receive chat messages', async () => {
    const host = await createUser({ name: 'Host Alice' });
    const guest = await createUser({ name: 'Guest Bob' });
    const meeting = await createMeeting(host.user.id, { waitingRoom: true });

    const hostSocket = await connectSocket(port, host.token);
    const guestSocket = await connectSocket(port, guest.token);
    socketsToClose.push(hostSocket, guestSocket);

    await emitAck(hostSocket, 'room:join', { code: meeting.code });
    const guestJoinAck = await emitAck(guestSocket, 'room:join', { code: meeting.code });
    expect(guestJoinAck.status).toBe('waiting');

    // Waiting guest cannot send
    const guestSendAck = await emitAck(guestSocket, 'chat:send', { text: 'Please let me in' });
    expect(guestSendAck.ok).toBe(false);
    expect(guestSendAck.error.code).toBe('NOT_IN_ROOM');

    // Host sends message - guest in waiting room must not receive chat:message
    let guestReceived = false;
    guestSocket.on('chat:message', () => {
      guestReceived = true;
    });

    const hostSendAck = await emitAck(hostSocket, 'chat:send', { text: 'Secret host chat' });
    expect(hostSendAck.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 200));
    expect(guestReceived).toBe(false);
  });

  it('rejects empty, whitespace-only, and too-long text', async () => {
    const host = await createUser({ name: 'Alice' });
    const meeting = await createMeeting(host.user.id);

    const socket = await connectSocket(port, host.token);
    socketsToClose.push(socket);
    await emitAck(socket, 'room:join', { code: meeting.code });

    // Empty string
    const emptyAck = await emitAck(socket, 'chat:send', { text: '' });
    expect(emptyAck.ok).toBe(false);
    expect(emptyAck.error.code).toBe('VALIDATION_ERROR');

    // Whitespace only
    const whitespaceAck = await emitAck(socket, 'chat:send', { text: '     ' });
    expect(whitespaceAck.ok).toBe(false);
    expect(whitespaceAck.error.code).toBe('VALIDATION_ERROR');

    // 1001 characters
    const longAck = await emitAck(socket, 'chat:send', { text: 'a'.repeat(1001) });
    expect(longAck.ok).toBe(false);
    expect(longAck.error.code).toBe('VALIDATION_ERROR');

    // Exactly 1000 characters succeeds
    const maxAck = await emitAck(socket, 'chat:send', { text: 'a'.repeat(1000) });
    expect(maxAck.ok).toBe(true);

    const totalMessages = await Message.countDocuments({ meeting: meeting._id });
    expect(totalMessages).toBe(1);
  });

  it('rate limit triggers after 5 messages in 5 seconds', async () => {
    const host = await createUser({ name: 'Speedy' });
    const meeting = await createMeeting(host.user.id);

    const socket = await connectSocket(port, host.token);
    socketsToClose.push(socket);
    await emitAck(socket, 'room:join', { code: meeting.code });

    for (let i = 1; i <= 5; i++) {
      const ack = await emitAck(socket, 'chat:send', { text: `Message ${i}` });
      expect(ack.ok).toBe(true);
    }

    const sixthAck = await emitAck(socket, 'chat:send', { text: 'Message 6' });
    expect(sixthAck.ok).toBe(false);
    expect(sixthAck.error.code).toBe('RATE_LIMITED');
    expect(sixthAck.error.message).toBe("You're sending messages too fast");
  });

  it('chat does not leak across different rooms', async () => {
    const user1 = await createUser({ name: 'Room 1 User' });
    const user2 = await createUser({ name: 'Room 2 User' });
    const meeting1 = await createMeeting(user1.user.id);
    const meeting2 = await createMeeting(user2.user.id);

    const socket1 = await connectSocket(port, user1.token);
    const socket2 = await connectSocket(port, user2.token);
    socketsToClose.push(socket1, socket2);

    await emitAck(socket1, 'room:join', { code: meeting1.code });
    await emitAck(socket2, 'room:join', { code: meeting2.code });

    let socket2Received = false;
    socket2.on('chat:message', () => {
      socket2Received = true;
    });

    const ack = await emitAck(socket1, 'chat:send', { text: 'Hello only to room 1' });
    expect(ack.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 200));
    expect(socket2Received).toBe(false);

    // Verify messages in DB only belong to meeting1
    const meeting1Msgs = await Message.find({ meeting: meeting1._id });
    const meeting2Msgs = await Message.find({ meeting: meeting2._id });
    expect(meeting1Msgs).toHaveLength(1);
    expect(meeting2Msgs).toHaveLength(0);
  });

  it('a message reaches an admitted peer whose socket is NOT in the socket.io room, with no duplicates', async () => {
    const host = await createUser({ name: 'Chat Host' });
    const guest = await createUser({ name: 'Chat Guest' });
    const meeting = await createMeeting(host.user.id);

    const hostSocket = await connectSocket(port, host.token);
    const guestSocket = await connectSocket(port, guest.token);
    socketsToClose.push(hostSocket, guestSocket);

    await emitAck(hostSocket, 'room:join', { code: meeting.code });
    await emitAck(guestSocket, 'room:join', { code: meeting.code });

    // Explicitly remove guest socket from socket.io room
    const serverGuestSocket = ioInstance.sockets.sockets.get(guestSocket.id);
    serverGuestSocket?.leave(meeting.code);

    let guestReceivedCount = 0;
    guestSocket.on('chat:message', () => {
      guestReceivedCount += 1;
    });

    const sendAck = await emitAck(hostSocket, 'chat:send', { text: 'Hello via user channel' });
    expect(sendAck.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 200));
    // Reached via user:<guestId> and exactly once (no duplicates)
    expect(guestReceivedCount).toBe(1);
  });

  it('a waiting guest receives nothing when chat message is sent', async () => {
    const host = await createUser({ name: 'Host With Waiting' });
    const waitingGuest = await createUser({ name: 'Waiting Guest' });
    const meeting = await createMeeting(host.user.id, { waitingRoom: true });

    const hostSocket = await connectSocket(port, host.token);
    const guestSocket = await connectSocket(port, waitingGuest.token);
    socketsToClose.push(hostSocket, guestSocket);

    await emitAck(hostSocket, 'room:join', { code: meeting.code });
    const joinAck = await emitAck(guestSocket, 'room:join', { code: meeting.code });
    expect(joinAck.status).toBe('waiting');

    let waitingReceived = false;
    guestSocket.on('chat:message', () => {
      waitingReceived = true;
    });

    const sendAck = await emitAck(hostSocket, 'chat:send', { text: 'Secret host message' });
    expect(sendAck.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 200));
    expect(waitingReceived).toBe(false);
  });
});
