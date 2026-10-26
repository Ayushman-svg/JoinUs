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

describe('Reactions, Hand Raise, and Feedback socket integration', () => {
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

  async function createMeeting(hostId, waitingRoom = false) {
    const code = generateMeetingCode();
    await Meeting.create({
      code,
      title: 'Reactions Test Meeting',
      host: hostId,
      startsAt: new Date(),
      waitingRoom,
    });
    return code;
  }

  test('a waiting guest cannot send reactions, hand raise, or feedback', async () => {
    const host = await createUser({ email: 'host1@example.com' });
    const guest = await createUser({ email: 'guest1@example.com' });
    const code = await createMeeting(host.user.id, true); // waitingRoom: true

    const hostSocket = await connectSocket(port, host.token);
    socketsToClose.push(hostSocket);
    await emitAck(hostSocket, 'room:join', { code });

    const guestSocket = await connectSocket(port, guest.token);
    socketsToClose.push(guestSocket);
    const joinRes = await emitAck(guestSocket, 'room:join', { code });
    expect(joinRes.status).toBe('waiting');

    // 1. Reaction from waiting guest must be rejected with NOT_IN_ROOM
    const reactionRes = await emitAck(guestSocket, 'reaction:send', { kind: 'thumbs-up' });
    expect(reactionRes.ok).toBe(false);
    expect(reactionRes.error.code).toBe('NOT_IN_ROOM');

    // 2. Hand set from waiting guest must be rejected with NOT_IN_ROOM
    const handRes = await emitAck(guestSocket, 'hand:set', { raised: true });
    expect(handRes.ok).toBe(false);
    expect(handRes.error.code).toBe('NOT_IN_ROOM');

    // 3. Feedback set from waiting guest must be rejected with NOT_IN_ROOM
    const feedbackRes = await emitAck(guestSocket, 'feedback:set', { kind: 'yes' });
    expect(feedbackRes.ok).toBe(false);
    expect(feedbackRes.error.code).toBe('NOT_IN_ROOM');
  });

  test('invalid kinds are rejected with VALIDATION_ERROR', async () => {
    const host = await createUser({ email: 'host2@example.com' });
    const code = await createMeeting(host.user.id, false);

    const hostSocket = await connectSocket(port, host.token);
    socketsToClose.push(hostSocket);
    await emitAck(hostSocket, 'room:join', { code });

    // Invalid reaction kind
    const resInvalidReaction = await emitAck(hostSocket, 'reaction:send', { kind: 'rocket' });
    expect(resInvalidReaction.ok).toBe(false);
    expect(resInvalidReaction.error.code).toBe('VALIDATION_ERROR');

    // Missing reaction kind
    const resEmptyReaction = await emitAck(hostSocket, 'reaction:send', {});
    expect(resEmptyReaction.ok).toBe(false);
    expect(resEmptyReaction.error.code).toBe('VALIDATION_ERROR');

    // Invalid feedback kind
    const resInvalidFeedback = await emitAck(hostSocket, 'feedback:set', { kind: 'unknown' });
    expect(resInvalidFeedback.ok).toBe(false);
    expect(resInvalidFeedback.error.code).toBe('VALIDATION_ERROR');

    // Missing hand raised field
    const resEmptyHand = await emitAck(hostSocket, 'hand:set', {});
    expect(resEmptyHand.ok).toBe(false);
    expect(resEmptyHand.error.code).toBe('VALIDATION_ERROR');
  });

  test('rate limit works: allows 1 reaction per second per socket and rejects excess', async () => {
    const host = await createUser({ email: 'host3@example.com' });
    const code = await createMeeting(host.user.id, false);

    const hostSocket = await connectSocket(port, host.token);
    socketsToClose.push(hostSocket);
    await emitAck(hostSocket, 'room:join', { code });

    // 1st reaction succeeds
    const firstRes = await emitAck(hostSocket, 'reaction:send', { kind: 'thumbs-up' });
    expect(firstRes.ok).toBe(true);
    expect(firstRes.kind).toBe('thumbs-up');

    // 2nd reaction sent immediately must be rejected with RATE_LIMITED
    const secondRes = await emitAck(hostSocket, 'reaction:send', { kind: 'heart' });
    expect(secondRes.ok).toBe(false);
    expect(secondRes.error.code).toBe('RATE_LIMITED');
  });

  test('broadcasts reactions, hand raise, and feedback to all admitted peers', async () => {
    const host = await createUser({ email: 'host4@example.com' });
    const guest = await createUser({ email: 'guest4@example.com' });
    const code = await createMeeting(host.user.id, false);

    const hostSocket = await connectSocket(port, host.token);
    socketsToClose.push(hostSocket);
    await emitAck(hostSocket, 'room:join', { code });

    const guestSocket = await connectSocket(port, guest.token);
    socketsToClose.push(guestSocket);
    await emitAck(guestSocket, 'room:join', { code });

    // Host sends reaction -> guest receives reaction:new
    const guestReactionPromise = waitForEvent(guestSocket, 'reaction:new');
    const sendReactionAck = await emitAck(hostSocket, 'reaction:send', { kind: 'clap' });
    expect(sendReactionAck.ok).toBe(true);

    const receivedReaction = await guestReactionPromise;
    expect(receivedReaction.kind).toBe('clap');
    expect(receivedReaction.userId).toBe(String(host.user.id));

    // Guest raises hand -> host receives hand:changed
    const hostHandPromise = waitForEvent(hostSocket, 'hand:changed');
    const handAck = await emitAck(guestSocket, 'hand:set', { raised: true });
    expect(handAck.ok).toBe(true);
    expect(handAck.raised).toBe(true);

    const receivedHand = await hostHandPromise;
    expect(receivedHand.raised).toBe(true);
    expect(receivedHand.userId).toBe(String(guest.user.id));

    // Guest sets feedback -> host receives feedback:changed
    const hostFeedbackPromise = waitForEvent(hostSocket, 'feedback:changed');
    const feedbackAck = await emitAck(guestSocket, 'feedback:set', { kind: 'slower' });
    expect(feedbackAck.ok).toBe(true);
    expect(feedbackAck.kind).toBe('slower');

    const receivedFeedback = await hostFeedbackPromise;
    expect(receivedFeedback.kind).toBe('slower');
    expect(receivedFeedback.userId).toBe(String(guest.user.id));
  });

  test('hand and feedback state appear in join response and room:status, and clear on leave', async () => {
    const host = await createUser({ email: 'host5@example.com' });
    const peer1 = await createUser({ email: 'peer1_5@example.com' });
    const lateJoiner = await createUser({ email: 'late5@example.com' });
    const code = await createMeeting(host.user.id, false);

    const hostSocket = await connectSocket(port, host.token);
    socketsToClose.push(hostSocket);
    await emitAck(hostSocket, 'room:join', { code });

    const peer1Socket = await connectSocket(port, peer1.token);
    socketsToClose.push(peer1Socket);
    await emitAck(peer1Socket, 'room:join', { code });

    // Peer 1 raises hand and sets feedback
    await emitAck(peer1Socket, 'hand:set', { raised: true });
    await emitAck(peer1Socket, 'feedback:set', { kind: 'faster' });

    // Late joiner joins now -> peer1's hand and feedback must appear in peers array
    const lateSocket = await connectSocket(port, lateJoiner.token);
    socketsToClose.push(lateSocket);
    const lateJoinRes = await emitAck(lateSocket, 'room:join', { code });

    expect(lateJoinRes.status).toBe('admitted');
    const peer1InJoin = lateJoinRes.peers.find((p) => p.user.id === String(peer1.user.id));
    expect(peer1InJoin).toBeDefined();
    expect(peer1InJoin.handRaised).toBe(true);
    expect(peer1InJoin.raisedAt).toBeGreaterThan(0);
    expect(peer1InJoin.feedback).toBe('faster');

    // Late joiner also sees it via room:status
    const statusRes = await emitAck(lateSocket, 'room:status', { code });
    const peer1InStatus = statusRes.peers.find((p) => p.user.id === String(peer1.user.id));
    expect(peer1InStatus).toBeDefined();
    expect(peer1InStatus.handRaised).toBe(true);
    expect(peer1InStatus.feedback).toBe('faster');

    // When Peer 1 leaves, state clears and peer is removed
    await emitAck(peer1Socket, 'room:leave', {});

    const statusAfterLeave = await emitAck(lateSocket, 'room:status', { code });
    const peer1AfterLeave = statusAfterLeave.peers.find((p) => p.user.id === String(peer1.user.id));
    expect(peer1AfterLeave).toBeUndefined();
  });
});
