const http = require('http');

const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');
const app = require('./app');
const { initSockets } = require('./sockets');

// One http server shared by Express and Socket.io
const server = http.createServer(app);
const { io, registry } = initSockets(server);
app.set('registry', registry);

async function start() {
  try {
    await connectDB();
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }

  server.listen(env.port, () => {
    console.log(`JoinUs server running on port ${env.port} (${env.nodeEnv})`);
  });
}

const { sanitizeError } = require('./utils/sanitizeLog');

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  // Force exit if connections refuse to close
  setTimeout(() => process.exit(1), 10000).unref();

  // Disconnects every socket and closes the underlying http server
  io.close(async () => {
    await disconnectDB();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error(`[fatal] unhandledRejection: ${sanitizeError(reason)}`);
});

process.on('uncaughtException', (err) => {
  console.error(`[fatal] uncaughtException: ${sanitizeError(err)}`);
  shutdown('uncaughtException');
});

start();
