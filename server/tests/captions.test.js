const http = require('http');
const ioClient = require('socket.io-client');
const request = require('supertest');

const app = require('../src/app');
const { initSockets } = require('../src/sockets');
const Meeting = require('../src/models/Meeting');
const Caption = require('../src/models/Caption');
const { generateMeetingCode } = require('../src/utils/meetingCode');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./helpers/db');
const { createUser } = require('./helpers/users');

beforeAll(connectTestDB, 120000);
afterEach(async () => {
  process.env.FEATURE_CAPTIONS = 'true';
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

describe('FEATURE_CAPTIONS: Live Captions and Transcript Integration', () => {
  let server;
  let port;
  const socketsToClose = [];

  beforeAll((done) => {
    process.env.FEATURE_CAPTIONS = 'true';
    server = http.createServer(app);
    initSockets(server);
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    socketsToClose.forEach((s) => s.disconnect());
    server.close(done);
  });

  afterEach(() => {
    while (socketsToClose.length) {
      const s = socketsToClose.pop();
      s.disconnect();
    }
  });

  async function setupMeetingAndPeers() {
    const hostUser = await createUser({ name: 'Host Person', email: 'host@test.com' });
    const peerUser = await createUser({ name: 'Peer Person', email: 'peer@test.com' });
    const outsiderUser = await createUser({ name: 'Outsider Person', email: 'outsider@test.com' });

    const code = generateMeetingCode();
    const meeting = await Meeting.create({
      code,
      title: 'Caption Test Meeting',
      host: hostUser.user.id || hostUser.user._id,
      waitingRoom: false,
      startsAt: new Date(),
      startedAt: new Date(Date.now() - 60000), // started 1 min ago
    });

    const hostSocket = await connectSocket(port, hostUser.token);
    socketsToClose.push(hostSocket);
    await emitAck(hostSocket, 'room:join', { code });

    const peerSocket = await connectSocket(port, peerUser.token);
    socketsToClose.push(peerSocket);
    await emitAck(peerSocket, 'room:join', { code });

    return {
      code,
      meeting,
      hostUser,
      peerUser,
      outsiderUser,
      hostSocket,
      peerSocket,
    };
  }

  test('Feature flag: blocks REST and socket event when FEATURE_CAPTIONS is disabled', async () => {
    const { code, hostUser, peerSocket } = await setupMeetingAndPeers();

    process.env.FEATURE_CAPTIONS = 'false';

    // REST check
    const res = await request(app)
      .get(`/api/meetings/${code}/captions`)
      .set('Authorization', `Bearer ${hostUser.token}`);

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FEATURE_DISABLED');

    // Socket check
    const socketRes = await emitAck(peerSocket, 'caption:segment', {
      text: 'Testing captions',
      final: false,
    });
    expect(socketRes.ok).toBe(false);
    expect(socketRes.error?.code).toBe('FEATURE_DISABLED');
  });

  test('Authorization: an outsider cannot read meeting captions via REST', async () => {
    const { code, hostUser, peerUser, outsiderUser, meeting } = await setupMeetingAndPeers();

    // Create a caption in the meeting
    await Caption.create({
      meeting: meeting._id,
      user: hostUser.user.id || hostUser.user._id,
      name: 'Host Person',
      text: 'Secret caption text',
      offsetMs: 5000,
    });

    // Outsider cannot read
    const outsiderRes = await request(app)
      .get(`/api/meetings/${code}/captions`)
      .set('Authorization', `Bearer ${outsiderUser.token}`);

    expect(outsiderRes.status).toBe(403);
    expect(outsiderRes.body.error?.code).toBe('FORBIDDEN');

    // Host can read
    const hostRes = await request(app)
      .get(`/api/meetings/${code}/captions`)
      .set('Authorization', `Bearer ${hostUser.token}`);

    expect(hostRes.status).toBe(200);
    expect(hostRes.body.captions).toHaveLength(1);
    expect(hostRes.body.captions[0].text).toBe('Secret caption text');

    // Admitted attendee can read
    await Meeting.updateOne(
      { _id: meeting._id },
      { $addToSet: { attendees: peerUser.user.id || peerUser.user._id } }
    );
    const peerRes = await request(app)
      .get(`/api/meetings/${code}/captions`)
      .set('Authorization', `Bearer ${peerUser.token}`);

    expect(peerRes.status).toBe(200);
    expect(peerRes.body.captions).toHaveLength(1);
  });

  test('Authorization: non-admitted peer cannot send caption segments or receive broadcast', async () => {
    const { code, peerSocket, outsiderUser } = await setupMeetingAndPeers();

    const outsiderSocket = await connectSocket(port, outsiderUser.token);
    socketsToClose.push(outsiderSocket);

    // Outsider sends without joining meeting
    const sendRes = await emitAck(outsiderSocket, 'caption:segment', {
      text: 'Unauthorized voice',
      final: false,
    });
    expect(sendRes.ok).toBe(false);
    expect(sendRes.error?.code).toBe('NOT_IN_ROOM');

    // Peer emits legitimate caption segment
    let outsiderReceived = false;
    outsiderSocket.on('caption:segment', () => {
      outsiderReceived = true;
    });

    const peerPromise = waitForEvent(peerSocket, 'caption:segment');
    await emitAck(peerSocket, 'caption:segment', {
      text: 'Admitted peer talking',
      final: false,
    });

    const broadcast = await peerPromise;
    expect(broadcast.text).toBe('Admitted peer talking');
    expect(outsiderReceived).toBe(false);
  });

  test('Security: speaker identity comes from socket session, never from client payload', async () => {
    const { peerSocket, peerUser, hostSocket } = await setupMeetingAndPeers();

    const hostPromise = waitForEvent(hostSocket, 'caption:segment');

    // Attempt to spoof speaker identity in the payload
    const res = await emitAck(peerSocket, 'caption:segment', {
      text: 'I am claiming to be the CEO',
      final: true,
      name: 'CEO Impersonator',
      user: '60c72b2f9b1d8b0015f8a000',
      userId: '60c72b2f9b1d8b0015f8a000',
    });

    expect(res.ok).toBe(true);
    expect(res.name).toBe('Peer Person');
    expect(res.userId.toString()).toBe((peerUser.user.id || peerUser.user._id).toString());

    const broadcast = await hostPromise;
    expect(broadcast.name).toBe('Peer Person');
    expect(broadcast.userId.toString()).toBe((peerUser.user.id || peerUser.user._id).toString());
    expect(broadcast.text).toBe('I am claiming to be the CEO');

    // Check DB persistence has real identity
    const saved = await Caption.findOne({ text: 'I am claiming to be the CEO' }).lean();
    expect(saved).not.toBeNull();
    expect(saved.name).toBe('Peer Person');
    expect(saved.user.toString()).toBe((peerUser.user.id || peerUser.user._id).toString());
  });

  test('Validation: rejects empty text and text exceeding 300 characters', async () => {
    const { peerSocket } = await setupMeetingAndPeers();

    // Empty text
    const emptyRes = await emitAck(peerSocket, 'caption:segment', {
      text: '   ',
      final: false,
    });
    expect(emptyRes.ok).toBe(false);
    expect(emptyRes.error?.code).toBe('VALIDATION_ERROR');

    // Exceeding 300 characters
    const longText = 'a'.repeat(301);
    const longRes = await emitAck(peerSocket, 'caption:segment', {
      text: longText,
      final: false,
    });
    expect(longRes.ok).toBe(false);
    expect(longRes.error?.code).toBe('VALIDATION_ERROR');

    // Exactly 300 characters is allowed
    const valid300 = 'b'.repeat(300);
    const validRes = await emitAck(peerSocket, 'caption:segment', {
      text: valid300,
      final: false,
    });
    expect(validRes.ok).toBe(true);
    expect(validRes.text).toBe(valid300);
  });

  test('Persistence and Caps: only final segments are saved, and cap of 5000 segments per meeting is strictly enforced', async () => {
    const { peerSocket, meeting } = await setupMeetingAndPeers();

    // Interim segment: not saved to DB
    const interimRes = await emitAck(peerSocket, 'caption:segment', {
      text: 'Interim speech fragment',
      final: false,
    });
    expect(interimRes.ok).toBe(true);

    const interimCount = await Caption.countDocuments({ meeting: meeting._id });
    expect(interimCount).toBe(0);

    // Final segment: saved to DB
    const finalRes = await emitAck(peerSocket, 'caption:segment', {
      text: 'Complete sentence spoken clearly.',
      final: true,
    });
    expect(finalRes.ok).toBe(true);

    const afterFinalCount = await Caption.countDocuments({ meeting: meeting._id });
    expect(afterFinalCount).toBe(1);

    // Seed 4999 more documents to reach 5000 cap
    const dummyCaptions = Array.from({ length: 4999 }, (_, i) => ({
      meeting: meeting._id,
      name: 'Speaker',
      text: `Seeded line ${i + 1}`,
      offsetMs: 1000 + i,
    }));
    await Caption.insertMany(dummyCaptions);

    const totalCountBefore = await Caption.countDocuments({ meeting: meeting._id });
    expect(totalCountBefore).toBe(5000);

    // Emit another final segment: broadcasts successfully but is not saved beyond 5000 cap
    const overCapRes = await emitAck(peerSocket, 'caption:segment', {
      text: 'Segment beyond 5000 cap',
      final: true,
    });
    expect(overCapRes.ok).toBe(true);

    const totalCountAfter = await Caption.countDocuments({ meeting: meeting._id });
    expect(totalCountAfter).toBe(5000);
  });

  test('Rate limiting: rejecting rapid bursts beyond 20 segments within 5s', async () => {
    const { peerSocket } = await setupMeetingAndPeers();

    let rateLimited = false;
    for (let i = 0; i < 25; i++) {
      const res = await emitAck(peerSocket, 'caption:segment', {
        text: `Burst message ${i}`,
        final: false,
      });
      if (res.ok === false && res.error?.code === 'RATE_LIMITED') {
        rateLimited = true;
        break;
      }
    }

    expect(rateLimited).toBe(true);
  });
});
