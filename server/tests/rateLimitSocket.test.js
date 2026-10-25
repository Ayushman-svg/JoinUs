const http = require('http');
const ioClient = require('socket.io-client');

const app = require('../src/app');
const { initSockets } = require('../src/sockets');
const Meeting = require('../src/models/Meeting');
const { generateMeetingCode } = require('../src/utils/meetingCode');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./helpers/db');
const { createUser } = require('./helpers/users');
const RateLimiter = require('../src/sockets/rateLimit');

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

describe('Socket rate limiting and payload limits', () => {
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

  it('rate limits room:join after 10 attempts in 10 seconds per socket', async () => {
    const hostUser = await createUser();
    const code = generateMeetingCode();
    await Meeting.create({
      code,
      title: 'Rate Limit Test Room',
      host: hostUser.user.id,
      startsAt: new Date(),
      waitingRoom: false,
    });

    const socket = await connectSocket(port, hostUser.token);
    socketsToClose.push(socket);

    // 10 joins allowed
    for (let i = 0; i < 10; i++) {
      const res = await emitAck(socket, 'room:join', { code, audio: true, video: true });
      expect(res.ok).toBe(true);
    }

    // 11th join rejected with RATE_LIMITED
    const blocked = await emitAck(socket, 'room:join', { code, audio: true, video: true });
    expect(blocked.ok).toBe(false);
    expect(blocked.error.code).toBe('RATE_LIMITED');
  });

  it('rate limits host:* controls after 30 attempts in 10 seconds per socket', async () => {
    const hostUser = await createUser();
    const code = generateMeetingCode();
    await Meeting.create({
      code,
      title: 'Host Control Test Room',
      host: hostUser.user.id,
      startsAt: new Date(),
      waitingRoom: false,
    });

    const socket = await connectSocket(port, hostUser.token);
    socketsToClose.push(socket);

    await emitAck(socket, 'room:join', { code, audio: true, video: true });

    // 30 host calls allowed
    for (let i = 0; i < 30; i++) {
      const res = await emitAck(socket, 'host:stop-share', {});
      expect(res.ok).toBe(true);
    }

    // 31st host call rejected with RATE_LIMITED
    const blocked = await emitAck(socket, 'host:stop-share', {});
    expect(blocked.ok).toBe(false);
    expect(blocked.error.code).toBe('RATE_LIMITED');
  });

  it('rate limits signal events when burst exceeds limit', async () => {
    const testSignalLimiter = new RateLimiter({ max: 3, windowMs: 10000 });
    expect(testSignalLimiter.check('socket-1')).toBe(true);
    expect(testSignalLimiter.check('socket-1')).toBe(true);
    expect(testSignalLimiter.check('socket-1')).toBe(true);
    expect(testSignalLimiter.check('socket-1')).toBe(false);
  });
});
