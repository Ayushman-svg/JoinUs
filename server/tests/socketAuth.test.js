const http = require('http');
const ioClient = require('socket.io-client');

const app = require('../src/app');
const { initSockets } = require('../src/sockets');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./helpers/db');
const { createUser } = require('./helpers/users');

beforeAll(connectTestDB, 120000);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

describe('Socket.io authentication', () => {
  let server;
  let ioInstance;
  let port;

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
    ioInstance.close(() => {
      done();
    });
  });

  it('rejects connection without auth token (UNAUTHORIZED)', (done) => {
    const socket = ioClient(`http://localhost:${port}`, {
      auth: {},
      transports: ['websocket'],
      reconnection: false,
    });

    socket.on('connect', () => {
      socket.disconnect();
      done(new Error('Should not have connected without a token'));
    });

    socket.on('connect_error', (err) => {
      expect(err.data).toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
      socket.disconnect();
      done();
    });
  });

  it('rejects connection with an invalid token (INVALID_TOKEN)', (done) => {
    const socket = ioClient(`http://localhost:${port}`, {
      auth: { token: 'invalid-token-string' },
      transports: ['websocket'],
      reconnection: false,
    });

    socket.on('connect', () => {
      socket.disconnect();
      done(new Error('Should not have connected with invalid token'));
    });

    socket.on('connect_error', (err) => {
      expect(err.data).toMatchObject({
        code: 'INVALID_TOKEN',
      });
      socket.disconnect();
      done();
    });
  });

  it('accepts connection with a valid token for an existing user', async () => {
    const { token, user } = await createUser();

    await new Promise((resolve, reject) => {
      const socket = ioClient(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
      });

      socket.on('connect', () => {
        expect(socket.connected).toBe(true);
        socket.disconnect();
        resolve();
      });

      socket.on('connect_error', (err) => {
        socket.disconnect();
        reject(err);
      });
    });
  });
});
