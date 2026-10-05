const { Server } = require('socket.io');

const env = require('../config/env');
const { MAX_PARTICIPANTS } = require('../config/constants');
const AppError = require('../utils/AppError');
const { verifyToken } = require('../utils/token');
const User = require('../models/User');
const RoomRegistry = require('./roomRegistry');
const { registerHandlers } = require('./handlers');

// socket.io delivers err.message and err.data to the client's "connect_error" handler
function toConnectError(err) {
  const known = err instanceof AppError;
  const error = new Error(known ? err.message : 'Something went wrong');
  error.data = { code: known ? err.code : 'INTERNAL_ERROR', message: error.message };
  return error;
}

// Handshake middleware: the connection is refused unless auth.token is a valid JWT
// for an existing user. The verified identity is stored on socket.data and is the
// only source of user information afterwards.
async function authenticate(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token.length === 0) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    const userId = verifyToken(token); // throws INVALID_TOKEN / TOKEN_EXPIRED
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User no longer exists');
    }

    socket.data.user = { id: user.id, name: user.name };
    next();
  } catch (err) {
    if (!(err instanceof AppError)) console.error(err);
    next(toConnectError(err));
  }
}

function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.clientOrigins, methods: ['GET', 'POST'] },
    // Signaling messages are small; refuse anything larger
    maxHttpBufferSize: 1e5,
  });

  const registry = new RoomRegistry({ maxParticipants: MAX_PARTICIPANTS });

  io.use(authenticate);

  io.on('connection', (socket) => {
    if (env.nodeEnv === 'development') {
      console.log(`socket connected: ${socket.id} (${socket.data.user.name})`);
      socket.on('disconnect', () => console.log(`socket disconnected: ${socket.id}`));
    }

    registerHandlers(io, socket, registry);
  });

  return { io, registry };
}

module.exports = { initSockets, authenticate };
